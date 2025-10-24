import { env } from '$env/dynamic/private';
import { devices } from '$lib/config/devices';
import { advancedDevices } from '$lib/config/advanced-devices';
import type {
	DeviceCommandKey,
	ShellyDevice,
	ShellyDeviceCommand,
	ShellyDeviceStatus,
	ShellyHttpTarget,
	ShellyTargetConfig
} from '$lib/config/schema';
import { parseShellyStatus, type ParsedStatus } from '$lib/status/parsers';

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
const RATE_LIMIT_DELAY_MS = 500;
const MAX_RATE_LIMIT_RETRIES = (() => {
	const raw = env.SHELLY_MAX_API_CALLS ?? env.SHELLY_MAX_RATE_LIMIT_RETRIES ?? '';
	const parsed = Number.parseInt(raw, 10);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : 3;
})();

const STATUS_CACHE_TTL_MS = (() => {
	const raw = env.SHELLY_STATUS_CACHE_TTL_MS ?? env.SHELLY_API_CACHE_TTL_MS ?? '';
	const parsed = Number.parseInt(raw, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
})();

export interface ShellyStatusResult extends ParsedStatus {
  deviceId: string;
  label: string;
  timestamp: number;
}

const simulateDevices = (() => {
	const flag = (env.SHELLY_SIMULATE_DEVICES ?? '').toLowerCase();
	return ['true', '1', 'yes'].includes(flag);
})();

type SimulatedDeviceState = {
	state: 'on' | 'off';
	lastChangedAt: number;
};

const simulatedStates = new Map<string, SimulatedDeviceState>();

const allDevices: ShellyDevice[] = [...devices, ...advancedDevices];

type StatusCacheEntry = {
	result: ShellyStatusResult;
	expiresAt: number;
};

const statusCache = new Map<string, StatusCacheEntry>();

function getOrCreateSimulatedState(device: ShellyDevice): SimulatedDeviceState {
	const existing = simulatedStates.get(device.id);
	if (existing) {
		return existing;
	}

	const initial = {
		state: 'off' as const,
		lastChangedAt: Date.now()
	};
	simulatedStates.set(device.id, initial);
	return initial;
}

function setSimulatedState(device: ShellyDevice, state: 'on' | 'off') {
	const next: SimulatedDeviceState = {
		state,
		lastChangedAt: Date.now()
	};
	simulatedStates.set(device.id, next);
	invalidateStatusCache(device.id);
	return next;
}

function toSimulatedStatusResult(
	device: ShellyDevice,
	state: 'on' | 'off',
	lastChangedAt: number
): ShellyStatusResult {
	const value = state === 'on' ? 'Aan' : 'Uit';
	return {
		deviceId: device.id,
		label: device.label,
		value,
		raw: {
			simulated: true,
			state,
			value,
			lastChangedAt
		},
		timestamp: Date.now()
	};
}

function getCachedStatus(deviceId: string): ShellyStatusResult | null {
	if (STATUS_CACHE_TTL_MS <= 0) return null;
	const cached = statusCache.get(deviceId);
	if (!cached) return null;
	if (Date.now() > cached.expiresAt) {
		statusCache.delete(deviceId);
		return null;
	}
	return cached.result;
}

function setCachedStatus(deviceId: string, result: ShellyStatusResult) {
	if (STATUS_CACHE_TTL_MS <= 0) return;
	statusCache.set(deviceId, {
		result,
		expiresAt: Date.now() + STATUS_CACHE_TTL_MS
	});
}

function invalidateStatusCache(deviceId: string) {
	if (statusCache.size === 0) return;
	statusCache.delete(deviceId);
}

function toTargetArray(config?: ShellyTargetConfig): ShellyHttpTarget[] {
	if (!config) return [];
	return Array.isArray(config) ? config : [config];
}

function resolveCommandTargets(command: ShellyDeviceCommand): ShellyHttpTarget[] {
	const useLan = (env.USE_LAN ?? '').toLowerCase() === 'true';
	const lanTargets = useLan ? toTargetArray(command.lan) : [];
	const selected = lanTargets.length > 0 ? lanTargets : toTargetArray(command.cloud);

	if (selected.length === 0) {
		throw new ShellyHttpError('No targets configured for command', 500, 'HTTP_ERROR');
	}

	return selected;
}

function resolveStatusTarget(target: ShellyDeviceStatus): ShellyHttpTarget {
	const useLan = (env.USE_LAN ?? '').toLowerCase() === 'true';
	if (useLan && target.lan) {
		return target.lan;
	}
	return target.cloud;
}

type ExecuteOptions = {
  expectJson?: boolean;
};

function buildRequestInit(
  target: ShellyHttpTarget,
  requiresAuth: boolean,
  authKey: string
) {
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
  } else {
    if (encoding === 'json') {
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
        throw new ShellyHttpError('Invalid JSON response from Shelly', response.status, 'HTTP_ERROR', text);
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
		const state = commandKey === 'on' ? 'on' : 'off';
		const nextState = setSimulatedState(device, state);
		const simulated = toSimulatedStatusResult(device, nextState.state, nextState.lastChangedAt);
		setCachedStatus(device.id, simulated);
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

	invalidateStatusCache(device.id);
}

export async function fetchDeviceStatus(device: ShellyDevice): Promise<ShellyStatusResult> {
	if (simulateDevices) {
		if (!device.status) {
			throw new ShellyHttpError(
				`Device ${device.id} has no status configuration`,
				400,
				'HTTP_ERROR'
			);
		}

		const { state, lastChangedAt } = getOrCreateSimulatedState(device);
		const simulated = toSimulatedStatusResult(device, state, lastChangedAt);
		setCachedStatus(device.id, simulated);
		return simulated;
	}

	const cached = getCachedStatus(device.id);
	if (cached) {
		return cached;
	}

  if (!device.status) {
    throw new ShellyHttpError(`Device ${device.id} has no status configuration`, 400, 'HTTP_ERROR');
  }

  const target = resolveStatusTarget(device.status);
  const requiresAuth = target.requiresAuthKey ?? true;

  const payload = await withRateLimitRetry(() =>
    executeRequest(target, requiresAuth, { expectJson: true })
  );

  const parsed = parseShellyStatus(device.status.parser, payload);

  const result: ShellyStatusResult = {
    deviceId: device.id,
    label: device.label,
    value: parsed.value,
    raw: parsed.raw,
    timestamp: Date.now()
  };

  setCachedStatus(device.id, result);
  return result;
}

export function getDevicesWithStatus(): ShellyDevice[] {
  return allDevices.filter((device) => Boolean(device.status));
}

export function getStatusDeviceIds(): string[] {
  return getDevicesWithStatus().map((device) => device.id);
}
