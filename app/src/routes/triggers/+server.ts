import { triggerDevice } from '$lib/config/control-helpers';
import type { RequestHandler } from './$types';
import { sendDeviceCommand, ShellyHttpError } from '$lib/server/shelly-http';
import { readEffectiveControls } from '$lib/server/scene-config-store';
import type { DashboardControl } from '$lib/config/schema';

type TriggerRequest = {
	triggerId?: string;
};

export const POST: RequestHandler = async ({ request, fetch, url }) => {
	const { triggerId }: TriggerRequest = await request.json();

	if (!triggerId) {
		return new Response(JSON.stringify({ error: 'Ongeldige actie.' }), {
			status: 400
		});
	}

	const trigger = (await readEffectiveControls()).find(
		(item): item is Exclude<DashboardControl, { controlType: 'device' }> =>
			item.controlType !== 'device' && item.id === triggerId
	);

	if (!trigger) {
		return new Response(JSON.stringify({ error: 'Onbekende actie.' }), { status: 404 });
	}

	if (trigger.enabled === false || !trigger.sceneId?.trim() || /^0+$/.test(trigger.sceneId)) {
		return new Response(JSON.stringify({ error: 'Actie niet ingesteld: scène-ID ontbreekt' }), {
			status: 409,
			headers: { 'content-type': 'application/json' }
		});
	}

	try {
		const sceneDevice = triggerDevice(`trigger-${trigger.id}`, trigger.label, trigger.sceneId);
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

		const msg = err instanceof Error ? err.message : 'Actie mislukt.';
		return new Response(JSON.stringify({ error: msg }), { status: 502 });
	}
};
