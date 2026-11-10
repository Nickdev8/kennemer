import { env } from '$env/dynamic/private';
import { runtimeMode } from './runtime-mode';
import { recordAuditEvent } from './audit-log';
import {
	cloudPayload,
	deviceView,
	indexStatuses,
	record,
	roomTargets,
	validateRoomCommand,
	isConfiguredShellyRoom
} from './shelly-inventory-core';
import type { ShellyBrowserView } from '$lib/dashboard/shelly-browser';
const ORIGIN = 'https://shelly-115-eu.shelly.cloud';
const INVENTORY_TTL = 5 * 60_000,
	STATUS_TTL = 30_000;
let inventory: unknown = null,
	status: unknown = null,
	inventoryAt = 0,
	statusAt = 0,
	failedAt = 0;
let inFlight: Promise<void> | null = null,
	queue = Promise.resolve(),
	lastRequest = 0;
const commands = new Set<string>();
const mockOutputs = new Map<string, boolean>();
function simulated() {
	return (
		runtimeMode(env.KENNEMER_RUNTIME_MODE) === 'mock' ||
		['1', 'true', 'yes', 'on'].includes((env.SHELLY_SIMULATE_DEVICES ?? '').toLowerCase())
	);
}
const mockInventory = {
	rooms: { 21: { name: 'Nieuwbouw' }, 2: { name: 'Light Hfd' } },
	devices: {
		aabbccddee01: { id: 'aabbccddee01', name: 'NB gangdeel', room_id: 21, channel: 0 },
		aabbccddee01_2: { id: 'aabbccddee01_2', name: 'Vide boven', room_id: 21, channel: 2 },
		aabbccddee02: { id: 'aabbccddee02', name: 'Koof licht', room_id: 21, channel: 0 },
		aabbccddee03: { id: 'aabbccddee03', name: 'Temperatuur nieuwbouw', room_id: 21, channel: 0 },
		aabbccddee04: { id: 'aabbccddee04', name: 'Entree parterre', room_id: 2, channel: 0 },
		aabbccddee05: { id: 'aabbccddee05', name: 'Licht gang', room_id: 2, channel: 0 }
	}
};
function mockStatus() {
	return {
		devices_status: {
			one: {
				_dev_info: { id: 'aabbccddee01', online: true },
				'switch:0': { output: mockOutputs.get('aabbccddee01:0') ?? true },
				'switch:1': { output: false },
				'switch:2': { output: mockOutputs.get('aabbccddee01:2') ?? false }
			},
			two: { _dev_info: { id: 'aabbccddee02', online: false }, 'light:0': { output: true } },
			three: { _dev_info: { id: 'aabbccddee03', online: true }, 'temperature:0': { tC: 21.5 } },
			four: {
				_dev_info: { id: 'aabbccddee04', online: true },
				relays: [{ ison: mockOutputs.get('aabbccddee04:0') ?? false }]
			},
			five: { _dev_info: { id: 'aabbccddee05', online: true }, unsupported: { value: 'private' } }
		}
	};
}
async function request(path: string, body?: Record<string, unknown>) {
	const execute = async () => {
		const wait = 1100 - (Date.now() - lastRequest);
		if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
		lastRequest = Date.now();
		if (!env.SHELLY_AUTH_KEY?.trim()) throw new Error('Shelly Cloud is niet ingesteld.');
		const url = new URL(path, ORIGIN);
		url.searchParams.set('auth_key', env.SHELLY_AUTH_KEY);
		if (path === '/device/all_status') url.searchParams.set('show_info', 'true');
		let response: Response;
		try {
			response = await fetch(url, {
				method: body ? 'POST' : 'GET',
				headers: body ? { 'content-type': 'application/json' } : undefined,
				body: body ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(4000)
			});
		} catch (error) {
			if (['TimeoutError', 'AbortError'].includes(error instanceof Error ? error.name : ''))
				throw new Error('TIMEOUT');
			throw new Error('Shelly Cloud niet bereikbaar.');
		}
		if (!response.ok)
			throw new Error(
				response.status === 429
					? 'Shelly Cloud is tijdelijk bezet.'
					: 'Shelly heeft de opdracht geweigerd.'
			);
		const result = await response.json().catch(() => null);
		if (result !== null) cloudPayload(result);
		return result;
	};
	const pending = queue.then(execute);
	queue = pending.then(
		() => undefined,
		() => undefined
	);
	return pending;
}
async function refresh() {
	if (simulated()) {
		inventory = mockInventory;
		status = mockStatus();
		inventoryAt = statusAt = Date.now();
		failedAt = 0;
		return;
	}
	if (inFlight) return inFlight;
	if (failedAt && Date.now() - failedAt < STATUS_TTL) return;
	inFlight = (async () => {
		try {
			if (!inventory || Date.now() - inventoryAt >= INVENTORY_TTL) {
				const loaded = await request('/interface/device/get_all_lists');
				const data = cloudPayload(loaded);
				if (!data.devices || !data.rooms) throw new Error('Ongeldige inventaris.');
				inventory = loaded;
				inventoryAt = Date.now();
			}
			if (!status || Date.now() - statusAt >= STATUS_TTL) {
				const loaded = await request('/device/all_status');
				if (
					!cloudPayload(loaded).devices_status ||
					typeof cloudPayload(loaded).devices_status !== 'object'
				)
					throw new Error('Ongeldige status.');
				status = loaded;
				statusAt = Date.now();
			}
			failedAt = 0;
		} catch {
			failedAt = Date.now();
		}
	})().finally(() => {
		inFlight = null;
	});
	return inFlight;
}
export async function readShellyRooms(room?: string, force = false): Promise<ShellyBrowserView> {
	if (room && !isConfiguredShellyRoom(room)) throw new Error('Onbekende ruimte.');
	if (force && Date.now() - statusAt >= 3000) statusAt = 0;
	await refresh();
	const { rooms, targets } = roomTargets(inventory ?? {}),
		statuses = indexStatuses(status ?? {});
	for (const entry of rooms)
		entry.onlineCount = targets.filter(
			(target) => target.room === entry.id && deviceView(target, statuses).online === true
		).length;
	const stale = Boolean(failedAt);
	return {
		ok: Boolean(inventory),
		rooms,
		...(room
			? {
					room,
					devices: targets
						.filter((target) => target.room === room)
						.map((target) => deviceView(target, statuses))
						.sort((a, b) => a.name.localeCompare(b.name, 'nl'))
				}
			: {}),
		updatedAt: statusAt || null,
		stale,
		message: stale
			? 'Shelly Cloud niet bereikbaar. Laatst bekende gegevens worden getoond.'
			: undefined
	};
}
export async function controlShellyRoom(input: unknown) {
	if (!simulated() && Date.now() - inventoryAt >= STATUS_TTL) inventoryAt = 0;
	await refresh();
	if (failedAt || !inventory)
		throw new Error('Inventaris niet beschikbaar. Probeer later opnieuw.');
	const parsed = validateRoomCommand(
		input,
		roomTargets(inventory).targets,
		indexStatuses(status ?? {})
	);
	const key = `${parsed.target.baseId}:${parsed.target.channel}`;
	if (commands.has(key)) throw new Error('Er loopt al een opdracht voor deze uitgang.');
	commands.add(key);
	let success = false;
	try {
		if (simulated()) {
			mockOutputs.set(`${parsed.target.baseId}:${parsed.target.channel}`, parsed.on);
			status = mockStatus();
			statusAt = Date.now();
		} else
			await request(`/v2/devices/api/set/${parsed.kind}`, {
				id: parsed.target.baseId,
				channel: parsed.target.channel,
				on: parsed.on
			});
		success = true;
		statusAt = 0;
		return { ok: true, message: 'Opdracht verstuurd. De actuele status wordt opnieuw opgehaald.' };
	} finally {
		commands.delete(key);
		await recordAuditEvent('shelly.command', {
			room: parsed.target.room,
			deviceId: parsed.target.id,
			component: parsed.kind,
			channel: parsed.target.channel,
			command: parsed.on ? 'on' : 'off',
			success
		});
	}
}
