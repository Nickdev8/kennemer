import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// Stub only the adapter boundary: the wrapper itself starts a real HTTP socket.
test('production wrapper derives HTTP scheme before handler import and overwrites spoofed headers', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'kennemer-origin-'));
	let child;
	try {
		await mkdir(join(dir, 'build'));
		await writeFile(join(dir, 'package.json'), '{"type":"module"}');
		const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
		await writeFile(
			join(dir, 'server.js'),
			source.replace('http://${host}:${httpPort}', 'http://${host}:${httpServer.address().port}')
		);
		await writeFile(
			join(dir, 'build/env.js'),
			'export const env = (name,fallback) => process.env[name] ?? fallback;'
		);
		await writeFile(
			join(dir, 'build/handler.js'),
			`const protocolHeader=process.env.PROTOCOL_HEADER;
export function handler(req,res) {res.setHeader('content-type','application/json'); res.end(JSON.stringify({protocol:req.headers[protocolHeader]||'https',host:req.headers.host}));}`
		);
		const env = { ...process.env, HOST: '127.0.0.1', PORT: '0' };
		for (const name of [
			'ORIGIN',
			'PROTOCOL_HEADER',
			'HTTPS_KEY_PATH',
			'HTTPS_CERT_PATH',
			'SOCKET_PATH'
		])
			delete env[name];
		child = spawn(process.execPath, ['server.js'], {
			cwd: dir,
			env,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		const startup = new Promise((resolve, reject) => {
			child.stdout.on('data', (data) => {
				output += data;
				if (output.includes('Serving HTTP')) resolve();
			});
			child.on('exit', (code) => reject(new Error(`server exited ${code}: ${output}`)));
			child.stderr.on('data', (data) => {
				output += data;
			});
		});
		// PORT=0 is ephemeral; report the actual listener port for the test copy only.
		// The original production wrapper remains unchanged apart from origin handling.
		await startup;
		const origin = output.match(/Serving HTTP on (http:\/\/127\.0\.0\.1:\d+)/)[1];
		const ordinary = await fetch(origin, { headers: { origin } });
		assert.equal((await ordinary.json()).protocol, 'http');
		const spoofed = await fetch(origin, {
			headers: { origin, 'x-forwarded-proto': 'https', 'x-kennemer-socket-protocol': 'https' }
		});
		assert.equal((await spoofed.json()).protocol, 'http');
		const health = await fetch(origin + '/healthz');
		assert.equal(await health.text(), 'ok\n');
	} finally {
		child?.kill('SIGTERM');
		if (child && child.exitCode === null)
			await new Promise((resolve) => child.once('exit', resolve));
		await rm(dir, { recursive: true, force: true });
	}
});
