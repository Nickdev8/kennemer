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

	const pane = page.locator('.dashboard-content > section').last();
	async function checkAdvancedLayout() {
		const panel = pane.locator('[aria-label="Geavanceerde bediening"]');
		const bounds = await pane.evaluate((pane) => {
			const panel = pane.querySelector('[aria-label="Geavanceerde bediening"]');
			const paneBox = pane.getBoundingClientRect();
			const panelBox = panel.getBoundingClientRect();
			return {
				expectedBottom:
					paneBox.bottom -
					parseFloat(getComputedStyle(pane).paddingBottom) -
					parseFloat(getComputedStyle(pane).borderBottomWidth),
				actualBottom: panelBox.bottom,
				emptyPublicGrids: [...pane.children].filter(
					(child) => getComputedStyle(child).display === 'grid'
				).length,
				hiddenHeights: [...pane.querySelectorAll(':scope > [hidden]')].map(
					(child) => child.getBoundingClientRect().height
				)
			};
		});
		assert.ok(Math.abs(bounds.expectedBottom - bounds.actualBottom) <= 1, JSON.stringify(bounds));
		assert.equal(bounds.emptyPublicGrids, 0);
		assert.ok(bounds.hiddenHeights.every((height) => height === 0));
		const scroller = panel.locator('[role="presentation"]');
		const cards = scroller.locator(':scope > .grid').locator(':scope > *');
		const count = await cards.count();
		assert.ok(count > 0);
		await expect(pane.locator(':scope > header')).toContainText(`${count} knoppen`);
		await cards.last().scrollIntoViewIfNeeded();
		const lastBox = await cards.last().boundingBox(),
			scrollBox = await scroller.boundingBox();
		assert.ok(lastBox.y + lastBox.height <= scrollBox.y + scrollBox.height + 1);
		const manageBox = await panel
			.getByRole('button', { name: 'Bediening beheren', exact: true })
			.boundingBox();
		assert.ok(manageBox.y + manageBox.height <= bounds.actualBottom + 1);
		assert.ok(manageBox.y > bounds.actualBottom - 100);
		const info = panel.getByRole('button', { name: 'Systeeminformatie', exact: true });
		const infoBox = await info.boundingBox();
		assert.ok(Math.abs(infoBox.y - manageBox.y) <= 1);
		assert.ok(infoBox.x + infoBox.width < manageBox.x);
		assert.equal(
			await info.evaluate(
				(node) =>
					node.parentElement ===
					[
						...node.closest('[aria-label="Geavanceerde bediening"]').querySelectorAll('button')
					].find((button) => button.textContent.includes('Bediening beheren')).parentElement
			),
			true
		);
	}
	for (const viewport of [
		{ width: 1280, height: 900 },
		{ width: 1024, height: 768 }
	]) {
		await page.setViewportSize(viewport);
		await page.getByRole('button', { name: 'Apparaten', exact: true }).click();
		const group = pane.locator('.gang-control-group');
		await expect(group).toBeVisible();
		const bounds = await group.evaluate((node) => {
			const rect = node.getBoundingClientRect();
			const options = node.querySelector('.gang-control-options');
			const columns = [...options.children].map((n) => n.getBoundingClientRect());
			return {
				width: rect.width,
				x: rect.x,
				y: rect.y,
				columns: columns.map((r) => ({ x: r.x, y: r.y, width: r.width })),
				grid:
					node.parentElement.clientWidth -
					parseFloat(getComputedStyle(node.parentElement).paddingRight) -
					parseFloat(getComputedStyle(node.parentElement).paddingLeft)
			};
		});
		assert.ok(Math.abs(bounds.width - bounds.grid) < 2, JSON.stringify(bounds));
		assert.ok(
			bounds.columns.every((c) => Math.abs(c.y - bounds.columns[0].y) < 1),
			JSON.stringify(bounds)
		);
		assert.ok(
			Math.abs(bounds.columns[0].width / bounds.columns[1].width - 1.5) < 0.03,
			JSON.stringify(bounds)
		);
		const groupBox = await group.boundingBox();
		for (const button of await group.getByRole('button').all()) {
			const box = await button.boundingBox();
			assert.ok(box.y + box.height <= groupBox.y + groupBox.height - 12, JSON.stringify({box,groupBox}));
		}
		await expect(group.getByRole('heading')).toHaveCount(1);
		await expect(group.getByRole('button', { name: 'Aan', exact: true })).toBeVisible();
		await expect(group.getByRole('button', { name: 'Uit', exact: true })).toBeVisible();
		for (const label of ['Gang Color 830', 'Gang Color 865', 'Gang Color Paars'])
			await expect(group.getByRole('button', { name: label, exact: true })).toBeVisible();
		if (process.env.GANG_SCREENSHOT_PATH)
			await page.screenshot({ path: process.env.GANG_SCREENSHOT_PATH });
		await expect(pane.getByText('Pagina 1 van 2', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Volgende pagina apparaten', exact: true }).click();
		await expect(group).toHaveCount(0);
		await expect(pane.getByRole('heading', { name: 'Gedenklicht', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Home', exact: true }).click();
		await expect(pane.locator(':scope > header')).toContainText('9 knoppen');
	}

	console.log(
		'Gang merged layout: full-width first row, 1:2 control proportions, preserved buttons, pagination and Home layout passed at two kiosk sizes.'
	);
} finally {
	await browser?.close();
	server.kill('SIGTERM');
	if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
	await rm(storage, { recursive: true, force: true });
}
