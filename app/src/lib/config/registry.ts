import { devices } from '../../../config/devices';
import { advancedControls } from '../../../config/advanced';
import { triggers } from '../../../config/triggers';
import type { DashboardControl, DashboardTab, DeviceInventoryEntry } from './schema';

export const tabs: DashboardTab[] = [
	{ id: 'home', label: 'Home', order: 0 },
	{ id: 'devices', label: 'Apparaten', order: 1 }
];
export const inventory: DeviceInventoryEntry[] = [
	{
		id: '90706948e37c',
		label: 'Color spare 051026',
		ip: '10.10.80.169',
		component: 'rgbcct',
		channel: 0
	}
];
export const controls: DashboardControl[] = [
	...devices,
	...advancedControls,
	...triggers,
	{
		id: 'color-spare-051026',
		label: 'Color spare 051026',
		controlType: 'device',
		placement: 'main',
		tabId: 'devices',
		pushNumber: 1,
		type: 'Direct',
		buttonMode: 'toggle',
		directDeviceId: '90706948e37c',
		statusdeviceid: '90706948e37c',
		enabled: true,
		commands: {
			on: { label: 'Aan', color: 'green', configured: true },
			off: { label: 'Uit', color: 'white', configured: true }
		}
	}
];
