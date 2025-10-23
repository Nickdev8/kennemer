import type { ShellyDevice } from './schema';

export const devices: ShellyDevice[] = [
	{
		id: 'scene',
		label: 'Scene',
		group: 'Scene',
		status: {
			parser: 'relay',
			cloud: {
				endpoint: 'https://shelly-115-eu.shelly.cloud/device/status',
				method: 'GET',
				payload: { id: '8cbfea9bc6d0' }
			},
			lan: {
				endpoint: 'http://shelly-relay.local/rpc/Switch.GetStatus',
				encoding: 'json',
				requiresAuthKey: false,
				method: 'POST',
				payload: { id: 0 }
			}
		},
		commands: {
			on: {
				label: 'Scene On',
				cloud: {
					endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
					payload: { id: '1727329580882' }
				},
				lan: {
					endpoint: 'http://shelly-scene-device.local/rpc/Group.On',
					method: 'POST',
					encoding: 'json',
					requiresAuthKey: false,
					payload: { id: 1 }
				}
			},
			off: {
				label: 'Scene Off',
				cloud: {
					endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
					payload: { id: '1730105330475' }
				},
				lan: {
					endpoint: 'http://shelly-scene-device.local/rpc/Group.Off',
					method: 'POST',
					encoding: 'json',
					requiresAuthKey: false,
					payload: { id: 2 }
				}
			}
		}
	},
	{
		id: 'relay',
		label: 'Lights',
		group: 'Relay',
		status: {
			parser: 'relay',
			cloud: {
				endpoint: 'https://shelly-115-eu.shelly.cloud/device/status',
				method: 'GET',
				payload: { id: '8cbfea9bc6d0' }
			},
			lan: {
				endpoint: 'http://shelly-relay.local/rpc/Switch.GetStatus',
				encoding: 'json',
				requiresAuthKey: false,
				method: 'POST',
				payload: { id: 0 }
			}
		},
		commands: {
			on: {
				label: 'Relay On',
				cloud: {
					endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
					payload: { id: '8cbfea9bc6d0', turn: 'on', channel: 0 }
				},
				lan: {
					endpoint: 'http://shelly-relay.local/rpc/Switch.Set',
					encoding: 'json',
					requiresAuthKey: false,
					payload: { id: 0, on: true }
				}
			},
			off: {
				label: 'Relay Off',
				cloud: {
					endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
					payload: { id: '8cbfea9bc6d0', turn: 'off', channel: 0 }
				},
				lan: {
					endpoint: 'http://shelly-relay.local/rpc/Switch.Set',
					encoding: 'json',
					requiresAuthKey: false,
					payload: { id: 0, on: false }
				}
			}
		}
	}
];
