import { env } from '$env/dynamic/private';
import { readFile } from 'node:fs/promises';
import { readEffectiveControls } from './scene-config-store';
import { runtimeMode } from './runtime-mode';
import { createVacationReader } from './vacation-reader';
import { createVacationTransport } from './vacation-transport';
import { object, privateIpv4, type ModeScenes } from './vacation-core';
async function configuredScenes(): Promise<ModeScenes> {
	const control = (await readEffectiveControls()).find(
		(control) => control.id === 'advanced-vacantie-begin'
	);
	function ids(side: 'on' | 'off') {
		if (control?.controlType !== 'device') return [];
		const source = control.commands[side]?.cloud,
			targets = source ? (Array.isArray(source) ? source : [source]) : [];
		return targets
			.map((target) => {
				try {
					return new URL(target.endpoint).pathname.endsWith('/scene/manual_run')
						? String(target.payload?.id ?? '')
						: '';
				} catch {
					return '';
				}
			})
			.map((id) => (/^\d{1,20}$/.test(id) ? id : 'unsupported-command'));
	}
	return { begin: ids('on'), end: ids('off') };
}
async function cachedIps(id: string) {
	try {
		const raw = JSON.parse(await readFile(env.IP_CACHE_PATH ?? 'ips.json', 'utf8')),
			devices = object(raw).devices ?? raw;
		return Object.entries(object(devices))
			.filter(
				([key, value]) =>
					key.toLowerCase().split('_')[0] === id ||
					String(object(value).id ?? '')
						.toLowerCase()
						.split('_')[0] === id
			)
			.map(([, value]) =>
				typeof value === 'string'
					? value
					: (object(value).ip ?? object(value).local_ip ?? object(value).lan_ip)
			)
			.filter(privateIpv4);
	} catch {
		return [];
	}
}
const transport = createVacationTransport({
	fetch: (...args) => fetch(...args),
	authKey: () => env.SHELLY_AUTH_KEY ?? '',
	cachedIps
});
const liveReader = createVacationReader({ scenes: configuredScenes, ...transport });
const mockReader = createVacationReader({
	scenes: configuredScenes,
	simulation: true,
	cloud: async (kind) => {
		if (kind === 'inventory')
			return {
				devices: {
					ece334f7b214_2: {
						id: 'ece334f7b214_2',
						channel: 2,
						name: '3) Bel trafo',
						gen: 2,
						ip: '10.0.0.2'
					}
				}
			};
		if (kind === 'statuses')
			return {
				devices_status: {
					ece334f7b214: {
						_dev_info: { id: 'ece334f7b214', online: true },
						'switch:2': { output: false }
					}
				}
			};
		const ids = await configuredScenes(),
			scripts: Record<string, unknown> = {};
		for (const [index, id] of ['1727329580882', '1782213221849', '1730105330475'].entries())
			scripts[id] = {
				_enabled: index === 2,
				_meta: { name: ['gang aan', 'Scr. HFD dicht zomer', 'Alles uit Alarm'][index] }
			};
		for (const id of ids.begin)
			scripts[id] = {
				do: [
					{ r: 'dev:260460590379540:r3', set: 'off' },
					{ r: 'blprop:1727329580882:enabled', set: 'false' },
					{ r: 'blprop:1782213221849:enabled', set: 'false' },
					{
						wait: 180,
						units: 'minutes',
						do: { blk: [{ r: 'blprop:1730105330475:enabled', set: 'false' }] }
					}
				]
			};
		for (const id of ids.end)
			scripts[id] = {
				do: [
					{ r: 'dev:260460590379540:r3', set: 'on' },
					...['1727329580882', '1782213221849', '1730105330475'].map((id) => ({
						r: `blprop:${id}:enabled`,
						set: 'true'
					}))
				]
			};
		return { scene_scripts: scripts };
	},
	lan: async (_id, targets) => new Map(targets.map((target) => [target.id, false]))
});
export function readVacationStatus(force = false) {
	return (
		runtimeMode(env.KENNEMER_RUNTIME_MODE) === 'mock' ||
		['1', 'true', 'yes', 'on'].includes((env.SHELLY_SIMULATE_DEVICES ?? '').toLowerCase())
			? mockReader
			: liveReader
	).read(force);
}
