import type { DashboardTab } from '../src/lib/config/schema';

export const tabs: DashboardTab[] = [
	{ id: 'home', label: 'Home', order: 0 },
	{ id: 'devices', label: 'Apparaten', order: 1 },
	{ id: 'overwerktimer', label: 'Overwerk timers', order: 2 }
];
