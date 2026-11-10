import type { VacationRow } from '$lib/dashboard/vacation-status';
export function object(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
export type ModeScenes = { begin: string[]; end: string[] };
export type VacationTarget = {
	id: string;
	kind: 'output' | 'scene' | 'unsupported';
	deviceId?: string;
	channel?: number;
	component?: 'switch' | 'light';
	sceneId?: string;
	begin: boolean | null;
	end: boolean | null;
	delays: { begin: number[]; end: number[] };
	issue?: string;
};
export function canonicalDeviceId(value: unknown) {
	const id = String(value ?? '').toLowerCase();
	return /^[a-f0-9]{1,12}$/.test(id) ? id.replace(/^0+(?=.)/, '') : id;
}
function decimalId(value: string) {
	try {
		const id = BigInt(value).toString(16);
		return id.length <= 12 ? id.padStart(id.length <= 6 ? 6 : 12, '0') : null;
	} catch {
		return null;
	}
}
function delaySeconds(value: unknown, units: unknown) {
	const factor = ['sec', 'seconds', 'second', 's'].includes(String(units))
		? 1
		: ['min', 'minutes', 'minute'].includes(String(units))
			? 60
			: ['hours', 'hour', 'h'].includes(String(units))
				? 3600
				: NaN;
	const delay = Number(value) * factor;
	return Number.isFinite(delay) && delay >= 0 && delay <= 365 * 86400 ? delay : null;
}
export function parseVacationDefinitions(payload: unknown, ids: ModeScenes): VacationTarget[] {
	const data = object(object(payload).data ?? payload),
		scripts = object(data.scene_scripts),
		targets = new Map<string, VacationTarget>();
	let unknown = 0;
	function unsupported(side: 'begin' | 'end', issue: string) {
		const id = `unsupported:${side}:${unknown++}`;
		targets.set(id, {
			id,
			kind: 'unsupported',
			begin: null,
			end: null,
			delays: { begin: [], end: [] },
			issue
		});
	}
	function walk(value: unknown, side: 'begin' | 'end', delay = 0) {
		if (Array.isArray(value)) {
			for (const item of value) walk(item, side, delay);
			return;
		}
		const action = object(value);
		if (!Object.keys(action).length) {
			unsupported(side, 'Scèneactie ontbreekt of is onbekend.');
			return;
		}
		if (action.blk) {
			if (Object.keys(action).some((key) => !['blk', '_gui_type', '_gui_purpose'].includes(key))) {
				unsupported(side, 'Voorwaardelijke actie: status niet volledig uitleesbaar.');
				return;
			}
			walk(action.blk, side, delay);
			return;
		}
		if (action.wait !== undefined) {
			if (
				Object.keys(action).some(
					(key) => !['wait', 'wid', 'do', 'units', '_gui_type', '_gui_purpose'].includes(key)
				)
			) {
				unsupported(side, 'Voorwaardelijke vertraging: status niet volledig uitleesbaar.');
				return;
			}
			const extra = delaySeconds(action.wait, action.units);
			if (extra === null) {
				unsupported(side, 'Vertraging kan niet worden bepaald.');
				return;
			}
			walk(action.do, side, delay + extra);
			return;
		}
		if (
			Object.keys(action).some((key) => !['r', 'set', '_gui_type', '_gui_purpose'].includes(key))
		) {
			unsupported(side, 'Deze scèneactie heeft geen uitleesbare vaste status.');
			return;
		}
		const resource = typeof action.r === 'string' ? action.r : '';
		const device = /^dev:(\d{1,20}):([rl])(\d{1,3})$/.exec(resource),
			scene = /^blprop:(\d{1,20}):enabled$/.exec(resource);
		let target: VacationTarget | undefined,
			expected: boolean | null = null;
		if (device) {
			const id = decimalId(device[1]),
				channel = Number(device[3]) - 1;
			if (!id || channel < 0 || channel > 99) {
				unsupported(side, 'Apparaatuitgang is niet herkenbaar.');
				return;
			}
			const kind = device[2] === 'l' ? 'light' : 'switch',
				key = `output:${id}:${kind}:${channel}`;
			target = targets.get(key) ?? {
				id: key,
				kind: 'output',
				deviceId: id,
				channel,
				component: kind,
				begin: null,
				end: null,
				delays: { begin: [], end: [] }
			};
			expected =
				action.set === 'on' || action.set === true
					? true
					: action.set === 'off' || action.set === false
						? false
						: null;
		} else if (scene) {
			const key = `scene:${scene[1]}`;
			target = targets.get(key) ?? {
				id: key,
				kind: 'scene',
				sceneId: scene[1],
				begin: null,
				end: null,
				delays: { begin: [], end: [] }
			};
			expected =
				action.set === 'true' || action.set === true
					? true
					: action.set === 'false' || action.set === false
						? false
						: null;
		} else {
			unsupported(side, 'Groep, scènevervolg of andere actie: status niet ondersteund.');
			return;
		}
		if (expected === null) {
			unsupported(side, 'Een wisselopdracht heeft geen vaste doelstatus.');
			return;
		}
		if (target[side] !== null && target[side] !== expected) {
			target.issue = 'Deze uitgang heeft meerdere verschillende doelstanden.';
			target.kind = 'unsupported';
		}
		target[side] = expected;
		target.delays[side] = [...new Set([...target.delays[side], delay])].sort((a, b) => a - b);
		targets.set(target.id, target);
	}
	for (const side of ['begin', 'end'] as const) {
		if (!ids[side].length) unsupported(side, 'Vakantiescène is niet ingesteld.');
		for (const id of ids[side]) {
			const script = object(scripts[id]);
			if (!Array.isArray(script.do)) {
				unsupported(side, 'Ingestelde vakantiescène is niet beschikbaar.');
				continue;
			}
			walk(script.do, side);
		}
	}
	return [...targets.values()];
}
export function privateIpv4(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
	const parts = value.split('.').map(Number);
	return (
		parts.every((value) => value >= 0 && value <= 255) &&
		(parts[0] === 10 ||
			(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
			(parts[0] === 192 && parts[1] === 168))
	);
}
export function outputState(
	status: unknown,
	channel: number,
	kind: 'switch' | 'light'
): boolean | null {
	const value = object(status),
		keys =
			kind === 'switch'
				? ['switch', 'light', 'rgb', 'rgbw', 'rgbcct']
				: ['light', 'rgb', 'rgbw', 'rgbcct'];
	for (const key of keys) {
		const component = object(value[`${key}:${channel}`]);
		if (typeof component.output === 'boolean') return component.output;
	}
	for (const key of kind === 'switch' ? ['relays', 'lights'] : ['lights']) {
		const entries = value[key];
		if (Array.isArray(entries)) {
			const component = object(entries[channel]);
			if (typeof component.ison === 'boolean') return component.ison;
		}
	}
	return null;
}
function entries(value: unknown): Array<[string, unknown]> {
	return Array.isArray(value)
		? value.map((item, index) => [String(index), item])
		: Object.entries(object(value));
}
export function inventoryDevices(
	payload: unknown
): Array<Record<string, unknown> & { id: string }> {
	return entries(object(object(payload).data ?? payload).devices).map(([key, item]) => ({
		...object(item),
		id: String(object(item).id ?? key)
	}));
}
export function cloudStatuses(payload: unknown) {
	const result = new Map<string, Record<string, unknown>>();
	for (const [key, value] of entries(object(object(payload).data ?? payload).devices_status)) {
		const status = object(value);
		result.set(canonicalDeviceId(object(status._dev_info).id ?? key), status);
	}
	return result;
}
export function targetLabel(target: VacationTarget, inventory: unknown, scenes: unknown) {
	if (target.kind === 'unsupported') return 'Actie niet volledig uitleesbaar';
	if (target.kind === 'scene') {
		const listing = object(object(object(scenes).data ?? scenes).scene_scripts);
		return String(
			object(object(listing[target.sceneId ?? ''])._meta).name ?? `Scène ${target.sceneId}`
		);
	}
	const match = inventoryDevices(inventory).find((device) => {
		const parts = /^([a-f0-9]+)(?:_(\d+))?$/i.exec(String(device.id));
		return (
			parts &&
			canonicalDeviceId(parts[1]) === canonicalDeviceId(target.deviceId) &&
			Number(device.channel ?? parts[2] ?? 0) === target.channel
		);
	});
	return typeof match?.name === 'string'
		? match.name
		: `Apparaat ${target.deviceId} · uitgang ${(target.channel ?? 0) + 1}`;
}
export function emptyVacationRow(target: VacationTarget, label: string): VacationRow {
	return {
		id: target.id,
		label,
		kind: target.kind,
		actual: null,
		begin: target.begin,
		end: target.end,
		source: 'unknown',
		delays: target.delays,
		...(target.issue ? { issue: target.issue } : {})
	};
}
