import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const storage = await mkdtemp(join(tmpdir(), 'kennemer-vacation-ui-'));
const origin = 'http://127.0.0.1:5193';
const server = spawn(
	process.execPath,
	['scripts/dev.mjs', 'mock', '--host', '127.0.0.1', '--port', '5193', '--strictPort'],
	{
		cwd: process.cwd(),
		env: {
			...process.env,
			KENNEMER_DEV_STORAGE: storage,
			PUBLIC_DISPLAY_DIM_TIMEOUT_MS: '60000'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	}
);
let log = '',
	browser;
server.stdout.on('data', (data) => (log += data));
server.stderr.on('data', (data) => (log += data));

try {
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			if ((await fetch(origin)).ok) break;
		} catch {}
		if (server.exitCode !== null) throw new Error(log);
		if (attempt === 99) throw new Error(log);
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
	const executablePath =
		process.env.CHROME_PATH ??
		[
			join(homedir(), '.local/bin/google-chrome'),
			'/usr/bin/google-chrome',
			'/usr/bin/chromium'
		].find(existsSync);
	browser = await chromium.launch({
		headless: true,
		...(executablePath ? { executablePath } : {}),
		args: ['--no-sandbox']
	});
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	page.setDefaultTimeout(8000);
	await page.clock.install();
	const reads = [];
	const commands = [];
	let releaseAction;
	let nextRows = [
		{
			id: 'known-lamp',
			label: 'Hal beneden',
			kind: 'output',
			actual: null,
			begin: null,
			end: null,
			source: 'unknown',
			delays: { begin: [], end: [] },
			issue: 'Apparaat offline'
		}
	];

	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.origin !== origin) return route.abort();
		if (url.pathname === '/api/modes/vacation' && route.request().method() === 'GET') {
			reads.push(route.request().url());
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					state: 'unknown',
					rows: nextRows,
					updatedAt: Date.now(),
					stale: false,
					simulation: true
				})
			});
		}
		if (url.pathname === '/actions' && route.request().method() === 'POST') {
			commands.push(route.request().postDataJSON());
			await new Promise((resolve) => (releaseAction = resolve));
			return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
		}
		return route.continue();
	});

	await page.goto(origin);
	await page.locator('main[data-hydrated="true"]').waitFor();
	assert.equal(reads.length, 0, 'vacation status must not poll before its room is opened');
	const pane = page.locator('.dashboard-content > section').last();
	const advanced = page.getByRole('button', { name: 'Geavanceerd', exact: true });
	await advanced.click();
	for (const digit of [1, 2, 3, 4])
		await page.getByRole('button', { name: `PIN ${digit}`, exact: true }).click();
	await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Geavanceerd', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await page.getByRole('button', { name: 'Vakantiemodi', exact: true }).click();
	await expect(pane.getByRole('button', { name: 'Begin vakantie', exact: true })).toBeEnabled();
	await expect(pane.getByRole('button', { name: 'Einde vakantie', exact: true })).toBeEnabled();
	await expect(
		pane.getByRole('list', { name: 'Status vakantiemodus' }).getByText('Onbekend', { exact: true })
	).toBeVisible();
	await expect(pane.getByText('Apparaat offline', { exact: true })).toBeVisible();
	assert.equal(reads.length, 1, 'status reads start only after opening Vakantiemodi');

	// A refresh response adds a row and reports configured delays; no countdown is implied.
	nextRows = [
		{ ...nextRows[0], actual: true, source: 'lan', delays: { begin: [10800, 0], end: [1800] } },
		{
			id: 'new-scene',
			label: 'Nieuwe scene',
			kind: 'scene',
			actual: false,
			begin: true,
			end: false,
			source: 'cloud',
			delays: { begin: [], end: [] }
		}
	];
	await pane.getByRole('button', { name: 'Vakantiestatus vernieuwen' }).click();
	await expect(pane.getByText('Nieuwe scene', { exact: true })).toBeVisible();
	await expect(pane.getByText('Aan', { exact: true })).toBeVisible();
	await expect(pane.getByText('Uitgeschakeld', { exact: true })).toBeVisible();
	await expect(pane.getByText('Begin: na 180 minuten', { exact: true })).toBeVisible();
	await expect(pane.getByText('Einde: na 30 minuten', { exact: true })).toBeVisible();
	await expect(pane.getByText('LAN', { exact: true })).toBeVisible();
	await expect(pane.getByText('Cloud', { exact: true })).toBeVisible();
	const activeRow = pane.locator('li').filter({ hasText: 'Hal beneden' });
	await expect(activeRow.locator('span').filter({ hasText: /^Aan$/ })).toHaveClass(
		/text-emerald-800/
	);
	const inactiveRow = pane.locator('li').filter({ hasText: 'Nieuwe scene' });
	await expect(inactiveRow.locator('span').filter({ hasText: /^Uitgeschakeld$/ })).toHaveClass(
		/text-rose-800/
	);

	const begin = pane.getByRole('button', { name: 'Begin vakantie', exact: true });
	await begin.click();
	await expect(begin).toBeDisabled();
	await expect(pane.getByRole('button', { name: 'Einde vakantie', exact: true })).toBeDisabled();
	assert.deepEqual(commands[0], { deviceId: 'advanced-vacantie-begin', command: 'on' });
	releaseAction();
	await expect(begin).toBeEnabled();
	await page.clock.runFor(7500);
	assert.ok(
		reads.some((url) => url.includes('refresh=1')),
		'action follow-up performs read-only refresh'
	);
	const end = pane.getByRole('button', { name: 'Einde vakantie', exact: true });
	await end.click();
	await expect(end).toBeDisabled();
	assert.deepEqual(commands[1], { deviceId: 'advanced-vacantie-begin', command: 'off' });
	releaseAction();
	await expect(end).toBeEnabled();

	const readCountBeforeBack = reads.length;
	await page.getByRole('button', { name: 'Terug naar Geavanceerd', exact: true }).click();
	await page.clock.runFor(15000);
	assert.equal(reads.length, readCountBeforeBack, 'polling stops outside Vakantiemodi');
	await page.getByRole('button', { name: 'Vakantiemodi', exact: true }).click();
	assert.equal(reads.length, readCountBeforeBack + 1, 'reopening the room reads status again');

	// Screen dim pauses reads and waking consumes the first touch without pressing controls.
	await page.clock.runFor(60000);
	await page.getByRole('button', { name: 'Scherm actief maken' }).waitFor();
	const readCountAsleep = reads.length;
	await page.clock.runFor(30000);
	assert.equal(reads.length, readCountAsleep, 'status polling pauses while the display sleeps');
	await page.getByRole('button', { name: 'Scherm actief maken' }).click();
	await expect(pane.locator(':scope > header')).toContainText('Home');
	assert.equal(commands.length, 2, 'wake touch never activates a vacation action');

	console.log(
		'Vacation UI passed: active-only polling, unknown/offline usability, aggregate rows/delays/colors, existing action IDs, and sleep/leave polling guards.'
	);
} finally {
	await browser?.close();
	server.kill('SIGTERM');
	if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
	await rm(storage, { recursive: true, force: true });
}
