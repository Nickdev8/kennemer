import type { RequestHandler } from './$types';
import { recordAuditEvent } from '$lib/server/audit-log';

export const POST: RequestHandler = async ({ request }) => {
	const origin = request.headers.get('origin');
	const host =
		request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host');
	if (!origin || !host) {
		return new Response(JSON.stringify({ error: 'Ongeldige aanvraag.' }), { status: 403 });
	}
	try {
		if (new URL(origin).host !== host) {
			return new Response(JSON.stringify({ error: 'Ongeldige aanvraag.' }), { status: 403 });
		}
	} catch {
		return new Response(JSON.stringify({ error: 'Ongeldige aanvraag.' }), { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ongeldige aanvraag.' }), { status: 400 });
	}
	if (
		!body ||
		typeof body !== 'object' ||
		(body as { source?: unknown }).source !== 'advanced-access' ||
		typeof (body as { accepted?: unknown }).accepted !== 'boolean'
	) {
		return new Response(JSON.stringify({ error: 'Ongeldige aanvraag.' }), { status: 400 });
	}

	await recordAuditEvent('pin.entered', {
		source: 'advanced-access',
		accepted: (body as { accepted: boolean }).accepted
	});
	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};
