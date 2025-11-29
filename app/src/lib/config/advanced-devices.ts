import type { ShellyDevice } from './schema';

// Populate this list with devices that should only be visible to advanced users.
export const advancedDevices: ShellyDevice[] = [
	// Example:
	{
		id: 'advenced 1',
		label: 'Example geavanceerd 1',
		group: 'Advanced',
		commands: {
			on: { label: 'Power On', cloud: { endpoint: 'https://example.net/device/on' } },
			off: { label: 'Power Off', cloud: { endpoint: 'https://example.net/device/off' } }
		}
	}
];






