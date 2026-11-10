import { env } from '$env/dynamic/private';
import { createShellyCloudCache, CloudReadError, type CloudReadKind } from './shelly-cloud-cache';
import { runtimeMode } from './runtime-mode';
export const shellyCloud = createShellyCloudCache({
	authKey: () => env.SHELLY_AUTH_KEY ?? '',
	fetch: (...args) => {
		if (
			runtimeMode(env.KENNEMER_RUNTIME_MODE) === 'mock' ||
			['1', 'true', 'yes', 'on'].includes((env.SHELLY_SIMULATE_DEVICES ?? '').toLowerCase())
		)
			throw new CloudReadError('unavailable', 'Simulatie gebruikt geen cloud.');
		return fetch(...args);
	}
});
export async function requireShellyCloudRead(kind: CloudReadKind, force = false) {
	const result = await shellyCloud.read(kind, force);
	if (result.stale || result.value === null)
		throw new CloudReadError(
			result.failure ?? 'unavailable',
			'Shelly-status is niet beschikbaar.',
			result.retryAt
		);
	return result.value;
}
