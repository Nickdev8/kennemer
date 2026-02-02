import { readFile, writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { fetchShellyJson } from '$lib/server/shelly-http';
import { fetchSwitchStatus } from '$lib/server/shelly-rpc';

type ShellyDeviceListEntry = {
	id?: string;
	room_id?: number | string;
	ip?: string;
	lan_ip?: string;
	local_ip?: string;
	address?: string;
	name?: string;
	channel?: number | string;
	gen?: number;
	category?: string;
	model?: string;
	type?: string;
};

type ShellyRoomEntry = {
	id?: string | number;
	name?: string;
};

type ShellyDeviceListPayload = {
	devices?: Record<string, ShellyDeviceListEntry> | ShellyDeviceListEntry[];
	rooms?: Record<string, ShellyRoomEntry> | ShellyRoomEntry[];
};

type ShellyDeviceListResponse = {
	data?: ShellyDeviceListPayload | null;
} & ShellyDeviceListPayload;

type ShellyDeviceCachePayload = ShellyDeviceListPayload & {
	generatedAt?: number;
};

type ShellyDeviceTarget = {
	deviceId: string;
	roomId: number;
	ip: string;
	name: string;
	channel: number | null;
	gen: number | null;
	category: string | null;
	model: string | null;
	type: string | null;
};

type WattageCapability = 'metered' | 'not-metered' | 'unknown';
type WattageState = 'ok' | 'unavailable';
type WattageSource = 'lan-rpc' | 'lan-status' | 'cloud' | 'cached' | 'unknown';

type WattageDeviceSummary = {
	deviceId: string;
	name: string;
	ip: string;
	channel: number | null;
	watts: number;
	output: boolean | null;
	source: WattageSource;
	timestamp: number | null;
	capability: WattageCapability;
	state: WattageState;
};

type WattageResponse = {
	ok: true;
	roomId: number;
	label: string;
	devices: WattageDeviceSummary[];
	totalWatts: number;
	summary: {
		unavailableCount: number;
		notMeteredCount: number;
		meteredCount: number;
		unknownCapabilityCount: number;
		cachedCount: number;
		cloudCount: number;
		lanRpcCount: number;
		lanStatusCount: number;
	};
};

type ErrorResponse = {
	ok: false;
	message: string;
};

const DEVICE_LIST_ENDPOINT =
	'https://shelly-115-eu.shelly.cloud/interface/device/get_all_lists';
const CLOUD_STATUS_ENDPOINT =
	'https://shelly-115-eu.shelly.cloud/device/status';
const HTTP_TIMEOUT_MS = 4000;
const IP_CACHE_PATH = resolvePath(process.cwd(), 'ips.json');
const CACHE_TTL_MS = 2 * 60 * 1000;

const useLanWattage = (() => {
	const raw = (env.USE_LAN_WATTAGE ?? '').trim().toLowerCase();
	if (!raw) return true;
	return ['1', 'true', 'yes', 'on'].includes(raw);
})();

type CachedWattage = {
	watts: number;
	output: boolean | null;
	timestamp: number;
	source: WattageSource;
	capability: WattageCapability;
};

const lastKnownWattage = new Map<string, CachedWattage>();

export const GET: RequestHandler = async ({ params, url }) => {
	const roomParam = params.room ?? '';
	const roomId = Number.parseInt(roomParam, 10);

	if (!Number.isFinite(roomId)) {
		return jsonError('Invalid room id', 400);
	}

	try {
		const forceRefresh = url.searchParams.has('refresh');
		const { label, devices } = await resolveRoomDevices(roomId, { forceRefresh });
		if (devices.length === 0) {
			const empty: WattageResponse = {
				ok: true,
				roomId,
				label,
				devices: [],
				totalWatts: 0,
				summary: {
					unavailableCount: 0,
					notMeteredCount: 0,
					meteredCount: 0,
					unknownCapabilityCount: 0,
					cachedCount: 0,
					cloudCount: 0,
					lanRpcCount: 0,
					lanStatusCount: 0
				}
			};
			return jsonResponse(empty);
		}

		const summaries = await Promise.all(devices.map((target) => fetchDeviceWattage(target)));

		const totals = summariseWattage(summaries);
		if (totals.summary.unavailableCount > 0) {
			const unavailable = summaries.filter(
				(item) => item.capability === 'metered' && item.state === 'unavailable'
			);
			if (unavailable.length > 0) {
				console.warn('Wattage unavailable for metered devices', {
					devices: unavailable.map((item) => ({
						deviceId: item.deviceId,
						ip: item.ip,
						source: item.source
					}))
				});
			}
		}
		const payload: WattageResponse = {
			ok: true,
			roomId,
			label,
			devices: summaries,
			totalWatts: totals.totalWatts,
			summary: totals.summary
		};

		return jsonResponse(payload);
	} catch (error) {
		const message = errorMessage(error);
		return jsonError(message, 502);
	}
};

async function resolveRoomDevices(
	roomId: number,
	options: { forceRefresh?: boolean } = {}
): Promise<{ label: string; devices: ShellyDeviceTarget[] }> {
	const list = await loadDeviceListPayload(options.forceRefresh ?? false);
	const ignoreRoomFilter = roomId === -1;
	const label =
		ignoreRoomFilter ? 'Alle ruimtes' : resolveRoomLabel(list?.rooms, roomId) ?? `Room ${roomId}`;
	const devices = collectRoomDeviceTargets(list?.devices, roomId, { ignoreRoomFilter });

	return { label, devices };
}

async function loadDeviceListPayload(forceRefresh: boolean): Promise<ShellyDeviceListPayload | null> {
	if (!forceRefresh) {
		const cached = await readDeviceListCache();
		if (cached) {
			return cached;
		}
	}

	const fresh = await fetchDeviceListFromCloud();
	if (fresh) {
		await writeDeviceListCache(fresh);
	}
	return fresh;
}

async function readDeviceListCache(): Promise<ShellyDeviceListPayload | null> {
	try {
		const raw = await readFile(IP_CACHE_PATH, 'utf-8');
		if (!raw) return null;
		const parsed = JSON.parse(raw) as ShellyDeviceCachePayload;
		return normaliseDeviceListPayload(parsed);
	} catch {
		return null;
	}
}

async function writeDeviceListCache(payload: ShellyDeviceListPayload): Promise<void> {
	const cachePayload: ShellyDeviceCachePayload = {
		generatedAt: Date.now(),
		devices: payload?.devices ?? {},
		rooms: payload?.rooms ?? {}
	};

	try {
		await writeFile(IP_CACHE_PATH, JSON.stringify(cachePayload, null, 2), 'utf-8');
	} catch {
	}
}

async function fetchDeviceListFromCloud(): Promise<ShellyDeviceListPayload | null> {
	const payload = (await fetchShellyJson({
		endpoint: DEVICE_LIST_ENDPOINT,
		method: 'GET',
		requiresAuthKey: true
	})) as ShellyDeviceListResponse | null;

	return normaliseDeviceListPayload(payload);
}

function normaliseDeviceListPayload(payload: unknown): ShellyDeviceListPayload | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const response = payload as ShellyDeviceListResponse;
	if (response.data && typeof response.data === 'object') {
		return response.data as ShellyDeviceListPayload;
	}

	return response as ShellyDeviceListPayload;
}

