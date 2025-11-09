import { unlink } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

import type { RequestHandler } from './$types';

const IP_CACHE_PATH = resolvePath(process.cwd(), 'ips.json');

export const POST: RequestHandler = async () => {
	try {
		await unlink(IP_CACHE_PATH);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== 'ENOENT') {
			return jsonError('Kon cache niet verwijderen', 500);
		}
	}

	return jsonResponse({ ok: true });
};

function jsonResponse(payload: unknown) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function jsonError(message: string, status = 500) {
	return new Response(JSON.stringify({ ok: false, message }), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

