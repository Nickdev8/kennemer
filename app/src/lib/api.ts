import type { DeviceCommandKey } from '$lib/config/schema';

type DeviceCommandResponse = {
	ok?: boolean;
	skipped?: boolean;
	activeUntil?: number;
	state?: {
		deviceId: string;
		lastCommand: DeviceCommandKey;
	};
};

export async function triggerDeviceCommand(deviceId: string, command: DeviceCommandKey) {
	const res = await fetch('/actions', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ deviceId, command })
	});

	if (!res.ok) {
		const payload = await res.json().catch(() => ({}));
		const error = new Error(typeof payload.error === 'string' ? payload.error : 'Request failed');
		if (payload.errorCode) {
			(error as Error & { code?: string }).code = payload.errorCode;
		}
		(error as Error & { status?: number }).status = res.status;
		throw error;
	}

	return res.json().catch(() => ({})) as Promise<DeviceCommandResponse>;
}

export async function triggerAction(triggerId: string) {
	const res = await fetch('/triggers', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ triggerId })
	});

	if (!res.ok) {
		const payload = await res.json().catch(() => ({}));
		const error = new Error(typeof payload.error === 'string' ? payload.error : 'Request failed');
		if (payload.errorCode) {
			(error as Error & { code?: string }).code = payload.errorCode;
		}
		(error as Error & { status?: number }).status = res.status;
		throw error;
	}

	return res.json().catch(() => ({}));
}
