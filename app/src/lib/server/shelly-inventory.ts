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
type Failure = NonNullable<ShellyBrowserView['failure']>;
class ShellyReadError extends Error {
	constructor(
		public category: Failure,
		message: string
	) {
		super(message);
	}
}
let lastFailure: Failure | null = null;
const failureMessages: Record<Failure, string> = {
	'rate-limit': 'Shelly Cloud is tijdelijk bezet (aanvraaglimiet). Status niet beschikbaar.',
	timeout: 'Shelly Cloud antwoordt niet op tijd. Status niet beschikbaar.',
	auth: 'Shelly Cloud-toegang is geweigerd. Status niet beschikbaar.',
	unavailable: 'Shelly-status is momenteel niet beschikbaar.',
	malformed: 'Shelly Cloud gaf geen bruikbare statusgegevens.'
};
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
		if (!env.SHELLY_AUTH_KEY?.trim())
			throw new ShellyReadError('auth', 'Shelly Cloud is niet ingesteld.');
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
				throw new ShellyReadError('timeout', 'TIMEOUT');
			throw new ShellyReadError('unavailable', 'Shelly Cloud niet bereikbaar.');
		}
		const result = await response.json().catch(() => null);
		const errorText = JSON.stringify(record(result).errors ?? record(result).error ?? '');
		if (response.status === 429 || /max_req|rate.?limit/i.test(errorText))
			throw new ShellyReadError('rate-limit', 'Shelly Cloud is tijdelijk bezet.');
		if ([401, 403].includes(response.status) || /auth|forbidden|access.denied/i.test(errorText))
			throw new ShellyReadError('auth', 'Shelly Cloud-toegang is geweigerd.');
		if (!response.ok || record(result).isok === false || record(result).error)
			throw new ShellyReadError('unavailable', 'Shelly heeft de opdracht geweigerd.');
		if (result === null && !path.includes('/set/'))
			throw new ShellyReadError('malformed', 'Ongeldige status.');
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
		lastFailure = null;
		return;
	}
	if (inFlight) return inFlight;
	if (failedAt && Date.now() - failedAt < STATUS_TTL) return;
	inFlight = (async () => {
		try {
			if (!inventory || Date.now() - inventoryAt >= INVENTORY_TTL) {
				const loaded = await request('/interface/device/get_all_lists');
				const data = cloudPayload(loaded);
				if (!data.devices || !data.rooms)
					throw new ShellyReadError('malformed', 'Ongeldige inventaris.');
				inventory = loaded;
				inventoryAt = Date.now();
			}
			if (!status || Date.now() - statusAt >= STATUS_TTL) {
				const loaded = await request('/device/all_status');
				if (
					!cloudPayload(loaded).devices_status ||
					typeof cloudPayload(loaded).devices_status !== 'object'
				)
					throw new ShellyReadError('malformed', 'Ongeldige status.');
				status = loaded;
				statusAt = Date.now();
			}
			failedAt = 0;
			lastFailure = null;
		} catch (error) {
			lastFailure = error instanceof ShellyReadError ? error.category : 'unavailable';
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
	const stale = Boolean(failedAt);
	for (const entry of rooms) {
		const devices = targets
			.filter((target) => target.room === entry.id)
			.map((target) => deviceView(target, statuses));
		entry.onlineCount =
			stale || !statusAt || !devices.some((device) => device.online !== null)
				? null
				: devices.filter((device) => device.online === true).length;
	}
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
		failure: stale ? (lastFailure ?? 'unavailable') : undefined,
		message: stale
			? failureMessages[lastFailure ?? 'unavailable'] +
				(inventory ? ' Laatst bekende apparaatgegevens worden getoond.' : '')
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
