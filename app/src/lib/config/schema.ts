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

export interface ShellyDeviceCommand {
	label?: string;
	cloud?: ShellyTargetConfig;
	lan?: ShellyTargetConfig;
}

export interface ShellyDevice {
	id: string;
	label: string;
	group: string;
	commands: Record<DeviceCommandKey, ShellyDeviceCommand>;
}
