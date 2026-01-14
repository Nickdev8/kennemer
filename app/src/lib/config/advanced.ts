import { env } from '$env/dynamic/public';
import type { ShellyDevice, ShellyDeviceCommand, ShellyTrigger } from './schema';

const shellyRelayEndpoint =
	env.PUBLIC_SHELLY_RELAY_ENDPOINT ??
	'https://shelly-115-eu.shelly.cloud/device/relay/control';

const buildRelayCommand = (
	deviceId: string,
	turn: 'on' | 'off',
	label: string
): ShellyDeviceCommand => ({
	label,
	cloud: {
		endpoint: shellyRelayEndpoint,
		method: 'POST',
		payload: { id: deviceId, channel: 0, turn },
		requiresAuthKey: true
	}
});

const buildSwitchDevice = ({
	id,
	label,
	group,
	colorCapable = false
}: {
	id: string;
	label: string;
	group: string;
	colorCapable?: boolean;
}): ShellyDevice => ({
	id,
	label,
	group,
	colorCapable,
	commands: {
		on: buildRelayCommand(id, 'on', 'Aan'),
		off: buildRelayCommand(id, 'off', 'Uit')
	}
});

// Populate this list with devices that should only be visible to advanced users.
export const advancedDevices: ShellyDevice[] = [
	buildSwitchDevice({ id: 'voordeur', label: 'Voordeur', group: 'Techniek' }),
	buildSwitchDevice({
		id: 'licht-poort-hfd',
		label: 'Licht poort Hfd',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'licht-pannenkoek',
		label: 'Licht pannenkoek',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'licht-onder-kap-plein-1-2',
		label: 'Licht onder kap plein 1/2',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'sportveld-led',
		label: 'Sportveld Led',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'ledstrip-overkapping-plein-3',
		label: 'Ledstrip overkapping plein <3',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'garderobe-nb',
		label: 'Garderobe NB',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'groen-achter-kopje-ketelhuis',
		label: 'Groen achter kopje ketelhuis',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'groen-voor-kopje-magazijn',
		label: 'Groen voor kopje magazijn',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'cv-licht',
		label: '3) Cv licht',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({
		id: 'hek-groen',
		label: 'Hek groen',
		group: 'Licht techniek',
		colorCapable: true
	}),
	buildSwitchDevice({ id: 'gedenklicht', label: 'Gedenklicht', group: 'Power socket' }),
	buildSwitchDevice({ id: 'wcd-hek-2', label: 'Wcd hek >2', group: 'Power socket' }),
	buildSwitchDevice({
		id: 'wcd-buiten-magazijn',
		label: 'Wcd buiten magazijn',
		group: 'Power socket'
	})
];

export const advancedTriggers: ShellyTrigger[] = [
	{
		id: 'licht-techniek-paars',
		label: 'Alles paars',
		sceneId: '1763038295754',
		type: '#7c3aed'
	},
	{
		id: 'licht-techniek-wit',
		label: 'Alles wit',
		sceneId: '1763040330000',
		type: '#ffffff',
		typeBorder: '#d0d7e2'
	}
];
