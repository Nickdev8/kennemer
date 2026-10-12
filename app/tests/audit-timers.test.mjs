import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModuleLoader } from '../scripts/module-loader.mjs';

test('audit events use Amsterdam business dates with a 04:00 boundary', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-audit-'));
	const previousDirectory = process.env.KENNEMER_AUDIT_LOG_DIR;
	const previousTimeZone = process.env.KENNEMER_AUDIT_TIME_ZONE;
	process.env.KENNEMER_AUDIT_LOG_DIR = directory;
	process.env.KENNEMER_AUDIT_TIME_ZONE = 'Europe/Amsterdam';
	let server;
	try {
		server = await createModuleLoader();
		const audit = await server.ssrLoadModule('/src/lib/server/audit-log.ts');
		const beforeCutoff = new Date('2026-01-01T02:59:00.000Z');
		const atCutoff = new Date('2026-01-01T03:00:00.000Z');
		assert.match(audit.auditFileFor(beforeCutoff), /2025\/12\/2025-12-31\.jsonl$/);
		assert.match(audit.auditFileFor(atCutoff), /2026\/01\/2026-01-01\.jsonl$/);

		await audit.recordAuditEvent(
			'pin.entered',
			{ source: 'advanced-access', accepted: false },
			beforeCutoff
		);
		const lines = (await readFile(audit.auditFileFor(beforeCutoff), 'utf8')).trim().split('\n');
		assert.deepEqual(JSON.parse(lines[0]), {
			timestamp: beforeCutoff.toISOString(),
			businessDate: '2025-12-31',
			type: 'pin.entered',
			source: 'advanced-access',
			accepted: false
		});
		assert.equal(lines[0].includes('1234'), false);
	} finally {
		await server?.close();
		if (previousDirectory === undefined) delete process.env.KENNEMER_AUDIT_LOG_DIR;
		else process.env.KENNEMER_AUDIT_LOG_DIR = previousDirectory;
		if (previousTimeZone === undefined) delete process.env.KENNEMER_AUDIT_TIME_ZONE;
		else process.env.KENNEMER_AUDIT_TIME_ZONE = previousTimeZone;
		await rm(directory, { recursive: true, force: true });
	}
});

test('timed-trigger expiry survives store reload and ignores unknown or expired IDs', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kennemer-timers-'));
	const previousPath = process.env.KENNEMER_TIMED_TRIGGER_PATH;
	process.env.KENNEMER_TIMED_TRIGGER_PATH = join(directory, 'timed-triggers.json');
	let server;
	try {
		server = await createModuleLoader();
		const store = await server.ssrLoadModule('/src/lib/server/timed-trigger-store.ts');
		const activeUntil = Date.now() + 60_000;
		await store.saveTimedTrigger('Overwerktimer-1', activeUntil);
		await store.saveTimedTrigger('expired-timer', Date.now() - 1);
		const restored = await store.readActiveTimedTriggers(
			new Set(['Overwerktimer-1', 'Overwerktimer-2', 'expired-timer'])
		);
		assert.deepEqual(restored, { 'Overwerktimer-1': activeUntil });
		assert.equal(
			JSON.parse(await readFile(process.env.KENNEMER_TIMED_TRIGGER_PATH, 'utf8'))[
				'Overwerktimer-1'
			],
			activeUntil
		);
	} finally {
		await server?.close();
		if (previousPath === undefined) delete process.env.KENNEMER_TIMED_TRIGGER_PATH;
		else process.env.KENNEMER_TIMED_TRIGGER_PATH = previousPath;
		await rm(directory, { recursive: true, force: true });
	}
});
