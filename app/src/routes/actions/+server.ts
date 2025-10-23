import type { RequestHandler } from './$types';
import { devices } from '$lib/config/devices';
import type { DeviceCommandKey } from '$lib/config/schema';
import { sendDeviceCommand, ShellyHttpError } from '$lib/server/shelly-http';

type ActionRequest = {
	deviceId?: string;
	command?: DeviceCommandKey;
};

export const POST: RequestHandler = async ({ request }) => {
	const { deviceId, command }: ActionRequest = await request.json();

	if (!deviceId || !command || !['on', 'off'].includes(command)) {
		return new Response(JSON.stringify({ error: 'Invalid command payload' }), {
			status: 400
		});
	}

	const device = devices.find((item) => item.id === deviceId);

	if (!device) {
		return new Response(JSON.stringify({ error: 'Unknown device' }), { status: 404 });
	}

	try {
		await sendDeviceCommand(device, command);
		return new Response(JSON.stringify({ ok: true }));
	} catch (err) {
		if (err instanceof ShellyHttpError) {
			return new Response(
				JSON.stringify({ error: err.message, errorCode: err.code }),
				{ status: err.status || 502 }
			);
		}

		const msg = err instanceof Error ? err.message : 'Action failed';
		return new Response(JSON.stringify({ error: msg }), { status: 502 });
	}
};
