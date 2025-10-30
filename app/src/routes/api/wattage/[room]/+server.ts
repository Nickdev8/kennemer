import type { RequestHandler } from './$types';
import { fetchShellyJson } from '$lib/server/shelly-http';

type ShellyDeviceListEntry = {
	id?: string;
	room_id?: number | string;
	ip?: string;
	name?: string;
	channel?: number | string;
	gen?: number;
};

type ShellyDeviceTarget = {
	deviceId: string;
	roomId: number;
	ip: string;
	name: string;
	channel: number | null;
};

type WattageDeviceSummary = {
	deviceId: string;
	name: string;
	ip: string;
	channel: number | null;
	watts: number;
	output: boolean | null;
};

type WattageResponse = {
	ok: true;
	roomId: number;
	label: string;
	devices: WattageDeviceSummary[];
	totalWatts: number;
};

type ErrorResponse = {
	ok: false;
	message: string;
};

const DEVICE_LIST_ENDPOINT = 'https://shelly-115-eu.shelly.cloud/interface/device/list';
const DEVICE_STATUS_ENDPOINT = 'https://shelly-115-eu.shelly.cloud/interface/device/status';
const ipOverrides = new Map<string, string>();

const HTTP_TIMEOUT_MS = 4000;

export const GET: RequestHandler = async ({ params }) => {
	const roomParam = params.room ?? '';
	const roomId = Number.parseInt(roomParam, 10);

	if (!Number.isFinite(roomId)) {
		return jsonError('Invalid room id', 400);
	}

	try {
		const targets = await resolveRoomDevices(roomId);
		if (targets.length === 0) {
			const empty: WattageResponse = {
				ok: true,
				roomId,
				label: `Room ${roomId}`,
				devices: [],
				totalWatts: 0
			};
			return jsonResponse(empty);
		}

		const summaries: WattageDeviceSummary[] = [];
		for (const target of targets) {
			const summary = await fetchDeviceWattage(target);
			summaries.push(summary);
		}

		const totalWatts = summaries.reduce((sum, item) => sum + item.watts, 0);
		const payload: WattageResponse = {
			ok: true,
			roomId,
			label: `Room ${roomId}`,
			devices: summaries,
			totalWatts
		};

		return jsonResponse(payload);
	} catch (error) {
		const message = errorMessage(error);
		return jsonError(message, 502);
	}
};

async function resolveRoomDevices(roomId: number): Promise<ShellyDeviceTarget[]> {
	const payload = await fetchShellyJson({
		endpoint: DEVICE_LIST_ENDPOINT,
		method: 'GET',
		requiresAuthKey: true
	});

	if (!payload || typeof payload !== 'object') {
		throw new Error('Invalid device list response');
	}

	const root = payload as Record<string, unknown>;
	const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null;
	const devicesObj = data && typeof data.devices === 'object' ? (data.devices as Record<string, unknown>) : null;
	if (!devicesObj) {
		return [];
	}

	const results: ShellyDeviceTarget[] = [];

	for (const [key, value] of Object.entries(devicesObj)) {
		if (!value || typeof value !== 'object') continue;
		const entry = value as ShellyDeviceListEntry;
		const ip = typeof entry.ip === 'string' && entry.ip ? entry.ip : '';
		if (!ip) continue;
		const entryRoom = parseNumber(entry.room_id);
		if (entryRoom !== roomId) continue;
		const deviceId = typeof entry.id === 'string' && entry.id ? entry.id : key;
		const name = typeof entry.name === 'string' && entry.name ? entry.name : deviceId;
		const channel = parseNumber(entry.channel);
		const overrideIp = ipOverrides.get(deviceId);
		results.push({
			deviceId,
			roomId,
			ip: overrideIp ?? ip,
			name,
			channel: Number.isFinite(channel) ? channel : null
		});
	}

	return results;
}

async function fetchDeviceWattage(target: ShellyDeviceTarget): Promise<WattageDeviceSummary> {
	const initial = await requestShellyStatus(target.ip);

	let payload = initial.payload;
	let effectiveIp = target.ip;

	if (payload && !matchesDeviceIdentity(payload, target.deviceId)) {
		const refreshedIp = await resolveDeviceIpFromCloud(target.deviceId);
		if (refreshedIp && refreshedIp !== target.ip) {
			ipOverrides.set(target.deviceId, refreshedIp);
			target.ip = refreshedIp;
			effectiveIp = refreshedIp;
			const retry = await requestShellyStatus(refreshedIp);
			payload = retry.payload;
		}
	}

	if (!payload || !matchesDeviceIdentity(payload, target.deviceId)) {
		return {
			deviceId: target.deviceId,
			name: target.name,
			ip: effectiveIp,
			channel: target.channel,
			watts: 0,
			output: null
		};
	}

	const metrics = extractMetrics(payload, target.channel);

	return {
		deviceId: target.deviceId,
		name: target.name,
		ip: effectiveIp,
		channel: target.channel,
		watts: metrics.watts ?? 0,
		output: metrics.output ?? null
	};
}

