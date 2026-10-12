import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeMode, maintenanceBlocked } from '$lib/server/runtime-mode';
import { createMockBackend } from '$lib/server/mock-backend';
import { readEffectiveControls } from '$lib/server/scene-config-store';
import { isDeviceCommandConfigured } from '$lib/config/device-validation';
import type { DashboardControl } from '$lib/config/schema';
import { updateDeviceState, updateDeviceStateIfNewer } from '$lib/server/device-state-store';
import { publishDeviceState } from '$lib/server/device-state-events';

const mock = createMockBackend(
	env.KENNEMER_MOCK_STATE_PATH ?? join(tmpdir(), 'kennemer-mock-physical.json'),
	{
		controls: readEffectiveControls,
		configured: (control, command) => {
			const device = control as DashboardControl;
			return device.controlType === 'device' && isDeviceCommandConfigured(device, command);
		},
		remember: async (id, command, source) =>
			source
				? (await updateDeviceStateIfNewer(id, command, Date.now(), source)).state
				: updateDeviceState(id, command),
		publish: (deviceId, state) => publishDeviceState({ deviceId, state })
	}
);
export const handle: Handle = async ({ event, resolve }) => {
	if (runtimeMode(env.KENNEMER_RUNTIME_MODE) === 'mock') {
		const response = await mock(event.request);
		if (response) return response;
	} else if (
		maintenanceBlocked(env.KENNEMER_RUNTIME_MODE) &&
		['/api/hardware', '/api/update'].includes(event.url.pathname)
	) {
		return new Response(
			JSON.stringify({
				ok: false,
				message: 'Hostonderhoud is niet beschikbaar in lokale ontwikkeling.'
			}),
			{ status: 503, headers: { 'content-type': 'application/json' } }
		);
	}
	return resolve(event);
};
