export interface ShellyHttpTarget {
	endpoint: string;
	method?: 'GET' | 'POST';
	payload?: Record<string, unknown>;
	headers?: Record<string, string>;
	encoding?: 'form' | 'json';
	requiresAuthKey?: boolean;
}

export type ShellyTargetConfig = ShellyHttpTarget | ShellyHttpTarget[];

export type DeviceCommandKey = 'on' | 'off';
export type DeviceButtonMode = 'toggle' | 'dual' | 'single';

export interface ShellyDeviceCommand {
	label?: string;
	type?: string;
	typeBorder?: string;
	cloud?: ShellyTargetConfig;
	lan?: ShellyTargetConfig;
}

export interface ShellyDevice {
	id: string;
	label: string;
	group: string;
	buttonMode?: DeviceButtonMode;
	statusdeviceid?: string;
	stateless?: boolean;
	colorCapable?: boolean;
	commands: Partial<Record<DeviceCommandKey, ShellyDeviceCommand>>;
}

export interface ShellyTrigger {
	id: string;
	label: string;
	type?: string;
	typeBorder?: string;
	sceneId: string;
}
