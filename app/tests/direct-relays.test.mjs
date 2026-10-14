import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModuleLoader } from '../scripts/module-loader.mjs';

test('relay channels use base cache IDs and off remains a valid status', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-direct-'));
	const previous = process.env.IP_CACHE_PATH,
		originalFetch = globalThis.fetch;
	process.env.IP_CACHE_PATH = join(directory, 'ips.json');
	let loader;
	try {
		await writeFile(
			process.env.IP_CACHE_PATH,
			JSON.stringify({
				devices: {
					'2805A5CA1D18': { ip: '10.10.80.132' },
					'80646fdb0d1c': { ip: '10.10.80.95' },
					'90706948e37c': { ip: '10.10.80.169' }
				}
			})
		);
		loader = await createModuleLoader();
		const { readDirectOutput, sendDirectCommand } = await loader.ssrLoadModule(
			'/src/lib/server/direct-device.ts'
		);
		const calls = [];
		globalThis.fetch = async (url, options) => {
			const body = JSON.parse(options.body);
			calls.push({ url, body });
			return Response.json({ result: body.method.endsWith('.GetStatus') ? { output: false } : {} });
		};
		for (let channel = 0; channel < 4; channel++) {
			assert.equal(await readDirectOutput(`2805a5ca1d18_${channel}`), 'off');
			assert.equal(calls.at(-1).url, 'http://10.10.80.132/rpc');
			assert.equal(calls.at(-1).body.params.id, channel);
		}
		await sendDirectCommand('2805a5ca1d18_3', 'on');
		assert.deepEqual(calls.at(-1).body.params, { id: 3, on: true });
		assert.equal(calls.at(-1).body.method, 'Switch.Set');
		assert.equal(await readDirectOutput('80646fdb0d1c'), 'off');
		assert.equal(calls.at(-1).body.params.id, 0);
		assert.equal(await readDirectOutput('90706948e37c'), 'off');
		assert.equal(calls.at(-1).body.method, 'RGBCCT.GetStatus');
		await assert.rejects(readDirectOutput('aaaaaaaaaaaa_0'), /niet geconfigureerd/);
		await assert.rejects(readDirectOutput('78ee4cd5bfac_0'), /apparaatcache/);
	} finally {
		globalThis.fetch = originalFetch;
		if (previous === undefined) delete process.env.IP_CACHE_PATH;
		else process.env.IP_CACHE_PATH = previous;
		await loader?.close();
		await rm(directory, { recursive: true, force: true });
	}
});
