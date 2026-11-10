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
		await open('Geavanceerde bediening');
		await checkAdvancedLayout();
		await open('Schoolbel');
		await page.getByRole('radiogroup', { name: 'Belrooster' }).waitFor();
		assert.equal(await pane.locator(':scope > .grid').count(), 0);
		await open('Geavanceerde bediening');
		await checkAdvancedLayout();
		await page.getByRole('button', { name: 'Home', exact: true }).click();
		await expect(pane.locator(':scope > header')).toContainText('9 knoppen');
		const gridBox = await pane.locator(':scope > .grid').boundingBox();
		const paneBox = await pane.boundingBox();
		assert.ok(Math.abs(gridBox.y + gridBox.height - (paneBox.y + paneBox.height - 17)) <= 1);
	}
	// Leaving advanced always revokes access; its DOM must not follow other tabs.
	const advancedPanel = page.locator('[aria-label="Geavanceerde bediening"]');
	for (const destination of ['Home', 'Apparaten', 'Overwerk timers', 'Shelly', 'Schoolbel']) {
		await open('Geavanceerde bediening');
		await page.getByRole('button', { name: destination, exact: true }).click();
		await expect(advancedPanel).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Bediening beheren', exact: true })).toHaveCount(
			0
		);
		if (destination === 'Schoolbel') {
			await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
			await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
				'aria-current',
				'page'
			);
		}
		await page.getByRole('button', { name: 'Geavanceerde bediening', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Ontgrendel', exact: true })).toBeVisible();
		await expect(advancedPanel).toHaveCount(0);
		await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
	}
	await open('Schoolbel');
	await page.getByRole('button', { name: 'Geavanceerde bediening', exact: true }).click();
	await expect(page.getByRole('radiogroup', { name: 'Belrooster', exact: true })).toBeHidden();
	await expect(advancedPanel).toHaveCount(0);
	await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await open('Geavanceerde bediening');
	await page.getByRole('button', { name: 'Systeeminformatie', exact: true }).click();
	await page.getByRole('dialog', { name: 'Debug- en systeeminformatie', exact: true }).waitFor();
	// Programmatic tab selection also closes nested protected overlays.
	await page
		.getByRole('button', { name: 'Home', exact: true })
		.evaluate((button) => button.click());
	await expect(
		page.getByRole('dialog', { name: 'Debug- en systeeminformatie', exact: true })
	).toHaveCount(0);
	await expect(advancedPanel).toHaveCount(0);

	await open('Geavanceerde bediening');
	await page.getByRole('button', { name: 'Bediening beheren', exact: true }).click();
	const editor = page.getByRole('dialog', { name: 'Bediening en tabs beheren', exact: true });
	const draftLabel = editor
		.locator('tr[data-control-id="push-1"]')
		.getByRole('textbox', { name: 'Label 1ste etage', exact: true });
	await draftLabel.fill('Bewaard na vergrendelen');
	const keyboard = page.getByRole('group', { name: 'Schermtoetsenbord' });
	if (await keyboard.isVisible())
		await keyboard.getByRole('button', { name: 'Sluiten', exact: true }).click();
	await page
		.getByRole('button', { name: 'Home', exact: true })
		.evaluate((button) => button.click());
	await expect(editor).toHaveCount(0);
	await expect(advancedPanel).toHaveCount(0);
	await open('Geavanceerde bediening');
	await page.getByRole('button', { name: 'Bediening beheren', exact: true }).click();
	await expect(draftLabel).toHaveValue('Bewaard na vergrendelen');

	console.log(
		'Protected layout passed: full-height advanced pane, correct count, scrollable last card, bottom management bar, hidden bell drafts, Home restoration at 1280×900 and 1024×768, access revocation on every destination, direct protected switches and cancellation.'
	);
} finally {
	await browser?.close();
	server.kill('SIGTERM');
	if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
	await rm(storage, { recursive: true, force: true });
}
