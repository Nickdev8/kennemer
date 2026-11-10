import test from 'node:test';
import assert from 'node:assert/strict';
import { createModuleLoader } from '../scripts/module-loader.mjs';
const loader = await createModuleLoader();
const { aggregateVacation } = await loader.ssrLoadModule('/src/lib/dashboard/vacation-status.ts');
const { parseVacationDefinitions, privateIpv4, outputState } = await loader.ssrLoadModule(
	'/src/lib/server/vacation-core.ts'
);
const { createVacationReader } = await loader.ssrLoadModule('/src/lib/server/vacation-reader.ts');
const { createVacationTransport } = await loader.ssrLoadModule(
	'/src/lib/server/vacation-transport.ts'
);
await loader.close();
const ids = { begin: ['111111'], end: ['222222'] },
	device = 'ece334f7b214';
function scripts(flags = [false, false, false]) {
	return {
		scene_scripts: {
			111111: {
				do: [
					{ r: 'dev:260460590379540:r3', set: 'off' },
					{ r: 'blprop:1727329580882:enabled', set: 'false' },
					{ r: 'blprop:1782213221849:enabled', set: 'false' },
					{
						wait: '180',
						units: 'minutes',
						do: { blk: [{ r: 'blprop:1730105330475:enabled', set: 'false' }] }
					}
				]
			},
			222222: {
				do: [
					{ r: 'dev:260460590379540:r3', set: 'on' },
					...['1727329580882', '1782213221849', '1730105330475'].map((id) => ({
						r: `blprop:${id}:enabled`,
						set: 'true'
					}))
				]
			},
			...Object.fromEntries(
				['1727329580882', '1782213221849', '1730105330475'].map((id, index) => [
					id,
					{
						_enabled: flags[index],
						_meta: { name: ['gang aan', 'Scr. HFD dicht zomer', 'Alles uit Alarm'][index] }
					}
				])
			)
		}
	};
}
const inventory = {
	devices: {
		ece334f7b214_2: { id: device + '_2', name: '3) Bel trafo', channel: 2, gen: 2, ip: '10.0.0.3' }
	}
};
function statuses(output = false, online = true) {
	return {
		devices_status: {
			differentKey: {
				_dev_info: { id: device, online },
				'switch:2': { output },
				wifi: { sta_ip: '10.0.0.2' }
			}
		}
	};
}
function observed(targets, actual) {
	return targets.map((target) => ({ ...target, label: target.id, actual, source: 'lan' }));
}
test('adaptive definitions resolve configured roots, exact output channel, cloud flags and actual delays', () => {
	const targets = parseVacationDefinitions(scripts(), ids);
	assert.equal(targets.length, 4);
	const output = targets.find((target) => target.kind === 'output');
	assert.equal(output.deviceId, device);
	assert.equal(output.channel, 2);
	assert.equal(output.begin, false);
	assert.equal(output.end, true);
	const alarm = targets.find((target) => target.sceneId === '1730105330475');
	assert.deepEqual(alarm.delays.begin, [10800]);
	assert.deepEqual(alarm.delays.end, [0]);
	const extra = scripts();
	extra.scene_scripts[111111].do.push({ r: 'blprop:333333:enabled', set: 'false' });
	extra.scene_scripts[222222].do.push({ r: 'blprop:333333:enabled', set: 'true' });
	assert.equal(parseVacationDefinitions(extra, ids).length, 5);
	const changed = scripts();
	changed.scene_scripts[111111].do[3].units = 'sec';
	assert.deepEqual(
		parseVacationDefinitions(changed, ids).find((target) => target.sceneId === '1730105330475')
			.delays.begin,
		[180]
	);
});
test('missing, one-sided, conflicting, toggle and unsupported actions cannot become a complete mode', () => {
	const targets = parseVacationDefinitions(scripts(), ids);
	assert.equal(aggregateVacation(observed(targets, false)), 'active');
	assert.equal(aggregateVacation(observed(targets, true)), 'inactive');
	const partial = observed(targets, false);
	partial[0].actual = true;
	assert.equal(aggregateVacation(partial), 'partial');
	partial[1].actual = null;
	assert.equal(aggregateVacation(partial), 'unknown');
	const extra = scripts();
	extra.scene_scripts[111111].do.push({ grpctrl: 2, turn: 'off' });
	assert.equal(aggregateVacation(observed(parseVacationDefinitions(extra, ids), false)), 'unknown');
	const conditional = scripts();
	conditional.scene_scripts[111111].do[3].if = { unknown: true };
	assert.ok(
		parseVacationDefinitions(conditional, ids).some((target) => target.kind === 'unsupported')
	);
	const toggle = scripts();
	toggle.scene_scripts[111111].do[0].set = 'toggle';
	assert.ok(parseVacationDefinitions(toggle, ids).some((target) => target.kind === 'unsupported'));
	const conflict = scripts();
	conflict.scene_scripts[111111].do.push({ r: 'dev:260460590379540:r3', set: 'on' });
	assert.ok(
		parseVacationDefinitions(conflict, ids).some((target) => target.kind === 'unsupported')
	);
	assert.equal(aggregateVacation(observed(parseVacationDefinitions({}, ids), false)), 'unknown');
	const oneSide = scripts();
	oneSide.scene_scripts[222222].do.pop();
	assert.equal(
		aggregateVacation(observed(parseVacationDefinitions(oneSide, ids), false)),
		'unknown'
	);
});
test('reader coalesces requests, caches status30s and definitions/inventory5min, adapts changed actions and never uses action memory', async () => {
	let now = 1_000_000,
		listing = scripts(),
		physical = false,
		cloudFails = false;
	const calls = [],
		lanCalls = [];
	const reader = createVacationReader({
		scenes: async () => ids,
		now: () => now,
		cloud: async (kind) => {
			calls.push(kind);
			if (cloudFails && kind === 'scenes') throw new Error('offline');
			return kind === 'scenes' ? listing : kind === 'inventory' ? inventory : statuses(physical);
		},
		lan: async (id, targets) => {
			lanCalls.push(id);
			return new Map(targets.map((target) => [target.id, physical]));
		}
	});
	const [first, same] = await Promise.all([reader.read(), reader.read()]);
	assert.deepEqual(first, same);
	assert.equal(first.state, 'active');
	assert.equal(first.rows[0].label, '3) Bel trafo');
	assert.equal(first.rows[0].source, 'lan');
	assert.equal(calls.length, 3);
	assert.equal(lanCalls.length, 1);
	await reader.read();
	assert.equal(calls.length, 3);
	assert.equal(lanCalls.length, 1);
	now += 31_000;
	physical = true;
	listing = scripts([true, true, true]);
	const inactive = await reader.read();
	assert.equal(inactive.state, 'inactive');
	assert.equal(calls.filter((kind) => kind === 'inventory').length, 1);
	now += 31_000;
	listing.scene_scripts[111111].do.push({ r: 'blprop:333333:enabled', set: 'false' });
	listing.scene_scripts[222222].do.push({ r: 'blprop:333333:enabled', set: 'true' });
	listing.scene_scripts[333333] = { _enabled: false, _meta: { name: 'Extra controle' } };
	assert.equal((await reader.read()).rows.length, 5);
	now += 31_000;
	cloudFails = true;
	const unavailable = await reader.read();
	assert.equal(unavailable.state, 'unknown');
	assert.ok(
		unavailable.rows.filter((row) => row.kind === 'scene').every((row) => row.actual === null)
	);
	assert.equal(unavailable.rows.find((row) => row.kind === 'output').actual, true);
	now += 301_000;
	assert.ok((await reader.read()).rows.every((row) => row.actual === null));
	assert.ok(!JSON.stringify(first).includes('10.0.0.'));
	assert.ok(!JSON.stringify(first).includes('auth_key'));
});
test('fresh cloud fallback is explicit; offline/missing physical observations remain unknown', async () => {
	let now = 2_000_000,
		online = true;
	const reader = createVacationReader({
		scenes: async () => ids,
		now: () => now,
		cloud: async (kind) =>
			kind === 'scenes' ? scripts() : kind === 'inventory' ? inventory : statuses(false, online),
		lan: async () => new Map()
	});
	const first = await reader.read();
	assert.equal(first.state, 'active');
	assert.equal(first.rows.find((row) => row.kind === 'output').source, 'cloud');
	online = false;
	now += 31_000;
	const unknown = await reader.read();
	assert.equal(unknown.state, 'unknown');
	assert.equal(unknown.rows.find((row) => row.kind === 'output').source, 'unknown');
});
test('transport only reads sealed cloud endpoints and identity-verified LAN GETs; wrong identity is never accepted', async () => {
	const calls = [];
	let now = 3_000_000;
	const transport = createVacationTransport({
		now: () => now,
		authKey: () => 'mock-key',
		fetch: async (input, init) => {
			const url = new URL(input);
			calls.push({ url, method: init?.method ?? 'GET' });
			now += 1200;
			if (url.protocol === 'https:') {
				assert.equal(url.hostname, 'shelly-115-eu.shelly.cloud');
				assert.ok(
					['/scene/list', '/interface/device/get_all_lists', '/device/all_status'].includes(
						url.pathname
					)
				);
				return Response.json({ isok: true, data: {} });
			}
			assert.equal(init?.method ?? 'GET', 'GET');
			assert.ok(['/rpc/Shelly.GetDeviceInfo', '/rpc/Shelly.GetStatus'].includes(url.pathname));
			if (url.pathname.endsWith('GetDeviceInfo'))
				return Response.json({
					mac: url.hostname === '10.0.0.2' ? 'wrong' : device.toUpperCase(),
					gen: 2
				});
			return Response.json({ 'switch:2': { output: false } });
		}
	});
	for (const kind of ['scenes', 'inventory', 'statuses']) await transport.cloud(kind);
	const targets = parseVacationDefinitions(scripts(), ids).filter(
		(target) => target.kind === 'output'
	);
	const result = await transport.lan(device, targets, inventory, { wifi: { sta_ip: '10.0.0.2' } });
	assert.equal(result.get(targets[0].id), false);
	assert.equal(calls.filter((call) => call.url.pathname.endsWith('GetStatus')).length, 1);
	assert.ok(calls.every((call) => !/Set|Toggle|enable|manual_run/.test(call.url.pathname)));
	for (const ip of ['10.0.0.1', '172.16.0.1', '192.168.0.1']) assert.equal(privateIpv4(ip), true);
	for (const ip of ['127.0.0.1', '169.254.1.1', '8.8.8.8', '10.0.0.999', 'http://10.0.0.1'])
		assert.equal(privateIpv4(ip), false);
	assert.equal(outputState({ 'switch:2': { output: false } }, 2, 'switch'), false);
	assert.equal(outputState({ 'switch:1': { output: true } }, 2, 'switch'), null);
});
test('cloud errors are single-attempt reads, without command or setting retries', async () => {
	let calls = 0;
	const transport = createVacationTransport({
		authKey: () => 'mock-key',
		fetch: async () => {
			calls++;
			return Response.json({ error: 'busy' }, { status: 429 });
		}
	});
	await assert.rejects(transport.cloud('scenes'));
	assert.equal(calls, 1);
});
