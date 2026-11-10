import test from 'node:test';
import assert from 'node:assert/strict';
import { createModuleLoader } from '../scripts/module-loader.mjs';
const loader = await createModuleLoader();
const { roomTargets, indexStatuses, deviceView, validateRoomCommand } = await loader.ssrLoadModule(
	'/src/lib/server/shelly-inventory-core.ts'
);
const { buildShellySupportReport } = await loader.ssrLoadModule(
	'/src/lib/server/shelly-support-report.ts'
);
await loader.close();
const inventory = {
	rooms: { 8: { name: 'Techniek' }, 1: { name: 'Screen' } },
	devices: {
		aabbccddee11_1: {
			id: 'aabbccddee11_1',
			channel: 1,
			room_id: 8,
			name: 'Gymzaal bel drukker',
			gen: 2,
			type: 'SNSN-0D24X',
			mainActionType: 'input',
			ip: '10.0.0.1',
			auth_key: 'hidden'
		},
		aabbccddee12: {
			id: 'aabbccddee12',
			channel: 0,
			room_id: 8,
			name: 'Gymzaal looplicht',
			gen: 2,
			type: 'SNSN-0D24X'
		},
		aabbccddee13: {
			id: 'aabbccddee13',
			channel: 0,
			room_id: 1,
			name: 'Echt scherm',
			gen: 2,
			type: 'cover',
			mode: 'cover'
		},
		aabbccddee14: {
			id: 'aabbccddee14',
			channel: 0,
			room_id: 1,
			name: 'Scherm naam alleen',
			gen: 2,
			type: 'switch',
			mode: 'switch'
		},
		aabbccddee15: {
			id: 'aabbccddee15',
			channel: 0,
			room_id: 1,
			name: 'Oud scherm',
			gen: 1,
			mode: 'roller'
		}
	}
};
const statuses = {
	devices_status: {
		a: {
			_dev_info: { id: 'aabbccddee11', online: true, code: 'SNSN-0D24X', gen: 'G2' },
			'input:0': { id: 0, state: false },
			'input:1': { id: 1, state: false }
		},
		b: {
			_dev_info: { id: 'aabbccddee12', online: true, code: 'SNSN-0D24X', gen: 'G2' },
			'input:0': { id: 0, state: true }
		},
		c: {
			_dev_info: { id: 'aabbccddee13', online: true },
			'cover:0': { id: 0, state: 'stopped', current_pos: 35 },
			'switch:0': { output: true }
		},
		d: { _dev_info: { id: 'aabbccddee14', online: true }, 'switch:0': { id: 0, output: false } },
		e: {
			_dev_info: { id: 'aabbccddee15', online: true },
			rollers: [{ state: 'stop', current_pos: -1 }],
			relays: [{ ison: true }, { ison: false }]
		}
	}
};
test('only real covers receive explicit directions; unknown position is not guessed and raw motor relays are hidden', () => {
	const targets = roomTargets(inventory).targets,
		indexed = indexStatuses(statuses);
	const cover = targets.find((target) => target.id === 'aabbccddee13');
	const view = deviceView(cover, indexed);
	assert.equal(view.components.length, 1);
	assert.equal(view.components[0].id, 'cover:0');
	assert.deepEqual(view.components[0].cover, { state: 'stopped', position: 35 });
	for (const command of ['open', 'stop', 'close']) {
		const resolved = validateRoomCommand(
			{ room: 'screen', deviceId: cover.id, component: 'cover:0', command },
			targets,
			indexed
		);
		assert.equal(resolved.kind, 'cover');
		assert.equal(resolved.position, command);
		assert.equal(resolved.target.channel, 0);
	}
	assert.throws(() =>
		validateRoomCommand(
			{ room: 'screen', deviceId: cover.id, component: 'cover:0', command: 'on' },
			targets,
			indexed
		)
	);
	const named = deviceView(
		targets.find((target) => target.id === 'aabbccddee14'),
		indexed
	);
	assert.equal(named.components[0].id, 'switch:0');
	assert.equal(named.components[0].cover, undefined);
	const old = deviceView(
		targets.find((target) => target.id === 'aabbccddee15'),
		indexed
	);
	assert.equal(old.components.length, 1);
	assert.equal(old.components[0].id, 'cover:0');
	assert.equal(old.components[0].cover.position, null);
});
test('support report classifies matching input channels without treating input.state as output or leaking private fields', () => {
	const report = buildShellySupportReport(inventory, statuses),
		tech = report.rooms.find((room) => room.id === 'techniek');
	assert.equal(tech.devices.length, 2);
	for (const device of tech.devices) {
		assert.equal(device.classification, 'input-only');
		assert.deepEqual(device.supportedControls, []);
		assert.ok(device.reason.includes('geen schakeluitgang'));
		assert.equal(device.model, 'SNSN-0D24X');
	}
	assert.deepEqual(tech.devices[0].matchedComponents, ['input:1']);
	assert.equal(tech.devices[0].components[1].reportedState, false);
	assert.ok(!JSON.stringify(report).includes('hidden'));
	assert.ok(!JSON.stringify(report).includes('10.0.0.1'));
	assert.ok(!JSON.stringify(report).includes('auth_key'));
	const screen = report.rooms.find((room) => room.id === 'screen');
	assert.deepEqual(screen.devices[0].supportedControls[0].commands, ['open', 'stop', 'close']);
});
