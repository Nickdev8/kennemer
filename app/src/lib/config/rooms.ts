import type { ShellyHttpTarget } from './schema';

export interface RoomWattageConfig {
	id: string;
	label: string;
	sources: ShellyHttpTarget[];
}

export const roomWattageConfigs: RoomWattageConfig[] = [
	{
		id: 'example-room',
		label: 'Example Room',
		sources: [
			{
				endpoint: 'https://shelly-115-eu.shelly.cloud/device/status',
				method: 'GET',
				payload: { id: 'replace-with-device-id' },
				requiresAuthKey: true
			}
		]
	}
];
