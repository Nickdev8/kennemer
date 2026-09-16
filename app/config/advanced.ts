import { env } from '$env/dynamic/public';
import type { ShellyDevice, ShellyTrigger } from '../src/lib/config/schema';

const shellySceneEndpoint =
	env.PUBLIC_SHELLY_SCENE_ENDPOINT ?? 'https://shelly-115-eu.shelly.cloud/scene/manual_run';

export const advancedDevices: ShellyDevice[] = [
	{
		id: 'advanced-vacantie-begin',
		label: 'Vakantie mode',
		type: 'Advanced',
		buttonMode: 'toggle',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789564319962' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789565464427' },
					requiresAuthKey: true
				}
			}
		}
	}
];

export const advancedTriggers: ShellyTrigger[] = [
	{
		id: 'Overwerktimer-1',
		label: 'Overwerktimer Hoofdgebouw',
		buttonLabel: 'Start timer',
		activeDurationMs: 3_600_000,
		sceneId: '1789568539275',
		type: 'off'
	},
	{
		id: 'Overwerktimer-2',
		label: 'Overwerktimer Nieuwbouw',
		buttonLabel: 'Start timer',
		activeDurationMs: 3_600_000,
		sceneId: '1789568549892',
		type: 'off'
	},
	{
		id: 'Overwerktimer-3',
		label: 'Overwerktimer Kopje',
		buttonLabel: 'Start timer',
		activeDurationMs: 3_600_000,
		sceneId: '1789568570313',
		type: 'off'
	}
];