function collectRoomDeviceTargets(
	devices: ShellyDeviceListPayload['devices'],
	roomId: number,
	options: { ignoreRoomFilter?: boolean } = {}
): ShellyDeviceTarget[] {
	const entries = toDeviceEntries(devices);
	const results: ShellyDeviceTarget[] = [];

	for (const [key, entry] of entries) {
		const entryRoom = parseNumber(entry.room_id);
		if (!options.ignoreRoomFilter && entryRoom !== roomId) continue;

		const ip = pickDeviceIp(entry);
		if (!isTargetSubnet(ip)) continue;

		const deviceId = typeof entry.id === 'string' && entry.id ? entry.id : key;
		const name = typeof entry.name === 'string' && entry.name ? entry.name : deviceId;
		const channel = parseNumber(entry.channel);
		const gen = parseNumber(entry.gen);
		const category = normaliseLabel(entry.category);
		const model = normaliseLabel(entry.model);
		const type = normaliseLabel(entry.type);

		results.push({
			deviceId,
			roomId: entryRoom ?? roomId,
			ip,
			name,
			channel: Number.isFinite(channel) ? channel : null,
			gen: Number.isFinite(gen) ? gen : null,
			category,
			model,
			type
		});
	}

	return results;
}

function toDeviceEntries(
	devices: ShellyDeviceListPayload['devices']
): Array<[string, ShellyDeviceListEntry]> {
	const entries: Array<[string, ShellyDeviceListEntry]> = [];
	if (!devices) return entries;

	if (Array.isArray(devices)) {
		devices.forEach((item, index) => {
			if (!item || typeof item !== 'object') return;
			const entry = item as ShellyDeviceListEntry;
			const key = typeof entry.id === 'string' && entry.id ? entry.id : String(index);
			entries.push([key, entry]);
		});
		return entries;
	}

	for (const [key, value] of Object.entries(devices)) {
		if (!value || typeof value !== 'object') continue;
		entries.push([key, value as ShellyDeviceListEntry]);
	}

	return entries;
}

