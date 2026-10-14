import test from 'node:test';
import assert from 'node:assert/strict';
import { createModuleLoader } from '../scripts/module-loader.mjs';
const server = await createModuleLoader();
const { controls, tabs } = await server.ssrLoadModule('/src/lib/config/registry.ts');
const { validateConfiguration } = await server.ssrLoadModule(
	'/src/lib/config/configuration-validation.ts'
);
const { toPublicControls } = await server.ssrLoadModule('/src/lib/config/public-controls.ts');
const { directTarget, parseDirectOutput } = await server.ssrLoadModule(
	'/src/lib/config/direct-device.ts'
);
const { resolveCardStatus } = await server.ssrLoadModule('/src/lib/dashboard/device-status.ts');
const { homeGridPosition, rowNumberToColumn } = await server.ssrLoadModule(
	'/src/lib/config/home-grid.ts'
);
const { applyConfiguration, controlMetadata, normalizeHomeNumbering } = await server.ssrLoadModule(
	'/src/lib/server/config-editor-core.ts'
);
const { createPollingGroup } = await server.ssrLoadModule('/src/lib/dashboard/polling.ts');
await server.close();

test('registered defaults preserve nine scene mappings and validate', () => {
	assert.deepEqual(validateConfiguration(controls, tabs), []);
	const home = controls.filter((c) => c.tabId === 'home');
	assert.deepEqual(
		home.map((c) => c.pushNumber),
		[1, 2, 3, 4, 5, 6, 7, 8, 9]
	);
	assert.deepEqual(
		home.map((c) => [c.commands.on.cloud.payload.id, c.commands.off?.cloud.payload.id]),
		[
			['1789560412180', '1789560433138'],
			['1789560339941', '1789560362113'],
			['1789560289492', '1789560313748'],
			['1789560234895', '1789560262228'],
			['1781189778293', undefined],
			['1789560154701', '1789560202028'],
			['1789559627914', '1789559664484'],
			['1789559514915', '1789559559159'],
			['1789557426197', '1789557375466']
		]
	);
});
test('invalid positions, references, status, colors and placeholder actions are rejected', () => {
	for (const mutation of [
		(c) => (c.id = controls[1].id),
		(c) => (c.pushNumber = 4),
		(c) => (c.tabId = 'absent'),
		(c) => (c.statusdeviceid = 'invalid'),
		(c) => (c.commands.on.color = 'invalid'),
		(c) => (c.commands.on.cloud.payload.id = '0000')
	]) {
		const draft = structuredClone(controls);
		mutation(draft[0]);
		assert.ok(validateConfiguration(draft, tabs).length);
	}
});
test('public controls strip transport secrets without losing configured state', () => {
	const draft = structuredClone(controls);
	draft[0].commands.on.cloud.headers = { secret: 'hidden' };
	const publicControls = toPublicControls(draft);
	assert.equal(publicControls[0].commands.on.configured, true);
	assert.equal(publicControls[0].commands.on.cloud, undefined);
	assert.ok(!JSON.stringify(publicControls).includes('hidden'));
});
test('RGBCCT direct target changes on only and parses physical state', () => {
	assert.deepEqual(
		directTarget(
			{ id: '90706948e37c', label: 'test', ip: '10.10.80.169', component: 'rgbcct', channel: 0 },
			'Set',
			'off'
		).payload,
		{ id: 1, method: 'RGBCCT.Set', params: { id: 0, on: false } }
	);
	assert.equal(parseDirectOutput({ result: { on: true } }), 'on');
	assert.equal(parseDirectOutput({ output: false }), 'off');
	assert.throws(() => parseDirectOutput({ result: {} }));
});
test('physical state wins, then remembered state, then off', () => {
	const device = controls[0];
	assert.equal(
		resolveCardStatus(
			device,
			new Map([[device.id, 'on']]),
			new Map([[device.statusdeviceid, 'off']])
		),
		'off'
	);
	assert.equal(resolveCardStatus(device, new Map([[device.id, 'on']]), new Map()), 'on');
	assert.equal(resolveCardStatus(device, new Map(), new Map()), 'off');
});
test('polling start is idempotent and pause clears each timer', () => {
	const originalSet = globalThis.setInterval,
		originalClear = globalThis.clearInterval;
	let started = 0,
		cleared = 0;
	globalThis.setInterval = () => ++started;
	globalThis.clearInterval = () => ++cleared;
	try {
		const group = createPollingGroup([{ intervalMs: 10, run() {} }]);
		group.start();
		group.start();
		group.pause();
		group.pause();
		group.start();
		group.pause();
		assert.equal(started, 2);
		assert.equal(cleared, 2);
	} finally {
		globalThis.setInterval = originalSet;
		globalThis.clearInterval = originalClear;
	}
});

