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
	/**
	 * Optional visual hint for the button:
	 * - 'on' / 'off' forces the green/red styles
	 * - 'none' shows a neutral button
	 * - a hex color (e.g. '#7c3aed') paints the button with that color
	 */
	type?: string;
	/**
	 * Optional hex color for the border when using a custom hex `type`.
	 * Falls back to the `type` color if omitted.
	 */
	typeBorder?: string;
	cloud?: ShellyTargetConfig;
	lan?: ShellyTargetConfig;
}

export interface ShellyDevice {
	id: string;
	label: string;
	group: string;
	/**
	 * Controls whether the UI renders a single toggle button or dual on/off buttons.
	 * Defaults to dual when omitted.
	 */
	buttonMode?: 'toggle' | 'dual';
	commands: Record<DeviceCommandKey, ShellyDeviceCommand>;
}
