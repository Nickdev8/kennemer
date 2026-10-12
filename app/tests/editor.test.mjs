import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createModuleLoader } from '../scripts/module-loader.mjs';
const loader = createModuleLoader;
test('editor migration, concurrent edits, restore, validation and restart recovery', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-editor-'));
	const path = join(directory, 'scene-overrides.json');
	const oldPath = process.env.SCENE_OVERRIDE_PATH;
	process.env.SCENE_OVERRIDE_PATH = path;
	let server;
	const originalFetch = globalThis.fetch;
	try {
		server = await loader();
		const { controls, tabs } = await server.ssrLoadModule('/src/lib/config/registry.ts');
		const { applyConfiguration } = await server.ssrLoadModule(
			'/src/lib/server/config-editor-core.ts'
		);
		const { configurationSnapshotSchema } = await server.ssrLoadModule(
			'/src/lib/config/scene-config-schema.ts'
		);
		const id = controls[0].id;
		const overrides = { [id]: { on: '123456', status: '90706948e37c_0' } };
		const legacy = {
			version: 1,
			revision: createHash('sha256').update(JSON.stringify(overrides)).digest('hex').slice(0, 16),
			updatedAt: Date.now(),
			overrides
		};
		await writeFile(path, JSON.stringify(legacy));
		const store = await server.ssrLoadModule('/src/lib/server/scene-config-store.ts');
		globalThis.fetch = () => {
			throw new Error('Editor must never contact equipment');
		};
		const initial = await store.readSceneEditorEntries();
		assert.equal(initial.entries[0].slots.on, '123456');
		assert.equal(initial.entries[0].slots.status, '90706948e37c_0');
		const request = (label) => ({
			revision: initial.revision,
			metadata: [{ controlId: id, values: { label } }]
		});
		const simultaneous = await Promise.allSettled([
			store.saveSceneOverrides(request('Nieuw label')),
			store.saveSceneOverrides(request('Verloren wijziging'))
		]);
		assert.equal(simultaneous.filter((result) => result.status === 'fulfilled').length, 1);
		assert.equal(
			simultaneous.find((result) => result.status === 'rejected').reason.message,
			'CONFIG_REVISION_CONFLICT'
		);
		assert.deepEqual(JSON.parse(await readFile(`${path}.bak`, 'utf8')), legacy);
		const saved = JSON.parse(await readFile(path, 'utf8'));
		assert.equal(saved.version, 2);
		assert.equal(saved.overrides[id].on, '123456');
		assert.equal((await store.readEffectiveControls())[0].label, 'Nieuw label');
		assert.notEqual(saved.revision, initial.revision);
		const beforeInvalid = await readFile(path, 'utf8');
		for (const invalid of [
			{ metadata: [{ controlId: 'unknown', values: { label: 'X' } }] },
			{ metadata: [{ controlId: id, values: { pushNumber: 2 } }] },
			{ metadata: [{ controlId: id, values: { onColor: 'unsupported-color' } }] },
			{ metadata: [{ controlId: id, values: { tabId: 'unknown' } }] },
			{ tabs: [{ id: 'other', label: 'Andere', order: 0 }] },
			{ importSnapshot: { version: 2, overrides: {}, metadata: { unknown: { label: 'X' } } } }
		])
			await assert.rejects(store.saveSceneOverrides({ revision: saved.revision, ...invalid }));
		assert.equal(await readFile(path, 'utf8'), beforeInvalid);
		assert.throws(() =>
			configurationSnapshotSchema.parse({
				version: 2,
				overrides: {},
				metadata: {},
				secret: 'not allowed'
			})
		);
		const exported = await store.exportConfiguration();
		assert.equal(exported.revision, undefined);
		assert.ok(!JSON.stringify(exported).includes('endpoint'));
		assert.equal(applyConfiguration(controls, tabs, exported).controls[0].label, 'Nieuw label');
		const restored = await store.restoreSceneOverrides({ revision: saved.revision });
		assert.equal((await store.readEffectiveControls())[0].label, controls[0].label);
		assert.equal((await store.readSceneEditorEntries()).entries[0].slots.on, '123456');
		assert.notEqual(restored.revision, saved.revision);
		const clearStatus = await store.saveSceneOverrides({
			revision: restored.revision,
			changes: [{ controlId: id, slot: 'status', sceneId: '' }]
		});
		assert.equal((await store.readEffectiveControls())[0].statusdeviceid, undefined);
		const reset = await store.resetSceneOverrides({
			revision: clearStatus.revision,
			controlId: id,
			slot: 'status'
		});
		assert.equal(
			(await store.readEffectiveControls())[0].statusdeviceid,
			controls[0].statusdeviceid
		);
		assert.equal(reset.overrides[id].on, '123456');
		globalThis.fetch = originalFetch;
		await server.close();
		server = await loader();
		const restarted = await server.ssrLoadModule('/src/lib/server/scene-config-store.ts');
		assert.equal((await restarted.readSceneEditorEntries()).revision, reset.revision);
		await server.close();
		server = undefined;
		await writeFile(path, '{broken');
		server = await loader();
		const recovered = await server.ssrLoadModule('/src/lib/server/scene-config-store.ts');
		assert.equal((await recovered.readSceneEditorEntries()).revision, clearStatus.revision);
		assert.equal((await recovered.readEffectiveControls())[0].statusdeviceid, undefined);
	} finally {
		globalThis.fetch = originalFetch;
		await server?.close();
		if (oldPath === undefined) delete process.env.SCENE_OVERRIDE_PATH;
		else process.env.SCENE_OVERRIDE_PATH = oldPath;
		await rm(directory, { recursive: true, force: true });
	}
});

