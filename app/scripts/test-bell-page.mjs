import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const storage = await mkdtemp(join(tmpdir(), 'kennemer-bell-page-'));
const origin = 'http://127.0.0.1:5190';
const server = spawn(
	process.execPath,
	['scripts/dev.mjs', 'mock', '--host', '127.0.0.1', '--port', '5190', '--strictPort'],
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
	const calls = [],
		errors = [],
		external = [];
	const fixed = Date.parse('2026-11-09T09:00:00Z');
	let config = {
		paused: false,
		active_profile: 'regular',
		weekdays: [0, 1, 2, 3, 4],
		timezone: 'Europe/Amsterdam',
		gap_seconds: 1,
		bell_duration_seconds: 1,
		profiles: {
			regular: [
				'11:00',
				...Array.from(
					{ length: 8 },
					(_, index) =>
						`${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`
				),
				'10:10x2',
				...Array.from(
					{ length: 16 },
					(_, index) =>
						`${String(12 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`
				)
			],
			short: ['10:30', '12:30'],
			'ten-minute': []
		}
	};
	let status = {
		paused: false,
		active_profile: 'regular',
		next_event: { at: '2026-11-09T09:10:00Z', time: '10:10', profile: 'regular', count: 2 },
		clock: { synchronized: true }
	};
	let unavailable = false;
	await page.route(`${origin}/api/bells/*`, async (route) => {
		const operation = new URL(route.request().url()).pathname.split('/').at(-1);
		if (route.request().method() === 'POST') {
			const input = route.request().postDataJSON();
			calls.push({ operation, input });
			if (operation === 'config') {
				config = input.config;
				status = {
					...status,
					paused: config.paused,
					active_profile: config.active_profile,
					next_event: config.paused
						? null
						: { at: '2026-11-09T09:30:00Z', time: '10:30', profile: config.active_profile }
				};
			}
			await route.fulfill({ json: { ok: true } });
			return;
		}
		if (operation === 'status' && unavailable) {
			await route.fulfill({ status: 503, json: { error: 'Belservice niet bereikbaar.' } });
			return;
		}
		await route.fulfill({ json: operation === 'config' ? { config, revision: 1 } : status });
	});
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('request', (request) => {
		if (!request.url().startsWith(origin) && !request.url().startsWith('data:'))
			external.push(request.url());
	});
	await page.goto(origin);
	await page.locator('main[data-hydrated="true"]').waitFor();
	await page.clock.install({ time: fixed });
	await page.getByRole('button', { name: 'Schoolbel', exact: true }).click();
	for (const digit of [1, 2, 3, 4])
		await page.getByRole('button', { name: `PIN ${digit}`, exact: true }).click();
	await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	const bell = page.locator('.bell-page');
	const selectedList = () => bell.getByRole('list', { name: /Belmomenten/ });
	await bell.getByLabel('Volgende beltijd', { exact: true }).waitFor();
	await expect(bell.getByLabel('Volgende beltijd', { exact: true })).toContainText('10:10');
	assert.deepEqual(
		await selectedList().locator('time').allTextContents(),
		[...config.profiles.regular].map((value) => value.slice(0, 5)).sort()
	);
	assert.equal(await selectedList().locator('[aria-current="true"]').count(), 1);
	async function assertCentered() {
		const position = await selectedList().evaluate((list) => {
			const next = list.querySelector('[aria-current="true"]');
			const row = next.getBoundingClientRect(),
				box = list.getBoundingClientRect();
			return {
				distance: Math.abs(row.top + row.height / 2 - (box.top + list.clientHeight / 2)),
				scroll: list.scrollTop
			};
		});
		assert.ok(position.distance <= 2, JSON.stringify(position));
		assert.ok(position.scroll > 0);
	}
	await assertCentered();
	const colors = await selectedList().evaluate((list) => ({
		past: getComputedStyle(list.firstElementChild).color,
		next: getComputedStyle(list.querySelector('[aria-current="true"]')).color
	}));
	assert.notEqual(colors.past, colors.next);
	await selectedList().evaluate((list) => {
		list.scrollTop = 0;
	});
	await page.clock.fastForward(1001);
	assert.equal(await selectedList().evaluate((list) => list.scrollTop), 0);
	await page.getByRole('button', { name: 'Home', exact: true }).click();
	await page.getByRole('button', { name: 'Schoolbel', exact: true }).click();
	for (const digit of [1, 2, 3, 4])
		await page.getByRole('button', { name: `PIN ${digit}`, exact: true }).click();
	await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	await assertCentered();
	assert.equal(await page.evaluate(() => window.scrollY), 0);
	await page.waitForTimeout(200);
	await page.screenshot({ path: '/tmp/kennemer-schoolbel.png' });

	const countdown = bell.getByLabel('Tijd tot volgende bel', { exact: true });
	const before = await countdown.textContent();
	await page.clock.fastForward(1000);
	assert.notEqual(await countdown.textContent(), before);
	assert.equal(calls.length, 0);
	for (const viewport of [
		{ width: 1280, height: 900 },
		{ width: 1024, height: 768 }
	]) {
		await page.setViewportSize(viewport);
		assert.ok(await bell.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
		const modeBox = await bell.getByRole('radiogroup', { name: 'Belrooster' }).boundingBox();
		const manualBox = await bell.locator('[aria-labelledby="manual-bell-title"]').boundingBox();
		assert.ok(manualBox.y > modeBox.y + modeBox.height + 150);
		const overviewBox = await bell.locator('.bell-overview').boundingBox(),
			nextBox = await bell.locator('.bell-next').boundingBox();
		assert.ok(nextBox.x > overviewBox.x + overviewBox.width / 3);
	}
	await bell.getByRole('radio', { name: 'Verkort', exact: true }).check();
	await expect(selectedList()).toHaveAttribute('aria-label', 'Belmomenten Verkort');
	assert.deepEqual(await selectedList().locator('time').allTextContents(), ['10:30', '12:30']);
	await expect(bell.getByLabel('Actief belrooster', { exact: true })).toContainText('Regulier');
	await expect(bell.getByLabel('Volgende beltijd', { exact: true })).toContainText('10:10');
	assert.equal(await selectedList().locator('[aria-current="true"]').count(), 0);
	await bell.getByText('Keuze Verkort nog niet opgeslagen.').waitFor();
	assert.equal(calls.length, 0);
	await bell.getByRole('button', { name: 'Opslaan', exact: true }).click();
	await expect(bell.getByLabel('Actief belrooster', { exact: true })).toContainText('Verkort');
	await expect(bell.getByLabel('Volgende beltijd', { exact: true })).toContainText('10:30');
	assert.equal(calls.length, 1);
	assert.equal(calls[0].input.config.active_profile, 'short');
	await bell.getByRole('radio', { name: '10-minutenbel', exact: true }).check();
	await bell.getByText('Dit rooster heeft geen belmomenten.').waitFor();
	assert.equal(await bell.getByRole('list', { name: /Belmomenten/ }).count(), 0);
	await bell.getByRole('radio', { name: 'Uit', exact: true }).check();
	await bell.getByText('De automatische bel staat uit.').waitFor();
	await expect(bell.getByLabel('Volgende beltijd', { exact: true })).toContainText('10:30');
	await bell.getByRole('button', { name: 'Opslaan', exact: true }).click();
	await bell.getByText('De automatische schoolbel staat uit.').waitFor();
	assert.equal(calls.length, 2);
	await bell.getByRole('button', { name: 'Bel nu 2×', exact: true }).click();
	assert.equal(calls.length, 3);
	assert.equal(calls[2].operation, 'demo');
	assert.equal(calls[2].input.count, 2);
	// Repeated clock/poll ticks are display-only and still allow the 2-minute Home timeout.
	await page.clock.fastForward(120001);
	await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	assert.equal(calls.length, 3);
	await page.getByRole('button', { name: 'Schoolbel', exact: true }).click();
	for (const digit of [1, 2, 3, 4])
		await page.getByRole('button', { name: `PIN ${digit}`, exact: true }).click();
	await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	unavailable = true;
	await page.clock.fastForward(3001);
	await bell.getByText('Niet beschikbaar', { exact: true }).waitFor();
	await expect(bell.getByLabel('Actief belrooster', { exact: true })).toContainText(
		'Laatst bekend rooster'
	);
	assert.equal(await bell.getByLabel('Tijd tot volgende bel', { exact: true }).count(), 0);
	assert.deepEqual(errors, []);
	assert.deepEqual(external, []);
	console.log(
		'Bell page passed: selected-only sorted roster, actual vs unsaved mode, countdown without idle reset, grey past/colored upcoming times, entry-only centered scrolling, off/empty/offline, explicit saves and manual rings, separated controls and responsive geometry.'
	);
} finally {
	await browser?.close();
	server.kill('SIGTERM');
	if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
	await rm(storage, { recursive: true, force: true });
}
