import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DeviceCommandKey } from '$lib/config/schema';

const DEVICE_STATE_PATH = resolve(process.cwd(), 'device-states.json');

export type StoredDeviceState = {
	lastCommand: DeviceCommandKey;
	updatedAt: number;
};

type DeviceStateMap = Record<string, StoredDeviceState>;

export async function readDeviceStates(): Promise<DeviceStateMap> {
	try {
		const raw = await readFile(DEVICE_STATE_PATH, 'utf-8');
		if (!raw) return {};
		const parsed = JSON.parse(raw) as DeviceStateMap;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

export async function writeDeviceStates(states: DeviceStateMap): Promise<void> {
	await writeFile(DEVICE_STATE_PATH, JSON.stringify(states, null, 2), 'utf-8');
}

export async function updateDeviceState(
	deviceId: string,
	command: DeviceCommandKey
): Promise<StoredDeviceState> {
	const current = await readDeviceStates();
	current[deviceId] = { lastCommand: command, updatedAt: Date.now() };
	await writeDeviceStates(current);
	return current[deviceId];
}

export async function updateDeviceStateIfNewer(
	deviceId: string,
	command: DeviceCommandKey,
	reportedAt?: number
) {
	const current = await readDeviceStates();
	const nextTimestamp = Number.isFinite(reportedAt) ? Number(reportedAt) : Date.now();
	const existing = current[deviceId];

	if (existing && typeof existing.updatedAt === 'number' && existing.updatedAt > nextTimestamp) {
		return { updated: false, state: existing };
	}

	current[deviceId] = { lastCommand: command, updatedAt: nextTimestamp };
	await writeDeviceStates(current);
	return { updated: true, state: current[deviceId] };
}
