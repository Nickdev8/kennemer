export type CloudReadKind = 'inventory' | 'statuses' | 'scenes';
export type CloudFailure = 'rate-limit' | 'timeout' | 'auth' | 'unavailable' | 'malformed';
export class CloudReadError extends Error {
	category: CloudFailure;
	retryAt: number;
	constructor(category: CloudFailure, message: string, retryAt = 0) {
		super(message);
		this.category = category;
		this.retryAt = retryAt;
	}
}

export type CloudSnapshot = {
	value: unknown | null;
	updatedAt: number | null;
	stale: boolean;
	failure?: CloudFailure;
	retryAt?: number;
};
type Options = {
	fetch: typeof fetch;
	authKey: () => string;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
};
const TTL = { inventory: 24 * 60 * 60_000, statuses: 30_000, scenes: 30_000 };
function object(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
export function createShellyCloudCache(options: Options) {
	const now = options.now ?? Date.now,
		sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	type Entry = {
		value: unknown | null;
		at: number;
		attempt: number;
		invalid: boolean;
		error: CloudReadError | null;
		retryAt: number;
		flight: Promise<CloudSnapshot> | null;
	};
	const entries = new Map<CloudReadKind, Entry>();
	let queue = Promise.resolve(),
		lastStart = -Infinity,
		blockedUntil = 0;
	function entry(kind: CloudReadKind) {
		let value = entries.get(kind);
		if (!value) {
			value = {
				value: null,
				at: 0,
				attempt: -Infinity,
				invalid: false,
				error: null,
				retryAt: 0,
				flight: null
			};
			entries.set(kind, value);
		}
		return value;
	}
	function retryAfter(value: string | null) {
		if (value === null) return 30000;
		const seconds = Number(value);
		if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
		const date = Date.parse(value);
		return Number.isFinite(date) ? Math.max(1000, date - now()) : 30000;
	}
	function enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const run = async () => {
			if (now() < blockedUntil)
				throw new CloudReadError('rate-limit', 'Shelly Cloud is tijdelijk bezet.', blockedUntil);
			const wait = 1100 - (now() - lastStart);
			if (wait > 0) await sleep(wait);
			if (now() < blockedUntil)
				throw new CloudReadError('rate-limit', 'Shelly Cloud is tijdelijk bezet.', blockedUntil);
			lastStart = now();
			return operation();
		};
		const pending = queue.then(run);
		queue = pending.then(
			() => undefined,
			() => undefined
		);
		return pending;
	}
	async function request(path: string, body?: Record<string, unknown>, sceneRead = false) {
		return enqueue(async () => {
			const auth = options.authKey();
			if (!auth.trim()) throw new CloudReadError('auth', 'Shelly Cloud is niet ingesteld.');
			const url = new URL(path, 'https://shelly-115-eu.shelly.cloud');
			const init: RequestInit = { signal: AbortSignal.timeout(4000) };
			if (sceneRead) {
				init.method = 'POST';
				init.body = new URLSearchParams({ auth_key: auth });
			} else {
				url.searchParams.set('auth_key', auth);
				if (path === '/device/all_status') url.searchParams.set('show_info', 'true');
				if (body) {
					init.method = 'POST';
					init.headers = { 'content-type': 'application/json' };
					init.body = JSON.stringify(body);
				}
			}
			let response: Response;
			try {
				response = await options.fetch(url, init);
			} catch (error) {
				throw new CloudReadError(
					['AbortError', 'TimeoutError'].includes(error instanceof Error ? error.name : '')
						? 'timeout'
						: 'unavailable',
					error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
						? 'TIMEOUT'
						: 'Shelly Cloud niet bereikbaar.'
				);
			}
			const value = await response.json().catch(() => null),
				data = object(value),
				errors = JSON.stringify(data.errors ?? data.error ?? '');
			if (response.status === 429 || /max_req|rate.?limit/i.test(errors)) {
				blockedUntil = Math.max(
					blockedUntil,
					now() + retryAfter(response.headers.get('retry-after'))
				);
				throw new CloudReadError('rate-limit', 'Shelly Cloud is tijdelijk bezet.', blockedUntil);
			}
			if ([401, 403].includes(response.status) || /auth|forbidden|access.denied/i.test(errors))
				throw new CloudReadError('auth', 'Shelly Cloud-toegang is geweigerd.');
			if (!response.ok || data.isok === false || data.error)
				throw new CloudReadError('unavailable', 'Shelly heeft de opdracht geweigerd.');
			if (value === null && !body) throw new CloudReadError('malformed', 'Ongeldige status.');
			return value;
		});
	}
	function view(value: Entry, stale: boolean, error = value.error): CloudSnapshot {
		return {
			value: value.value,
			updatedAt: value.at || null,
			stale,
			...(error ? { failure: error.category, retryAt: Math.max(value.retryAt, error.retryAt) } : {})
		};
	}
	function read(kind: CloudReadKind, force = false): Promise<CloudSnapshot> {
		const value = entry(kind);
		if (value.flight) return value.flight;
		if (now() < value.retryAt) return Promise.resolve(view(value, true));
		const fresh =
			value.value !== null && !value.invalid && !value.error && now() - value.at < TTL[kind];
		if (fresh && (!force || now() - value.at < 5000)) return Promise.resolve(view(value, false));
		value.attempt = now();
		const paths = {
			inventory: '/interface/device/get_all_lists',
			statuses: '/device/all_status',
			scenes: '/scene/list'
		};
		value.flight = (async () => {
			try {
				const result = await request(paths[kind], undefined, kind === 'scenes'),
					payload = object(object(result).data ?? result),
					field =
						kind === 'inventory'
							? 'devices'
							: kind === 'statuses'
								? 'devices_status'
								: 'scene_scripts';
				if (
					!payload[field] ||
					typeof payload[field] !== 'object' ||
					(kind === 'inventory' && !payload.rooms)
				)
					throw new CloudReadError('malformed', 'Ongeldige status.');
				value.value = result;
				value.at = now();
				value.invalid = false;
				value.error = null;
				value.retryAt = 0;
				return view(value, false);
			} catch (error) {
				value.error =
					error instanceof CloudReadError
						? error
						: new CloudReadError('unavailable', 'Shelly-status is niet beschikbaar.');
				value.retryAt = Math.max(now() + 30000, value.error.retryAt);
				return view(value, true);
			}
		})().finally(() => {
			value.flight = null;
		});
		return value.flight;
	}
	function invalidate(kind: CloudReadKind) {
		entry(kind).invalid = true;
	}
	async function control(kind: 'switch' | 'light' | 'cover', body: Record<string, unknown>) {
		const value = await request(`/v2/devices/api/set/${kind}`, body);
		invalidate('statuses');
		return value;
	}
	return { read, invalidate, control };
}
