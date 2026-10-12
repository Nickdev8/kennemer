import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export const validCommit = (value: unknown): string | null =>
	typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value.trim())
		? value.trim()
		: null;
export const unavailableHost = (error: string) => ({
	available: false,
	clock: null,
	uptimeSeconds: null,
	service: null,
	error
});

export async function localDevelopmentCommit(cwd: string): Promise<string | null> {
	try {
		const { stdout } = await execute('git', ['rev-parse', 'HEAD'], {
			cwd,
			timeout: 3000,
			maxBuffer: 4096
		});
		return validCommit(stdout);
	} catch {
		return null;
	}
}

/** Only whitelisted, validated diagnostics cross the host/browser boundary. */
export function publicHostDiagnostics(input: unknown) {
	const data = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	const host =
		data.host && typeof data.host === 'object' ? (data.host as Record<string, unknown>) : {};
	const service =
		host.service && typeof host.service === 'object'
			? (host.service as Record<string, unknown>)
			: null;
	const state = (value: unknown) =>
		typeof value === 'string' && /^[a-z-]{1,32}$/.test(value) ? value : 'unknown';
	return {
		localCommit: validCommit(data.localCommit),
		remoteCommit: validCommit(data.remoteCommit),
		remoteCheckedAt:
			typeof data.remoteCheckedAt === 'number' && Number.isFinite(data.remoteCheckedAt)
				? data.remoteCheckedAt
				: null,
		remoteError: data.remoteError ? 'Remoteversie niet bereikbaar.' : null,
		host: {
			available: host.available === true,
			clock:
				typeof host.clock === 'string' && /^\d{4}-\d{2}-\d{2}T[0-9:.+Z-]+$/.test(host.clock)
					? host.clock
					: null,
			uptimeSeconds:
				typeof host.uptimeSeconds === 'number' &&
				Number.isFinite(host.uptimeSeconds) &&
				host.uptimeSeconds >= 0
					? host.uptimeSeconds
					: null,
			service: service
				? {
						activeState: state(service.activeState),
						subState: state(service.subState),
						result: state(service.result)
					}
				: null,
			error: host.available === true ? null : 'Hostdiagnostiek niet beschikbaar.'
		}
	};
}
