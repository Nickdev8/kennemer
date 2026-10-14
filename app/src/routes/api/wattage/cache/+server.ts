import writeFileAtomic from 'write-file-atomic';
import { env } from '$env/dynamic/private';
import { resolve as resolvePath } from 'node:path';

import type { RequestHandler } from './$types';
import { fetchShellyJson } from '$lib/server/shelly-http';

const IP_CACHE_PATH = resolvePath(process.cwd(), env.IP_CACHE_PATH ?? 'ips.json');
const DEVICE_LIST_ENDPOINT = 'https://shelly-115-eu.shelly.cloud/interface/device/get_all_lists';

export const POST: RequestHandler = async () => {
	const fresh = await fetchDeviceListFromCloud();
	if (!fresh) {
		return jsonError('Kon apparaatlijst niet vernieuwen', 502);
	}

	await writeDeviceListCache(fresh);

	return jsonResponse({ ok: true });
};

function jsonResponse(payload: unknown) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function jsonError(message: string, status = 500) {
	return new Response(JSON.stringify({ ok: false, message }), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

type ShellyDeviceListPayload = {
	devices?: Record<string, unknown> | unknown[];
	rooms?: Record<string, unknown> | unknown[];
};

type ShellyDeviceListResponse = {
	data?: ShellyDeviceListPayload | null;
} & ShellyDeviceListPayload;

type ShellyDeviceCachePayload = ShellyDeviceListPayload & {
	generatedAt?: number;
};

async function fetchDeviceListFromCloud(): Promise<ShellyDeviceListPayload | null> {
	const payload = (await fetchShellyJson({
		endpoint: DEVICE_LIST_ENDPOINT,
		method: 'POST',
		encoding: 'form',
		payload: { _ts: Date.now() },
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

async function writeDeviceListCache(payload: ShellyDeviceListPayload): Promise<void> {
	const cachePayload: ShellyDeviceCachePayload = {
		generatedAt: Date.now(),
		devices: payload?.devices ?? {},
		rooms: payload?.rooms ?? {}
	};

	await writeFileAtomic(IP_CACHE_PATH, JSON.stringify(cachePayload, null, 2), {
		encoding: 'utf8',
		mode: 0o644
	});
}
