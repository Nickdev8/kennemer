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
};
export function createVacationTransport(options: Options) {
	const now = options.now ?? Date.now,
		preferred = new Map<string, string>();
	let queue = Promise.resolve(),
		lastCall = 0;
	async function cloud(kind: Kind) {
		const task = async () => {
			const key = options.authKey();
			if (!key.trim()) throw new Error('Cloud is not configured');
			const wait = 1100 - (now() - lastCall);
			if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
			lastCall = now();
			const paths = {
				scenes: '/scene/list',
				inventory: '/interface/device/get_all_lists',
				statuses: '/device/all_status'
			};
			const url = new URL(paths[kind], 'https://shelly-115-eu.shelly.cloud');
			const request: RequestInit = { signal: AbortSignal.timeout(2500) };
			if (kind === 'scenes') {
				request.method = 'POST';
				request.body = new URLSearchParams({ auth_key: key });
			} else {
				url.searchParams.set('auth_key', key);
				if (kind === 'statuses') url.searchParams.set('show_info', 'true');
			}
			const response = await options.fetch(url, request);
			if (!response.ok) throw new Error('Cloud read unavailable');
			const result = await response.json();
			if (object(result).isok === false) throw new Error('Cloud read unavailable');
			return result;
		};
		const result = queue.then(task);
		queue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
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
