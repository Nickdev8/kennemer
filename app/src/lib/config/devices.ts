import type { ShellyDevice } from './schema';

export const devices: ShellyDevice[] = [
	{
		id: 'test1',
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
	},
		{
		id: 'test2',
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
	},
		{
		id: 'test3',
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
	},
		{
		id: 'test4',
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
	},
		{
		id: 'test5',
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
	},
		{
		id: 'test6',
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
