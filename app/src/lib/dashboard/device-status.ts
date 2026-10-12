import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
import { isValidStatusDeviceId } from '$lib/config/device-validation';

export function resolveCardStatus(
	device: ShellyDevice,
	knownDeviceStates: Map<string, DeviceCommandKey>,
	knownStatusDeviceStates: Map<string, DeviceCommandKey>
) {
	const statusDeviceId = device.statusdeviceid?.trim();
	if (statusDeviceId && isValidStatusDeviceId(statusDeviceId)) {
		return knownStatusDeviceStates.get(statusDeviceId) ?? knownDeviceStates.get(device.id) ?? 'off';
	}
	if (device.type === 'Scene') return null;

	return knownDeviceStates.get(device.id) ?? null;
}
