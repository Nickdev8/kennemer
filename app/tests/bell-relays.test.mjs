import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModuleLoader } from '../scripts/module-loader.mjs';

test('relay editor keeps roster and mode, stores IDs only, and rejects unknown or duplicate targets', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-relay-editor-'));
	const settings = {
		KENNEMER_MAINTENANCE_TOKEN: 'test-token',
		KENNEMER_CONFIG_EDIT_PIN: 'test-pin',
		KENNEMER_BELL_URL: 'http://localhost:8788',
		IP_CACHE_PATH: join(directory, 'ips.json'),
		KENNEMER_AUDIT_LOG_DIR: join(directory, 'logs')
	};
	const previous = Object.fromEntries(
		[...Object.keys(settings), 'KENNEMER_RUNTIME_MODE'].map((key) => [key, process.env[key]])
	);
	Object.assign(process.env, settings);
	delete process.env.KENNEMER_RUNTIME_MODE;
	const originalFetch = globalThis.fetch;
	let loader;
	try {
		await writeFile(
			settings.IP_CACHE_PATH,
			JSON.stringify({ devices: { A8032ABC4265: { ip: '10.10.80.200' } } })
		);
		loader = await createModuleLoader();
		const { POST } = await loader.ssrLoadModule('/src/routes/api/bells/[operation]/+server.ts');
		const config = {
			paused: false,
			active_profile: 'short',
			weekdays: [0, 1, 2, 3, 4],
			gap_seconds: 2,
			bell_duration_seconds: 3,
			profiles: { regular: [], short: ['08:10x2'], 'ten-minute': [] },
			relays: [{ id: 'a8032abc4264' }, { id: '08b61fd8993c' }]
		};
		const writes = [];
		globalThis.fetch = async (url, options = {}) => {
			assert.equal(String(url), 'http://localhost:8788/config');
			if (options.method === 'POST') {
				writes.push(JSON.parse(options.body));
				return Response.json({ ok: true });
			}
			return Response.json({ revision: 7, config });
		};
		const send = (operation, body) =>
			POST({
				params: { operation },
				url: new URL('http://localhost/api/bells/' + operation),
				request: new Request('http://localhost/api/bells/' + operation, {
					method: 'POST',
					headers: {
						origin: 'http://localhost',
						host: 'localhost',
						'content-type': 'application/json',
						'x-kennemer-config-pin': 'test-pin'
					},
					body: JSON.stringify(body)
				})
			});
		assert.equal(
			(await send('relays', { revision: 7, relayIds: ['a8032abc4265', '08b61fd8993c'] })).status,
			200
		);
		assert.deepEqual(writes[0], {
			revision: 7,
			config: { ...config, relays: [{ id: 'a8032abc4265' }, { id: '08b61fd8993c' }] }
		});
		assert.equal(JSON.stringify(writes[0]).includes('10.10.'), false);
		assert.equal(
			(await send('relays', { revision: 7, relayIds: ['a8032abc4265', 'a8032abc4265'] })).status,
			400
		);
		assert.equal(
			(await send('relays', { revision: 7, relayIds: ['ffffffffffff', '08b61fd8993c'] })).status,
			400
		);
		assert.equal(
			(await send('relays', { revision: 6, relayIds: ['a8032abc4265', '08b61fd8993c'] })).status,
			409
		);
		assert.equal(
			(
				await send('config', {
					revision: 7,
					config: { ...config, relays: [{ id: 'a8032abc4265' }, { id: '08b61fd8993c' }] }
				})
			).status,
			400
		);
		assert.equal(writes.length, 1);
	} finally {
		globalThis.fetch = originalFetch;
		await loader?.close();
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		await rm(directory, { recursive: true, force: true });
	}
});
