import test from 'node:test';
import assert from 'node:assert/strict';
import { createShellyCloudCache } from '../src/lib/server/shelly-cloud-cache.ts';
function fixture() {
	let now = 1_000_000,
		limited = false;
	const calls = [];
	const cache = createShellyCloudCache({
		now: () => now,
		sleep: async (ms) => {
			now += ms;
		},
		authKey: () => 'fixture-key',
		fetch: async (input, init) => {
			const url = new URL(input);
			calls.push({ path: url.pathname, time: now, body: init?.body });
			if (limited)
				return Response.json(
					{ errors: { max_req: true } },
					{ status: 401, headers: { 'retry-after': '120' } }
				);
			if (url.pathname.includes('/set/')) return Response.json({ ok: true });
			return Response.json({
				data: url.pathname.includes('get_all_lists')
					? { devices: {}, rooms: {} }
					: url.pathname === '/scene/list'
						? { scene_scripts: {} }
						: { devices_status: {} }
			});
		}
	});
	return {
		cache,
		calls,
		advance(ms) {
			now += ms;
		},
		limit(value) {
			limited = value;
		}
	};
}
test('consumers coalesce one inventory/status read, metadata lives24h and pressing never refreshes inventory', async () => {
	const { cache, calls, advance } = fixture();
	await Promise.all(Array.from({ length: 5 }, () => cache.read('inventory')));
	assert.equal(calls.length, 1);
	await Promise.all([cache.read('statuses'), cache.read('statuses')]);
	assert.equal(calls.length, 2);
	assert.ok(calls[1].time - calls[0].time >= 1100);
	advance(31_000);
	await cache.control('switch', { id: 'fixture', channel: 2, on: false });
	await cache.read('inventory');
	await cache.read('statuses');
	assert.equal(calls.filter((call) => call.path.includes('get_all_lists')).length, 1);
	advance(23 * 60 * 60_000);
	await cache.read('inventory');
	assert.equal(calls.filter((call) => call.path.includes('get_all_lists')).length, 1);
	advance(2 * 60 * 60_000);
	await cache.read('inventory');
	assert.equal(calls.filter((call) => call.path.includes('get_all_lists')).length, 2);
});
test('explicit refresh updates both resources once and debounces repeated refreshes', async () => {
	const { cache, calls, advance } = fixture();
	await Promise.all([cache.read('inventory'), cache.read('statuses')]);
	advance(6000);
	await Promise.all([
		cache.read('inventory', true),
		cache.read('inventory', true),
		cache.read('statuses', true),
		cache.read('statuses', true)
	]);
	assert.equal(calls.length, 4);
	await Promise.all([cache.read('inventory', true), cache.read('statuses', true)]);
	assert.equal(calls.length, 4);
});
test('rate limit honors Retry-After, preserves stale status, and never replays a blocked mutation', async () => {
	const { cache, calls, advance, limit } = fixture();
	const first = await cache.read('statuses');
	assert.equal(first.stale, false);
	advance(31_000);
	limit(true);
	const stale = await cache.read('statuses');
	assert.equal(stale.stale, true);
	assert.equal(stale.failure, 'rate-limit');
	assert.deepEqual(stale.value, first.value);
	const count = calls.length;
	await cache.read('statuses', true);
	await assert.rejects(cache.control('switch', { id: 'fixture', channel: 2, on: true }));
	assert.equal(calls.length, count);
	advance(61_000);
	await cache.read('statuses', true);
	assert.equal(calls.length, count);
	limit(false);
	advance(61_000);
	assert.equal((await cache.read('statuses')).stale, false);
	assert.equal(calls.filter((call) => call.path.includes('/set/')).length, 0);
});
