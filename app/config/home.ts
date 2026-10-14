import { controlHelpers } from '../src/lib/config/control-presets';
import type { DashboardControl } from '../src/lib/config/schema';

const { sceneToggle, sceneButton, timedTrigger } = controlHelpers({
	placement: 'main',
	tabId: 'home'
});

export const home: DashboardControl[] = [
	sceneToggle({
		id: 'push-1',
		label: '1ste etage',
		pushNumber: 1,
		statusdeviceid: '8813bfd6d300_1',
		on: '1789560412180',
		off: '1789560433138'
	}),
	sceneToggle({
		id: 'scene-1ste',
		label: '1ste',
		pushNumber: 2,
		statusdeviceid: '30c92276c1d4_0',
		on: '1789560339941',
		off: '1789560362113'
	}),
	sceneToggle({
		id: 'scene-parterre',
		label: 'Parterre',
		pushNumber: 3,
		statusdeviceid: '30c92276c1d4_1',
		on: '1789560289492',
		off: '1789560313748'
	}),
	sceneToggle({
		id: 'scene-aula-plafond',
		label: 'Aula plafond',
		pushNumber: 4,
		statusdeviceid: '8813bfd6d300_0',
		on: '1789560234895',
		off: '1789560262228'
	}),
	sceneButton({
		id: 'scene-screen-lokalen',
		label: 'Screen lokalen',
		pushNumber: 5,
		sceneId: '1781189778293',
		buttonLabel: 'Schermen omhoog',
		color: 'blue',
		icon: 'arrow-up',
		activeDurationMs: 60_000
	}),
	sceneToggle({
		id: 'scene-aula-vide',
		label: 'Aula vide',
		pushNumber: 6,
		statusdeviceid: '2cbcbb3d9af0_0',
		on: '1789560154701',
		off: '1789560202028'
	}),
	sceneToggle({
		id: 'scene-gang-entree',
		label: 'Gang + entree',
		pushNumber: 7,
		statusdeviceid: '2043a80ac3e4_0',
		on: '1789559627914',
		off: '1789559664484'
	}),
	sceneToggle({
		id: 'scene-kantine',
		label: 'Kantine',
		pushNumber: 8,
		statusdeviceid: '2043a80ac3e4_1',
		on: '1789559514915',
		off: '1789559559159'
	}),
	sceneToggle({
		id: 'scene-kopje-gang',
		label: 'Kopje',
		pushNumber: 9,
		statusdeviceid: '2cbcbb3d9af0_1',
		on: '1789557426197',
		off: '1789557375466'
	}),

	timedTrigger({
		pushNumber: 1,
		id: 'Overwerktimer-1',
		label: 'Overwerktimer Hoofdgebouw',
		sceneId: '1789568539275'
	}),
	timedTrigger({
		pushNumber: 2,
		id: 'Overwerktimer-2',
		label: 'Overwerktimer Nieuwbouw',
		sceneId: '1789568549892'
	}),
	timedTrigger({
		pushNumber: 3,
		id: 'Overwerktimer-3',
		label: 'Overwerktimer Kopje',
		sceneId: '1789568570313'
	})
];
