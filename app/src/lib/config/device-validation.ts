import type {
	DeviceCommandKey,
	ShellyDevice,
	ShellyDeviceCommand,
	ShellyHttpTarget,
	ShellyTargetConfig
} from './schema';

const shellyDeviceIdPattern = /^[0-9a-f]{12}(?:_\d+)?$/i;

function toTargets(config?: ShellyTargetConfig): ShellyHttpTarget[] {
	if (!config) return [];
	return Array.isArray(config) ? config : [config];
}

function hasValue(value: unknown): boolean {
	if (typeof value === 'string') return value.trim().length > 0;
	return value !== undefined && value !== null;
}

function isTargetConfigured(target: ShellyHttpTarget): boolean {
	if (!target.endpoint?.trim()) return false;
	if (!target.endpoint.includes('/scene/manual_run')) return true;
	return hasValue(target.payload?.id);
}

export function isCommandConfigured(command?: ShellyDeviceCommand): boolean {
	if (!command) return false;
	return [...toTargets(command.lan), ...toTargets(command.cloud)].some(isTargetConfigured);
}

export function isDeviceCommandConfigured(
	device: ShellyDevice,
	command: DeviceCommandKey
): boolean {
	return isCommandConfigured(device.commands[command]);
}

export function isValidStatusDeviceId(value?: string): boolean {
	return Boolean(value?.trim() && shellyDeviceIdPattern.test(value.trim()));
}

export function isDeviceStatusConfigured(device: ShellyDevice): boolean {
	if (device.stateless || device.buttonMode === 'single' || device.type !== 'Scene') return true;
	return isValidStatusDeviceId(device.statusdeviceid);
}

export function getDeviceConfigurationIssues(device: ShellyDevice): string[] {
	const issues: string[] = [];

	(['on', 'off'] as DeviceCommandKey[]).forEach((command) => {
		if (!device.commands[command]) return;
		if (!isDeviceCommandConfigured(device, command)) {
			issues.push(`Scène-ID voor ${command === 'on' ? 'aan' : 'uit'} ontbreekt`);
		}
	});

	if (!isDeviceStatusConfigured(device)) {
		issues.push(
			device.statusdeviceid?.trim() ? 'Statusdevice-ID is ongeldig' : 'Statusdevice-ID ontbreekt'
		);
	}

	return issues;
}
