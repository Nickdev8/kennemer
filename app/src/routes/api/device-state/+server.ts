import type { RequestHandler } from './$types';
import { readDeviceStates } from '$lib/server/device-state-store';

export const GET: RequestHandler = async () => {
	const states = await readDeviceStates();
	return new Response(JSON.stringify({ ok: true, states }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};
