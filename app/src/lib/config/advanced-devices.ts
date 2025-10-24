import type { ShellyDevice } from './schema';

// Populate this list with devices that should only be visible to advanced users.
export const advancedDevices: ShellyDevice[] = [
	// Example:
	{
		id: 'server-rack',
		label: 'Server Rack Power',
		group: 'Advanced',
		status: {
			parser: 'relay',
			cloud: {
				// expects: {"isok":true,"data":{"online":false}}
				endpoint: 'https://example.net/device/status',
				method: 'GET',
				payload: { id: 'deadbeef1234' },
				requiresAuthKey: true
			}
		},
		commands: {
			on: { label: 'Power On', cloud: { endpoint: 'https://example.net/device/on' } },
			off: { label: 'Power Off', cloud: { endpoint: 'https://example.net/device/off' } }
		}
	}
];







