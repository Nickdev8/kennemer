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
	icon?: 'arrow-up';
	type?: string;
	typeBorder?: string;
	cloud?: ShellyTargetConfig;
	lan?: ShellyTargetConfig;
}

export interface ShellyDevice {
	id: string;
	label: string;
	type: string;
	pushNumber?: number;
	buttonMode?: DeviceButtonMode;
	statusdeviceid?: string;
	stateless?: boolean;
	activeDurationMs?: number;
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

export interface TimedShellyTrigger extends ShellyTrigger {
	buttonLabel: string;
	activeDurationMs: number;
}
