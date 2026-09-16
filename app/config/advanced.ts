import { env } from '$env/dynamic/public';
import type { ShellyDevice, ShellyTrigger } from '../src/lib/config/schema';

const shellySceneEndpoint =
	env.PUBLIC_SHELLY_SCENE_ENDPOINT ?? 'https://shelly-115-eu.shelly.cloud/scene/manual_run';

export const advancedDevices: ShellyDevice[] = [
	{
		id: 'advanced-vacantie-begin',
		label: 'Vacantie begin',
		type: 'Scene',
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

export const advancedTriggers: ShellyTrigger[] = [];
