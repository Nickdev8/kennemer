import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const storage = await mkdtemp(join(tmpdir(), 'kennemer-hardware-ui-'));
const port = 5195;
const origin = `http://127.0.0.1:${port}`;
const child = spawn(
	process.execPath,
	['scripts/dev.mjs', 'mock', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
	{
		cwd: process.cwd(),
		env: { ...process.env, KENNEMER_DEV_STORAGE: storage, PUBLIC_DISPLAY_DIM_TIMEOUT_MS: '4000' },
		stdio: ['ignore', 'pipe', 'pipe']
	}
);
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
let browser;
try {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(origin)).ok) break;
		} catch {}
		if (child.exitCode !== null) throw new Error(log);
		await new Promise((resolve) => setTimeout(resolve, 150));
		if (i === 99) throw new Error(log);
	}
	const installedChrome =
		process.env.CHROME_PATH ??
		[
			join(homedir(), '.local/bin/google-chrome'),
			'/usr/bin/google-chrome',
			'/usr/bin/chromium'
		].find(existsSync);
	browser = await chromium.launch({
		headless: true,
		...(installedChrome ? { executablePath: installedChrome } : {}),
		args: ['--no-sandbox']
	});
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	page.setDefaultTimeout(8000);
	await page.clock.install();
	let hardwareReads = 0;
	const commands = [], errors = [], external = [];
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.origin !== origin) {
			external.push(url.href);
			return route.abort();
		}
		if (['/actions', '/triggers'].includes(url.pathname)) {
			commands.push(url.pathname);
			return route.abort();
		}
		if (url.pathname === '/api/hardware') {
			hardwareReads++;
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ok: true, touchscreen: { connected: false } })
			});
		}
		return route.continue();
	});
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(origin);
	await page.locator('main[data-hydrated="true"]').waitFor();
	await expect.poll(() => hardwareReads).toBeGreaterThan(0);
	await expect(page.getByText('Touchscreen niet gevonden', { exact: true })).toHaveCount(0);
	await expect(page.getByText('Bediening via aanraking is niet beschikbaar.', { exact: true })).toHaveCount(0);
	await page.clock.fastForward(4500);
	const wake = page.getByRole('button', { name: 'Scherm actief maken' });
	await expect(wake).toBeVisible();
	const asleepReads = hardwareReads;
	await page.clock.fastForward(30000);
	assert.equal(hardwareReads, asleepReads);
	await wake.click({ position: { x: 10, y: 10 } });
	await expect(wake).toHaveCount(0);
	await expect.poll(() => hardwareReads).toBeGreaterThan(asleepReads);
	await expect(page.getByText('Touchscreen niet gevonden', { exact: true })).toHaveCount(0);
	assert.deepEqual(commands, []);
	assert.deepEqual(external, []);
	assert.deepEqual(errors, []);
	console.log('PASS: missing touchscreen has no frontend warning; hardware polls pause asleep, resume on wake; wake sends no commands.');
} catch (error) {
	console.error(log.slice(-4000));
	throw error;
} finally {
	await browser?.close();
	child.kill('SIGTERM');
	if (child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
	await rm(storage, { recursive: true, force: true });
}
