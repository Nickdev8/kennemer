import type { ShellyDevice } from './schema';

const shellySceneEndpoint = 'https://shelly-115-eu.shelly.cloud/scene/manual_run';

export const gangColorDevice: ShellyDevice = {
	id: 'gang-color',
	label: 'Gang kleur',
	group: 'Advanced',
	commands: {
		on: {
			label: 'Gang paars',
			type: '#7c3aed',
			cloud: {
				endpoint: shellySceneEndpoint,
				method: 'POST',
				payload: { id: 1763038295754, channel: 0, turn: 'on' },
				requiresAuthKey: true
			}
		},
		off: {
			label: 'Gang wit',
			type: '#ffffff',
			typeBorder: '#d0d7e2',
			cloud: {
				endpoint: shellySceneEndpoint,
				method: 'POST',
				payload: { id: 1763040330000, channel: 0, turn: 'on' },
				requiresAuthKey: true
			}
		}
	}
};

export const devices: ShellyDevice[] = [
	{
		id: 'test1',
		label: 'Nicks Test Scene',
		group: 'Scene',
		commands: {
			on: {
				label: 'Lamp aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Lamp uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'gang',
		label: 'Gang',
		group: 'Scene',
		commands: {
			on: {
				label: 'Gang aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1727329580882', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Gang uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1730105330475', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	}
];
