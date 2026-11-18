import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModuleLoader } from '../scripts/module-loader.mjs';

test('connectivity audits confirmed outages and recovery without repeated entries', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-connectivity-'));
	const previousDirectory = process.env.KENNEMER_AUDIT_LOG_DIR;
	const previousFetch = globalThis.fetch;
	process.env.KENNEMER_AUDIT_LOG_DIR = directory;
	const loader = await createModuleLoader();
	try {
		const { GET } = await loader.ssrLoadModule('/src/routes/api/connectivity/+server.ts');
		let reachable = true;
		globalThis.fetch = async (_url, options) => {
			assert.equal(options.method, 'HEAD');
			assert.equal(options.redirect, 'manual');
			if (!reachable) throw new Error('Simulated network failure');
			return new Response(null, { status: 503 });
		};
		for (const expected of [true, false, true, false, false, false, true, true]) {
			reachable = expected;
			assert.deepEqual(await (await GET()).json(), { online: expected });
		}
		const files = (await readdir(directory, { recursive: true })).filter((file) => file.endsWith('.jsonl'));
		const contents = await Promise.all(files.map((file) => readFile(join(directory, file), 'utf8')));
		const events = contents.join('').trim().split('\n').map(JSON.parse);
		assert.deepEqual(events.map(({ type, source, online, outcome }) => ({ type, source, online, outcome })), [
			{ type: 'connectivity', source: 'shelly-cloud', online: false, outcome: 'unreachable' },
			{ type: 'connectivity', source: 'shelly-cloud', online: true, outcome: 'restored' }
		]);
	} finally {
		globalThis.fetch = previousFetch;
		if (previousDirectory === undefined) delete process.env.KENNEMER_AUDIT_LOG_DIR;
		else process.env.KENNEMER_AUDIT_LOG_DIR = previousDirectory;
		await loader.close();
		await rm(directory, { recursive: true, force: true });
	}
});
