import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModuleLoader } from '../scripts/module-loader.mjs';
const coreLoader = await createModuleLoader();
const { roomTargets, indexStatuses, deviceView, validateRoomCommand } =
	await coreLoader.ssrLoadModule('/src/lib/server/shelly-inventory-core.ts');
await coreLoader.close();
const inventory = {
	rooms: { 21: { name: 'Nieuwbouw' }, 2: { name: 'Light Hfd' }, 5: { name: 'Other' } },
	devices: {
		aabbccddee11: {
			id: 'aabbccddee11',
			channel: 0,
			room_id: 21,
			name: 'Uitgang nul',
			ip: '10.0.0.1',
			auth_key: 'private'
		},
		aabbccddee11_2: { id: 'aabbccddee11_2', channel: 2, room_id: 21, name: 'Uitgang twee' },
		aabbccddee12: { id: 'aabbccddee12', room_id: 2, name: 'Oud licht' },
		aabbccddee13: { id: 'aabbccddee13', room_id: 21, name: 'Sensor' },
		aabbccddee14: { id: 'aabbccddee14', room_id: 5, name: 'Outside' },
		aabbccddee15: { id: 'aabbccddee15', room_id: 2, name: 'Unknown' },
		aabbccddee16_3: { id: 'aabbccddee16_3', channel: 0, room_id: 2, name: 'Bad channel' }
	}
};
const statuses = {
	devices_status: {
		inconsistentKey: {
			_dev_info: { id: 'aabbccddee11', online: true },
			'switch:0': { output: false },
			'switch:1': { output: false },
			'switch:2': { output: true }
		},
		old: { _dev_info: { id: 'aabbccddee12', online: false }, lights: [{ ison: true }] },
		sensor: { _dev_info: { id: 'aabbccddee13', online: true }, 'temperature:0': { tC: 22.4 } },
		unknown: {
			_dev_info: { id: 'aabbccddee15', online: true },
			unrecognized: { auth_key: 'private' }
		}
	}
};
test('all room devices/channels are retained, names/IDs match both allowlisted account rooms, unsupported stays unknown', () => {
	const { rooms, targets } = roomTargets(inventory);
	assert.deepEqual(
		rooms.map((room) => [room.id, room.count]),
		[
			['nieuwbouw', 3],
			['light-hfd', 2]
		]
	);
	const indexed = indexStatuses(statuses),
		second = deviceView(
			targets.find((target) => target.id.endsWith('_2')),
			indexed
		);
	assert.equal(second.components[0].output, true);
	assert.equal(second.components[0].id, 'switch:2');
	const first = deviceView(targets[0], indexed);
	assert.equal(first.components[0].output, false);
	const offline = deviceView(
		targets.find((target) => target.id.endsWith('12')),
		indexed
	);
	assert.equal(offline.online, false);
	assert.equal(offline.components[0].output, null);
	const sensor = deviceView(
		targets.find((target) => target.id.endsWith('13')),
		indexed
	);
	assert.equal(sensor.components[0].value, '22.4 °C');
	assert.equal(sensor.components[0].controllable, false);
	assert.deepEqual(
		deviceView(
			targets.find((target) => target.id.endsWith('15')),
			indexed
		).components,
		[]
	);
	assert.ok(!JSON.stringify(first).includes('private'));
	assert.ok(!JSON.stringify(first).includes('10.0.0.1'));
	assert.equal(
		roomTargets({ ...inventory, rooms: { 21: { name: 'Other' }, 2: { name: 'Light Hfd' } } })
			.rooms[0].found,
		false
	);
});
test('commands resolve exact room-assigned channel and reject arbitrary endpoint, outside room, sensors and guessed channels', () => {
	const targets = roomTargets(inventory).targets,
		indexed = indexStatuses(statuses),
		valid = {
			room: 'nieuwbouw',
			deviceId: 'aabbccddee11_2',
			component: 'switch:2',
			command: 'off'
		};
	assert.deepEqual(validateRoomCommand(valid, targets, indexed), {
		target: targets[1],
		kind: 'switch',
		on: false
	});
	for (const changed of [
		{ endpoint: 'http://evil' },
		{ room: 'light-hfd' },
		{ deviceId: 'aabbccddee14' },
		{ component: 'switch:0' },
		{ deviceId: 'aabbccddee13', component: 'temperature:0' },
		{ command: ['on'] }
	])
		assert.throws(() => validateRoomCommand({ ...valid, ...changed }, targets, indexed));
});
test('live transport is cached, strips secrets, sends one validated explicit mutation, audits safely, never retries timeout and preserves stale data', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-shelly-'));
	const originalFetch = globalThis.fetch,
		originalNow = Date.now;
	const keys = [
		'KENNEMER_RUNTIME_MODE',
		'SHELLY_SIMULATE_DEVICES',
		'SHELLY_AUTH_KEY',
		'KENNEMER_AUDIT_LOG_DIR'
	];
	const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
	Object.assign(process.env, {
		KENNEMER_RUNTIME_MODE: 'live',
		SHELLY_SIMULATE_DEVICES: '0',
		SHELLY_AUTH_KEY: 'test-secret',
		KENNEMER_AUDIT_LOG_DIR: directory
	});
	let loader,
		now = Date.now(),
		failRead = false,
		timeout = false;
	const calls = [];
	Date.now = () => now;
	globalThis.fetch = async (url, init) => {
		const parsed = new URL(url);
		calls.push({ url: parsed, init });
		assert.equal(parsed.origin, 'https://shelly-115-eu.shelly.cloud');
		now += 1200;
		if (parsed.pathname.includes('/set/')) {
			if (timeout) {
				const error = new Error('timeout');
				error.name = 'TimeoutError';
				throw error;
			}
			return new Response(null, { status: 200 });
		}
		if (failRead) throw new Error('offline');
		return Response.json({
			isok: true,
			data: parsed.pathname.includes('get_all_lists') ? inventory : statuses
		});
	};
	try {
		loader = await createModuleLoader();
		const service = await loader.ssrLoadModule('/src/lib/server/shelly-inventory.ts');
		const first = await service.readShellyRooms('nieuwbouw');
		assert.equal(calls.length, 2);
		assert.equal(first.devices.length, 3);
		await service.readShellyRooms('light-hfd');
		assert.equal(calls.length, 2);
		await service.controlShellyRoom({
			room: 'nieuwbouw',
			deviceId: 'aabbccddee11_2',
			component: 'switch:2',
			command: 'off'
		});
		const command = calls.at(-1);
		assert.equal(command.url.pathname, '/v2/devices/api/set/switch');
		assert.deepEqual(JSON.parse(command.init.body), { id: 'aabbccddee11', channel: 2, on: false });
		assert.equal(
			(await service.readShellyRooms('nieuwbouw')).devices.find((device) =>
				device.id.endsWith('_2')
			).components[0].output,
			true,
			'HTTP success must not replace physical status'
		);
		timeout = true;
		const before = calls.length;
		await assert.rejects(
			service.controlShellyRoom({
				room: 'nieuwbouw',
				deviceId: 'aabbccddee11_2',
				component: 'switch:2',
				command: 'on'
			}),
			/TIMEOUT/
		);
		assert.equal(calls.length, before + 1);
		failRead = true;
		now += 31_000;
		const stale = await service.readShellyRooms();
		assert.equal(stale.stale, true);
		assert.equal(stale.ok, true);
		const failedCount = calls.length;
		await service.readShellyRooms();
		assert.equal(calls.length, failedCount);
		assert.ok(!JSON.stringify(stale).includes('test-secret'));
		const years = await readdir(directory),
			months = await readdir(join(directory, years[0])),
			files = await readdir(join(directory, years[0], months[0]));
		const audit = await readFile(join(directory, years[0], months[0], files[0]), 'utf8');
		assert.ok(audit.includes('shelly.command'));
		assert.ok(!audit.includes('test-secret'));
		assert.ok(!audit.includes('auth_key'));
	} finally {
		await loader?.close();
		globalThis.fetch = originalFetch;
		Date.now = originalNow;
		for (const key of keys) {
			if (previous[key] === undefined) delete process.env[key];
			else process.env[key] = previous[key];
		}
		await rm(directory, { recursive: true, force: true });
	}
});
