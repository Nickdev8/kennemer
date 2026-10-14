import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '$env/dynamic/private';

let queue: Promise<unknown> = Promise.resolve();
const reply = (body: unknown, status = 200) => Response.json(body, { status });

/** Development storage only. This module has no device or host transport. */
export function mockBells(request: Request, operation: string) {
	const run = queue.then(async () => {
		const defaults = JSON.parse(
			await readFile(resolve(process.cwd(), '../odroid/bell-defaults.json'), 'utf8')
		);
		if (!env.KENNEMER_MOCK_STATE_PATH) return reply({ error: 'Mockopslag ontbreekt.' }, 503);
		const path = join(dirname(env.KENNEMER_MOCK_STATE_PATH), 'bell-roster.json');
		let saved = { revision: 1, config: defaults, last_outcome: null as unknown };
		try {
			saved = JSON.parse(await readFile(path, 'utf8'));
		} catch {}
		if (request.method === 'POST') {
			let input;
			try {
				input = await request.json();
			} catch {
				return reply({ error: 'Ongeldige JSON.' }, 400);
			}
			if (operation !== 'demo' && input.revision !== saved.revision)
				return reply({ error: 'Belrooster is intussen gewijzigd. Laad opnieuw.' }, 409);
			if (operation === 'config') {
				const c = input.config;
				if (
					!c ||
					!['regular', 'short', 'ten-minute'].includes(c.active_profile) ||
					typeof c.paused !== 'boolean' ||
					!Number.isFinite(c.gap_seconds) ||
					c.gap_seconds < 0 ||
					c.gap_seconds > 30 ||
					!Number.isFinite(c.bell_duration_seconds) ||
					c.bell_duration_seconds < 0.1 ||
					c.bell_duration_seconds > 30 ||
					!Array.isArray(c.weekdays) ||
					!c.weekdays.length ||
					c.weekdays.some((day: number) => !Number.isInteger(day) || day < 0 || day > 6) ||
					['regular', 'short', 'ten-minute'].some(
						(profile) => !Array.isArray(c.profiles?.[profile])
					)
				)
					return reply({ error: 'Ongeldig belrooster.' }, 400);
				saved.config = { ...c, relays: saved.config.relays };
			} else if (operation === 'relays') {
				const ids = input.relayIds;
				if (
					!Array.isArray(ids) ||
					ids.length !== 2 ||
					ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{12}$/i.test(id)) ||
					ids[0].toLowerCase() === ids[1].toLowerCase()
				)
					return reply({ error: 'Vul twee verschillende Shelly-ID’s in.' }, 400);
				saved.config = { ...saved.config, relays: ids.map((id) => ({ id: id.toLowerCase() })) };
			} else if (operation === 'restore')
				saved.config = {
					...defaults,
					paused: saved.config.paused,
					active_profile: saved.config.active_profile,
					relays: saved.config.relays
				};
			else if (operation === 'pause') saved.config.paused = true;
			else if (operation === 'resume') saved.config.paused = false;
			else if (operation === 'demo') {
				if (![1, 2].includes(input.count)) return reply({ error: 'Kies 1× of 2×.' }, 400);
				saved.last_outcome = { ok: true, simulated: true, count: input.count };
			}
			if (operation !== 'demo') saved.revision++;
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path + '.tmp', JSON.stringify(saved), { mode: 0o600 });
			await rename(path + '.tmp', path);
			return reply({ ok: true, simulation: true });
		}
		if (operation === 'config')
			return reply({
				revision: saved.revision,
				config: saved.config,
				preview: false,
				simulation: true
			});
		return reply({
			ok: true,
			preview: false,
			simulation: true,
			paused: saved.config.paused,
			enabled: !saved.config.paused,
			active_profile: saved.config.active_profile,
			bell_duration_seconds: saved.config.bell_duration_seconds,
			clock: { synchronized: true, timezone: 'Europe/Amsterdam' },
			config_revision: saved.revision,
			next_event: null,
			last_outcome: saved.last_outcome,
			relay_health: [],
			scheduler: { last_scan: null, skipped_missed: 0 }
		});
	});
	queue = run.catch(() => undefined);
	return run;
}
