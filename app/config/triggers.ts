import type { DashboardControl } from '../src/lib/config/schema';

// Global actions stay separate because they can have page-specific confirmation.
export const triggers: Array<Extract<DashboardControl, { controlType: 'trigger' }>> = [
	{
		controlType: 'trigger',
		placement: 'energy',
		id: 'energy-devices-scene',
		label: 'ALLES UIT',
		color: 'red',
		sceneId: '1730105330475'
	}
];

export const energyDevicesTrigger = triggers[0];
