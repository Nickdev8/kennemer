import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const storage = await mkdtemp(join(tmpdir(), 'kennemer-shelly-ui-'));
const origin = 'http://127.0.0.1:5191';
const server = spawn(
	process.execPath,
	['scripts/dev.mjs', 'mock', '--host', '127.0.0.1', '--port', '5191', '--strictPort'],
	{
		cwd: process.cwd(),
		env: {
			...process.env,
			KENNEMER_DEV_STORAGE: storage,
			PUBLIC_DISPLAY_DIM_TIMEOUT_MS: '3600000'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	}
);
let log = '',
	browser;
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
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
	const reads = [],
		commands = [],
		errors = [],
		external = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('request', (request) => {
		if (!request.url().startsWith(origin) && !request.url().startsWith('data:'))
			external.push(request.url());
		if (new URL(request.url()).pathname === '/api/shelly') {
			if (request.method() === 'POST') commands.push(request.postDataJSON());
			else reads.push(request.url());
		}
	});
	await page.goto(origin);
	await page.locator('main[data-hydrated="true"]').waitFor();
	await page.clock.install();
	assert.equal(reads.length, 0, 'Shelly inventory must not poll on other tabs');
	await page.getByRole('button', { name: 'Shelly', exact: true }).click();
	const pane = page.getByLabel('Shelly ruimtes', { exact: true });
	await pane.getByRole('button', { name: /^Nieuwbouw/ }).waitFor();
	await pane.getByRole('button', { name: /^Light Hfd/ }).waitFor();
	assert.equal(await page.getByRole('button', { name: 'Ontgrendel', exact: true }).count(), 0);
	const heading = page.locator('.dashboard-content > section').last().locator(':scope > header');
	assert.ok(!(await heading.textContent()).includes('knoppen'));
	for (const viewport of [
		{ width: 1280, height: 900 },
		{ width: 1024, height: 768 }
	]) {
		await page.setViewportSize(viewport);
		assert.ok(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
	}
	await pane.getByRole('button', { name: /^Nieuwbouw/ }).click();
	await pane.getByRole('heading', { name: 'Nieuwbouw', exact: true }).waitFor();
	await pane.getByRole('heading', { name: 'Vide boven', exact: true }).waitFor();

	const temperature = pane.locator('section[aria-label="Temperatuur nieuwbouw"]');
	await temperature.getByText('21.5 °C', { exact: true }).waitFor();
	assert.equal(await temperature.getByRole('button').count(), 0);
	const offline = pane.locator('section[aria-label="Koof licht"]');
	await offline.getByText('Apparaat offline', { exact: true }).waitFor();
	await offline.getByText('Status onbekend', { exact: true }).waitFor();
	const vide = pane.locator('section[aria-label="Vide boven"]');
	await vide.locator('span').filter({ hasText: /^Uit$/ }).waitFor();
	await expect(
		vide.getByRole('button', { name: 'Vide boven Uitgang: Aan', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	assert.equal(
		await offline.getByRole('button').count(),
		2,
		'Unknown output retains explicit on/off'
	);
	assert.equal(await offline.locator('.shelly-power').count(), 0);
	for (const viewport of [
		{ width: 1280, height: 900 },
		{ width: 1024, height: 768 }
	]) {
		await page.setViewportSize(viewport);
		const layout = await pane.locator('.shelly-device-grid').evaluate((grid) => {
			const cards = [...grid.children].map((card) => {
				const box = card.getBoundingClientRect();
				return { x: box.x, y: box.y, height: box.height };
			});
			return { cards, overflow: grid.scrollWidth > grid.clientWidth + 1 };
		});
		assert.equal(layout.overflow, false);
		assert.ok(layout.cards[0].x < layout.cards[1].x);
		assert.equal(layout.cards[0].y, layout.cards[1].y);
		assert.ok(layout.cards.every((card) => card.height <= 160));
		const power = await vide.locator('.shelly-power').boundingBox();
		assert.equal(power.width, 52);
		assert.equal(power.height, 52);
	}

	const timeout = (route) =>
		route.fulfill({
			status: 504,
			json: {
				error: 'Shelly antwoordde niet. Controleer de werkelijke status voordat u opnieuw drukt.'
			}
		});
	await page.route(`${origin}/api/shelly`, async (route) => {
		if (route.request().method() === 'POST') await timeout(route);
		else await route.continue();
	});
	await vide.getByRole('button', { name: 'Vide boven Uitgang: Aan', exact: true }).click();
	await pane
		.getByText('Shelly antwoordde niet. Controleer de werkelijke status voordat u opnieuw drukt.')
		.waitFor();
	await page.clock.fastForward(6000);
	assert.equal(commands.length, 1, 'Timeouts never resend a command');
	assert.deepEqual(commands[0], {
		room: 'nieuwbouw',
		deviceId: 'aabbccddee01_2',
		component: 'switch:2',
		command: 'on'
	});
	await page.unroute(`${origin}/api/shelly`);
	await vide.getByRole('button', { name: 'Vide boven Uitgang: Aan', exact: true }).click();
	await page.clock.fastForward(2000);
	await vide.locator('span').filter({ hasText: /^Aan$/ }).waitFor();
	assert.equal(commands.length, 2);
	await expect(
		vide.getByRole('button', { name: 'Vide boven Uitgang: Uit', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await vide.getByRole('button', { name: 'Vide boven Uitgang: Uit', exact: true }).click();
	await page.clock.fastForward(2000);
	await vide.locator('span').filter({ hasText: /^Uit$/ }).waitFor();
	assert.equal(commands.length, 3);
	assert.equal(commands[2].command, 'off');
	assert.equal(commands[2].component, 'switch:2');

	await pane.getByRole('button', { name: 'Terug naar ruimtes', exact: true }).click();
	await pane.getByRole('button', { name: /^Light Hfd/ }).click();
	const unknown = pane.locator('section[aria-label="Licht gang"]');
	await unknown.getByText('Status onbekend · geen ondersteunde uitgang of sensor.').waitFor();
	assert.equal(await unknown.getByRole('button').count(), 0);
	await pane.getByRole('button', { name: 'Terug naar ruimtes', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Shelly', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	const invalid = await page.request.post(`${origin}/api/shelly`, {
		data: { room: 'nieuwbouw', deviceId: 'aabbccddee01_2', component: 'switch:0', command: 'on' }
	});
	assert.equal(invalid.status(), 400);
	assert.equal((await page.request.get(`${origin}/api/shelly?room=other`)).status(), 400);
	await page.getByRole('button', { name: 'Home', exact: true }).click();
	const pausedReads = reads.length;
	await page.clock.fastForward(31_000);
	assert.equal(reads.length, pausedReads);
	assert.equal(commands.length, 3);
	await page.getByRole('button', { name: 'Shelly', exact: true }).click();
	await pane.getByRole('button', { name: /^Nieuwbouw/ }).waitFor();
	await page.clock.fastForward(120001);
	await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	const afterIdle = reads.length;
	await page.clock.fastForward(31_000);
	assert.equal(reads.length, afterIdle);
	// Missing room and account outage remain explicit without exposing server details.
	await page.route(`${origin}/api/shelly*`, (route) =>
		route.fulfill({
			json: {
				ok: true,
				stale: false,
				updatedAt: Date.now(),
				rooms: [
					{ id: 'nieuwbouw', name: 'Nieuwbouw', found: false, count: 0, onlineCount: 0 },
					{ id: 'light-hfd', name: 'Light Hfd', found: true, count: 0, onlineCount: 0 }
				]
			}
		})
	);
	await page.getByRole('button', { name: 'Shelly', exact: true }).click();
	await expect(pane.getByRole('button', { name: /^Nieuwbouw/ })).toBeDisabled();
	await pane.getByText('Ruimte niet gevonden in Shelly-account', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'Home', exact: true }).click();
	await page.unroute(`${origin}/api/shelly*`);
	await page.route(`${origin}/api/shelly*`, (route) =>
		route.fulfill({ status: 503, json: { error: 'offline' } })
	);
	await page.getByRole('button', { name: 'Shelly', exact: true }).click();
	await pane.getByText('Shelly Cloud niet bereikbaar. Probeer later opnieuw.').waitFor();
	assert.deepEqual(errors, []);
	assert.deepEqual(external, []);
	console.log(
		'Shelly UI passed: public room cards, in-pane navigation, channel-specific explicit controls, sensors/unknown/offline, no timeout retry, active-only polling/idle cleanup, missing room/account failure and compact two-column cards, known-state power toggles, unknown explicit controls and responsive bounds.'
	);
} finally {
	await browser?.close();
	server.kill('SIGTERM');
	if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
	await rm(storage, { recursive: true, force: true });
}
