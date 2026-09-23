import type { RequestHandler } from './$types';
import { sendDeviceCommand, ShellyHttpError } from '$lib/server/shelly-http';
import { readEffectiveControls } from '$lib/server/scene-config-store';
import type { DashboardControl, ShellyDevice } from '$lib/config/schema';

const shellySceneEndpoint = 'https://shelly-115-eu.shelly.cloud/scene/manual_run';

type TriggerRequest = {
	triggerId?: string;
};

export const POST: RequestHandler = async ({ request, fetch, url }) => {
	const { triggerId }: TriggerRequest = await request.json();

	if (!triggerId) {
		return new Response(JSON.stringify({ error: 'Invalid trigger payload' }), {
			status: 400
		});
	}

	const trigger = (await readEffectiveControls()).find(
		(item): item is Exclude<DashboardControl, { controlType: 'device' }> =>
			item.controlType !== 'device' && item.id === triggerId
	);

	if (!trigger) {
		return new Response(JSON.stringify({ error: 'Unknown trigger' }), { status: 404 });
	}

	if (!trigger.sceneId?.trim()) {
		return new Response(JSON.stringify({ error: 'Actie niet ingesteld: scène-ID ontbreekt' }), {
			status: 409,
			headers: { 'content-type': 'application/json' }
		});
	}

	try {
		const sceneDevice: ShellyDevice = {
			id: `trigger-${trigger.id}`,
			label: trigger.label,
			type: 'Trigger',
			stateless: true,
			commands: {
				on: {
					cloud: {
						endpoint: shellySceneEndpoint,
						method: 'POST',
						payload: { id: trigger.sceneId },
						requiresAuthKey: true
					}
				},
				off: {
					cloud: {
						endpoint: shellySceneEndpoint,
						method: 'POST',
						payload: { id: trigger.sceneId },
						requiresAuthKey: true
					}
				}
			}
		};
		await sendDeviceCommand(sceneDevice, 'on');
		const callbackUrl = new URL('/api/device-state/callback', url).toString();
		const postTransientState = (state: 'on' | 'off') =>
			fetch(callbackUrl, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					deviceId: trigger.id,
					state,
					reportedAt: Date.now(),
					transient: true
				})
			}).catch(() => undefined);

		void postTransientState('on');
		setTimeout(() => {
			void postTransientState('off');
		}, 5000);
		return new Response(JSON.stringify({ ok: true }));
	} catch (err) {
		if (err instanceof ShellyHttpError) {
			return new Response(JSON.stringify({ error: err.message, errorCode: err.code }), {
				status: err.status || 502
			});
		}

		const msg = err instanceof Error ? err.message : 'Trigger failed';
		return new Response(JSON.stringify({ error: msg }), { status: 502 });
	}
};
