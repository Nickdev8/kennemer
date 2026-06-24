import type { RequestHandler } from './$types';
import { fetchShellyJson } from '$lib/server/shelly-http';
import { updateDeviceStateIfNewer } from '$lib/server/device-state-store';
import { publishDeviceState } from '$lib/server/device-state-events';
import type { DeviceCommandKey } from '$lib/config/schema';

const CLOUD_STATUS_ENDPOINT = 'https://shelly-115-eu.shelly.cloud/device/status';

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

async function fetchDeviceOutput(deviceId: string): Promise<OutputState | null> {
	const payload = await fetchShellyJson({
		endpoint: CLOUD_STATUS_ENDPOINT,
		method: 'POST',
		encoding: 'form',
		payload: { id: deviceId },
		requiresAuthKey: true
	});
	const output = extractOutput(payload);
	if (output === null) return null;

	const command: DeviceCommandKey = output ? 'on' : 'off';
	const updatedAt = Date.now();
	const { state } = await updateDeviceStateIfNewer(deviceId, command, updatedAt, 'status-poll');
	publishDeviceState({ deviceId, state });

	return {
		lastCommand: state.lastCommand,
		updatedAt: state.updatedAt,
		source: state.source
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const ids = parseIds(url.searchParams.get('ids'));
	if (ids.length === 0) {
		return jsonResponse({ ok: false, message: 'Missing ids' }, 400);
	}

	const states: Record<string, OutputState> = {};
	const errors: Record<string, string> = {};

	await Promise.all(
		ids.map(async (deviceId) => {
			try {
				const state = await fetchDeviceOutput(deviceId);
				if (state) {
					states[deviceId] = state;
				} else {
					errors[deviceId] = 'No output state found';
				}
			} catch (error) {
				errors[deviceId] = error instanceof Error ? error.message : 'Status request failed';
			}
		})
	);

	return jsonResponse({ ok: true, states, errors });
};
