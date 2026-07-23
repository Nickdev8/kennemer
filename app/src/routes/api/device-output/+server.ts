import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

import type { RequestHandler } from './$types';
import { fetchShellyJson } from '$lib/server/shelly-http';
import { fetchSwitchStatus } from '$lib/server/shelly-rpc';
import { updateDeviceStateIfNewer } from '$lib/server/device-state-store';
import { publishDeviceState } from '$lib/server/device-state-events';
import type { DeviceCommandKey } from '$lib/config/schema';

const CLOUD_STATUS_ENDPOINT = 'https://shelly-115-eu.shelly.cloud/device/status';
const STATUS_REQUEST_INTERVAL_MS = 1100;
const IP_CACHE_PATH = resolvePath(process.cwd(), 'ips.json');

type CachedDevice = {
	id?: string;
	ip?: string;
	local_ip?: string;
	lan_ip?: string;
	address?: string;
	channel?: number | string;
};

type DeviceCache = {
	devices?: Record<string, CachedDevice> | CachedDevice[];
};

type OutputState = {
	lastCommand: DeviceCommandKey;
	updatedAt: number;
	source: string;
};

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function readDeviceCache(): Promise<DeviceCache | null> {
	try {
		const raw = await readFile(IP_CACHE_PATH, 'utf-8');
		const parsed = JSON.parse(raw) as DeviceCache;
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

function resolveCachedDevice(cache: DeviceCache | null, deviceId: string): CachedDevice | null {
	const devices = cache?.devices;
	if (!devices) return null;

	if (Array.isArray(devices)) {
		return devices.find((device) => device?.id === deviceId) ?? null;
	}

	return (
		devices[deviceId] ?? Object.values(devices).find((device) => device?.id === deviceId) ?? null
	);
}

function cachedIp(device: CachedDevice | null): string {
	if (!device) return '';
	for (const value of [device.ip, device.local_ip, device.lan_ip, device.address]) {
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return '';
}

function cachedChannel(device: CachedDevice | null): number {
	const parsed = Number(device?.channel ?? 0);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function parseIds(value: string | null) {
	if (!value) return [];
	return Array.from(
		new Set(
			value
				.split(',')
				.map((item) => item.trim())
				.filter((item) => /^[a-z0-9_-]+$/i.test(item))
		)
	);
}

function parseBoolean(value: unknown): boolean | null {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const normalised = value.trim().toLowerCase();
		if (!normalised) return null;
		if (['true', '1', 'on', 'yes'].includes(normalised)) return true;
		if (['false', '0', 'off', 'no'].includes(normalised)) return false;
	}
	return null;
}

function resolveStatusPayload(payload: unknown): Record<string, unknown> | null {
	if (!payload || typeof payload !== 'object') return null;
	const root = payload as Record<string, unknown>;
	const direct = root.device_status ?? root.status;
	if (direct && typeof direct === 'object') return direct as Record<string, unknown>;

	const data = root.data;
	if (data && typeof data === 'object') {
		const dataObj = data as Record<string, unknown>;
		const nested = dataObj.device_status ?? dataObj.status;
		if (nested && typeof nested === 'object') return nested as Record<string, unknown>;
		return dataObj;
	}

	return root;
}

function readOutputFromEntries(entries: unknown, keys: string[]) {
	if (!Array.isArray(entries)) return null;
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		for (const key of keys) {
			const output = parseBoolean(record[key]);
			if (output !== null) return output;
		}
	}
	return null;
}

function extractOutput(payload: unknown): boolean | null {
	const status = resolveStatusPayload(payload);
	if (!status) return null;

	const switchOutput = readOutputFromEntries(status.switch, ['output', 'on', 'ison', 'enabled']);
	if (switchOutput !== null) return switchOutput;

	const relayOutput = readOutputFromEntries(status.relays, ['ison', 'output', 'on', 'enabled']);
	if (relayOutput !== null) return relayOutput;

	const lightOutput = readOutputFromEntries(status.lights, ['ison', 'output', 'on', 'enabled']);
	if (lightOutput !== null) return lightOutput;

	for (const [key, value] of Object.entries(status)) {
		if (!value || typeof value !== 'object') continue;
		if (!/^switch:\d+$/i.test(key) && !/^relay:\d+$/i.test(key) && !/^light:\d+$/i.test(key)) {
			continue;
		}
		const record = value as Record<string, unknown>;
		const output = parseBoolean(record.output ?? record.ison ?? record.on ?? record.enabled);
		if (output !== null) return output;
	}

	return parseBoolean(status.output ?? status.ison ?? status.on ?? status.enabled);
}

async function saveOutputState(
	deviceId: string,
	output: boolean,
	source: 'status-lan' | 'status-poll'
): Promise<OutputState> {
	const command: DeviceCommandKey = output ? 'on' : 'off';
	const updatedAt = Date.now();
	const { state } = await updateDeviceStateIfNewer(deviceId, command, updatedAt, source);
	publishDeviceState({ deviceId, state });

	return {
		lastCommand: state.lastCommand,
		updatedAt: state.updatedAt,
		source: state.source
	};
}

async function fetchLocalDeviceOutput(
	deviceId: string,
	cache: DeviceCache | null
): Promise<OutputState | null> {
	const cachedDevice = resolveCachedDevice(cache, deviceId);
	const ip = cachedIp(cachedDevice);
	if (!ip) return null;

	const localStatus = await fetchSwitchStatus(ip, cachedChannel(cachedDevice));
	if (typeof localStatus?.output !== 'boolean') return null;
	return saveOutputState(deviceId, localStatus.output, 'status-lan');
}

async function fetchCloudDeviceOutput(
	deviceId: string,
	beforeCloudRequest: () => Promise<void>
): Promise<OutputState | null> {
	await beforeCloudRequest();
	const payload = await fetchShellyJson({
		endpoint: CLOUD_STATUS_ENDPOINT,
		method: 'POST',
		encoding: 'form',
		payload: { id: deviceId },
		requiresAuthKey: true
	});
	const output = extractOutput(payload);
	if (output === null) return null;
	return saveOutputState(deviceId, output, 'status-poll');
}

export const GET: RequestHandler = async ({ url }) => {
	const ids = parseIds(url.searchParams.get('ids'));
	if (ids.length === 0) {
		return jsonResponse({ ok: false, message: 'Missing ids' }, 400);
	}

	const states: Record<string, OutputState> = {};
	const errors: Record<string, string> = {};
	const cache = await readDeviceCache();
	let lastCloudRequestAt = 0;

	const beforeCloudRequest = async () => {
		const waitMs = Math.max(0, STATUS_REQUEST_INTERVAL_MS - (Date.now() - lastCloudRequestAt));
		if (waitMs > 0) await sleep(waitMs);
		lastCloudRequestAt = Date.now();
	};

	const localResults = await Promise.all(
		ids.map(async (deviceId) => {
			try {
				return {
					deviceId,
					state: await fetchLocalDeviceOutput(deviceId, cache)
				};
			} catch {
				return { deviceId, state: null };
			}
		})
	);

	const cloudFallbackIds: string[] = [];
	for (const result of localResults) {
		if (result.state) {
			states[result.deviceId] = result.state;
		} else {
			cloudFallbackIds.push(result.deviceId);
		}
	}

	for (const deviceId of cloudFallbackIds) {
		try {
			const state = await fetchCloudDeviceOutput(deviceId, beforeCloudRequest);
			if (state) {
				states[deviceId] = state;
			} else {
				errors[deviceId] = 'No output state found';
			}
		} catch (error) {
			errors[deviceId] = error instanceof Error ? error.message : 'Status request failed';
		}
	}

	return jsonResponse({ ok: true, states, errors });
};
