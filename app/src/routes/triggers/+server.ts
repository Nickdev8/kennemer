import { triggerDevice } from '$lib/config/control-helpers';
import type { RequestHandler } from './$types';
import { sendDeviceCommand, ShellyHttpError } from '$lib/server/shelly-http';
import { readEffectiveControls } from '$lib/server/scene-config-store';
import { recordAuditEvent } from '$lib/server/audit-log';
import { saveTimedTrigger } from '$lib/server/timed-trigger-store';
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

	const actionTimestamp = new Date();
	try {
		const sceneDevice = triggerDevice(`trigger-${trigger.id}`, trigger.label, trigger.sceneId);
		await sendDeviceCommand(sceneDevice, 'on');
		const durationMs =
			trigger.controlType === 'timed-trigger' && Number.isFinite(trigger.activeDurationMs)
				? Math.max(0, Number(trigger.activeDurationMs))
				: 0;
		const activeUntil = durationMs > 0 ? Date.now() + durationMs : undefined;
		let timerStatePersisted = true;
		if (activeUntil !== undefined) {
			try {
				await saveTimedTrigger(trigger.id, activeUntil);
			} catch {
				timerStatePersisted = false;
				console.error(`[timer] Timer started but its state could not be saved (${trigger.id}).`);
			}
		}
		await recordAuditEvent(
			activeUntil === undefined ? 'control.triggered' : 'timer.started',
			{
				controlId: trigger.id,
				label: trigger.label,
				outcome: 'succeeded',
				...(activeUntil === undefined ? {} : { durationMs, activeUntil })
			},
			actionTimestamp
		);
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
		return new Response(JSON.stringify({ ok: true, activeUntil, timerStatePersisted }));
	} catch (err) {
		await recordAuditEvent(
			'control.triggered',
			{
				controlId: trigger.id,
				label: trigger.label,
				outcome: 'failed'
			},
			actionTimestamp
		);
		if (err instanceof ShellyHttpError) {
			return new Response(JSON.stringify({ error: err.message, errorCode: err.code }), {
				status: err.status || 502
			});
		}

		const msg = err instanceof Error ? err.message : 'Actie mislukt.';
		return new Response(JSON.stringify({ error: msg }), { status: 502 });
	}
};
