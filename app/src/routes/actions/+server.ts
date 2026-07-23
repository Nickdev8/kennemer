import type { RequestHandler } from './$types';
import { devices } from '$lib/config/devices';
import { advancedDevices } from '$lib/config/advanced';
import type { DeviceCommandKey } from '$lib/config/schema';
import { sendDeviceCommand, ShellyHttpError } from '$lib/server/shelly-http';
import { updateDeviceState } from '$lib/server/device-state-store';
import { publishDeviceState } from '$lib/server/device-state-events';
import { isDeviceCommandConfigured } from '$lib/config/device-validation';

type ActionRequest = {
	deviceId?: string;
	command?: DeviceCommandKey;
};

const statelessActiveUntil = new Map<string, number>();
const statelessCommandsInFlight = new Map<string, Promise<number>>();

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

export const POST: RequestHandler = async ({ request }) => {
	const { deviceId, command }: ActionRequest = await request.json();

	if (!deviceId || !command || !['on', 'off'].includes(command)) {
		return jsonResponse({ error: 'Invalid command payload' }, 400);
	}

	const device = [...devices, ...advancedDevices].find((item) => item.id === deviceId);

	if (!device) {
		return jsonResponse({ error: 'Unknown device' }, 404);
	}

	if (!isDeviceCommandConfigured(device, command)) {
		return jsonResponse({ error: 'Actie niet ingesteld: scène-ID ontbreekt' }, 409);
	}

	try {
		const activeDurationMs =
			device.stateless &&
			Number.isFinite(device.activeDurationMs) &&
			Number(device.activeDurationMs) > 0
				? Number(device.activeDurationMs)
				: 0;
		const actionKey = `${device.id}:${command}`;
		let activeUntil: number | undefined;
		let skipped = false;

		if (activeDurationMs > 0) {
			const currentActiveUntil = statelessActiveUntil.get(actionKey) ?? 0;
			if (currentActiveUntil > Date.now()) {
				activeUntil = currentActiveUntil;
				skipped = true;
			} else {
				statelessActiveUntil.delete(actionKey);
				const inFlight = statelessCommandsInFlight.get(actionKey);
				if (inFlight) {
					activeUntil = await inFlight;
					skipped = true;
				} else {
					const commandPromise = sendDeviceCommand(device, command).then(() => {
						const nextActiveUntil = Date.now() + activeDurationMs;
						statelessActiveUntil.set(actionKey, nextActiveUntil);
						setTimeout(() => {
							if (statelessActiveUntil.get(actionKey) === nextActiveUntil) {
								statelessActiveUntil.delete(actionKey);
							}
						}, activeDurationMs);
						return nextActiveUntil;
					});
					statelessCommandsInFlight.set(actionKey, commandPromise);
					try {
						activeUntil = await commandPromise;
					} finally {
						if (statelessCommandsInFlight.get(actionKey) === commandPromise) {
							statelessCommandsInFlight.delete(actionKey);
						}
					}
				}
			}
		} else {
			await sendDeviceCommand(device, command);
		}

		if (!device.stateless) {
			const state = await updateDeviceState(device.id, command);
			publishDeviceState({ deviceId: device.id, state });
		}
		return jsonResponse({
			ok: true,
			skipped,
			activeUntil,
			state: { deviceId: device.id, lastCommand: command }
		});
	} catch (err) {
		if (err instanceof ShellyHttpError) {
			return jsonResponse({ error: err.message, errorCode: err.code }, err.status || 502);
		}

		const msg = err instanceof Error ? err.message : 'Action failed';
		return jsonResponse({ error: msg }, 502);
	}
};
