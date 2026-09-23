import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

import type { RequestHandler } from './$types';
import { fetchShellyJson } from '$lib/server/shelly-http';
import { fetchShellyStatus } from '$lib/server/shelly-rpc';
import { readEffectiveControls } from '$lib/server/scene-config-store';
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

function splitStatusDeviceId(deviceId: string) {
	const match = /^([a-f0-9]{12})(?:_(\d+))?$/i.exec(deviceId);
	if (!match) return { baseDeviceId: deviceId, channel: 0 };
	const channel = Number(match[2] ?? 0);
	return {
		baseDeviceId: match[1].toLowerCase(),
		channel: Number.isInteger(channel) && channel >= 0 ? channel : 0
	};
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

function readOutputFromRecord(entry: unknown, keys: string[]) {
	if (!entry || typeof entry !== 'object') return null;
	const record = entry as Record<string, unknown>;
	for (const key of keys) {
		const output = parseBoolean(record[key]);
		if (output !== null) return output;
	}
	return null;
}

function readOutputFromEntries(entries: unknown, keys: string[], channel: number) {
	if (!Array.isArray(entries)) return null;

	const matchingEntry = entries.find((entry) => {
		if (!entry || typeof entry !== 'object') return false;
		const record = entry as Record<string, unknown>;
		for (const value of [record.id, record.channel, record.index]) {
			if (Number(value) === channel) return true;
		}
		return false;
	});
	const matchingOutput = readOutputFromRecord(matchingEntry, keys);
	if (matchingOutput !== null) return matchingOutput;

	const indexedOutput = readOutputFromRecord(entries[channel], keys);
	if (indexedOutput !== null) return indexedOutput;

	if (channel === 0) {
		for (const entry of entries) {
			const output = readOutputFromRecord(entry, keys);
			if (output !== null) return output;
		}
	}

	return null;
}

function extractOutput(payload: unknown, channel: number): boolean | null {
	const status = resolveStatusPayload(payload);
	if (!status) return null;

	const switchOutput = readOutputFromEntries(
		status.switch,
		['output', 'on', 'ison', 'enabled'],
		channel
	);
	if (switchOutput !== null) return switchOutput;

	const relayOutput = readOutputFromEntries(
		status.relays,
		['ison', 'output', 'on', 'enabled'],
		channel
	);
	if (relayOutput !== null) return relayOutput;

	const lightOutput = readOutputFromEntries(
		status.lights,
		['ison', 'output', 'on', 'enabled'],
		channel
	);
	if (lightOutput !== null) return lightOutput;

	for (const component of ['switch', 'relay', 'light']) {
		const output = readOutputFromRecord(status[`${component}:${channel}`], [
			'output',
			'ison',
			'on',
			'enabled'
		]);
		if (output !== null) return output;
	}

	return channel === 0
		? parseBoolean(status.output ?? status.ison ?? status.on ?? status.enabled)
		: null;
}

async function saveOutputState(
	deviceId: string,
	output: boolean,
	source: 'status-lan' | 'status-poll',
	logicalDeviceIds: string[] = []
): Promise<OutputState> {
	const command: DeviceCommandKey = output ? 'on' : 'off';
	const updatedAt = Date.now();
	const { state } = await updateDeviceStateIfNewer(deviceId, command, updatedAt, source);
	publishDeviceState({ deviceId, state });

	for (const logicalDeviceId of logicalDeviceIds) {
		if (logicalDeviceId === deviceId) continue;
		const logicalResult = await updateDeviceStateIfNewer(
			logicalDeviceId,
			command,
			updatedAt,
			source
		);
		publishDeviceState({ deviceId: logicalDeviceId, state: logicalResult.state });
	}

	return {
		lastCommand: state.lastCommand,
		updatedAt: state.updatedAt,
		source: state.source
	};
}

async function fetchLocalDeviceOutputs(
	deviceIds: string[],
	cache: DeviceCache | null,
	logicalDeviceIdsByStatusId: Map<string, string[]>
): Promise<Array<{ deviceId: string; state: OutputState | null }>> {
	const deviceIdsByBaseId = new Map<string, string[]>();
	for (const deviceId of deviceIds) {
		const { baseDeviceId } = splitStatusDeviceId(deviceId);
		const groupedIds = deviceIdsByBaseId.get(baseDeviceId) ?? [];
		groupedIds.push(deviceId);
		deviceIdsByBaseId.set(baseDeviceId, groupedIds);
	}

	const groupedResults = await Promise.all(
		Array.from(deviceIdsByBaseId.entries()).map(async ([baseDeviceId, groupedIds]) => {
			const cachedDevice = resolveCachedDevice(cache, baseDeviceId);
			const ip = cachedIp(cachedDevice);
			if (!ip) {
				return groupedIds.map((deviceId) => ({ deviceId, state: null }));
			}

			const localStatus = await fetchShellyStatus(ip);
			return Promise.all(
				groupedIds.map(async (deviceId) => {
					const { channel } = splitStatusDeviceId(deviceId);
					const output = extractOutput(localStatus, channel);
					return {
						deviceId,
						state:
							output === null
								? null
								: await saveOutputState(
										deviceId,
										output,
										'status-lan',
										logicalDeviceIdsByStatusId.get(deviceId) ?? []
									)
					};
				})
			);
		})
	);

	return groupedResults.flat();
}

async function fetchCloudDeviceOutput(
	deviceId: string,
	beforeCloudRequest: () => Promise<void>,
	logicalDeviceIdsByStatusId: Map<string, string[]>
): Promise<OutputState | null> {
	const { baseDeviceId, channel } = splitStatusDeviceId(deviceId);
	await beforeCloudRequest();
	const payload = await fetchShellyJson({
		endpoint: CLOUD_STATUS_ENDPOINT,
		method: 'POST',
		encoding: 'form',
		payload: { id: baseDeviceId },
		requiresAuthKey: true
	});
	const output = extractOutput(payload, channel);
	if (output === null) return null;
	return saveOutputState(
		deviceId,
		output,
		'status-poll',
		logicalDeviceIdsByStatusId.get(deviceId) ?? []
	);
}

export const GET: RequestHandler = async ({ url }) => {
	const ids = parseIds(url.searchParams.get('ids'));
	if (ids.length === 0) {
		return jsonResponse({ ok: false, message: 'Missing ids' }, 400);
	}

	const states: Record<string, OutputState> = {};
	const errors: Record<string, string> = {};
	const logicalDeviceIdsByStatusId = new Map<string, string[]>();
	for (const control of await readEffectiveControls()) {
		if (control.controlType !== 'device') continue;
		const statusDeviceId = control.statusdeviceid?.trim();
		if (!statusDeviceId) continue;
		const owners = logicalDeviceIdsByStatusId.get(statusDeviceId) ?? [];
		owners.push(control.id);
		logicalDeviceIdsByStatusId.set(statusDeviceId, owners);
	}
	const cache = await readDeviceCache();
	let lastCloudRequestAt = 0;

	const beforeCloudRequest = async () => {
		const waitMs = Math.max(0, STATUS_REQUEST_INTERVAL_MS - (Date.now() - lastCloudRequestAt));
		if (waitMs > 0) await sleep(waitMs);
		lastCloudRequestAt = Date.now();
	};

	const localResults = await fetchLocalDeviceOutputs(ids, cache, logicalDeviceIdsByStatusId).catch(() =>
		ids.map((deviceId) => ({ deviceId, state: null }))
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
			const state = await fetchCloudDeviceOutput(
				deviceId,
				beforeCloudRequest,
				logicalDeviceIdsByStatusId
			);
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
