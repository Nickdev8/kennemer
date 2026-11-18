import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModuleLoader } from '../scripts/module-loader.mjs';

test('touchscreen changes are audited without duplicate or false missing reports', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-hardware-'));
	const keys = ['KENNEMER_AUDIT_LOG_DIR', 'KENNEMER_MAINTENANCE_TOKEN', 'KENNEMER_MAINTENANCE_URL'];
	const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
	const previousFetch = globalThis.fetch;
	Object.assign(process.env, {
		KENNEMER_AUDIT_LOG_DIR: directory,
		KENNEMER_MAINTENANCE_TOKEN: 'test-only-token',
		KENNEMER_MAINTENANCE_URL: 'http://host.invalid'
	});
	const loader = await createModuleLoader();
	try {
		const { GET } = await loader.ssrLoadModule('/src/routes/api/hardware/+server.ts');
		const cases = [
			[200, { ok: true, touchscreen: { connected: false } }],
			[200, { ok: true, touchscreen: { connected: false } }],
			[200, { ok: true, touchscreen: { connected: true } }],
			[200, { ok: true, touchscreen: { connected: true } }],
			[503, { ok: true, touchscreen: { connected: false } }],
			[200, { ok: true, touchscreen: { connected: 'false' } }],
			[200, null],
			[200, 'invalid JSON'],
			[502, new Error('Simulated host timeout')],
			[200, { ok: true, touchscreen: { connected: true } }]
		];
		for (const [status, payload] of cases) {
			globalThis.fetch = async (url, options) => {
				assert.equal(url, 'http://host.invalid/hardware');
				assert.ok(options.signal instanceof AbortSignal);
				if (payload instanceof Error) throw payload;
				return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
					status
				});
			};
			const response = await GET();
			assert.equal(response.status, status);
			if (typeof payload !== 'string' && !(payload instanceof Error)) {
				assert.deepEqual(await response.json(), payload);
			}
		}
		const files = (await readdir(directory, { recursive: true })).filter((file) =>
			file.endsWith('.jsonl')
		);
		const contents = (
			await Promise.all(files.map((file) => readFile(join(directory, file), 'utf8')))
		).join('');
		const events = contents.trim().split('\n').map(JSON.parse);
		assert.deepEqual(
			events.map(({ type, source, status }) => ({ type, source, status })),
			[
				{ type: 'hardware', source: 'touchscreen', status: 'missing' },
				{ type: 'hardware', source: 'touchscreen', status: 'connected' },
				{ type: 'hardware', source: 'touchscreen', status: 'unavailable' },
				{ type: 'hardware', source: 'touchscreen', status: 'connected' }
			]
		);
		assert.equal(contents.includes('test-only-token'), false);
		assert.equal(contents.includes('host.invalid'), false);
	} finally {
		globalThis.fetch = previousFetch;
		for (const key of keys) {
			if (previous[key] === undefined) delete process.env[key];
			else process.env[key] = previous[key];
		}
		await loader.close();
		await rm(directory, { recursive: true, force: true });
	}
});
