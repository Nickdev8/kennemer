import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import process from 'node:process';

import { handler } from './build/handler.js';
import { env } from './build/env.js';

function requestHandler(request, response) {
	if (request.url === '/healthz') {
		response.writeHead(200, {
			'cache-control': 'no-store',
			'content-type': 'text/plain; charset=utf-8'
		});
		response.end('ok\n');
		return;
	}

	handler(request, response);
}

const socketPath = env('SOCKET_PATH', undefined);
const host = env('HOST', '0.0.0.0');
const httpPort = socketPath ? undefined : Number(env('PORT', '80'));

const httpServer = http.createServer(requestHandler);

if (socketPath) {
	httpServer.listen({ path: socketPath }, () => {
		console.log(`Serving HTTP on Unix socket ${socketPath}`);
	});
} else {
	httpServer.listen({ host, port: httpPort }, () => {
		console.log(`Serving HTTP on http://${host}:${httpPort}`);
	});
}

const httpsKeyPath = process.env.HTTPS_KEY_PATH;
const httpsCertPath = process.env.HTTPS_CERT_PATH;
const httpsCaPath = process.env.HTTPS_CA_PATH;
const httpsPassphrase = process.env.HTTPS_PASSPHRASE;
const httpsPort = Number(process.env.HTTPS_PORT ?? '443');
const httpsHost = process.env.HTTPS_HOST ?? host;

if (httpsKeyPath && httpsCertPath) {
	try {
		const httpsOptions = {
			key: fs.readFileSync(httpsKeyPath),
			cert: fs.readFileSync(httpsCertPath)
		};

		if (httpsCaPath) {
			httpsOptions.ca = fs.readFileSync(httpsCaPath);
		}

		if (httpsPassphrase) {
			httpsOptions.passphrase = httpsPassphrase;
		}

		const httpsServer = https.createServer(httpsOptions, requestHandler);
		httpsServer.listen({ host: httpsHost, port: httpsPort }, () => {
			console.log(`Serving HTTPS on https://${httpsHost}:${httpsPort}`);
		});
	} catch (error) {
		console.error('Failed to start HTTPS server:', error);
		process.exit(1);
	}
} else if (httpsKeyPath || httpsCertPath) {
	console.warn(
		'HTTPS not started: both HTTPS_KEY_PATH and HTTPS_CERT_PATH must be provided to enable TLS.'
	);
} else {
	console.log('HTTPS disabled; set HTTPS_KEY_PATH and HTTPS_CERT_PATH to enable TLS.');
}
