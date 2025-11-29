import type { ShellyDevice } from './schema';

export const devices: ShellyDevice[] = [
	{
		id: 'test1',
		label: 'Test Scene 1',
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
	},
		{
		id: 'test2',
		label: 'Test Scene 2',
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
	},
		{
		id: 'test3',
		label: 'Test Scene 3',
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
	},
		{
		id: 'test4',
		label: 'Test Scene 4',
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
	},
		{
		id: 'test5',
		label: 'Test Scene 5',
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
	},
		{
		id: 'test6',
		label: 'Test Scene 6',
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
