import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { authorizeSceneConfig } from '$lib/server/scene-config-auth';
import { recordAuditEvent } from '$lib/server/audit-log';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const reads = new Set(['status', 'config']);
const writes = new Set(['config', 'pause', 'resume', 'restore', 'demo']);
const reply = (body: unknown, status = 200) => json(body, { status, headers: { 'cache-control': 'no-store' } });

const proxy: RequestHandler = async ({ request, params, url }) => {
	const operation = params.operation;
	if (!(request.method === 'GET' ? reads : writes).has(operation)) return reply({ error: 'Onbekende belactie.' }, 404);
	if (env.KENNEMER_RUNTIME_MODE) {
		if (request.method === 'POST') return reply({ error: 'De belservice werkt alleen op de ODROID.' }, 403);
		const config = JSON.parse(await readFile(resolve(process.cwd(), '../odroid/bell-defaults.json'), 'utf8'));
		if (operation === 'config') return reply({ revision: 1, config });
		return reply({
			ok: true, preview: true, paused: true, enabled: false, simulation: true,
			clock: { synchronized: false, timezone: 'Europe/Amsterdam' },
			config_revision: 1, next_event: null, last_outcome: null, relay_health: [],
			scheduler: { last_scan: null, skipped_missed: 0 }
		});
	}
	if (request.method === 'POST') {
		const failure = authorizeSceneConfig(request, url.origin);
		await recordAuditEvent('pin.entered', { source: 'bell-roster', accepted: !failure });
		if (failure) return reply(failure, failure.status);
	}
	if (!env.KENNEMER_MAINTENANCE_TOKEN) return reply({ error: 'Belservice is niet geconfigureerd.' }, 503);
	let body: string | undefined;
	if (request.method === 'POST') {
		body = await request.text();
		if (body.length > 65536) return reply({ error: 'Roosterbestand is te groot.' }, 413);
		try { JSON.parse(body); } catch { return reply({ error: 'Ongeldige JSON.' }, 400); }
	}
	try {
		const response = await fetch(`${env.KENNEMER_BELL_URL ?? 'http://host.docker.internal:8788'}/${operation}`, {
			method: request.method,
			headers: { 'content-type': 'application/json', 'x-kennemer-maintenance-token': env.KENNEMER_MAINTENANCE_TOKEN },
			body,
			signal: AbortSignal.timeout(15000)
		});
		const payload = await response.json();
		if (response.ok && request.method === 'POST') await recordAuditEvent('bell.operation', { operation });
		return reply(payload, response.status);
	} catch {
		return reply({
			error: request.method === 'GET'
				? 'Belservice niet bereikbaar.'
				: 'Belservice niet bereikbaar. Uitkomst onbekend; een belactie niet opnieuw versturen.'
		}, 502);
	}
};

export const GET = proxy;
export const POST = proxy;
