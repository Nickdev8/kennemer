import type { PageLoad } from './$types';
import type { DashboardTab, DashboardControl } from '$lib/config/schema';

type DeviceStatePayload = {
	ok: boolean;
	states: Record<string, { lastCommand: 'on' | 'off' }>;
};

export const load: PageLoad = async ({ fetch }) => {
	let controls: DashboardControl[] | undefined;
	let tabs: DashboardTab[] | undefined;
	let mode: 'mock' | 'live' = 'live';
	try {
		const configResponse = await fetch('/api/config/scenes', { cache: 'no-store' });
		const configPayload = (await configResponse.json().catch(() => null)) as {
			controls?: DashboardControl[];
			tabs?: DashboardTab[];
			mode?: 'mock' | 'live';
		} | null;
		controls = configPayload?.controls;
		tabs = configPayload?.tabs;
		mode = configPayload?.mode ?? 'live';
	} catch {}

	try {
		const res = await fetch('/api/device-state', { cache: 'no-store' });
		if (!res.ok) {
			return { deviceStates: {}, controls, tabs, mode };
		}

		const payload = (await res.json()) as DeviceStatePayload;
		if (!payload?.ok || !payload.states) {
			return { deviceStates: {}, controls, tabs, mode };
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

		return { deviceStates: flattened, controls, tabs, mode };
	} catch {
		return { deviceStates: {}, controls, tabs, mode };
	}
};
