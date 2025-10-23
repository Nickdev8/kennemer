import fetch from 'node-fetch';
import { env } from '$env/dynamic/private';
import {
  actions,
  statusTargets,
  type ShellyHttpAction,
  type ShellyHttpTarget,
  type ShellyStatusTarget
} from '$lib/config/devices';
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
const MAX_RATE_LIMIT_RETRIES = 3;

export interface ShellyStatusResult extends ParsedStatus {
  key: string;
  label: string;
  timestamp: number;
}

function resolveActionTarget(action: ShellyHttpAction): ShellyHttpTarget {
  const useLan = (env.USE_LAN ?? '').toLowerCase() === 'true';
  if (useLan && action.lan) {
    return { ...action.cloud, ...action.lan };
  }
  return action.cloud;
}

function resolveStatusTarget(target: ShellyStatusTarget): ShellyHttpTarget {
  const useLan = (env.USE_LAN ?? '').toLowerCase() === 'true';
  if (useLan && target.lan) {
    return { ...target.cloud, ...target.lan };
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
    // keep raw text
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

export async function sendHttpAction(action: ShellyHttpAction) {
  const target = resolveActionTarget(action);
  const requiresAuth = target.requiresAuthKey ?? true;

  await withRateLimitRetry(() => executeRequest(target, requiresAuth));
}

export async function fetchShellyStatus(key: string): Promise<ShellyStatusResult> {
  const definition = statusTargets[key];
  if (!definition) {
    throw new ShellyHttpError(`Unknown status target: ${key}`, 404, 'HTTP_ERROR');
  }

  const target = resolveStatusTarget(definition);
  const requiresAuth = target.requiresAuthKey ?? true;

  const payload = await withRateLimitRetry(() =>
    executeRequest(target, requiresAuth, { expectJson: true })
  );

  const parsed = parseShellyStatus(definition.parser, payload);

  return {
    key: definition.key,
    label: definition.label,
    value: parsed.value,
    raw: parsed.raw,
    timestamp: Date.now()
  };
}

export function getStatusKeys(): string[] {
  const keys = new Set<string>();
  actions.forEach((action) => {
    if (action.statusKey) keys.add(action.statusKey);
  });
  return Array.from(keys);
}
