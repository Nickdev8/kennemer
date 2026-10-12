import type {
	DashboardControl,
	ShellyDeviceCommand,
	ShellyDevice,
	ShellyHttpTarget
} from './schema';

export const defaultSceneEndpoint = 'https://shelly-115-eu.shelly.cloud/scene/manual_run';
export function sceneTarget(id: string, endpoint = defaultSceneEndpoint): ShellyHttpTarget {
	return { endpoint, method: 'POST', payload: { id }, requiresAuthKey: true };
}
export function sceneCommand(
	id: string,
	options: Omit<ShellyDeviceCommand, 'cloud'> = {}
): ShellyDeviceCommand {
	return { ...options, cloud: sceneTarget(id) };
}
type DeviceControl = Extract<DashboardControl, { controlType: 'device' }>;
export function sceneToggle(
	options: Omit<DeviceControl, 'commands' | 'controlType' | 'buttonMode' | 'type'> & {
		on: string;
		off: string;
		onColor?: string;
		offColor?: string;
		type?: string;
	}
): DeviceControl {
	const { on, off, onColor = 'green', offColor = 'white', type = 'Scene', ...metadata } = options;
	return {
		...metadata,
		type,
		controlType: 'device',
		buttonMode: 'toggle',
		commands: {
			on: sceneCommand(on, { label: 'Aan', color: onColor }),
			off: sceneCommand(off, { label: 'Uit', color: offColor })
		}
	};
}
export function sceneButton(
	options: Omit<DeviceControl, 'commands' | 'controlType' | 'buttonMode' | 'type'> & {
		sceneId: string;
		buttonLabel: string;
		color?: string;
		icon?: 'arrow-up';
	}
): DeviceControl {
	const { sceneId, buttonLabel, color, icon, ...metadata } = options;
	return {
		...metadata,
		controlType: 'device',
		type: 'Scene',
		buttonMode: 'single',
		stateless: true,
		commands: { on: sceneCommand(sceneId, { label: buttonLabel, color, icon }) }
	};
}
export function triggerDevice(
	id: string,
	label: string,
	sceneId: string,
	endpoint = defaultSceneEndpoint
): ShellyDevice {
	return {
		id,
		label,
		type: 'Trigger',
		stateless: true,
		commands: { on: { cloud: sceneTarget(sceneId, endpoint) } }
	};
}
