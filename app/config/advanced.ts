import { env } from '$env/dynamic/public';
import type { DashboardControl } from '../src/lib/config/schema';

const shellySceneEndpoint =
	env.PUBLIC_SHELLY_SCENE_ENDPOINT ?? 'https://shelly-115-eu.shelly.cloud/scene/manual_run';

export const advancedControls: DashboardControl[] = [
	{
		controlType: 'device',
		placement: 'advanced',
		id: 'advanced-vacantie-begin',
		label: 'Vakantie mode',
		type: 'Advanced',
		buttonMode: 'toggle',
		commands: {
				on: {
				label: 'Status: Aan',
				color: 'red',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789564319962' },
					requiresAuthKey: true
				}
			},
				off: {
				label: 'Status: Uit',
				color: 'white',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789565464427' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		controlType: 'timed-trigger',
		placement: 'advanced',
		id: 'Overwerktimer-1',
		label: 'Overwerktimer Hoofdgebouw',
		color: 'orange',
		buttonLabel: 'Start timer',
		activeDurationMs: 14_400_000,
		sceneId: '1789568539275'
	},
	{
		controlType: 'timed-trigger',
		placement: 'advanced',
		id: 'Overwerktimer-2',
		label: 'Overwerktimer Nieuwbouw',
		color: 'orange',
		buttonLabel: 'Start timer',
		activeDurationMs: 14_400_000,
		sceneId: '1789568549892'
	},
	{
		controlType: 'timed-trigger',
		placement: 'advanced',
		id: 'Overwerktimer-3',
		label: 'Overwerktimer Kopje',
		color: 'orange',
		buttonLabel: 'Start timer',
		activeDurationMs: 14_400_000,
		sceneId: '1789568570313'
	},
	{
		controlType: 'trigger',
		placement: 'advanced',
		id: 'winder-mode',
		label: 'Winder Mode',
		color: 'purple',
		sceneId: '0000'
	},
	{
		controlType: 'trigger',
		placement: 'advanced',
		id: 'zomer-mode',
		label: 'Zomer Mode',
		color: 'blue',
		sceneId: '0000'
	}
];

export const advancedDevices = advancedControls.filter(
	(control): control is Extract<DashboardControl, { controlType: 'device' }> =>
		control.controlType === 'device'
);

export const advancedTriggers = advancedControls.filter(
	(control): control is Extract<DashboardControl, { controlType: 'trigger' }> =>
		control.controlType === 'trigger'
);

export const advancedTimedTriggers = advancedControls.filter(
	(control): control is Extract<DashboardControl, { controlType: 'timed-trigger' }> =>
		control.controlType === 'timed-trigger'
);
