import type { RequestHandler } from './$types';
import { devices } from '$lib/config/devices';
import { advancedDevices } from '$lib/config/advanced';
import { updateDeviceStateIfNewer, updateDeviceStateIfNewerTransient } from '$lib/server/device-state-store';
import { publishDeviceState } from '$lib/server/device-state-events';
import type { DeviceCommandKey } from '$lib/config/schema';

type CallbackPayload = {
	deviceId?: string;
	sceneId?: string;
	state?: DeviceCommandKey;
	reportedAt?: number;
	transient?: boolean;
};

const validStates = new Set<DeviceCommandKey>(['on', 'off']);

type CallbackInput = {
	deviceId?: string;
	sceneId?: string;
	state?: DeviceCommandKey;
	reportedAt?: number;
	transient?: boolean;
};

async function handleCallback(payload: CallbackInput | null) {
	if (!payload || (!payload.deviceId && !payload.sceneId)) {
		return jsonError('Missing deviceId or sceneId', 400);
	}

	const state = payload.state;
	if (!state || !validStates.has(state)) {
		return jsonError('Invalid state', 400);
	}

	const id = (payload.deviceId ?? payload.sceneId ?? '').trim();
	if (!id) {
		return jsonError('Invalid deviceId', 400);
	}

	const device = [...devices, ...advancedDevices].find((item) => item.id === id);
	if (!device && !payload.transient) {
		return jsonError('Unknown device', 404);
	}

	const deviceId = device?.id ?? id;
	const transient = payload.transient ?? true;
	const updater = transient ? updateDeviceStateIfNewerTransient : updateDeviceStateIfNewer;
	const { state: stored } = await updater(deviceId, state, payload.reportedAt);
	publishDeviceState({ deviceId, state: stored });

	return jsonResponse({ ok: true, deviceId, lastCommand: stored.lastCommand });
}

export const GET: RequestHandler = async ({ url }) => {
	const deviceId = url.searchParams.get('deviceId') ?? undefined;
	const sceneId = url.searchParams.get('sceneId') ?? undefined;
	const state = (url.searchParams.get('state') ?? undefined) as DeviceCommandKey | undefined;
	const transientRaw = url.searchParams.get('transient');
	const reportedAtRaw = url.searchParams.get('reportedAt');
	const transient = transientRaw === 'false' ? false : transientRaw === 'true' ? true : undefined;
	const reportedAt = reportedAtRaw ? Number(reportedAtRaw) : undefined;

	return handleCallback({ deviceId, sceneId, state, transient, reportedAt });
};

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => null)) as CallbackPayload | null;
	return handleCallback(payload);
};

function jsonResponse(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function jsonError(message: string, status = 400) {
	return jsonResponse({ ok: false, message }, status);
}
