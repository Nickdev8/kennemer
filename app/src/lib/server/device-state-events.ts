import type { StoredDeviceState } from './device-state-store';

type DeviceStateEvent = {
	deviceId: string;
	state: StoredDeviceState;
};

const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

export function subscribeDeviceState(
	controller: ReadableStreamDefaultController<Uint8Array>
) {
	clients.add(controller);
}

export function unsubscribeDeviceState(
	controller: ReadableStreamDefaultController<Uint8Array>
) {
	clients.delete(controller);
}

export function publishDeviceState(event: DeviceStateEvent) {
	if (clients.size === 0) return;
	const payload = `event: state\ndata: ${JSON.stringify(event)}\n\n`;
	const encoded = new TextEncoder().encode(payload);

	for (const controller of clients) {
		try {
			controller.enqueue(encoded);
		} catch {
			clients.delete(controller);
		}
	}
}
