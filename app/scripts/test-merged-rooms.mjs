import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const storage = await mkdtemp(join(tmpdir(), 'kennemer-layout-'));
const origin = 'http://127.0.0.1:5189';
const server = spawn(
	process.execPath,
	['scripts/dev.mjs', 'mock', '--host', '127.0.0.1', '--port', '5189', '--strictPort'],
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
	await page.goto(origin);
	await page.locator('main[data-hydrated="true"]').waitFor();
	async function open(name) {
		await page.getByRole('button', { name, exact: true }).click();
		for (const digit of [1, 2, 3, 4])
			await page.getByRole('button', { name: `PIN ${digit}`, exact: true }).click();
		await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	}

	const nav = page.getByRole('navigation', { name: "Bedieningspagina's" });
	await expect(nav.getByRole('button', { name: 'Apparaten', exact: true })).toHaveCount(0);
	await expect(nav.getByRole('button', { name: 'Shelly', exact: true })).toHaveCount(0);
	await open('Geavanceerd');
	await expect(page.getByRole('button', { name: /Nieuwbouw/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Light Hfd/ })).toBeVisible();
	await page.getByRole('button', { name: 'Vakantiemodi', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Vakantiemodus', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Gang Color', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Terug naar ruimtes', exact: true }).click();
	await page.getByRole('button', { name: 'Eigen apparaten', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Gang Color', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Vakantiemodus', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Bediening beheren', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Terug naar ruimtes', exact: true }).click();
	await page.getByRole('button', { name: /Nieuwbouw/ }).click();
	await expect(page.locator('.shelly-device-card').first()).toBeVisible();
	await nav.getByRole('button', { name: 'Home', exact: true }).click();
	await nav.getByRole('button', { name: 'Geavanceerd', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'PIN vereist' })).toBeVisible();
	console.log('Merged protected room navigation passed.');

} finally {
	await browser?.close();
	server.kill('SIGTERM');
	if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
	await rm(storage, { recursive: true, force: true });
}