test('column numbering preserves physical layout and migrates old overrides once', () => {
	assert.deepEqual(
		Array.from({ length: 9 }, (_, i) => rowNumberToColumn(i + 1)),
		[1, 4, 7, 2, 5, 8, 3, 6, 9]
	);
	assert.deepEqual(homeGridPosition(3), { column: 1, row: 3 });
	assert.deepEqual(homeGridPosition(7), { column: 3, row: 1 });
	const snapshot = {
		version: 2,
		overrides: {},
		metadata: {
			'scene-aula-plafond': { pushNumber: 2 },
			'color-spare-051026': { tabId: 'devices', pushNumber: 2 }
		}
	};
	const migrated = normalizeHomeNumbering(controls, snapshot);
	assert.equal(migrated.metadata['scene-aula-plafond'].pushNumber, 4);
	assert.equal(migrated.metadata['color-spare-051026'].pushNumber, 2);
	assert.deepEqual(normalizeHomeNumbering(controls, migrated), migrated);
});
test('normal cards change tabs while normal and advanced areas remain fixed', () => {
	const timers = ['Overwerktimer-1', 'Overwerktimer-2', 'Overwerktimer-3'].map((id) =>
		controls.find((control) => control.id === id)
	);
	assert.ok(timers.every((timer) => timer));
	assert.deepEqual(
		timers.map((timer) => [timer?.placement, timer?.tabId, timer?.pushNumber]),
		[
			['main', 'overwerktimer', 1],
			['main', 'overwerktimer', 2],
			['main', 'overwerktimer', 3]
		]
	);
	assert.equal(tabs.find((tab) => tab.id === 'overwerktimer')?.label, 'Overwerk timers');
	const timer = timers[0];
	assert.ok(timer);
	assert.equal(controlMetadata(timer).placement, 'main');

	const placedOnDevices = applyConfiguration(controls, tabs, {
		version: 2,
		overrides: {},
		metadata: {
			[timer.id]: {
				placement: 'main',
				tabId: 'devices',
				pushNumber: 2
			}
		}
	}).controls.find((control) => control.id === timer.id);
	assert.equal(placedOnDevices?.placement, 'main');
	assert.equal(placedOnDevices?.tabId, 'devices');
	assert.equal(placedOnDevices?.pushNumber, 2);

	assert.throws(
		() =>
			applyConfiguration(controls, tabs, {
				version: 2,
				overrides: {},
				metadata: { [timer.id]: { placement: 'advanced' } }
			}),
		/elkaars scherm/
	);
	const advanced = controls.find((control) => control.placement === 'advanced');
	assert.throws(
		() =>
			applyConfiguration(controls, tabs, {
				version: 2,
				overrides: {},
				metadata: { [advanced.id]: { placement: 'main', tabId: 'devices', pushNumber: 2 } }
			}),
		/elkaars scherm/
	);
	const advancedControls = controls.filter((control) => control.placement === 'advanced');
	const reordered = applyConfiguration(controls, tabs, {
		version: 2,
		overrides: {},
		metadata: {
			[advancedControls[0].id]: { pushNumber: advancedControls[1].pushNumber },
			[advancedControls[1].id]: { pushNumber: advancedControls[0].pushNumber }
		}
	});
	assert.equal(
		reordered.controls.find((control) => control.id === advancedControls[0].id).pushNumber,
		2
	);

	assert.throws(
		() =>
			applyConfiguration(controls, tabs, {
				version: 2,
				overrides: {},
				metadata: { [timer.id]: { placement: 'main', tabId: 'devices', pushNumber: 1 } }
			}),
		/positie/
	);
});
