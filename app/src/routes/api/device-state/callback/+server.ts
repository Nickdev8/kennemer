import type { RequestHandler } from './$types';
import { devices } from '$lib/config/devices';
import { advancedDevices } from '$lib/config/advanced';
import { updateDeviceStateIfNewer } from '$lib/server/device-state-store';
import { publishDeviceState } from '$lib/server/device-state-events';
import type { DeviceCommandKey } from '$lib/config/schema';

type CallbackPayload = {
	deviceId?: string;
	sceneId?: string;
	state?: DeviceCommandKey;
	reportedAt?: number;
};

const validStates = new Set<DeviceCommandKey>(['on', 'off']);

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => null)) as CallbackPayload | null;

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
	if (!device) {
		return jsonError('Unknown device', 404);
	}

	const { state: stored } = await updateDeviceStateIfNewer(device.id, state, payload.reportedAt);
	publishDeviceState({ deviceId: device.id, state: stored });

	return jsonResponse({ ok: true, deviceId: device.id, lastCommand: stored.lastCommand });
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
