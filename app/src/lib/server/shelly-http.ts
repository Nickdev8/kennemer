import { env } from '$env/dynamic/private';
import type {
	DeviceCommandKey,
	ShellyDevice,
	ShellyDeviceCommand,
	ShellyHttpTarget,
	ShellyTargetConfig
} from '$lib/config/schema';

export type ShellyErrorCode = 'RATE_LIMIT' | 'HTTP_ERROR';

export class ShellyHttpError extends Error {
	constructor(
		message: string,
		public status: number,
		public code: ShellyErrorCode,
		public payload?: unknown
	) {
		super(message);
		this.name = 'ShellyHttpError';
	}
}

const REQUEST_TIMEOUT_MS = 4000;
const RATE_LIMIT_DELAY_MS = 2000;
const MAX_RATE_LIMIT_RETRIES = (() => {
	const raw = env.SHELLY_MAX_API_CALLS ?? env.SHELLY_MAX_RATE_LIMIT_RETRIES ?? '';
	const parsed = Number.parseInt(raw, 10);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : 3;
})();

const TRUTHY_FLAGS = new Set(['true', '1', 'yes', 'on']);

function readBooleanFlag(...keys: string[]): boolean {
	for (const key of keys) {
		const raw = (env[key] ?? '').toLowerCase();
		if (!raw) continue;
		if (TRUTHY_FLAGS.has(raw)) return true;
		if (['false', '0', 'no', 'off'].includes(raw)) return false;
	}
	return false;
}

const simulateDevices = readBooleanFlag('SHELLY_SIMULATE_DEVICES');

function toTargetArray(config?: ShellyTargetConfig): ShellyHttpTarget[] {
	if (!config) return [];
	return Array.isArray(config) ? config : [config];
}

function resolveCommandTargets(command: ShellyDeviceCommand): ShellyHttpTarget[] {
	const preferLan = readBooleanFlag('USE_LAN', 'USE_LOCAL');
	const lanTargets = toTargetArray(command.lan);
	const cloudTargets = toTargetArray(command.cloud);

	const preferred = preferLan ? lanTargets : cloudTargets;
	const fallback = preferLan ? cloudTargets : lanTargets;

	const selected = preferred.length > 0 ? preferred : fallback;

	if (selected.length === 0) {
		throw new ShellyHttpError('No targets configured for command', 500, 'HTTP_ERROR');
	}

	return selected;
}

type ExecuteOptions = {
	expectJson?: boolean;
};

function buildRequestInit(target: ShellyHttpTarget, requiresAuth: boolean, authKey: string) {
	const method = target.method ?? 'POST';
	const encoding = target.encoding ?? 'form';
	const basePayload = target.payload ? { ...target.payload } : {};
	const payload = requiresAuth ? { auth_key: authKey, ...basePayload } : basePayload;

	const headers: Record<string, string> = { ...(target.headers ?? {}) };
	let url = target.endpoint;
	let body: string | undefined;

	if (method.toUpperCase() === 'GET') {
		const params = new URLSearchParams();
		Object.entries(payload).forEach(([key, value]) => {
			if (value === undefined || value === null) return;
			params.append(key, String(value));
		});
		const query = params.toString();
		if (query) {
			url += url.includes('?') ? `&${query}` : `?${query}`;
		}
	} else if (encoding === 'json') {
		body = JSON.stringify(payload);
		if (!headers['content-type']) {
			headers['content-type'] = 'application/json';
		}
	} else {
		const params = new URLSearchParams();
		Object.entries(payload).forEach(([key, value]) => {
			if (value === undefined || value === null) return;
			params.append(key, String(value));
		});
		body = params.toString();
		if (!headers['content-type']) {
			headers['content-type'] = 'application/x-www-form-urlencoded';
		}
	}

	return {
		url,
		init: {
			method,
			headers,
			body
		} as RequestInit
	};
}

async function executeRequest(
	target: ShellyHttpTarget,
	requiresAuth: boolean,
	options: ExecuteOptions = {}
): Promise<unknown> {
	const authKey = env.SHELLY_AUTH_KEY ?? '';

	if (requiresAuth && !authKey) {
		throw new ShellyHttpError('Missing SHELLY_AUTH_KEY', 500, 'HTTP_ERROR');
	}

	const { url, init } = buildRequestInit(target, requiresAuth, authKey);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(url, { ...init, signal: controller.signal });
		const text = await response.text();

		if (!response.ok) {
			throw buildShellyError(response.status, text);
		}

		if (options.expectJson) {
			if (!text) {
				return null;
			}
			try {
				return JSON.parse(text);
			} catch {
				throw new ShellyHttpError(
					'Invalid JSON response from Shelly',
					response.status,
					'HTTP_ERROR',
					text
				);
			}
		}

		return undefined;
	} catch (error) {
		if (error instanceof ShellyHttpError) {
			throw error;
		}

		if ((error as Error).name === 'AbortError') {
			throw new ShellyHttpError('Shelly request timed out', 504, 'HTTP_ERROR');
		}

		throw new ShellyHttpError(
			'Shelly request failed',
			500,
			'HTTP_ERROR',
			error instanceof Error ? error.message : String(error)
		);
	} finally {
		clearTimeout(timeout);
	}
}

function buildShellyError(status: number, body: string): ShellyHttpError {
	let payload: unknown = body;
	try {
		payload = body ? JSON.parse(body) : undefined;
	} catch {
		// ignore JSON parse failures; we fall back to raw body
	}

	let code: ShellyErrorCode = 'HTTP_ERROR';
	let message = `Shelly HTTP error ${status}`;

	if (payload && typeof payload === 'object') {
		const maybeErrors = (payload as { errors?: Record<string, string> }).errors;
		if (maybeErrors && typeof maybeErrors.max_req === 'string') {
			code = 'RATE_LIMIT';
			message = 'Shelly request limit reached';
		}
	}

	if (code === 'HTTP_ERROR' && body) {
		message = `${message}: ${body}`;
	}

	return new ShellyHttpError(message, status, code, payload);
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
	let attempt = 0;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		try {
			return await fn();
		} catch (error) {
			if (
				error instanceof ShellyHttpError &&
				error.code === 'RATE_LIMIT' &&
				attempt < MAX_RATE_LIMIT_RETRIES
			) {
				attempt += 1;
				await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
				continue;
			}
			throw error;
		}
	}
}

export async function sendDeviceCommand(device: ShellyDevice, commandKey: DeviceCommandKey) {
	if (simulateDevices) {
		return;
	}

	const command = device.commands[commandKey];

	if (!command) {
		throw new ShellyHttpError(
			`Unknown command ${commandKey} for device ${device.id}`,
			400,
			'HTTP_ERROR'
		);
	}

	const targets = resolveCommandTargets(command);

	for (const target of targets) {
		const requiresAuth = target.requiresAuthKey ?? true;
		await withRateLimitRetry(() => executeRequest(target, requiresAuth));
	}
}

export async function fetchShellyJson(
	target: ShellyHttpTarget,
	options: { requiresAuth?: boolean } = {}
): Promise<unknown> {
	if (simulateDevices) {
		return {
			simulated: true,
			source: target.endpoint,
			timestamp: Date.now(),
			apower: Math.round(Math.random() * 500)
		};
	}

	const requiresAuth = options.requiresAuth ?? target.requiresAuthKey ?? true;
	return withRateLimitRetry(() => executeRequest(target, requiresAuth, { expectJson: true }));
}
