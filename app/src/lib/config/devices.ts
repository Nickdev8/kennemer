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
				payload: { id: '8cbfea9bc6d0' },
				requiresAuthKey: true
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
					payload: { id: '1727329580882' },
					requiresAuthKey: true
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
					payload: { id: '1730105330475' },
					requiresAuthKey: true
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
		label: 'Wall Display Relay',
		group: 'Relay',
		status: {
			parser: 'relay',
			cloud: {
				endpoint: 'https://shelly-115-eu.shelly.cloud/device/status',
				method: 'GET',
				payload: { id: '000822f8a245' },
				requiresAuthKey: true
			},
			lan: {
				endpoint: 'http://10.10.80.133/rpc/Switch.GetStatus',
				method: 'GET',
				requiresAuthKey: false,
				payload: { id: 0 }
			}
		},
		commands: {
			on: {
				label: 'Relay On',
				cloud: {
					endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
					method: 'POST',
					payload: { id: '000822f8a245', channel: 0, turn: 'on' },
					requiresAuthKey: true
				},
				lan: {
					endpoint: 'http://10.10.80.133/rpc/Switch.Set',
					method: 'GET',
					requiresAuthKey: false,
					payload: { id: 0, on: 1 }
				}
			},
			off: {
				label: 'Relay Off',
				cloud: {
					endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
					method: 'POST',
					payload: { id: '000822f8a245', channel: 0, turn: 'off' },
					requiresAuthKey: true
				},
				lan: {
					endpoint: 'http://10.10.80.133/rpc/Switch.Set',
					method: 'GET',
					requiresAuthKey: false,
					payload: { id: 0, on: 0 }
				}
			}
		}
	}
];
