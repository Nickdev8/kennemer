import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

type Control = {
	id: string;
	label: string;
	controlType: string;
	statusdeviceid?: string;
	stateless?: boolean;
	activeDurationMs?: number;
	sceneId?: string;
	enabled?: boolean;
};
type State = { lastCommand: 'on' | 'off'; updatedAt: number; source: string };
type Dependencies = {
	controls: () => Promise<Control[]>;
	configured: (control: Control, command: 'on' | 'off') => boolean;
	remember: (id: string, command: 'on' | 'off', source?: string) => Promise<State>;
	publish: (id: string, state: State) => void;
};
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});

/** No transport dependency: mocked handlers cannot send equipment or maintenance requests. */
export function createMockBackend(path: string, deps: Dependencies) {
	let queue: Promise<unknown> = Promise.resolve();
	const activeUntilByCommand = new Map<string, number>();
	const read = async (): Promise<Record<string, 'on' | 'off'>> => {
		try {
			const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
			if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
			return Object.fromEntries(
				Object.entries(raw).filter(([, value]) => value === 'on' || value === 'off')
			);
		} catch {
			return {};
		}
	};
	const save = async (id: string, command: 'on' | 'off') => {
		const operation = queue.then(async () => {
			const states = await read();
			states[id] = command;
			await mkdir(dirname(path), { recursive: true });
			await writeFile(`${path}.tmp`, JSON.stringify(states), { mode: 0o600 });
			await rename(`${path}.tmp`, path);
		});
		queue = operation.catch(() => undefined);
		await operation;
	};
	let updateStartedAt = 0;
	return async (request: Request): Promise<Response | null> => {
		const url = new URL(request.url),
			route = url.pathname;
		if (route === '/api/connectivity') return json({ online: true });
		if (route === '/api/hardware')
			return json({
				ok: true,
				touchscreen: { connected: true },
				message: 'Demotouchscreen aangesloten'
			});
		if (route === '/api/update') {
			if (request.method === 'POST') updateStartedAt = Date.now();
			const running = updateStartedAt > 0 && Date.now() - updateStartedAt < 2500;
			return json({
				ok: true,
				updating: running,
				updateStarted: request.method === 'POST',
				updateAvailable: updateStartedAt === 0 || running,
				currentShort: 'demo',
				fastForward: true,
				fetchOk: true,
				message: running ? 'Demo-update bezig' : 'Demo is bijgewerkt',
				service: { activeState: running ? 'active' : 'inactive', result: 'success' }
			});
		}
		if (route === '/api/wattage/cache')
			return json({ ok: true, generatedAt: Date.now(), message: 'Democache vernieuwd' });
		if (route.startsWith('/api/wattage/')) {
			const controls = (await deps.controls())
				.filter((c) => c.controlType === 'device')
				.slice(0, 5);
			const physical = await read();
			const devices = controls.map((c, index) => ({
				deviceId: c.id,
				name: c.label,
				ip: 'demo',
				channel: 0,
				watts: physical[c.statusdeviceid ?? c.id] === 'on' ? 60 + index * 25 : 0,
				output: physical[c.statusdeviceid ?? c.id] === 'on',
				source: 'lan-rpc',
				timestamp: Date.now(),
				capability: 'metered',
				state: 'ok'
			}));
			return json({
				ok: true,
				roomId: Number(route.split('/').at(-1)),
				label: 'Demo',
				devices,
				totalWatts: devices.reduce((sum, d) => sum + d.watts, 0),
				inventory: {
					totalCount: devices.length,
					onlineCount: devices.length,
					offlineCount: 0,
					unknownStatusCount: 0,
					offlineDevices: [],
					unknownStatusDevices: []
				},
				summary: {
					unavailableCount: 0,
					notMeteredCount: 0,
					meteredCount: devices.length,
					unknownCapabilityCount: 0,
					cachedCount: 0,
					cloudCount: 0,
					lanRpcCount: devices.length,
					lanStatusCount: 0
				}
			});
		}
		if (route === '/api/device-output') {
			const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
			if (!ids.length) return json({ ok: false, message: 'Apparaat-ID ontbreekt' }, 400);
			const controls = await deps.controls(),
				physical = await read(),
				states: Record<string, State> = {},
				errors: Record<string, string> = {};
			for (const id of ids) {
				const owners = controls.filter(
					(c) => c.controlType === 'device' && c.statusdeviceid === id
				);
				if (!owners.length) {
					errors[id] = 'Onbekend apparaat';
					continue;
				}
				const command = physical[id] ?? 'off';
				states[id] = { lastCommand: command, updatedAt: Date.now(), source: 'status-demo' };
				for (const owner of owners)
					deps.publish(owner.id, await deps.remember(owner.id, command, 'status-demo'));
			}
			return json({ ok: true, states, errors });
		}
		if (route === '/actions' || route === '/triggers') {
			if (request.method !== 'POST') return json({ error: 'Methode niet toegestaan' }, 405);
			let body: Record<string, unknown>;
			try {
				body = await request.json();
			} catch {
				return json({ error: 'Ongeldig verzoek' }, 400);
			}
			const control = (await deps.controls()).find(
				(c) =>
					c.id === (route === '/actions' ? body.deviceId : body.triggerId) &&
					(route === '/actions' ? c.controlType === 'device' : c.controlType !== 'device')
			);
			if (!control) return json({ error: 'Onbekende bediening' }, 404);
			if (control.enabled === false) return json({ error: 'Bediening uitgeschakeld' }, 409);
			if (route === '/triggers') {
				if (!control.sceneId?.trim() || /^0+$/.test(control.sceneId))
					return json({ error: 'Scène-ID ontbreekt' }, 409);
				deps.publish(control.id, {
					lastCommand: 'on',
					updatedAt: Date.now(),
					source: 'demo-trigger'
				});
				setTimeout(
					() =>
						deps.publish(control.id, {
							lastCommand: 'off',
							updatedAt: Date.now(),
							source: 'demo-trigger'
						}),
					control.activeDurationMs ?? 5000
				).unref?.();
				return json({ ok: true });
			}
			const command = body.command;
			if (command !== 'on' && command !== 'off') return json({ error: 'Ongeldige opdracht' }, 400);
			if (!deps.configured(control, command)) return json({ error: 'Actie niet ingesteld' }, 409);
			let activeUntil: number | undefined;
			let skipped = false;
			if (
				control.stateless &&
				Number.isFinite(control.activeDurationMs) &&
				Number(control.activeDurationMs) > 0
			) {
				const key = `${control.id}:${command}`;
				const existing = activeUntilByCommand.get(key) ?? 0;
				skipped = existing > Date.now();
				activeUntil = skipped ? existing : Date.now() + Number(control.activeDurationMs);
				activeUntilByCommand.set(key, activeUntil);
			}
			if (!control.stateless) {
				await save(control.statusdeviceid ?? control.id, command);
				deps.publish(control.id, await deps.remember(control.id, command));
			}
			return json({
				ok: true,
				skipped,
				activeUntil,
				state: { deviceId: control.id, lastCommand: command }
			});
		}
		return null;
	};
}
