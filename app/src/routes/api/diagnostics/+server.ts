import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { appVersion, buildCommit } from '$lib/server/build-info';
import {
	localDevelopmentCommit,
	publicHostDiagnostics,
	unavailableHost
} from '$lib/server/diagnostics';

export const GET: RequestHandler = async () => {
	const base = { ok: true, appVersion, buildCommit };
	let payload: Record<string, unknown>;
	if (env.KENNEMER_RUNTIME_MODE === 'mock') {
		payload = {
			...base,
			mode: 'mock',
			localCommit: 'a'.repeat(40),
			remoteCommit: 'b'.repeat(40),
			remoteCheckedAt: 1760000000000,
			remoteError: null,
			host: {
				available: true,
				clock: '2026-10-12T12:00:00Z',
				uptimeSeconds: 3600,
				service: { activeState: 'inactive', subState: 'dead', result: 'success' },
				error: null
			}
		};
	} else if (env.KENNEMER_RUNTIME_MODE === 'live') {
		payload = {
			...base,
			mode: 'development-live',
			localCommit: await localDevelopmentCommit(process.cwd()),
			remoteCommit: null,
			remoteCheckedAt: null,
			remoteError: 'Remotecontrole is niet beschikbaar in lokale ontwikkeling.',
			host: unavailableHost('Hostdiagnostiek is niet beschikbaar in lokale ontwikkeling.')
		};
	} else {
		const unavailable = {
			localCommit: null,
			remoteCommit: null,
			remoteCheckedAt: null,
			remoteError: 'Hostdiagnostiek niet beschikbaar.',
			host: unavailableHost('Hostdiagnostiek niet beschikbaar.')
		};
		let diagnostics = unavailable as ReturnType<typeof publicHostDiagnostics>;
		if (env.KENNEMER_MAINTENANCE_TOKEN) {
			try {
				const response = await fetch(
					`${env.KENNEMER_MAINTENANCE_URL ?? 'http://host.docker.internal:8787'}/diagnostics`,
					{
						headers: { 'x-kennemer-maintenance-token': env.KENNEMER_MAINTENANCE_TOKEN },
						signal: AbortSignal.timeout(12000),
						cache: 'no-store'
					}
				);
				if (response.ok) diagnostics = publicHostDiagnostics(await response.json());
			} catch {
				/* Availability remains explicit; never expose transport errors or credentials. */
			}
		}
		payload = { ...base, mode: 'production', ...diagnostics };
	}
	return new Response(JSON.stringify(payload), {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};
