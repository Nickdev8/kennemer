import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import type { DeviceCommandKey } from '$lib/config/schema';

const DEVICE_STATE_PATH = resolve(
	process.cwd(),
	env.DEVICE_STATE_PATH ?? 'device-states.json'
);

export type StoredDeviceState = {
	lastCommand: DeviceCommandKey;
	updatedAt: number;
	source: string;
};

type DeviceStateMap = Record<string, StoredDeviceState>;

let cachedStates: DeviceStateMap = {};
let loadPromise: Promise<void> | null = null;
let writeWarningLogged = false;

function normalizeStates(raw: unknown): DeviceStateMap {
	if (!raw || typeof raw !== 'object') return {};
	const entries: DeviceStateMap = {};
	for (const [deviceId, value] of Object.entries(raw)) {
		if (!value || typeof value !== 'object') continue;
		const record = value as Partial<StoredDeviceState> & {
			lastCommand?: string;
			updatedAt?: number;
		};
		const lastCommand = record.lastCommand;
		if (lastCommand !== 'on' && lastCommand !== 'off') continue;
		const updatedAt = Number.isFinite(record.updatedAt)
			? Number(record.updatedAt)
			: Date.now();
		const source =
			typeof record.source === 'string' && record.source.trim()
				? record.source
				: 'unknown';
		entries[deviceId] = { lastCommand, updatedAt, source };
	}
	return entries;
}

async function loadDeviceStates(): Promise<void> {
	if (loadPromise) {
		await loadPromise;
		return;
	}
	loadPromise = (async () => {
		try {
			const raw = await readFile(DEVICE_STATE_PATH, 'utf-8');
			cachedStates = normalizeStates(JSON.parse(raw));
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT') {
				cachedStates = {};
			}
		}
	})();
	await loadPromise;
}

void loadDeviceStates();

function shouldUpdateState(existing: StoredDeviceState | undefined, nextTimestamp: number) {
	return !(
		existing &&
		typeof existing.updatedAt === 'number' &&
		existing.updatedAt > nextTimestamp
	);
}

export async function readDeviceStates(): Promise<DeviceStateMap> {
	await loadDeviceStates();
	return cachedStates;
}

async function persistDeviceStates(states: DeviceStateMap): Promise<void> {
	try {
		await mkdir(dirname(DEVICE_STATE_PATH), { recursive: true });
		const tempPath = `${DEVICE_STATE_PATH}.tmp-${Date.now()}-${Math.random()
			.toString(16)
			.slice(2)}`;
		await writeFile(tempPath, JSON.stringify(states, null, 2), 'utf-8');
		await rename(tempPath, DEVICE_STATE_PATH);
	} catch (error) {
		if (!writeWarningLogged) {
			writeWarningLogged = true;
			console.warn('[device-state] Failed to persist device states', error);
		}
	}
}

export async function writeDeviceStates(states: DeviceStateMap): Promise<void> {
	cachedStates = states;
	await persistDeviceStates(states);
}

export async function updateDeviceState(
	deviceId: string,
	command: DeviceCommandKey
): Promise<StoredDeviceState> {
	await loadDeviceStates();
	cachedStates[deviceId] = {
		lastCommand: command,
		updatedAt: Date.now(),
		source: 'action'
	};
	void persistDeviceStates(cachedStates);
	return cachedStates[deviceId];
}

export async function updateDeviceStateIfNewer(
	deviceId: string,
	command: DeviceCommandKey,
	reportedAt?: number,
	source = 'callback'
) {
	await loadDeviceStates();
	const nextTimestamp = Number.isFinite(reportedAt) ? Number(reportedAt) : Date.now();
	const existing = cachedStates[deviceId];

	if (!shouldUpdateState(existing, nextTimestamp)) {
		return { updated: false, state: existing };
	}

	cachedStates[deviceId] = { lastCommand: command, updatedAt: nextTimestamp, source };
	void persistDeviceStates(cachedStates);
	return { updated: true, state: cachedStates[deviceId] };
}

export async function updateDeviceStateIfNewerTransient(
	deviceId: string,
	command: DeviceCommandKey,
	reportedAt?: number,
	source = 'transient'
) {
	await loadDeviceStates();
	const nextTimestamp = Number.isFinite(reportedAt) ? Number(reportedAt) : Date.now();
	const existing = cachedStates[deviceId];

	if (!shouldUpdateState(existing, nextTimestamp)) {
		return { updated: false, state: existing };
	}

	cachedStates[deviceId] = { lastCommand: command, updatedAt: nextTimestamp, source };
	return { updated: true, state: cachedStates[deviceId] };
}
