import type { ShellyStatusParser } from '$lib/config/schema';

export interface ParsedStatus {
  value: string;
  raw: unknown;
}

const UNKNOWN_STATUS: ParsedStatus = {
  value: 'Onbekend',
  raw: null
};

export function parseShellyStatus(
  parser: ShellyStatusParser,
  payload: unknown
): ParsedStatus {
  if (parser === 'relay') {
    return parseRelayStatus(payload);
  }

  return { ...UNKNOWN_STATUS, raw: payload };
}

function parseRelayStatus(payload: unknown): ParsedStatus {
  if (!payload || typeof payload !== 'object') {
    return { ...UNKNOWN_STATUS, raw: payload };
  }

  const body = payload as any;

  if (body.isok === false) {
    return { value: 'Niet beschikbaar', raw: payload };
  }

  const data = body.data && typeof body.data === 'object' ? body.data : body;

  if (typeof data.online === 'boolean' && data.online === false) {
    return { value: 'Offline', raw: payload };
  }

  const statusSources: unknown[] = [];

  if (data.device_status && typeof data.device_status === 'object') {
    statusSources.push(data.device_status);
  }

  statusSources.push(data);

  for (const source of statusSources) {
    if (!source || typeof source !== 'object') continue;

    const candidate =
      (source as any)['switch:0'] ??
      (source as any)['relay:0'] ??
      (source as any)['switch0'] ??
      (source as any)['relay0'] ??
      (Array.isArray((source as any).relays) ? (source as any).relays[0] : undefined);

    const parsed = parseRelayOutput(candidate);
    if (parsed) {
      return { value: parsed, raw: payload };
    }
  }

  const directParsed = parseRelayOutput(data);
  if (directParsed) {
    return { value: directParsed, raw: payload };
  }

  return { ...UNKNOWN_STATUS, raw: payload };
}

function parseRelayOutput(source: unknown): string | null {
  if (!source || typeof source !== 'object') return null;
  const relay = source as Record<string, unknown>;

  if (typeof relay.output === 'boolean') {
    return relay.output ? 'Aan' : 'Uit';
  }

  if (typeof relay.ison === 'boolean') {
    return relay.ison ? 'Aan' : 'Uit';
  }

  if (typeof relay.state === 'boolean') {
    return relay.state ? 'Aan' : 'Uit';
  }

  return null;
}