test('editor reassigns overwork timers and cleanly moves them back behind PIN access', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-editor-placement-'));
	const previousPath = process.env.SCENE_OVERRIDE_PATH;
	process.env.SCENE_OVERRIDE_PATH = join(directory, 'scene-overrides.json');
	let server;
	try {
		server = await loader();
		const store = await server.ssrLoadModule('/src/lib/server/scene-config-store.ts');
		const timerId = 'Overwerktimer-1';
		const initial = await store.readSceneEditorEntries();
		assert.equal(initial.entries.find((entry) => entry.controlId === timerId).placement, 'main');

		const regular = await store.saveSceneOverrides({
			revision: initial.revision,
			metadata: [
				{ controlId: timerId, values: { placement: 'main', tabId: 'devices', pushNumber: 2 } }
			]
		});
		let timer = (await store.readEffectiveControls()).find((control) => control.id === timerId);
		assert.equal(timer.placement, 'main');
		assert.equal(timer.tabId, 'devices');
		assert.equal(timer.pushNumber, 2);

		const protectedAgain = await store.saveSceneOverrides({
			revision: regular.revision,
			metadata: [{ controlId: timerId, values: { placement: 'advanced' } }]
		});
		timer = (await store.readEffectiveControls()).find((control) => control.id === timerId);
		assert.equal(timer.placement, 'advanced');
		assert.equal(timer.tabId, undefined);
		assert.equal(timer.pushNumber, undefined);
		assert.equal(
			(await store.readSceneEditorEntries()).entries.find((entry) => entry.controlId === timerId)
				.metadata.placement,
			'advanced'
		);
		assert.ok(protectedAgain.revision);
	} finally {
		await server?.close();
		if (previousPath === undefined) delete process.env.SCENE_OVERRIDE_PATH;
		else process.env.SCENE_OVERRIDE_PATH = previousPath;
		await rm(directory, { recursive: true, force: true });
	}
});

test('one-time placement migration moves saved overwork timers and preserves later PIN placement', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-editor-timer-migration-'));
	const path = join(directory, 'scene-overrides.json');
	const previousPath = process.env.SCENE_OVERRIDE_PATH;
	process.env.SCENE_OVERRIDE_PATH = path;
	let server;
	try {
		server = await loader();
		const { tabs } = await server.ssrLoadModule('/src/lib/config/registry.ts');
		const timerId = 'Overwerktimer-1';
		await writeFile(
			path,
			JSON.stringify({
				version: 2,
				homeNumbering: 'column',
				revision: '0123456789abcdef',
				updatedAt: Date.now(),
				overrides: {},
				metadata: { [timerId]: { placement: 'advanced' } },
				tabs
			})
		);
		const store = await server.ssrLoadModule('/src/lib/server/scene-config-store.ts');
		let timer = (await store.readEffectiveControls()).find((control) => control.id === timerId);
		assert.equal(timer.placement, 'main');
		assert.equal(timer.tabId, 'overwerktimer');
		assert.equal(timer.pushNumber, 1);

		const initial = await store.readSceneEditorEntries();
		await store.saveSceneOverrides({
			revision: initial.revision,
			metadata: [{ controlId: timerId, values: { placement: 'advanced' } }]
		});
		assert.equal(JSON.parse(await readFile(path, 'utf8')).placementDefaultsVersion, 1);
		await server.close();
		server = await loader();
		timer = (
			await (
				await server.ssrLoadModule('/src/lib/server/scene-config-store.ts')
			).readEffectiveControls()
		).find((control) => control.id === timerId);
		assert.equal(timer.placement, 'advanced');
	} finally {
		await server?.close();
		if (previousPath === undefined) delete process.env.SCENE_OVERRIDE_PATH;
		else process.env.SCENE_OVERRIDE_PATH = previousPath;
		await rm(directory, { recursive: true, force: true });
	}
});
