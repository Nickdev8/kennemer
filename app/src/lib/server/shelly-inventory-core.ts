import type {
	ShellyComponentView,
	ShellyRoomDevice,
	ShellyRoomView
} from '$lib/dashboard/shelly-browser';
import { SHELLY_ROOMS } from '../../../config/shelly';
export function isConfiguredShellyRoom(room: unknown): room is string {
	return typeof room === 'string' && SHELLY_ROOMS.some((entry) => entry.id === room);
}

type ObjectValue = Record<string, unknown>;
export function record(value: unknown): ObjectValue {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as ObjectValue)
		: {};
}
function rows(value: unknown) {
	return Object.entries(record(value)).length
		? Object.entries(record(value))
		: Array.isArray(value)
			? value.map((value, index) => [String(index), value] as [string, unknown])
			: [];
}
export function cloudPayload(value: unknown) {
	const data = record(value);
	if (data.isok === false || data.error) throw new Error('Shelly Cloud niet bereikbaar.');
	return record(data.data ?? data);
}
export type RoomTarget = {
	id: string;
	baseId: string;
	channel: number;
	room: string;
	name: string;
	mode?: string;
};
export function roomTargets(inventory: unknown): {
	rooms: ShellyRoomView[];
	targets: RoomTarget[];
} {
	const data = cloudPayload(inventory),
		targets: RoomTarget[] = [];
	const rooms = SHELLY_ROOMS.map((room) => {
		const match = rows(data.rooms).filter(
			([key, value]) =>
				String(record(value).id ?? key) === room.accountId &&
				String(record(value).name ?? '')
					.trim()
					.toLowerCase() === room.name.toLowerCase()
		);
		if (match.length !== 1)
			return { id: room.id, name: room.name, found: false, count: 0, onlineCount: 0 };
		for (const [key, value] of rows(data.devices)) {
			const device = record(value);
			if (String(device.room_id) !== room.accountId) continue;
			const id = String(device.id ?? key).toLowerCase();
			const parts = /^([a-f0-9]{6,12})(?:_(\d+))?$/.exec(id);
			const suffix = parts?.[2] !== undefined ? Number(parts[2]) : null;
			const channel = Number(device.channel ?? suffix ?? 0);
			if (!id || !Number.isInteger(channel) || channel < 0 || channel > 99) continue;
			// A suffix and explicit channel must agree; never silently address output zero.
			if (suffix !== null && suffix !== channel) continue;
			targets.push({
				id,
				baseId: parts?.[1] ?? id,
				channel,
				room: room.id,
				name: String(device.name ?? id),
				...(typeof device.mode === 'string' ? { mode: device.mode } : {})
			});
		}
		return {
			id: room.id,
			name: room.name,
			found: true,
			count: targets.filter((target) => target.room === room.id).length,
			onlineCount: 0
		};
	});
	return { rooms, targets };
}
export function indexStatuses(payload: unknown) {
	const result = new Map<string, ObjectValue>();
	for (const [key, value] of rows(cloudPayload(payload).devices_status)) {
		const status = record(value),
			info = record(status._dev_info);
		result.set(String(info.id ?? key).toLowerCase(), status);
	}
	return result;
}
export function deviceView(
	target: RoomTarget,
	statuses: Map<string, ObjectValue>
): ShellyRoomDevice {
	const status = statuses.get(target.baseId) ?? {};
	const info = record(status._dev_info);
	const online =
		typeof info.online === 'boolean'
			? info.online
			: info.online === 1
				? true
				: info.online === 0
					? false
					: null;
	const components: ShellyComponentView[] = [];
	function output(kind: 'switch' | 'light', value: unknown) {
		const data = record(value);
		const state =
			typeof data.output === 'boolean'
				? data.output
				: typeof data.ison === 'boolean'
					? data.ison
					: null;
		components.push({
			id: `${kind}:${target.channel}`,
			label: kind === 'switch' ? 'Uitgang' : 'Licht',
			output: online === true ? state : null,
			value: null,
			controllable: /^[a-f0-9]{6,12}$/.test(target.baseId)
		});
	}
	const coverRaw =
		status[`cover:${target.channel}`] ??
		(Array.isArray(status.rollers) ? status.rollers[target.channel] : undefined);
	const coverMode = ['cover', 'roller'].includes(target.mode?.toLowerCase() ?? '');
	if (coverRaw !== undefined && coverRaw !== null && typeof coverRaw === 'object') {
		const value = record(coverRaw),
			position = value.current_pos;
		const allowedStates = [
			'open',
			'closed',
			'opening',
			'closing',
			'stopped',
			'calibrating',
			'safety_stop'
		];
		components.push({
			id: `cover:${target.channel}`,
			label: 'Scherm',
			output: null,
			value: null,
			controllable: /^[a-f0-9]{6,12}$/.test(target.baseId),
			cover: {
				state:
					online === true && typeof value.state === 'string' && allowedStates.includes(value.state)
						? value.state
						: null,
				position:
					online === true &&
					typeof position === 'number' &&
					Number.isFinite(position) &&
					position >= 0 &&
					position <= 100
						? position
						: null
			}
		});
	}
	for (const kind of coverRaw !== undefined || coverMode ? [] : ['switch', 'light', 'rgb', 'rgbw', 'rgbcct'])
		if (status[`${kind}:${target.channel}`] !== undefined)
			output(kind === 'switch' ? 'switch' : 'light', status[`${kind}:${target.channel}`]);
	for (const [key, kind] of [
		['relays', 'switch'],
		['lights', 'light']
	] as const) {
		const values = status[key];
		if (
			coverRaw === undefined && !coverMode &&
			Array.isArray(values) &&
			values[target.channel] !== undefined &&
			!components.some((component) => component.id === `${kind}:${target.channel}`)
		)
			output(kind, values[target.channel]);
	}
	for (const [kind, label, field, unit] of [
		['temperature', 'Temperatuur', 'tC', ' °C'],
		['humidity', 'Luchtvochtigheid', 'rh', '%'],
		['illuminance', 'Lichtsterkte', 'lux', ' lux']
	] as const) {
		const sensor = record(status[`${kind}:${target.channel}`]);
		if (Object.keys(sensor).length) {
			const value = sensor[field];
			components.push({
				id: `${kind}:${target.channel}`,
				label,
				output: null,
				value:
					online === true && typeof value === 'number' && Number.isFinite(value)
						? `${value}${unit}`
						: null,
				controllable: false
			});
		}
	}
	const input = record(status[`input:${target.channel}`]);
	if (!components.length && typeof input.state === 'boolean')
		components.push({
			id: `input:${target.channel}`,
			label: 'Ingang',
			output: null,
			value: online === true ? (input.state ? 'Actief' : 'Niet actief') : null,
			controllable: false
		});
	return { id: target.id, name: target.name, online, components };
}
export function validateRoomCommand(
	input: unknown,
	targets: RoomTarget[],
	statuses: Map<string, ObjectValue>
) {
	const body = record(input);
	if (Object.keys(body).some((key) => !['room', 'deviceId', 'component', 'command'].includes(key)))
		throw new Error('Ongeldige opdracht.');
	if (
		typeof body.command !== 'string' ||
		!['on', 'off', 'open', 'close', 'stop'].includes(body.command)
	)
		throw new Error('Kies Aan of Uit.');
	const target = targets.find((target) => target.id === body.deviceId && target.room === body.room);
	if (!target) throw new Error('Apparaat hoort niet bij deze ruimte.');
	const component = deviceView(target, statuses).components.find(
		(component) => component.id === body.component && component.controllable
	);
	if (!component) throw new Error('Deze uitgang kan niet worden bediend.');
	if (component.cover) {
		if (!['open', 'close', 'stop'].includes(body.command))
			throw new Error('Kies Omhoog, Stop of Omlaag.');
		return {
			target,
			kind: 'cover' as const,
			position: body.command as 'open' | 'close' | 'stop',
			on: false
		};
	}
	if (!['on', 'off'].includes(body.command)) throw new Error('Kies Aan of Uit.');
	return {
		target,
		kind: component.id.startsWith('switch:') ? ('switch' as const) : ('light' as const),
		on: body.command === 'on'
	};
}
