import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { mockBells } from '$lib/server/mock-bells';
import type { RequestHandler } from './$types';
import { authorizeSceneConfig } from '$lib/server/scene-config-auth';
import { recordAuditEvent } from '$lib/server/audit-log';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const reads = new Set(['status', 'config']);
const writes = new Set(['config', 'pause', 'resume', 'restore', 'demo', 'relays']);
const reply = (body: unknown, status = 200) =>
	json(body, { status, headers: { 'cache-control': 'no-store' } });

const proxy: RequestHandler = async ({ request, params, url }) => {
	const operation = params.operation;
	if (!(request.method === 'GET' ? reads : writes).has(operation))
		return reply({ error: 'Onbekende belactie.' }, 404);
	if (request.method === 'POST') {
		const failure = authorizeSceneConfig(request, url.origin);
		if (failure) return reply(failure, failure.status);
	}
	if (env.KENNEMER_RUNTIME_MODE === 'mock') return mockBells(request, operation);
	if (env.KENNEMER_RUNTIME_MODE) {
		if (request.method === 'POST')
			return reply({ error: 'De belservice werkt alleen op de ODROID.' }, 403);
		const config = JSON.parse(
			await readFile(resolve(process.cwd(), '../odroid/bell-defaults.json'), 'utf8')
		);
		if (operation === 'config') return reply({ revision: 1, config, preview: true });
		return reply({
			ok: true,
			preview: true,
			paused: true,
			enabled: false,
			simulation: true,
			clock: { synchronized: false, timezone: 'Europe/Amsterdam' },
			config_revision: 1,
			next_event: null,
			last_outcome: null,
			relay_health: [],
			scheduler: { last_scan: null, skipped_missed: 0 }
		});
	}
	if (request.method === 'POST') {
		const failure = authorizeSceneConfig(request, url.origin);
		if (failure) return reply(failure, failure.status);
	}
	if (!env.KENNEMER_MAINTENANCE_TOKEN)
		return reply({ error: 'Belservice is niet geconfigureerd.' }, 503);
	let body: string | undefined;
	if (request.method === 'POST') {
		body = await request.text();
		if (body.length > 65536) return reply({ error: 'Roosterbestand is te groot.' }, 413);
		try {
			JSON.parse(body);
		} catch {
			return reply({ error: 'Ongeldige JSON.' }, 400);
		}
	}
	try {
		let hostOperation = operation;
		const headers = {
			'content-type': 'application/json',
			'x-kennemer-maintenance-token': env.KENNEMER_MAINTENANCE_TOKEN
		};
		const hostBase = env.KENNEMER_BELL_URL ?? 'http://host.docker.internal:8788';
		if (request.method === 'POST' && (operation === 'config' || operation === 'relays')) {
			const currentResponse = await fetch(`${hostBase}/config`, {
				headers,
				signal: AbortSignal.timeout(15000)
			});
			if (!currentResponse.ok) return reply(await currentResponse.json(), currentResponse.status);
			const current = await currentResponse.json();
			const input = JSON.parse(body!);
			if (input.revision !== current.revision)
				return reply({ error: 'Belrooster is intussen gewijzigd. Laad opnieuw.' }, 409);
			if (operation === 'relays') {
				const ids = input.relayIds;
				if (
					!Array.isArray(ids) ||
					ids.length !== 2 ||
					ids.some((id) => typeof id !== 'string' || !/^[0-9a-f]{12}$/i.test(id)) ||
					ids[0].toLowerCase() === ids[1].toLowerCase()
				)
					return reply({ error: 'Vul twee verschillende Shelly-ID’s in.' }, 400);
				let cache: Record<string, any> = {};
				try {
					cache = JSON.parse(
						await readFile(resolve(process.cwd(), env.IP_CACHE_PATH ?? 'ips.json'), 'utf8')
					);
				} catch {}
				const relays = ids.map((value: string) => {
					const id = value.toLowerCase();
					const devices = cache.devices ?? cache;
					const entry = Array.isArray(devices)
						? devices.find((device) => device.id?.toLowerCase() === id)
						: (devices[id] ??
							Object.entries(devices).find(
								([key, device]) =>
									key.toLowerCase() === id || (device as { id?: string })?.id?.toLowerCase() === id
							)?.[1]);
					const known =
						Boolean(entry) ||
						current.config.relays?.some((relay: { id: string }) => relay.id === id);
					if (!known)
						throw new Error(`Geen LAN-adres bekend voor Shelly ${id}. Vernieuw de apparaatcache.`);
					return { id };
				});
				body = JSON.stringify({
					revision: current.revision,
					config: { ...current.config, relays }
				});
				hostOperation = 'config';
			} else {
				if (
					input.config?.relays &&
					JSON.stringify(input.config.relays) !== JSON.stringify(current.config.relays)
				)
					return reply({ error: 'Wijzig belrelais via Bediening beheren.' }, 400);
				body = JSON.stringify({
					...input,
					config: { ...input.config, relays: current.config.relays }
				});
			}
		}
		const response = await fetch(
			`${env.KENNEMER_BELL_URL ?? 'http://host.docker.internal:8788'}/${hostOperation}`,
			{
				method: request.method,
				headers: {
					'content-type': 'application/json',
					'x-kennemer-maintenance-token': env.KENNEMER_MAINTENANCE_TOKEN
				},
				body,
				signal: AbortSignal.timeout(hostOperation === 'config' ? 60000 : 15000)
			}
		);
		const payload = await response.json();
		if (response.ok && request.method === 'POST')
			await recordAuditEvent('bell.operation', { operation });
		return reply(payload, response.status);
	} catch (error) {
		if (error instanceof Error && error.message.startsWith('Geen LAN-adres'))
			return reply({ error: error.message }, 400);
		return reply(
			{
				error:
					request.method === 'GET'
						? 'Belservice niet bereikbaar.'
						: 'Belservice niet bereikbaar. Uitkomst onbekend; een belactie niet opnieuw versturen.'
			},
			502
		);
	}
};

export const GET = proxy;
export const POST = proxy;
