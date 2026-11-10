import { aggregateVacation, type VacationStatusView } from '$lib/dashboard/vacation-status';
import {
	object,
	parseVacationDefinitions,
	canonicalDeviceId,
	cloudStatuses,
	targetLabel,
	emptyVacationRow,
	type ModeScenes,
	type VacationTarget
} from './vacation-core';
type ReadKind = 'scenes' | 'inventory' | 'statuses';
type Dependencies = {
	scenes: () => Promise<ModeScenes>;
	cloud: (kind: ReadKind, force?: boolean) => Promise<unknown>;
	lan: (
		deviceId: string,
		targets: VacationTarget[],
		inventory: unknown,
		status: unknown
	) => Promise<Map<string, boolean>>;
	now?: () => number;
	simulation?: boolean;
};
export function createVacationReader(deps: Dependencies) {
	const now = deps.now ?? Date.now;
	const cache = new Map<
		ReadKind,
		{ value: unknown; at: number; attempt: number; ok: boolean; flight: Promise<void> | null }
	>();
	let parsed: VacationTarget[] = [],
		definitionAt = 0,
		signature = '',
		flight: Promise<VacationStatusView> | null = null,
		lastView: VacationStatusView | null = null,
		viewAt = 0;
	async function read(kind: ReadKind, force: boolean) {
		let entry = cache.get(kind);
		if (!entry) {
			entry = { value: null, at: 0, attempt: 0, ok: false, flight: null };
			cache.set(kind, entry);
		}
		if (entry.flight) return entry.flight;
		const ttl = kind === 'inventory' ? 24 * 60 * 60_000 : 30_000,
			min = force && kind !== 'inventory' ? 5000 : ttl;
		if (entry.attempt && now() - entry.attempt < min) return;
		entry.attempt = now();
		const current = entry;
		current.flight = (async () => {
			try {
				const value = await deps.cloud(kind, force);
				if (object(value).isok === false) throw new Error();
				const data = object(object(value).data ?? value),
					field =
						kind === 'scenes'
							? 'scene_scripts'
							: kind === 'inventory'
								? 'devices'
								: 'devices_status';
				if (!data[field] || typeof data[field] !== 'object') throw new Error();
				current.value = value;
				current.at = now();
				current.ok = true;
			} catch {
				current.ok = false;
			}
		})().finally(() => {
			current.flight = null;
		});
		return current.flight;
	}
	async function snapshot(force: boolean): Promise<VacationStatusView> {
		const ids = await deps.scenes();
		await Promise.all([read('scenes', force), read('inventory', false), read('statuses', force)]);
		const listing = cache.get('scenes')!,
			inventory = cache.get('inventory')!,
			statuses = cache.get('statuses')!;
		const scriptMap = object(object(object(listing.value).data ?? listing.value).scene_scripts);
		const currentSignature = JSON.stringify([
			ids,
			...[...ids.begin, ...ids.end].map((id) => object(scriptMap[id]).do)
		]);
		if (!definitionAt || now() - definitionAt >= 300_000 || signature !== currentSignature) {
			parsed = parseVacationDefinitions(listing.value, ids);
			definitionAt = listing.at;
			signature = currentSignature;
		}
		const indexed = cloudStatuses(statuses.value),
			rows = parsed.map((target) =>
				emptyVacationRow(target, targetLabel(target, inventory.value, listing.value))
			);
		const deviceIds = [
			...new Set(
				parsed.filter((target) => target.kind === 'output').map((target) => target.deviceId!)
			)
		];
		const lanResults = new Map<string, Map<string, boolean>>();
		// Bound LAN work; remaining outputs can still use freshly acquired cloud reports.
		const pending = deviceIds.slice(0, 8);
		await Promise.all(
			Array.from({ length: Math.min(3, pending.length) }, async () => {
				while (pending.length) {
					const id = pending.shift()!;
					const affected = parsed.filter((target) => target.deviceId === id);
					try {
						lanResults.set(
							id,
							await deps.lan(id, affected, inventory.value, indexed.get(canonicalDeviceId(id)))
						);
					} catch {
						lanResults.set(id, new Map());
					}
				}
			})
		);
		for (let index = 0; index < parsed.length; index++) {
			const target = parsed[index],
				row = rows[index];
			if (target.kind === 'unsupported') continue;
			if (target.kind === 'scene') {
				const flag = object(scriptMap[target.sceneId ?? ''])._enabled;
				if (listing.ok && now() - listing.at < 30_000 && typeof flag === 'boolean') {
					row.actual = flag;
					row.source = 'cloud';
				}
			} else {
				const lan = lanResults.get(target.deviceId!)?.get(target.id);
				if (typeof lan === 'boolean') {
					row.actual = lan;
					row.source = 'lan';
					continue;
				}
				const status = indexed.get(canonicalDeviceId(target.deviceId)),
					info = object(status?._dev_info);
				if (
					statuses.ok &&
					now() - statuses.at < 30_000 &&
					(info.online === true || info.online === 1)
				) {
					const state = depsOutput(status, target);
					if (state !== null) {
						row.actual = state;
						row.source = 'cloud';
					}
				}
			}
		}
		const completeDefinitions = definitionAt > 0 && now() - definitionAt < 300_000;
		if (!completeDefinitions)
			for (const row of rows) {
				row.actual = null;
				row.source = 'unknown';
			}
		const stale = !completeDefinitions || rows.some((row) => row.actual === null);
		const observed = [listing.at, statuses.at].filter((value) => value > 0);
		return {
			state: aggregateVacation(rows),
			rows,
			updatedAt: observed.length ? Math.min(...observed) : null,
			stale,
			simulation: deps.simulation ?? false,
			...(stale ? { message: 'Niet alle actuele controles zijn beschikbaar.' } : {})
		};
	}
	function depsOutput(status: unknown, target: VacationTarget) {
		return readOutput(status, target.channel!, target.component!);
	}
	return {
		read(force = false) {
			if (flight) return flight;
			if (lastView && now() - viewAt < (force ? 5000 : 30000)) return Promise.resolve(lastView);
			flight = snapshot(force)
				.then((value) => {
					lastView = value;
					viewAt = now();
					return value;
				})
				.finally(() => {
					flight = null;
				});
			return flight;
		}
	};
}
import { outputState as readOutput } from './vacation-core';
