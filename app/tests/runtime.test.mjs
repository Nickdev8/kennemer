import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockBackend } from '../src/lib/server/mock-backend.ts';
import { runtimeMode, maintenanceBlocked } from '../src/lib/server/runtime-mode.ts';

test('production defaults live; only explicit dev live blocks host maintenance', () => {
	assert.equal(runtimeMode(undefined), 'live');
	assert.equal(runtimeMode('mock'), 'mock');
	assert.equal(maintenanceBlocked(undefined), false);
	assert.equal(maintenanceBlocked('live'), true);
});
test('mock routes avoid network, validate IDs and persist independent physical state', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-runtime-test-'));
	const remembered = {};
	const originalFetch = globalThis.fetch;
	globalThis.fetch = () => {
		throw new Error('External request forbidden');
	};
	try {
		const deps = {
			controls: async () => [
				{ id: 'light', label: 'Licht', controlType: 'device', statusdeviceid: '90706948e37c_0' },
				{ id: 'bell', label: 'Bel', controlType: 'trigger', sceneId: '123' }
			],
			configured: () => true,
			remember: async (id, command) => {
				remembered[id] = command;
				return { lastCommand: command, updatedAt: Date.now(), source: 'action' };
			},
			publish: () => undefined
		};
		const path = join(directory, 'physical.json');
		const backend = createMockBackend(path, deps);
		for (const route of [
			'/api/connectivity',
			'/api/hardware',
			'/api/update',
			'/api/wattage/-1',
			'/api/wattage/cache'
		]) {
			assert.equal((await backend(new Request(`http://demo${route}`)))?.status, 200);
		}
		for (const route of ['/api/update', '/api/wattage/cache'])
			assert.equal(
				(await backend(new Request(`http://demo${route}`, { method: 'POST' })))?.status,
				200
			);
		const action = (deviceId) =>
			new Request('http://demo/actions', {
				method: 'POST',
				body: JSON.stringify({ deviceId, command: 'on' })
			});
		assert.equal((await backend(action('unknown')))?.status, 404);
		assert.equal((await backend(action('light')))?.status, 200);
		assert.equal(
			(
				await backend(
					new Request('http://demo/triggers', {
						method: 'POST',
						body: JSON.stringify({ triggerId: 'bell' })
					})
				)
			)?.status,
			200
		);
		remembered.light = 'off';
		const restarted = createMockBackend(path, deps);
		const response = await restarted(
			new Request('http://demo/api/device-output?ids=90706948e37c_0,unknown')
		);
		const data = await response.json();
		assert.equal(data.states['90706948e37c_0'].lastCommand, 'on');
		assert.equal(remembered.light, 'on');
		assert.ok(data.errors.unknown);
		assert.equal(await backend(new Request('http://demo/api/config/scenes')), null);
	} finally {
		globalThis.fetch = originalFetch;
		await rm(directory, { recursive: true, force: true });
	}
});

test('stateless cooldown, failure cases and physical event source match live behavior', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-runtime-guard-'));
	const events = [];
	const backend = createMockBackend(join(directory, 'physical.json'), {
		controls: async () => [
			{ id: 'pulse', label: 'Puls', controlType: 'device', stateless: true, activeDurationMs: 40 },
			{ id: 'missing', label: 'Leeg', controlType: 'device' },
			{ id: 'disabled', label: 'Uit', controlType: 'device', enabled: false },
			{ id: 'light', label: 'Licht', controlType: 'device', statusdeviceid: '90706948e37c_0' }
		],
		configured: (control) => control.id !== 'missing',
		remember: async (id, command, source = 'action') => ({
			lastCommand: command,
			updatedAt: Date.now(),
			source
		}),
		publish: (id, state) => events.push({ id, state })
	});
	const action = (id) =>
		new Request('http://demo/actions', {
			method: 'POST',
			body: JSON.stringify({ deviceId: id, command: 'on' })
		});
	try {
		assert.equal((await backend(action('missing'))).status, 409);
		assert.equal((await backend(action('disabled'))).status, 409);
		assert.equal(
			(await backend(new Request('http://demo/actions', { method: 'POST', body: 'bad' }))).status,
			400
		);
		const first = await (await backend(action('pulse'))).json();
		const repeated = await (await backend(action('pulse'))).json();
		assert.equal(first.skipped, false);
		assert.equal(repeated.skipped, true);
		assert.equal(first.activeUntil, repeated.activeUntil);
		assert.equal(events.length, 0);
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.equal((await (await backend(action('pulse'))).json()).skipped, false);
		await backend(new Request('http://demo/api/device-output?ids=90706948e37c_0'));
		assert.equal(events.at(-1).state.source, 'status-demo');
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
