import type { RequestHandler } from './$types';
import { fetchDeviceStatus, getDevicesWithStatus, ShellyHttpError } from '$lib/server/shelly-http';

export const GET: RequestHandler = async ({ url }) => {
  const keysParam = url.searchParams.get('keys') ?? '';
  const keys = keysParam
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: 'No status keys supplied' }), {
      status: 400
    });
  }

  const uniqueKeys = Array.from(new Set(keys));
  const devicesWithStatus = getDevicesWithStatus();
  const lookup = new Map(devicesWithStatus.map((device) => [device.id, device]));
  const statuses: Record<
    string,
    { value: string; label: string; timestamp: number; error?: string }
  > = {};

  for (const key of uniqueKeys) {
    const device = lookup.get(key);
    if (!device) {
      statuses[key] = {
        value: 'Niet beschikbaar',
        label: key,
        timestamp: Date.now(),
        error: 'Onbekend apparaat of geen statusconfiguratie'
      };
      continue;
    }

    try {
      const result = await fetchDeviceStatus(device);
      statuses[device.id] = {
        value: result.value,
        label: result.label,
        timestamp: result.timestamp
      };
    } catch (error) {
      if (error instanceof ShellyHttpError) {
        statuses[device.id] = {
          value: 'Niet beschikbaar',
          label: device.label,
          timestamp: Date.now(),
          error: error.message
        };
        continue;
      }

      const message = error instanceof Error ? error.message : 'Onbekende fout';
      statuses[device.id] = {
        value: 'Niet beschikbaar',
        label: device.label,
        timestamp: Date.now(),
        error: message
      };
    }
  }

  return new Response(JSON.stringify({ ok: true, statuses }), {
    headers: { 'content-type': 'application/json' }
  });
};
