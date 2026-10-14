import { controlHelpers } from '../src/lib/config/control-presets';
import type { DashboardControl } from '../src/lib/config/schema';

const { directDevice, sceneTrigger, sceneDualButton } = controlHelpers({
	placement: 'main',
	tabId: 'devices'
});

export const devices: DashboardControl[] = [
	sceneDualButton({
		id: 'gangcolorgroup',
		label: 'Gang Color',
		pushNumber: 1,
		on: '1791985205549',
		off: '1791985208675',
		offColor: 'red'
	}),
	sceneTrigger({
		id: 'gangcolor-830',
		label: 'Gang Color 830',
		pushNumber: 2,
		sceneId: '1763040330000',
		color: '#f4c27a'
	}),
	sceneTrigger({
		id: 'gangcolor-865',
		label: 'Gang Color 865',
		pushNumber: 3,
		sceneId: '1791981097936',
		color: '#b9d9f5'
	}),
	sceneTrigger({
		id: 'gangcolor-paars',
		label: 'Gang Color Paars',
		pushNumber: 4,
		sceneId: '1763038295754',
		color: 'purple'
	}),
	directDevice({
		id: 'nb-gangdeel',
		label: 'NB gangdeel',
		pushNumber: 5,
		directDeviceId: '2805a5ca1d18_0'
	}),
	directDevice({
		id: 'aula-ring-buiten',
		label: 'Aula ring buiten',
		pushNumber: 6,
		directDeviceId: '2805a5ca1d18_1'
	}),
	directDevice({
		id: 'vide-boven',
		label: 'Vide boven',
		pushNumber: 7,
		directDeviceId: '2805a5ca1d18_2'
	}),
	directDevice({
		id: 'locker-vide',
		label: 'Locker vide',
		pushNumber: 8,
		directDeviceId: '2805a5ca1d18_3'
	}),
	directDevice({
		id: 'koof-licht',
		label: 'Koof licht',
		pushNumber: 9,
		directDeviceId: '2805a5ca1d18_0'
	}),
	directDevice({
		id: 'vide-onderkant',
		label: 'Vide onderkant',
		pushNumber: 10,
		directDeviceId: '2805a5ca1d18_1'
	}),
	directDevice({
		id: 'aula-ring-binnen',
		label: 'Aula Ring binnen',
		pushNumber: 11,
		directDeviceId: '2805a5ca1d18_2'
	}),
	directDevice({
		id: 'locker-hoog',
		label: 'Locker hoog',
		pushNumber: 12,
		directDeviceId: '2cbcbb2d8954_1'
	}),
	directDevice({
		id: 'licht-gang-partere-scheikunde',
		label: 'Licht gang partere Scheikunde',
		pushNumber: 13,
		directDeviceId: '083af27caf6c_3'
	}),
	directDevice({
		id: 'licht-gang-partere-bio',
		label: 'Licht gang partere Bio',
		pushNumber: 14,
		directDeviceId: '80646fc7f844_0'
	}),
	directDevice({
		id: 'dakraam-licht',
		label: 'Dakraam licht',
		pushNumber: 15,
		directDeviceId: '78ee4cd5bfac_0'
	}),
	directDevice({
		id: 'licht-gang-rechts-1-ste',
		label: 'Licht gang rechts 1 ste',
		pushNumber: 16,
		directDeviceId: 'ec62608c4d08_0'
	}),
	directDevice({
		id: 'licht-gang-links-1ste',
		label: 'Licht gang links 1ste',
		pushNumber: 17,
		directDeviceId: '80646fdb0d1c'
	}),
	directDevice({
		id: 'gedenklicht',
		label: 'Gedenklicht',
		pushNumber: 18,
		directDeviceId: 'b0b21c1a7c28'
	})
];
