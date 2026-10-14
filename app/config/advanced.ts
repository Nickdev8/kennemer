import { controlHelpers } from '../src/lib/config/control-presets';
import type { DashboardControl } from '../src/lib/config/schema';

const { sceneToggle } = controlHelpers({ placement: 'advanced', type: 'Advanced' });

export const advancedControls: DashboardControl[] = [
	sceneToggle({
		id: 'advanced-vacantie-begin',
		label: 'Vakantiemodus',
		pushNumber: 1,
		on: '1789564319962',
		off: '1789565464427',
		onColor: 'red'
	}),
	sceneToggle({
		id: 'winder-mode',
		label: 'Wintermodus',
		pushNumber: 2,
		on: '',
		off: '',
		onColor: 'red',
		enabled: false
	}),
	sceneToggle({
		id: 'zomer-mode',
		label: 'Zomermodus',
		pushNumber: 3,
		on: '',
		off: '',
		onColor: 'red',
		enabled: false
	})
];

export const advancedDevices = advancedControls.filter(
	(control): control is Extract<DashboardControl, { controlType: 'device' }> =>
		control.controlType === 'device'
);

export const advancedTriggers = advancedControls.filter(
	(control): control is Extract<DashboardControl, { controlType: 'trigger' }> =>
		control.controlType === 'trigger'
);

export const advancedTimedTriggers = advancedControls.filter(
	(control): control is Extract<DashboardControl, { controlType: 'timed-trigger' }> =>
		control.controlType === 'timed-trigger'
);
