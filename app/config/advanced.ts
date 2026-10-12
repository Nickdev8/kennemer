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
	{
		controlType: 'timed-trigger',
		placement: 'advanced',
		id: 'Overwerktimer-1',
		label: 'Overwerktimer Hoofdgebouw',
		color: 'orange',
		buttonLabel: 'Start timer',
		activeDurationMs: 14_400_000,
		sceneId: '1789568539275'
	},
	{
		controlType: 'timed-trigger',
		placement: 'advanced',
		id: 'Overwerktimer-2',
		label: 'Overwerktimer Nieuwbouw',
		color: 'orange',
		buttonLabel: 'Start timer',
		activeDurationMs: 14_400_000,
		sceneId: '1789568549892'
	},
	{
		controlType: 'timed-trigger',
		placement: 'advanced',
		id: 'Overwerktimer-3',
		label: 'Overwerktimer Kopje',
		color: 'orange',
		buttonLabel: 'Start timer',
		activeDurationMs: 14_400_000,
		sceneId: '1789568570313'
	},
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
