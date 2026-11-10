import { SHELLY_ROOMS } from '../../../config/shelly';
import {
	cloudPayload,
	record,
	roomTargets,
	indexStatuses,
	deviceView
} from './shelly-inventory-core';
function componentList(status: Record<string, unknown>) {
	const rows = Object.entries(status)
		.filter(([key]) => /^[a-z][a-z0-9_-]*:\d+$/i.test(key))
		.map(([id, value]) => ({ ...record(value), id }));
	for (const [key, kind] of [
		['relays', 'switch'],
		['lights', 'light'],
		['rollers', 'cover']
	] as const) {
		const value = status[key];
		if (Array.isArray(value))
			value.forEach((entry, index) => rows.push({ ...record(entry), id: `${kind}:${index}` }));
	}
	return rows.map((row) => {
		const value = record(row),
			state = value.output ?? value.ison ?? value.state ?? value.value;
		return {
			id: String(value.id),
			kind: String(value.id).split(':')[0],
			reportedState:
				typeof state === 'boolean'
					? state
					: typeof state === 'string' && /^[a-z_ -]{1,40}$/i.test(state)
						? state
						: null
		};
	});
}
export function buildShellySupportReport(inventory: unknown, statusPayload: unknown) {
	const data = cloudPayload(inventory),
		statuses = indexStatuses(statusPayload),
		{ rooms, targets } = roomTargets(inventory);
	const entries = Array.isArray(data.devices)
		? data.devices.map((value, index) => [String(index), value] as const)
		: Object.entries(record(data.devices));
	return {
		rooms: SHELLY_ROOMS.map((configured) => ({
			id: configured.id,
			name: configured.name,
			found: rooms.find((room) => room.id === configured.id)?.found ?? false,
			devices: entries
				.filter(([, value]) => String(record(value).room_id) === configured.accountId)
				.map(([key, value]) => {
					const device = record(value),
						id = String(device.id ?? key),
						baseId = id.split('_')[0].toLowerCase(),
						channel = Number(device.channel ?? id.split('_')[1] ?? 0),
						raw = statuses.get(baseId) ?? {},
						info = record(raw._dev_info);
					const target = targets.find(
							(target) => target.id === id.toLowerCase() && target.room === configured.id
						),
						view = target ? deviceView(target, statuses) : null,
						components = componentList(raw),
						matched = components.filter(
							(component) => Number(component.id.split(':')[1]) === channel
						);
					const controls = (view?.components ?? [])
						.filter((component) => component.controllable)
						.map((component) => ({
							component: component.id,
							commands: component.cover ? ['open', 'stop', 'close'] : ['on', 'off']
						}));
					const inputOnly =
						matched.length > 0 && matched.every((component) => component.kind === 'input');
					const hints = Object.fromEntries(
						['mainActionType', 'statusLabelParam']
							.filter((key) => typeof device[key] === 'string')
							.map((key) => [
								key,
								/auth|token|pass|secret|https?:|[a-f0-9]{32,}/i.test(String(device[key]))
									? '[redacted]'
									: String(device[key]).slice(0, 100)
							])
					);
					const classification = !target
						? 'invalid-channel'
						: controls.length
							? 'controllable'
							: inputOnly
								? 'input-only'
								: view?.components.length
									? 'read-only'
									: 'unsupported';
					const reason = !target
						? 'Inventaris-ID of kanaal is niet eenduidig.'
						: controls.length
							? 'Ondersteunde uitgang op het toegewezen kanaal.'
							: inputOnly
								? 'Alleen ingangstatus op dit kanaal; input.state is geen schakeluitgang.'
								: matched.some((component) =>
											['boolean', 'enum', 'button', 'virtual'].includes(component.kind)
									  ) || String(info.gen ?? '').startsWith('V')
									? 'Virtuele/appactie gevonden; geen ondersteunde gedocumenteerde uitgang.'
									: view?.components.length
										? 'Sensor/ingang is uitleesbaar, zonder ondersteunde uitgang.'
										: 'Geen ondersteunde componentstatus op het toegewezen kanaal.';
					return {
						id,
						name: String(device.name ?? id),
						channel,
						model: String(info.code ?? device.type ?? device.model ?? 'onbekend'),
						generation: info.gen ?? device.gen ?? null,
						profile: typeof device.mode === 'string' ? device.mode : null,
						online: view?.online ?? null,
						components,
						matchedComponents: matched.map((component) => component.id),
						supportedReads: (view?.components ?? []).map((component) => component.id),
						supportedControls: controls,
						classification,
						reason,
						appActionHints: hints,
						...(Object.keys(hints).length && !controls.length
							? {
									appActionSupport:
										'Appmetadata is een aanwijzing, geen bewijs van een beschikbare output-API.'
								}
							: {})
					};
				})
		}))
	};
}
