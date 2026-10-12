import type { RequestHandler } from './$types';
import type { DashboardControl } from '$lib/config/schema';
import { readEffectiveControls } from '$lib/server/scene-config-store';
import { readActiveTimedTriggers } from '$lib/server/timed-trigger-store';

export const GET: RequestHandler = async () => {
	const controls = await readEffectiveControls();
	const timedTriggers = controls.filter(
		(control): control is Extract<DashboardControl, { controlType: 'timed-trigger' }> =>
			control.controlType === 'timed-trigger'
	);
	const activeUntilById = await readActiveTimedTriggers(
		new Set(timedTriggers.map((trigger) => trigger.id))
	);
	return new Response(JSON.stringify({ ok: true, activeUntilById }), {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};
