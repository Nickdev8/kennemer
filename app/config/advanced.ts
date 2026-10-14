import { sceneToggle } from '../src/lib/config/control-helpers';
import type { DashboardControl } from '../src/lib/config/schema';

export const advancedControls: DashboardControl[] = [
	sceneToggle({
		id: 'advanced-vacantie-begin',
		label: 'Vakantiemodus',
		placement: 'advanced',
		type: 'Advanced',
		on: '1789564319962',
		off: '1789565464427',
		onColor: 'red'
	}),
	sceneToggle({
		id: 'winder-mode',
		label: 'Wintermodus',
		placement: 'advanced',
		type: 'Advanced',
		on: '',
		off: '',
		onColor: 'red',
		enabled: false
	}),
	sceneToggle({
		id: 'zomer-mode',
		label: 'Zomermodus',
		placement: 'advanced',
		type: 'Advanced',
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
