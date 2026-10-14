import { sceneDualButton } from '../src/lib/config/control-helpers';
import type { DashboardControl, ShellyDevice, ShellyTrigger } from '../src/lib/config/schema';

const tabId = 'devices';

function directDevice(
	id: string,
	label: string,
	pushNumber: number,
	directDeviceId: string
): ShellyDevice & { controlType: 'device'; placement: 'main' } {
	return {
		id,
		label,
		pushNumber,
		directDeviceId,
		statusdeviceid: directDeviceId,
		tabId,
		controlType: 'device',
		placement: 'main',
		type: 'Direct',
		buttonMode: 'toggle',
		commands: {
			on: { label: 'Aan', color: 'green', configured: true },
			off: { label: 'Uit', color: 'white', configured: true }
		}
	};
}

function sceneTrigger(
	id: string,
	label: string,
	pushNumber: number,
	sceneId: string,
	color: string
): ShellyTrigger & { controlType: 'trigger'; placement: 'main' } {
	return { id, label, pushNumber, sceneId, color, tabId, controlType: 'trigger', placement: 'main' };
}

export const apparaten: DashboardControl[] = [
	sceneDualButton({
		id: 'gangcolorgroup',
		label: 'Gang Color',
		placement: 'main',
		tabId,
		pushNumber: 1,
		on: '1791985205549',
		off: '1791985208675',
		onColor: 'green',
		offColor: 'red'
	}),
	sceneTrigger('gangcolor-830', 'Gang Color 830', 2, '1763040330000', '#f4c27a'),
	sceneTrigger('gangcolor-865', 'Gang Color 865', 3, '1791981097936', '#b9d9f5'),
	sceneTrigger('gangcolor-paars', 'Gang Color Paars', 4, '1763038295754', 'purple'),
	directDevice('nb-gangdeel', 'NB gangdeel', 5, '2805a5ca1d18_0'),
	directDevice('aula-ring-buiten', 'Aula ring buiten', 6, '2805a5ca1d18_1'),
	directDevice('vide-boven', 'Vide boven', 7, '2805a5ca1d18_2'),
	directDevice('locker-vide', 'Locker vide', 8, '2805a5ca1d18_3'),
	directDevice('koof-licht', 'Koof licht', 9, '2805a5ca1d18_0'),
	directDevice('vide-onderkant', 'Vide onderkant', 10, '2805a5ca1d18_1'),
	directDevice('aula-ring-binnen', 'Aula Ring binnen', 11, '2805a5ca1d18_2'),
	directDevice('locker-hoog', 'Locker hoog', 12, '2cbcbb2d8954_1'),
	directDevice('licht-gang-partere-scheikunde', 'Licht gang partere Scheikunde', 13, '083af27caf6c_3'),
	directDevice('licht-gang-partere-bio', 'Licht gang partere Bio', 14, '80646fc7f844_0'),
	directDevice('dakraam-licht', 'Dakraam licht', 15, '78ee4cd5bfac_0'),
	directDevice('licht-gang-rechts-1-ste', 'Licht gang rechts 1 ste', 16, 'ec62608c4d08_0'),
	directDevice('licht-gang-links-1ste', 'Licht gang links 1ste', 17, '80646fdb0d1c'),
	directDevice('gedenklicht', 'Gedenklicht', 18, 'b0b21c1a7c28')
];
