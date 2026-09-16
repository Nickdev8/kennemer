type SwitchStatusPayload = {
	apower?: number;
	output?: boolean;
};

type ShellyStatusPayload = Record<string, unknown>;

const HTTP_TIMEOUT_MS = 4000;

export async function fetchSwitchStatus(
	ip: string,
	channel: number
): Promise<SwitchStatusPayload | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
	const url = `http://${ip}/rpc/Switch.GetStatus?id=${channel}`;

	try {
		const res = await fetch(url, {
			method: 'GET',
			signal: controller.signal,
			headers: { accept: 'application/json' }
		});

		if (!res.ok) {
			return null;
		}

		const payload = (await res.json()) as SwitchStatusPayload;
		return payload && typeof payload === 'object' ? payload : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function fetchShellyStatus(ip: string): Promise<ShellyStatusPayload | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
	const url = `http://${ip}/rpc/Shelly.GetStatus`;

	try {
		const res = await fetch(url, {
			method: 'GET',
			signal: controller.signal,
			headers: { accept: 'application/json' }
		});

		if (!res.ok) {
			return null;
		}

		const payload = (await res.json()) as ShellyStatusPayload;
		return payload && typeof payload === 'object' ? payload : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
