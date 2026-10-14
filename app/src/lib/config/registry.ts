import { devices } from '../../../config/devices';
import { apparaten } from '../../../config/apparaten';
import { advancedControls } from '../../../config/advanced';
import { triggers } from '../../../config/triggers';
import { tabs } from '../../../config/tabs';
import type { DashboardControl, DeviceInventoryEntry } from './schema';

export { tabs };
export const inventory: DeviceInventoryEntry[] = [
	{
		id: '90706948e37c',
		label: 'Color spare 051026',
		ip: '10.10.80.169',
		component: 'rgbcct',
		channel: 0
	}
];
export const controls: DashboardControl[] = [...devices, ...apparaten, ...advancedControls, ...triggers];
