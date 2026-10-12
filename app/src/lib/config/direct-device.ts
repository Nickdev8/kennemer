import type { DeviceInventoryEntry, DeviceCommandKey } from './schema';
const names = { switch: 'Switch', light: 'Light', rgb: 'RGB', rgbcct: 'RGBCCT' };
export function directTarget(
	device: DeviceInventoryEntry,
	method: 'GetStatus' | 'Set',
	command?: DeviceCommandKey
) {
	if (!device.component || device.channel === undefined)
		throw new Error('Apparaat is niet geconfigureerd.');
	return {
		url: `http://${device.ip}/rpc`,
		payload: {
			id: 1,
			method: `${names[device.component]}.${method}`,
			params: { id: device.channel, ...(method === 'Set' ? { on: command === 'on' } : {}) }
		}
	};
}
export function parseDirectOutput(payload: unknown): DeviceCommandKey {
	const result = payload as {
		result?: { on?: unknown; output?: unknown };
		on?: unknown;
		output?: unknown;
	};
	const state = result?.result ?? result;
	const output = state?.on ?? state?.output;
	if (typeof output !== 'boolean') throw new Error('Apparaatstatus ontbreekt.');
	return output ? 'on' : 'off';
}
