import { recordAuditEvent } from '$lib/server/audit-log';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const DEFAULT_CHECK_URL = 'https://shelly-115-eu.shelly.cloud/';
const CHECK_TIMEOUT_MS = 3000;

let consecutiveFailures = 0;
let lastReportedOnline = true;

export const GET: RequestHandler = async () => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
	let online = false;

	try {
		// Any HTTP response proves that the ODROID can reach Shelly Cloud.
		await fetch(env.CONNECTIVITY_CHECK_URL ?? DEFAULT_CHECK_URL, {
			method: 'HEAD',
			cache: 'no-store',
			redirect: 'manual',
			signal: controller.signal
		});
		online = true;
	} catch {
		online = false;
	} finally {
		clearTimeout(timeout);
	}

	consecutiveFailures = online ? 0 : consecutiveFailures + 1;
	const reportedOnline = online || consecutiveFailures < 2;
	if (reportedOnline !== lastReportedOnline) {
		lastReportedOnline = reportedOnline;
		await recordAuditEvent('connectivity', {
			source: 'shelly-cloud',
			online: reportedOnline,
			outcome: reportedOnline ? 'restored' : 'unreachable'
		});
	}

	return new Response(JSON.stringify({ online }), {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store'
		}
	});
};
