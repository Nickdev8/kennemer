import type { PageLoad } from './$types';

type DeviceStatePayload = {
	ok: boolean;
	states: Record<string, { lastCommand: 'on' | 'off' }>;
};

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/device-state', { cache: 'no-store' });
		if (!res.ok) {
			return { deviceStates: {} };
		}

		const payload = (await res.json()) as DeviceStatePayload;
		if (!payload?.ok || !payload.states) {
			return { deviceStates: {} };
		}

		const flattened = Object.entries(payload.states).reduce<Record<string, 'on' | 'off'>>(
			(acc, [id, entry]) => {
				if (entry?.lastCommand === 'on' || entry?.lastCommand === 'off') {
					acc[id] = entry.lastCommand;
				}
				return acc;
			},
			{}
		);

		return { deviceStates: flattened };
	} catch {
		return { deviceStates: {} };
	}
};