function pickDeviceIp(entry: ShellyDeviceListEntry): string {
	const candidates: unknown[] = [entry.ip, entry.local_ip, entry.lan_ip, entry.address];
	for (const candidate of candidates) {
		const normalised = normaliseIp(candidate);
		if (normalised) {
			return normalised;
		}
	}
	return '';
}

function normaliseIp(value: unknown): string {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		const compact = trimmed.replace(/\s+/g, '');
		return compact;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value);
	}
	return '';
}

function normaliseLabel(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function isTargetSubnet(ip: string) {
	return typeof ip === 'string' && ip.startsWith('10.10.80.');
}

function resolveRoomLabel(rooms: ShellyDeviceListPayload['rooms'], roomId: number): string | null {
	if (!rooms) return null;

	const targetId = String(roomId);

	if (Array.isArray(rooms)) {
		for (const room of rooms) {
			if (!room || typeof room !== 'object') continue;
			const entry = room as ShellyRoomEntry;
			const rid = parseNumber(entry.id ?? (entry as { room_id?: number | string }).room_id);
			if (rid !== null && String(rid) === targetId) {
				const name = entry.name;
				if (typeof name === 'string' && name.trim()) {
					return name.trim();
				}
			}
		}
		return null;
	}

	const record = rooms[targetId];
	if (record && typeof record === 'object') {
		const entry = record as ShellyRoomEntry;
		if (typeof entry.name === 'string' && entry.name.trim()) {
			return entry.name.trim();
		}
	}

	return null;
}

async function fetchDeviceWattage(target: ShellyDeviceTarget): Promise<WattageDeviceSummary> {
	const now = Date.now();
	const metadataCapability = inferCapabilityFromMetadata(target);
	const lanReading = useLanWattage ? await fetchLanReading(target) : null;
	const capability = resolveCapability(metadataCapability, lanReading?.capabilityHint ?? null);

	if (lanReading && isValidReading(lanReading)) {
		const summary = buildSummary(target, lanReading, 'metered', 'ok');
		if (summary.capability === 'metered') {
			rememberReading(target.deviceId, summary);
		}
		return summary;
	}

	const cloudResult = await fetchCloudReading(target);
	if (cloudResult && cloudResult.reading) {
		console.log('[Wattage cloud fallback]', {
			deviceId: target.deviceId,
			payload: cloudResult.payload,
			extractedWatts: cloudResult.reading.watts
		});
	}
	if (cloudResult && cloudResult.reading && isValidReading(cloudResult.reading)) {
		const summary = buildSummary(target, cloudResult.reading, 'metered', 'ok');
		rememberReading(target.deviceId, summary);
		return summary;
	}

	if (capability !== 'not-metered') {
		const cached = readCachedReading(target, now);
		if (cached) {
			return cached;
		}
	}

	return buildUnavailableSummary(target, capability);
}

function supportsRpcPower(target: ShellyDeviceTarget) {
	return typeof target.gen === 'number' && target.gen >= 2;
}

async function fetchLanReading(
	target: ShellyDeviceTarget
): Promise<{
	watts: number | null;
	output: boolean | null;
	source: WattageSource;
	timestamp: number;
	capabilityHint: WattageCapability | null;
} | null> {
	const timestamp = Date.now();
	const channel = target.channel ?? 0;

	if (supportsRpcPower(target)) {
		const payload = await fetchSwitchStatus(target.ip, channel);
		if (payload && typeof payload.apower === 'number') {
			return {
				watts: payload.apower,
				output: typeof payload.output === 'boolean' ? payload.output : null,
				source: 'lan-rpc',
				timestamp,
				capabilityHint: 'metered'
			};
		}
		const hasOutput = payload && typeof payload.output === 'boolean';
		return {
			watts: null,
			output: hasOutput ? payload.output ?? null : null,
			source: 'lan-rpc',
			timestamp,
			capabilityHint: hasOutput ? 'not-metered' : null
		};
	}

	const { payload } = await requestShellyStatus(target.ip);
	if (!payload || !matchesDeviceIdentity(payload, target.deviceId)) {
		return {
			watts: null,
			output: null,
			source: 'lan-status',
			timestamp,
			capabilityHint: null
		};
	}

	const metrics = extractMetrics(payload, target.channel);
	return {
		watts: metrics.watts ?? null,
		output: metrics.output ?? null,
		source: 'lan-status',
		timestamp,
		capabilityHint: typeof metrics.watts === 'number' ? 'metered' : null
	};
}

async function fetchCloudReading(target: ShellyDeviceTarget): Promise<{
	reading: { watts: number | null; output: boolean | null; source: WattageSource; timestamp: number };
	payload: unknown;
} | null> {
	try {
		const payload = await fetchShellyJson({
			endpoint: CLOUD_STATUS_ENDPOINT,
			method: 'POST',
			encoding: 'form',
			payload: { id: target.deviceId },
			requiresAuthKey: true
		});

		const resolved = resolveCloudStatusPayload(payload);
		if (!resolved) return null;
		const metrics = extractMetrics(resolved, target.channel);
		return {
			reading: {
				watts: metrics.watts ?? null,
				output: metrics.output ?? null,
				source: 'cloud',
				timestamp: Date.now()
			},
			payload
		};
	} catch {
		return null;
	}
}

function inferCapabilityFromMetadata(target: ShellyDeviceTarget): WattageCapability {
	const category = target.category?.toLowerCase() ?? '';
	const model = target.model?.toLowerCase() ?? '';
	const type = target.type?.toLowerCase() ?? '';
	const name = target.name?.toLowerCase() ?? '';
	const haystack = `${category} ${model} ${type} ${name}`.trim();

	if (!haystack) return 'unknown';

	if (category.includes('roller') || haystack.includes('cover') || haystack.includes('roller')) {
		return 'not-metered';
	}

	if (
		haystack.includes('wall display') ||
		haystack.includes('walldisplay') ||
		haystack.includes('display') ||
		haystack.includes('sensor') ||
		haystack.includes('input')
	) {
		return 'not-metered';
	}

	if (model) {
		if (model.includes('pm') || model.includes('em')) {
			return 'metered';
		}
		return 'not-metered';
	}

	return 'unknown';
}

function resolveCapability(
	metadata: WattageCapability,
	hint: WattageCapability | null
): WattageCapability {
	if (hint) return hint;
	return metadata;
}

function isValidReading(reading: {
	watts: number | null;
	output: boolean | null;
	source: WattageSource;
}) {
	if (typeof reading.watts !== 'number' || !Number.isFinite(reading.watts)) return false;
	if (reading.watts < 0) return false;
	if (reading.watts === 0) {
		return reading.output === false;
	}
	return true;
}

function rememberReading(deviceId: string, reading: {
	watts: number | null;
	output: boolean | null;
	source: WattageSource;
	timestamp: number;
	capability: WattageCapability;
}) {
	if (reading.watts === null || !Number.isFinite(reading.watts)) return;
	lastKnownWattage.set(deviceId, {
		watts: reading.watts,
		output: reading.output ?? null,
		timestamp: reading.timestamp,
		source: reading.source,
		capability: reading.capability
	});
}

function readCachedReading(
	target: ShellyDeviceTarget,
	now: number
): WattageDeviceSummary | null {
	const cached = lastKnownWattage.get(target.deviceId);
	if (!cached) return null;
	if (now - cached.timestamp > CACHE_TTL_MS) {
		lastKnownWattage.delete(target.deviceId);
		return null;
	}
	return {
		deviceId: target.deviceId,
		name: target.name,
		ip: target.ip,
		channel: target.channel,
		watts: cached.watts,
		output: cached.output ?? null,
		source: 'cached',
		timestamp: cached.timestamp,
		capability: cached.capability,
		state: 'ok'
	};
}

function buildSummary(
	target: ShellyDeviceTarget,
	reading: {
		watts: number | null;
		output: boolean | null;
		source: WattageSource;
		timestamp: number | null;
	},
	capability: WattageCapability,
	state: WattageState
): WattageDeviceSummary {
	return {
		deviceId: target.deviceId,
		name: target.name,
		ip: target.ip,
		channel: target.channel,
		watts: typeof reading.watts === 'number' && Number.isFinite(reading.watts) ? reading.watts : 0,
		output: reading.output ?? null,
		source: reading.source,
		timestamp: reading.timestamp ?? Date.now(),
		capability,
		state
	};
}

function buildUnavailableSummary(
	target: ShellyDeviceTarget,
	capability: WattageCapability
): WattageDeviceSummary {
	const state: WattageState = capability === 'metered' ? 'unavailable' : 'ok';
	return {
		deviceId: target.deviceId,
		name: target.name,
		ip: target.ip,
		channel: target.channel,
		watts: 0,
		output: null,
		source: 'unknown',
		timestamp: null,
		capability,
		state
	};
}

function summariseWattage(summaries: WattageDeviceSummary[]) {
	let totalWatts = 0;
	let unavailableCount = 0;
	let notMeteredCount = 0;
	let meteredCount = 0;
	let unknownCapabilityCount = 0;
	let cachedCount = 0;
	let cloudCount = 0;
	let lanRpcCount = 0;
	let lanStatusCount = 0;

	for (const item of summaries) {
		if (item.capability === 'not-metered') {
			notMeteredCount += 1;
			continue;
		}

		if (item.capability === 'metered') {
			meteredCount += 1;
		} else {
			unknownCapabilityCount += 1;
			continue;
		}

		if (item.state === 'unavailable') {
			unavailableCount += 1;
			continue;
		}

		if (!Number.isFinite(item.watts)) continue;
		totalWatts += item.watts;
		if (item.source === 'cached') cachedCount += 1;
		if (item.source === 'cloud') cloudCount += 1;
		if (item.source === 'lan-rpc') lanRpcCount += 1;
		if (item.source === 'lan-status') lanStatusCount += 1;
	}

	return {
		totalWatts,
		summary: {
			unavailableCount,
			notMeteredCount,
			meteredCount,
			unknownCapabilityCount,
			cachedCount,
			cloudCount,
			lanRpcCount,
			lanStatusCount
		}
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

		if (Array.isArray(source.switch)) {
			for (const entry of source.switch) {
				if (!entry || typeof entry !== 'object') continue;
				const record = entry as Record<string, unknown>;
				const switchIndex = parseNumber(record.id ?? record.idx ?? record.index);
				if (channel !== null && switchIndex !== null && switchIndex !== channel) continue;
				const value = parseNumber(record.apower ?? record.power);
				if (typeof value === 'number') {
					watts = value;
					break;
				}
				if (output === null) {
					output = parseBoolean(record.output ?? record.on ?? record.ison ?? record.enabled);
				}
			}
		}

		if (Array.isArray(source.relays)) {
			for (const relay of source.relays) {
				if (!relay || typeof relay !== 'object') continue;
				const record = relay as Record<string, unknown>;
				const relayIndex = parseNumber(record.id ?? record.idx ?? record.index);
				if (channel !== null && relayIndex !== null && relayIndex !== channel) continue;
				const value = parseNumber(record.apower ?? record.power);
				if (typeof value === 'number') {
					watts = value;
					break;
				}
				if (output === null) {
					output = parseBoolean(record.output ?? record.on ?? record.ison ?? record.enabled);
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

		if (watts === null && typeof source.apower === 'number') {
			watts = source.apower;
		}

		if (watts === null) {
			for (const [key, value] of Object.entries(source)) {
				if (!value || typeof value !== 'object') continue;
				const record = value as Record<string, unknown>;
				if (!/^switch:\d+$/i.test(key) && !/^relay:\d+$/i.test(key)) continue;
				const valueWatts = parseNumber(record.apower ?? record.power);
				if (typeof valueWatts === 'number') {
					watts = valueWatts;
					if (output === null) {
						output = parseBoolean(record.output ?? record.on ?? record.ison ?? record.enabled);
					}
					break;
				}
			}
		}
	}

	return { watts, output };
}

function resolveCloudStatusPayload(payload: unknown): Record<string, unknown> | null {
	if (!payload || typeof payload !== 'object') return null;
	const root = payload as Record<string, unknown>;
	const direct = root.device_status ?? root.status;
	if (direct && typeof direct === 'object') {
		return direct as Record<string, unknown>;
	}
	const data = root.data;
	if (data && typeof data === 'object') {
		const dataObj = data as Record<string, unknown>;
		const nested = dataObj.device_status ?? dataObj.status;
		if (nested && typeof nested === 'object') {
			return nested as Record<string, unknown>;
		}
		return dataObj;
	}
	return root;
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
