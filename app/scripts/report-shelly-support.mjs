import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createModuleLoader } from './module-loader.mjs';
const args = process.argv.slice(2),
	live = args.includes('--live');
const fixtureAt = args.indexOf('--fixture'),
	outputAt = args.indexOf('--output');
const fixture = fixtureAt >= 0 ? args[fixtureAt + 1] : null,
	output = outputAt >= 0 ? args[outputAt + 1] : null;
if (
	(!live && !fixture) ||
	(live && fixture) ||
	args.some(
		(arg, index) =>
			!['--live', '--fixture', '--output'].includes(arg) &&
			index !== fixtureAt + 1 &&
			index !== outputAt + 1
	)
) {
	console.log(
		'Read-only report: npm run report:shelly-support -- --fixture FILE [--output FILE]\nExplicit live reads: npm run report:shelly-support -- --live [--output FILE]\nNo scene/device/settings commands are available.'
	);
	process.exit(live || fixture ? 2 : 0);
}
const originalFetch = globalThis.fetch;
if (!live)
	globalThis.fetch = () => {
		throw new Error('Offline report blocks external requests');
	};
let loader;
try {
	loader = await createModuleLoader();
	const { buildShellySupportReport } = await loader.ssrLoadModule(
		'/src/lib/server/shelly-support-report.ts'
	);
	let inventory,
		statuses,
		stale = false,
		failure;
	if (fixture) {
		const input = JSON.parse(await readFile(resolve(fixture), 'utf8'));
		inventory = input.inventory;
		statuses = input.statuses;
	} else {
		const { loadEnv } = await import('vite'),
			env = {
				...loadEnv('development', fileURLToPath(new URL('..', import.meta.url)), ''),
				...process.env
			};
		const { createShellyCloudCache } = await loader.ssrLoadModule(
			'/src/lib/server/shelly-cloud-cache.ts'
		);
		const client = createShellyCloudCache({
			authKey: () => env.SHELLY_AUTH_KEY ?? '',
			fetch: (input, init) => {
				const url = new URL(input);
				if (
					url.origin !== 'https://shelly-115-eu.shelly.cloud' ||
					!['/interface/device/get_all_lists', '/device/all_status'].includes(url.pathname) ||
					(init?.method ?? 'GET') !== 'GET'
				)
					throw new Error('Report only permits inventory/status reads');
				return originalFetch(input, init);
			}
		});
		const metadata = await client.read('inventory'),
			state = await client.read('statuses');
		inventory = metadata.value;
		statuses = state.value;
		stale = metadata.stale || state.stale;
		failure = metadata.failure ?? state.failure;
	}
	const report = {
		generatedAt: new Date().toISOString(),
		mode: live ? 'live-read-only' : 'fixture',
		stale,
		...(failure ? { failure } : {}),
		...buildShellySupportReport(inventory ?? {}, statuses ?? {})
	};
	const text = JSON.stringify(report, null, 2) + '\n';
	if (output) {
		await writeFile(resolve(output), text, { mode: 0o600 });
		console.log(`Read-only report written to ${resolve(output)}`);
	} else console.log(text);
} catch {
	console.error('Read-only report unavailable. Credentials and raw responses are never printed.');
	process.exitCode = 1;
} finally {
	globalThis.fetch = originalFetch;
	await loader?.close();
}
