import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const maintenanceUrl = env.KENNEMER_MAINTENANCE_URL ?? 'http://host.docker.internal:8787';
const maintenanceToken = env.KENNEMER_MAINTENANCE_TOKEN ?? '';

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
		return jsonResponse({ ok: false, message: 'Hostonderhoud is niet geconfigureerd.' }, 503);
	}

	try {
		const response = await fetch(`${maintenanceUrl}/hardware`, {
			headers: {
				'x-kennemer-maintenance-token': maintenanceToken
			},
			cache: 'no-store'
		});
		const payload = await response.json().catch(() => ({
			ok: false,
			message: 'Hostonderhoud gaf een ongeldig antwoord.'
		}));
		return jsonResponse(payload, response.status);
	} catch (error) {
		return jsonResponse(
			{
				ok: false,
				message: error instanceof Error ? error.message : 'Hostonderhoud is niet bereikbaar.'
			},
			502
		);
	}
};
