import fetch from 'node-fetch';
import { env } from '$env/dynamic/private';
import type { ShellyHttpAction, ShellyHttpTarget } from '$lib/config/devices';

type ShellyErrorCode = 'RATE_LIMIT' | 'HTTP_ERROR';

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

function resolveTarget(action: ShellyHttpAction): ShellyHttpTarget {
  const useLan = (env.USE_LAN ?? '').toLowerCase() === 'true';
  if (useLan && action.lan) {
    return { ...action.cloud, ...action.lan };
  }
  return action.cloud;
}

export async function sendHttpAction(action: ShellyHttpAction) {
  const target = resolveTarget(action);
  const authKey = env.SHELLY_AUTH_KEY ?? '';
  const requiresAuth = target.requiresAuthKey ?? true;

  if (requiresAuth && !authKey) {
    throw new ShellyHttpError('Missing SHELLY_AUTH_KEY', 500, 'HTTP_ERROR');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const method = target.method ?? 'POST';
    const encoding = target.encoding ?? 'form';
    const basePayload = target.payload ? { ...target.payload } : {};
    const payload = requiresAuth ? { auth_key: authKey, ...basePayload } : basePayload;

    let body: string | undefined;
    if (method !== 'GET') {
      if (encoding === 'form') {
        const params = new URLSearchParams();
        Object.entries(payload).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          params.append(key, String(value));
        });
        body = params.toString();
      } else {
        body = JSON.stringify(payload);
      }
    }

    const defaultHeaders =
      encoding === 'form'
        ? { 'content-type': 'application/x-www-form-urlencoded' }
        : { 'content-type': 'application/json' };
    const headers = { ...defaultHeaders, ...(target.headers ?? {}) };

    const res = await fetch(target.endpoint, {
      method,
      headers,
      body,
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        // keep raw text
      }

      let code: ShellyErrorCode = 'HTTP_ERROR';
      let message = `Shelly HTTP error ${res.status}`;

      if (payload && typeof payload === 'object') {
        const maybeErrors = (payload as { errors?: Record<string, string> }).errors;
        if (maybeErrors && typeof maybeErrors.max_req === 'string') {
          code = 'RATE_LIMIT';
          message = 'Shelly request limit reached';
        }
      }

      if (code === 'HTTP_ERROR') {
        message = `${message}: ${text}`;
      }

      throw new ShellyHttpError(message, res.status, code, payload);
    }
  } finally {
    clearTimeout(timeout);
  }
}







