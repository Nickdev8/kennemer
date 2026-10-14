import type { DashboardControl, DashboardTab } from './schema';
import { isDeviceCommandConfigured, isValidStatusDeviceId } from './device-validation';
import { resolveControlColor } from '../components/control-colors';

export function validateConfiguration(
	controls: DashboardControl[],
	tabs: DashboardTab[]
): string[] {
	const errors: string[] = [];
	const ids = new Set<string>();
	const tabIds = new Set<string>();
	for (const tab of tabs) {
		if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(tab.id) || tabIds.has(tab.id))
			errors.push(`Ongeldige of dubbele tab: ${tab.id}`);
		if (!tab.label.trim() || tab.label.length > 80 || !Number.isInteger(tab.order) || tab.order < 0)
			errors.push(`Ongeldige tabgegevens: ${tab.id}`);
		tabIds.add(tab.id);
	}
	if (!tabIds.has('home')) errors.push('De tab Home ontbreekt.');
	const occupied = new Set<string>();
	const home = new Set<number>();
	for (const control of controls) {
		if (!control.id || ids.has(control.id)) errors.push(`Dubbel of leeg control-ID: ${control.id}`);
		ids.add(control.id);
		if (!control.label.trim() || control.label.length > 120)
			errors.push(`Ongeldig label: ${control.id}`);
		if (control.placement === 'main') {
			const tab = control.tabId ?? 'home';
			if (!tabIds.has(tab)) errors.push(`Onbekende tab: ${control.id}`);
			const position = control.pushNumber;
			if (!Number.isInteger(position) || Number(position) < 1 || Number(position) > 99)
				errors.push(`Ongeldige positie: ${control.id}`);
			const key = `${tab}:${position}`;
			if (occupied.has(key)) errors.push(`Dubbele positie: ${key}`);
			occupied.add(key);
			if (tab === 'home' && position !== undefined) home.add(position);
		}
		if (control.placement === 'advanced') {
			const position = control.pushNumber;
			if (!Number.isInteger(position) || Number(position) < 1 || Number(position) > 99)
				errors.push(`Ongeldige geavanceerde positie: ${control.id}`);
			const key = `advanced:${position}`;
			if (occupied.has(key)) errors.push(`Dubbele positie: ${key}`);
			occupied.add(key);
		}
		if (
			'activeDurationMs' in control &&
			control.activeDurationMs !== undefined &&
			(!Number.isInteger(control.activeDurationMs) ||
				control.activeDurationMs <= 0 ||
				control.activeDurationMs > 86_400_000)
		)
			errors.push(`Ongeldige tijdsduur: ${control.id}`);
		const colors =
			control.controlType === 'device'
				? Object.values(control.commands).map((command) => command?.color)
				: [control.color];
		if (colors.some((color) => color !== undefined && !resolveControlColor(color)))
			errors.push(`Ongeldige kleur: ${control.id}`);
		if (control.controlType === 'device') {
			if (control.statusdeviceid && !isValidStatusDeviceId(control.statusdeviceid))
				errors.push(`Ongeldig status-ID: ${control.id}`);
			if (control.enabled !== false) {
				const required =
					control.buttonMode === 'single' ? (['on'] as const) : (['on', 'off'] as const);
				if (required.some((slot) => !isDeviceCommandConfigured(control, slot)))
					errors.push(`Actie ontbreekt: ${control.id}`);
			}
		} else if (
			control.enabled !== false &&
			(!/^\d{1,32}$/.test(control.sceneId) || /^0+$/.test(control.sceneId))
		)
			errors.push(`Scène-ID ontbreekt of ongeldig: ${control.id}`);
	}
	if (home.size !== 9 || Array.from({ length: 9 }, (_, i) => i + 1).some((n) => !home.has(n)))
		errors.push('Home moet precies de posities 1–9 bevatten.');
	return errors;
}
