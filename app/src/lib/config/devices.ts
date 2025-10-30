import type { ShellyDevice } from './schema';

export const devices: ShellyDevice[] = [
	{
		id: 'test',
		label: 'Nick Test Scene',
		group: 'Scene',
		commands: {
			on: {
				label: 'Scene On',
				cloud: {
					endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Scene Off',
				cloud: {
					endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	}
];
