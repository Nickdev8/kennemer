import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2] ?? 'mock';
if (!['mock', 'live'].includes(mode)) throw new Error('Use mock or live');
const loaded = loadEnv('development', root, '');
const env = { ...loaded, ...process.env };
if (
	mode === 'live' &&
	(!env.SHELLY_AUTH_KEY?.trim() ||
		/placeholder|your[_ -]|example|changeme|replace|<|>/i.test(env.SHELLY_AUTH_KEY))
) {
	throw new Error('dev:live requires a valid SHELLY_AUTH_KEY in app/.env');
}
const project = createHash('sha256').update(resolve(root)).digest('hex').slice(0, 12);
const defaultStorage = join(tmpdir(), `kennemer-${process.getuid?.() ?? 'user'}-${project}`, mode);
const storage = env.KENNEMER_DEV_STORAGE ? resolve(env.KENNEMER_DEV_STORAGE) : defaultStorage;
const forbidden = [resolve(root, '..'), '/data', '/runtime', '/opt/kennemer'];
if (forbidden.some((path) => storage === path || storage.startsWith(`${path}/`))) {
	throw new Error('Development storage must be outside repository and production storage');
}
await mkdir(storage, { recursive: true, mode: 0o700 });
Object.assign(env, {
	KENNEMER_RUNTIME_MODE: mode,
	DEVICE_STATE_PATH: join(storage, 'device-states.json'),
	SCENE_OVERRIDE_PATH: join(storage, 'scene-overrides.json'),
	IP_CACHE_PATH: join(storage, 'ips.json'),
	KENNEMER_MOCK_STATE_PATH: join(storage, 'physical-states.json'),
	SHELLY_SIMULATE_DEVICES: mode === 'mock' ? '1' : '0'
});
if (mode === 'mock')
	Object.assign(env, {
		KENNEMER_CONFIG_EDIT_PIN: '1234',
		PUBLIC_ADVANCED_PATTERN: '1234',
		PUBLIC_ADVANCED_PIN: '1234'
	});
const validation = spawnSync(process.execPath, [join(root, 'scripts/validate-config.mjs')], {
	cwd: root,
	env,
	stdio: 'inherit'
});
if (validation.status !== 0) process.exit(validation.status ?? 1);
console.log(`Kennemer ${mode} — runtime data: ${storage}`);
const child = spawn(
	process.execPath,
	[join(root, 'node_modules/vite/bin/vite.js'), 'dev', ...process.argv.slice(3)],
	{ cwd: root, env, stdio: 'inherit' }
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
	process.exitCode = code ?? 1;
});
