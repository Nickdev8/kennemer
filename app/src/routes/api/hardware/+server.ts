import { recordAuditEvent } from '$lib/server/audit-log';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const maintenanceUrl = env.KENNEMER_MAINTENANCE_URL ?? 'http://host.docker.internal:8787';
const maintenanceToken = env.KENNEMER_MAINTENANCE_TOKEN ?? '';

type HardwareStatus = 'connected' | 'missing' | 'unavailable';
let lastHardwareStatus: HardwareStatus | null = null;

async function logHardwareStatus(status: HardwareStatus) {
	if (status === lastHardwareStatus) return;
	lastHardwareStatus = status;
	await recordAuditEvent('hardware', { source: 'touchscreen', status });
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store'
		}
	});
}

export const GET: RequestHandler = async () => {
	if (!maintenanceToken) {
		await logHardwareStatus('unavailable');
		return jsonResponse({ ok: false, message: 'Hostonderhoud is niet geconfigureerd.' }, 503);
	}

	try {
		const response = await fetch(`${maintenanceUrl}/hardware`, {
			headers: {
				'x-kennemer-maintenance-token': maintenanceToken
			},
			cache: 'no-store',
			signal: AbortSignal.timeout(3000)
		});
		const payload = await response.json().catch(() => ({
			ok: false,
			message: 'Hostonderhoud gaf een ongeldig antwoord.'
		}));
		const connected = payload?.touchscreen?.connected;
		await logHardwareStatus(
			response.ok && payload?.ok === true && typeof connected === 'boolean'
				? connected
					? 'connected'
					: 'missing'
				: 'unavailable'
		);
		return jsonResponse(payload, response.status);
	} catch (error) {
		await logHardwareStatus('unavailable');
		return jsonResponse(
			{
				ok: false,
				message: error instanceof Error ? error.message : 'Hostonderhoud is niet bereikbaar.'
			},
			502
		);
	}
};
