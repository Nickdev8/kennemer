import type { DashboardControl } from './schema';
import { isDeviceCommandConfigured } from './device-validation';

export function toPublicControls(controls: DashboardControl[]): DashboardControl[] {
	return controls.map((control) => {
		if (control.controlType !== 'device') return structuredClone(control);
		return {
			...control,
			commands: Object.fromEntries(
				Object.entries(control.commands).map(([slot, command]) => {
					const { cloud: _cloud, lan: _lan, ...presentation } = command!;
					return [
						slot,
						{
							...presentation,
							configured: isDeviceCommandConfigured(control, slot as 'on' | 'off')
						}
					];
				})
			)
		};
	});
}
