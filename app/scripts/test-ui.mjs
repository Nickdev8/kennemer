import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const storage = await mkdtemp(join(tmpdir(), 'kennemer-ui-'));
const port = 5187;
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
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
	page.setDefaultTimeout(8000);
	const external = [],
		actions = [],
		errors = [];
	const offlineStatusDeviceId = '8813bfd6d300';
	let statusRequestCount = 0;
	await page.route(`${origin}/api/device-output*`, async (route) => {
		statusRequestCount += 1;
		const ids = new URL(route.request().url()).searchParams.get('ids')?.split(',') ?? [];
		const states = Object.fromEntries(
			ids
				.filter((id) => id !== offlineStatusDeviceId || statusRequestCount === 1)
				.map((id) => [id, { lastCommand: 'off' }])
		);
		const failedIds = ids.filter((id) => id === offlineStatusDeviceId && statusRequestCount > 1);
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				ok: true,
				states,
				errors: Object.fromEntries(failedIds.map((id) => [id, 'Internal status error']))
			})
		});
	});
	page.on('request', (r) => {
		if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(r.url());
		if (['/actions', '/triggers'].some((p) => r.url().endsWith(p))) actions.push(r.url());
	});
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(origin);
	await page.locator('main[data-hydrated="true"]').waitFor();
	await page.getByRole('navigation', { name: "Bedieningspagina's" }).waitFor();
	assert.equal(await page.getByLabel(/^Knop [1-9]$/).count(), 9);
	const homeButton = page.getByRole('button', { name: 'Home', exact: true });
	const blue = await homeButton.evaluate((node) => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d');
		context.fillStyle = getComputedStyle(node).backgroundColor;
		context.fillRect(0, 0, 1, 1);
		return Array.from(context.getImageData(0, 0, 1, 1).data);
	});
	assert.ok(blue[2] > blue[1] && blue[1] > blue[0] && blue[2] >= 200 && blue[0] < 100);
	const homeBox = await homeButton.boundingBox(),
		allOffBox = await page.getByRole('button', { name: 'ALLES UIT', exact: true }).boundingBox();
	assert.equal(homeBox.height, allOffBox.height);
	const navBox = await page.getByRole('navigation', { name: "Bedieningspagina's" }).boundingBox();
	const advancedBox = await page
		.getByRole('button', { name: 'Geavanceerde bediening', exact: true })
		.boundingBox();
	assert.ok(navBox.y + navBox.height <= advancedBox.y);
	assert.equal(
		await page
			.getByLabel('Knop 1', { exact: true })
			.locator('..')
			.locator('..')
			.getByRole('heading', { name: '1ste etage', exact: true })
			.count(),
		1
	);
	const positions = await page.getByLabel(/^Knop [1-9]$/).evaluateAll((nodes) =>
		nodes.map((node) => ({
			number: Number(node.textContent),
			x: node.getBoundingClientRect().x,
			y: node.getBoundingClientRect().y
		}))
	);
	const left = positions.filter((p) => p.number <= 3);
	assert.ok(left[0].y < left[1].y && left[1].y < left[2].y);
	assert.equal(left[0].x, left[1].x);
	assert.equal(left[1].x, left[2].x);
	await page.getByRole('button', { name: 'Apparaten', exact: true }).click();
	await page.getByText('Color spare 051026', { exact: true }).waitFor();
	assert.equal(actions.length, 0);
	await page.getByRole('button', { name: 'Uit', exact: true }).click();
	await page.getByRole('button', { name: 'Aan', exact: true }).waitFor();
	await expect(page.getByRole('button', { name: 'Aan', exact: true })).toHaveCSS(
		'background-color',
		'rgb(22, 163, 74)'
	);
	await page.getByRole('button', { name: 'Home', exact: true }).click();
	const offlineCard = page
		.getByRole('heading', { name: '1ste etage', exact: true })
		.locator('xpath=../../..');
	await offlineCard.getByRole('button', { name: 'Uit', exact: true }).click();
	await offlineCard.getByText('Apparaat offline', { exact: true }).waitFor();
	await expect(offlineCard.getByRole('button', { name: 'Aan', exact: true })).toBeEnabled();
	await offlineCard.getByRole('button', { name: 'Aan', exact: true }).click();
	await offlineCard.getByRole('button', { name: 'Uit', exact: true }).waitFor();
	await offlineCard.getByText('Apparaat offline', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'ALLES UIT', exact: true }).click();
	await page.getByRole('button', { name: 'Nee', exact: true }).last().click();
	assert.equal(actions.length, 3);
	// A wake touch is consumed and cannot execute a card beneath the overlay.
	await page.getByRole('button', { name: 'Scherm actief maken' }).waitFor({ timeout: 6000 });
	await page.getByRole('button', { name: 'Scherm actief maken' }).click();
	assert.equal(actions.length, 3);
	await page.getByRole('button', { name: 'Geavanceerde bediening', exact: true }).click();
	await page.getByRole('button', { name: 'PIN 1', exact: true }).click();
	await page.getByRole('button', { name: 'PIN 2', exact: true }).click();
	await page.getByRole('button', { name: 'PIN 3', exact: true }).click();
	await page.getByRole('button', { name: 'PIN 4', exact: true }).click();
	await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Geavanceerde bediening', exact: true })
		.getByRole('button', { name: 'Sluiten', exact: true })
		.click();
	await page.getByRole('button', { name: 'Overwerk timers', exact: true }).click();
	for (const label of [
		'Overwerktimer Hoofdgebouw',
		'Overwerktimer Nieuwbouw',
		'Overwerktimer Kopje'
	])
		await page.getByRole('heading', { name: label, exact: true }).waitFor();
	await page.getByRole('button', { name: 'Overwerktimer Hoofdgebouw: Start timer' }).click();
	await page.getByRole('button', { name: /Overwerktimer Hoofdgebouw: timer gestart/ }).waitFor();
	assert.equal(actions.length, 4);
	await page.getByRole('button', { name: 'Geavanceerde bediening', exact: true }).click();
	for (const digit of [1, 2, 3, 4])
		await page.getByRole('button', { name: `PIN ${digit}`, exact: true }).click();
	await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	const rosters = page.getByRole('radiogroup', { name: 'Belrooster' });
	assert.equal(await rosters.getByRole('radio', { checked: true }).count(), 1);
	for (const label of ['Verkort rooster', '10-minutenbel', 'Regulier rooster']) {
		await rosters.getByText(label, { exact: true }).click();
		assert.equal(await rosters.getByRole('radio', { checked: true }).count(), 1);
		await expect(rosters.getByRole('radio', { name: label, exact: true })).toBeChecked();
	}
	assert.equal(actions.length, 4);
	await page
		.getByRole('dialog', { name: 'Geavanceerde bediening', exact: true })
		.getByRole('button', { name: 'Sluiten', exact: true })
		.click();
	await page.getByRole('button', { name: 'Overwerk timers', exact: true }).click();
	await page.getByRole('button', { name: /Overwerktimer Hoofdgebouw: timer gestart/ }).waitFor();
	await page.getByRole('button', { name: 'Geavanceerde bediening', exact: true }).click();
	for (const digit of [1, 2, 3, 4])
		await page.getByRole('button', { name: `PIN ${digit}`, exact: true }).click();
	await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	const information = page.getByRole('button', { name: 'Systeeminformatie' });
	assert.equal(
		(await information.boundingBox()).height,
		(await page.getByRole('button', { name: 'Paneel vastzetten' }).boundingBox()).height
	);
	await information.click();
	const debug = page.getByRole('dialog', { name: 'Debug- en systeeminformatie', exact: true });
	await debug.getByText('a'.repeat(40), { exact: true }).waitFor();
	await debug.getByText('b'.repeat(40), { exact: true }).waitFor();
	await debug.getByText('Appversie', { exact: true }).waitFor();
	await debug.getByText('Systeem', { exact: true }).waitFor();
	await debug.getByRole('button', { name: 'Sluiten', exact: true }).click();
	await debug.waitFor({ state: 'hidden' });
	const panelBox = await page
		.getByRole('dialog', { name: 'Geavanceerde bediening', exact: true })
		.boundingBox();
	const manageBox = await page
		.getByRole('button', { name: 'Bediening beheren', exact: true })
		.boundingBox();
	assert.ok(manageBox.y > panelBox.y + panelBox.height / 2);
	assert.ok(manageBox.x + manageBox.width > panelBox.x + panelBox.width * 0.8);
	await page.getByRole('button', { name: 'Bediening beheren', exact: true }).click();
	const editor = page.getByRole('dialog', { name: 'Bediening en tabs beheren', exact: true });
	await editor.getByText('Configuratie lezen…').waitFor({ state: 'hidden' });
	const record = editor.locator('tr[data-control-id="push-1"]');
	assert.equal(
		await editor.getByRole('button', { name: 'Concept bekijken', exact: true }).count(),
		0
	);
	await record.getByRole('textbox', { name: 'Label 1ste etage', exact: true }).fill('Test etage');
	const enabled = record.getByRole('checkbox', { name: 'Ingeschakeld 1ste etage', exact: true });
	await enabled.uncheck();
	await record.getByText('Nee', { exact: true }).waitFor();
	await enabled.check();
	await record.getByText('Ja', { exact: true }).waitFor();
	assert.equal(actions.length, 4);
	const timerRow = editor.locator('tr[data-control-id="Overwerktimer-1"]');
	await timerRow
		.getByRole('combobox', { name: 'Plaatsing Overwerktimer Hoofdgebouw' })
		.selectOption('main');
	await expect(
		timerRow.getByRole('combobox', { name: 'Tab Overwerktimer Hoofdgebouw' })
	).toHaveValue('overwerktimer');
	await expect(
		timerRow.getByRole('spinbutton', { name: 'Positie Overwerktimer Hoofdgebouw' })
	).toHaveValue('1');
	await timerRow
		.getByRole('combobox', { name: 'Tab Overwerktimer Hoofdgebouw' })
		.selectOption('devices');
	await timerRow.getByRole('spinbutton', { name: 'Positie Overwerktimer Hoofdgebouw' }).fill('2');
	await expect(
		timerRow.getByRole('combobox', { name: 'Tab Overwerktimer Hoofdgebouw' })
	).toHaveValue('devices');
	await expect(
		timerRow.getByRole('spinbutton', { name: 'Positie Overwerktimer Hoofdgebouw' })
	).toHaveValue('2');
	await editor.getByRole('button', { name: 'Wijzigingen opslaan', exact: true }).click();
	await editor.getByLabel('Configuratie-PIN', { exact: true }).fill('1234');
	await editor.getByRole('button', { name: 'Bevestigen', exact: true }).click();
	await editor.getByText('Configuratie opgeslagen.', { exact: true }).waitFor();
	await editor.getByRole('button', { name: 'Sluiten', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Geavanceerde bediening', exact: true })
		.getByRole('button', { name: 'Sluiten', exact: true })
		.click();
	await page.getByRole('button', { name: 'Apparaten', exact: true }).click();
	await page.getByRole('heading', { name: 'Overwerktimer Hoofdgebouw', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Geavanceerde bediening', exact: true }).click();
	for (const digit of [1, 2, 3, 4])
		await page.getByRole('button', { name: `PIN ${digit}`, exact: true }).click();
	await page.getByRole('button', { name: 'Ontgrendel', exact: true }).click();
	await page.getByRole('button', { name: 'Bediening beheren', exact: true }).click();
	await editor.getByText('Configuratie lezen…').waitFor({ state: 'hidden' });
	await editor.getByRole('button', { name: 'Vorige opslag herstellen', exact: true }).click();
	await editor.getByLabel('Configuratie-PIN', { exact: true }).fill('1234');
	await editor.getByRole('button', { name: 'Bevestigen', exact: true }).click();
	await editor.getByText('Vorige configuratie hersteld.', { exact: true }).waitFor();
	assert.equal(actions.length, 4);
	for (const size of [
		{ width: 980, height: 800 },
		{ width: 390, height: 844 }
	]) {
		await page.setViewportSize(size);
		await editor.getByRole('button', { name: 'Wijzigingen opslaan', exact: true }).waitFor();
		assert.ok(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
		const footer = await editor.locator('.editor-actions').boundingBox();
		assert.ok(footer.y >= 0 && footer.y + footer.height <= size.height);
		const row = editor.locator('tr[data-control-id="push-1"]');
		await row
			.getByRole('textbox', { name: 'Label 1ste etage', exact: true })
			.fill('Responsive concept');
		await row.getByRole('textbox', { name: 'Label 1ste etage', exact: true }).fill('1ste etage');
	}
	assert.equal(actions.length, 4);
	assert.deepEqual(errors, []);
	assert.deepEqual(external, []);
	console.log(
		'UI passed: tabs, numbering, mock on/off, confirmation, first-touch wake, timer confirmation and persistence after closing/reopening, advanced information, responsive inline editor/save/restore, debug version/commit popup, column numbers, blue navigation, popup placement, zero external browser calls.'
	);
} catch (error) {
	console.error(log.slice(-4000));
	throw error;
} finally {
	await browser?.close();
	child.kill('SIGTERM');
	await new Promise((resolve) => child.once('exit', resolve));
	await rm(storage, { recursive: true, force: true });
}
