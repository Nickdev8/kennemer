import type { DashboardControl } from '../config/schema.ts';

export interface ControlGroup {
	id: string;
	controls: DashboardControl[];
	wide: boolean;
}

const gangIds = ['gangcolorgroup', 'gangcolor-830', 'gangcolor-865', 'gangcolor-paars'];

/** Group only co-located registered controls; editor moves remain effective. */
export function controlPages(controls: DashboardControl[], tab: string): ControlGroup[][] {
	const gang = gangIds.map((id) => controls.find((control) => control.id === id));
	const grouped = tab === 'devices' && gang.every(Boolean);
	const entries: ControlGroup[] = controls
		.filter((control) => !grouped || !gangIds.includes(control.id))
		.map((control) => ({ id: control.id, controls: [control], wide: false }));
	if (grouped)
		entries.unshift({ id: 'gang-color', controls: gang as DashboardControl[], wide: true });
	if (tab !== 'devices') return [entries];
	const pages: ControlGroup[][] = [[]];
	let used = 0;
	for (const entry of entries) {
		const slots = entry.wide ? 3 : 1;
		if (used + slots > 9) {
			pages.push([]);
			used = 0;
		}
		pages[pages.length - 1].push(entry);
		used += slots;
	}
	return pages;
}
