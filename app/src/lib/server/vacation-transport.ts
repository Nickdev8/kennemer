import { createShellyCloudCache, CloudReadError } from './shelly-cloud-cache';
import {
	object,
	privateIpv4,
	canonicalDeviceId,
	inventoryDevices,
	outputState,
	type VacationTarget
} from './vacation-core';
type Kind = 'scenes' | 'inventory' | 'statuses';
type Options = {
	fetch: typeof fetch;
	authKey: () => string;
	cachedIps?: (id: string) => Promise<string[]>;
	now?: () => number;
	cloudRead?: (kind: Kind, force?: boolean) => Promise<unknown>;
};
export function createVacationTransport(options: Options) {
	const preferred = new Map<string, string>();
	const shared = options.cloudRead
		? null
		: createShellyCloudCache({ fetch: options.fetch, authKey: options.authKey, now: options.now });
	async function cloud(kind: Kind, force = false) {
		if (options.cloudRead) return options.cloudRead(kind, force);
		const result = await shared!.read(kind, force);
		if (result.stale || result.value === null)
			throw new CloudReadError(
				result.failure ?? 'unavailable',
				'Cloud read unavailable',
				result.retryAt
			);
		return result.value;
	}
	async function lan(id: string, targets: VacationTarget[], inventory: unknown, status: unknown) {
		const devices = inventoryDevices(inventory).filter(
			(device) => canonicalDeviceId(String(device.id).split('_')[0]) === canonicalDeviceId(id)
		);
		const gen = Number(devices[0]?.gen ?? (object(object(status)._dev_info).gen === 'G1' ? 1 : 2));
		const candidates = [
			preferred.get(id),
			object(object(status).wifi).sta_ip,
			object(object(status).eth).ip,
			...devices.map((device) => device.ip),
			...((await options.cachedIps?.(id)) ?? [])
		].filter(privateIpv4);
		for (const ip of [...new Set(candidates)].slice(0, 2)) {
			try {
				const identityResponse = await options.fetch(
					`http://${ip}${gen === 1 ? '/shelly' : '/rpc/Shelly.GetDeviceInfo'}`,
					{ signal: AbortSignal.timeout(1000) }
				);
				if (!identityResponse.ok) continue;
				const identity = object(await identityResponse.json());
				if (
					canonicalDeviceId(String(identity.mac ?? '').replaceAll(':', '')) !==
					canonicalDeviceId(id)
				)
					continue;
				if (gen !== 1 && !(typeof identity.gen === 'number' && identity.gen >= 2)) continue;
				const response = await options.fetch(
					`http://${ip}${gen === 1 ? '/status' : '/rpc/Shelly.GetStatus'}`,
					{ signal: AbortSignal.timeout(1000) }
				);
				if (!response.ok) continue;
				const value = await response.json(),
					result = new Map<string, boolean>();
				for (const target of targets) {
					const actual = outputState(value, target.channel!, target.component!);
					if (actual !== null) result.set(target.id, actual);
				}
				if (result.size) {
					preferred.set(id, ip);
					return result;
				}
			} catch {}
		}
		return new Map<string, boolean>();
	}
	return { cloud, lan };
}