function extractMetrics(payload: unknown, channel: number | null) {
	let watts: number | null = null;
	let output: boolean | null = null;

	if (payload && typeof payload === 'object') {
		const source = payload as Record<string, unknown>;
		if (Array.isArray(source.meters)) {
			for (const meter of source.meters) {
				if (!meter || typeof meter !== 'object') continue;
				const record = meter as Record<string, unknown>;
				const meterIndex = parseNumber(record.idx ?? record.id);
				if (channel !== null && meterIndex !== null && meterIndex !== channel) continue;
				const value = parseNumber(record.power);
				if (typeof value === 'number') {
					watts = value;
					break;
				}
			}
		}

		if (Array.isArray(source.lights)) {
			for (const light of source.lights) {
				if (!light || typeof light !== 'object') continue;
				const record = light as Record<string, unknown>;
				const candidate = parseBoolean(record.ison ?? record.on ?? record.output ?? record.enabled);
				if (candidate !== null) {
					output = candidate;
					break;
				}
			}
		}

		if (watts === null && typeof source.power === 'number') {
			watts = source.power;
		}
	}

	return { watts: watts ?? 0, output };
}

function parseNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
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

function normaliseIdentifier(value: string) {
	return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

type StatusResponse = {
	payload: Record<string, unknown> | null;
};

async function requestShellyStatus(ip: string): Promise<StatusResponse> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

	try {
		const res = await fetch(`http://${ip}/status`, {
			method: 'GET',
			signal: controller.signal,
			headers: { accept: 'application/json' }
		});

		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}

		const payload = (await res.json()) as Record<string, unknown>;
		return { payload };
	} catch {
		return { payload: null };
	} finally {
		clearTimeout(timeout);
	}
}

function extractDeviceIdentifiers(payload: Record<string, unknown>): string[] {
	const identifiers = new Set<string>();

	const maybeAdd = (value: unknown) => {
		if (typeof value === 'string' && value.trim()) {
			identifiers.add(normaliseIdentifier(value));
		}
	};

	maybeAdd(payload.mac);

	const wifi = payload.wifi_sta;
	if (wifi && typeof wifi === 'object') {
		maybeAdd((wifi as Record<string, unknown>).mac);
	}

	const device = payload.device;
	if (device && typeof device === 'object') {
		const deviceObj = device as Record<string, unknown>;
		maybeAdd(deviceObj.id);
		maybeAdd(deviceObj.mac);
	}

	const sys = payload.sys;
	if (sys && typeof sys === 'object') {
		const sysObj = sys as Record<string, unknown>;
		maybeAdd(sysObj.deviceid);
		maybeAdd(sysObj.mac);
	}

	return Array.from(identifiers);
}

function matchesDeviceIdentity(payload: Record<string, unknown>, expectedId: string) {
	const identifiers = extractDeviceIdentifiers(payload);
	if (identifiers.length === 0) {
		return true;
	}

	const expected = normaliseIdentifier(expectedId);
	return identifiers.some((id) => id === expected);
}

async function resolveDeviceIpFromCloud(deviceId: string): Promise<string | null> {
	try {
		const target = {
			endpoint: `${DEVICE_STATUS_ENDPOINT}?id=${encodeURIComponent(deviceId)}`,
			method: 'GET',
			requiresAuthKey: true
		} as const;
		const payload = (await fetchShellyJson(target)) as Record<string, unknown> | null;
		if (!payload || typeof payload !== 'object') {
			return null;
		}

		const data = payload.data;
		if (data && typeof data === 'object') {
			const dataObj = data as Record<string, unknown>;
			const device = dataObj.device_status;
			if (device && typeof device === 'object') {
				const ip = extractIpFromStatus(device as Record<string, unknown>);
				if (ip) return ip;
			}
		}

		const ip = extractIpFromStatus(payload);
		return ip;
	} catch {
		return null;
	}
}

function extractIpFromStatus(payload: Record<string, unknown>): string | null {
	const maybeIp = payload.ip ?? payload.address;
	if (typeof maybeIp === 'string' && maybeIp.trim()) {
		return maybeIp.trim();
	}

	const wifi = (payload.wifi_sta ?? payload.wifi) ?? null;
	if (wifi && typeof wifi === 'object') {
		const wifiObj = wifi as Record<string, unknown>;
		const ip = wifiObj.ip;
		if (typeof ip === 'string' && ip.trim()) {
			return ip.trim();
		}
	}

	const sys = payload.sys;
	if (sys && typeof sys === 'object') {
		const sysObj = sys as Record<string, unknown>;
		const ip = sysObj.ip ?? sysObj.address;
		if (typeof ip === 'string' && ip.trim()) {
			return ip.trim();
		}
	}

	return null;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return 'Failed to collect wattage data';
}

function jsonResponse(payload: WattageResponse) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function jsonError(message: string, status = 500) {
	const payload: ErrorResponse = { ok: false, message };
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
