import type { ShellyDevice, ShellyTrigger } from '../src/lib/config/schema';

export const advancedDevices: ShellyDevice[] = [
	{
		id: 'advanced-placeholder-toggle',
		label: 'Aan / uit',
		type: 'Placeholder',
		buttonMode: 'toggle',
		commands: {
			on: { label: 'Aan' },
			off: { label: 'Uit' }
		}
	}
];

export const advancedTriggers: ShellyTrigger[] = [
	{
		id: 'advanced-scene-1789564319962',
		label: 'Scene 1789564319962',
		sceneId: '1789564319962'
	}
];
