import { env } from '$env/dynamic/private';
import { runtimeMode } from './runtime-mode';
import { shellyCloud } from './shelly-cloud';
import { recordAuditEvent } from './audit-log';
import {
	cloudPayload,
	deviceView,
	indexStatuses,
	roomTargets,
	validateRoomCommand,
	isConfiguredShellyRoom
} from './shelly-inventory-core';
import type { ShellyBrowserView } from '$lib/dashboard/shelly-browser';
type Failure = NonNullable<ShellyBrowserView['failure']>;
let lastFailure: Failure | null = null;
const failureMessages: Record<Failure, string> = {
	'rate-limit': 'Shelly Cloud is tijdelijk bezet (aanvraaglimiet). Status niet beschikbaar.',
	timeout: 'Shelly Cloud antwoordt niet op tijd. Status niet beschikbaar.',
	auth: 'Shelly Cloud-toegang is geweigerd. Status niet beschikbaar.',
	unavailable: 'Shelly-status is momenteel niet beschikbaar.',
	malformed: 'Shelly Cloud gaf geen bruikbare statusgegevens.'
};
let inventory: unknown = null,
	status: unknown = null,
	statusAt = 0,
	failedAt = 0;
let inFlight: Promise<void> | null = null;
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
async function refresh(force = false) {
	if (simulated()) {
		inventory = mockInventory;
		status = mockStatus();
		statusAt = Date.now();
		failedAt = 0;
		lastFailure = null;
		return;
	}
	if (inFlight) return inFlight;
	inFlight = (async () => {
		const metadata = await shellyCloud.read('inventory', force),
			readings = await shellyCloud.read('statuses', force);
		if (metadata.value !== null) inventory = metadata.value;
		if (readings.value !== null) {
			status = readings.value;
			statusAt = readings.updatedAt ?? 0;
		}
		const failure = metadata.stale
			? metadata.failure
			: readings.stale
				? readings.failure
				: undefined;
		if (metadata.stale || readings.stale) {
			failedAt = Date.now();
			lastFailure = failure ?? 'unavailable';
		} else {
			failedAt = 0;
			lastFailure = null;
		}
	})().finally(() => {
		inFlight = null;
	});
	return inFlight;
}
export async function readShellyRooms(room?: string, force = false): Promise<ShellyBrowserView> {
	if (room && !isConfiguredShellyRoom(room)) throw new Error('Onbekende ruimte.');
	await refresh(force);
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
			if (parsed.kind !== 'cover')
				mockOutputs.set(`${parsed.target.baseId}:${parsed.target.channel}`, parsed.on);
			status = mockStatus();
			statusAt = Date.now();
		} else
			await shellyCloud.control(parsed.kind, {
				id: parsed.target.baseId,
				channel: parsed.target.channel,
				...(parsed.kind === 'cover' ? { position: parsed.position } : { on: parsed.on })
			});
		success = true;
		if (!simulated()) shellyCloud.invalidate('statuses');
		return { ok: true, message: 'Opdracht verstuurd. De actuele status wordt opnieuw opgehaald.' };
	} finally {
		commands.delete(key);
		await recordAuditEvent('shelly.command', {
			room: parsed.target.room,
			deviceId: parsed.target.id,
			component: parsed.kind,
			channel: parsed.target.channel,
			command: parsed.kind === 'cover' ? parsed.position : parsed.on ? 'on' : 'off',
			success
		});
	}
}
