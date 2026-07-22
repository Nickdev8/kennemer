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
		return jsonResponse({ ok: false, message: 'Maintenance token is not configured' }, 503);
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
			message: 'Maintenance service returned an invalid response'
		}));
		return jsonResponse(payload, response.status);
	} catch (error) {
		return jsonResponse(
			{
				ok: false,
				message: error instanceof Error ? error.message : 'Maintenance service is unreachable'
			},
			502
		);
	}
};
