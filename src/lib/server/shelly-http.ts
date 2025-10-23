import fetch from 'node-fetch';
import { env } from '$env/dynamic/private';
import type { ShellyHttpAction } from '$lib/config/devices';

const REQUEST_TIMEOUT_MS = 4000;
const AUTH_KEY = env.SHELLY_AUTH_KEY ?? '';

export async function sendHttpAction(action: ShellyHttpAction) {
  if (!AUTH_KEY) throw new Error('Missing SHELLY_AUTH_KEY');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = new URLSearchParams({
      auth_key: AUTH_KEY,
      ...(action.payload ?? {})
    });

    const res = await fetch(action.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shelly HTTP error ${res.status}: ${text}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
