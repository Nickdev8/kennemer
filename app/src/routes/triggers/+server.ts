import type { RequestHandler } from './$types';
import { advancedTriggers } from '$lib/config/advanced';
import { sendDeviceCommand, ShellyHttpError } from '$lib/server/shelly-http';
import type { ShellyDevice } from '$lib/config/schema';

const shellySceneEndpoint = 'https://shelly-115-eu.shelly.cloud/scene/manual_run';

type TriggerRequest = {
	triggerId?: string;
};

export const POST: RequestHandler = async ({ request }) => {
	const { triggerId }: TriggerRequest = await request.json();

	if (!triggerId) {
		return new Response(JSON.stringify({ error: 'Invalid trigger payload' }), {
			status: 400
		});
	}

	const trigger = advancedTriggers.find((item) => item.id === triggerId);

	if (!trigger) {
		return new Response(JSON.stringify({ error: 'Unknown trigger' }), { status: 404 });
	}

	try {
		const sceneDevice: ShellyDevice = {
			id: `trigger-${trigger.id}`,
			label: trigger.label,
			group: 'Trigger',
			stateless: true,
			commands: {
				on: {
					cloud: {
						endpoint: shellySceneEndpoint,
						method: 'POST',
						payload: { id: trigger.sceneId, channel: 0, turn: 'on' },
						requiresAuthKey: true
					}
				},
				off: {
					cloud: {
						endpoint: shellySceneEndpoint,
						method: 'POST',
						payload: { id: trigger.sceneId, channel: 0, turn: 'on' },
						requiresAuthKey: true
					}
				}
			}
		};
		await sendDeviceCommand(sceneDevice, 'on');
		return new Response(JSON.stringify({ ok: true }));
	} catch (err) {
		if (err instanceof ShellyHttpError) {
			return new Response(
				JSON.stringify({ error: err.message, errorCode: err.code }),
				{ status: err.status || 502 }
			);
		}

		const msg = err instanceof Error ? err.message : 'Trigger failed';
		return new Response(JSON.stringify({ error: msg }), { status: 502 });
	}
};
