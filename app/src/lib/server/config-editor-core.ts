import { rowNumberToColumn } from '../config/home-grid';
import type { DashboardControl, DashboardTab } from '../config/schema';
import {
	sceneIdSchema,
	statusDeviceIdSchema,
	type ConfigurationSnapshot,
	type ControlOverride,
	type SceneSlot
} from '../config/scene-config-schema';
import { validateConfiguration } from '../config/configuration-validation';

export class ConfigValidationError extends Error {}

export function editableSlots(control: DashboardControl): SceneSlot[] {
	if (control.controlType !== 'device') return ['scene'];
	// Direct controls use fixed transport identities, never editable scene/status bindings.
	if (control.directDeviceId) return [];
	const slots: SceneSlot[] = (['on', 'off'] as const).filter((slot) => {
		const cloud = control.commands[slot]?.cloud;
		return (cloud ? (Array.isArray(cloud) ? cloud : [cloud]) : []).some((target) =>
			target.endpoint.includes('/scene/manual_run')
		);
	});
	slots.push('status');
	return slots;
}
export function baseSceneId(control: DashboardControl, slot: SceneSlot): string | undefined {
	if (control.controlType !== 'device') return slot === 'scene' ? control.sceneId : undefined;
	if (slot === 'status') return control.statusdeviceid;
	if (slot === 'scene') return undefined;
	const cloud = control.commands[slot]?.cloud;
	return (cloud ? (Array.isArray(cloud) ? cloud : [cloud]) : []).find((target) =>
		target.endpoint.includes('/scene/manual_run')
	)?.payload?.id as string | undefined;
}
export function controlMetadata(control: DashboardControl): ControlOverride {
	return {
		label: control.label,
		enabled: control.enabled !== false,
		...(control.placement === 'main' || control.placement === 'advanced'
			? {
					placement: control.placement,
					...(control.placement === 'main'
						? { tabId: control.tabId ?? 'home', pushNumber: control.pushNumber }
						: {})
				}
			: {}),
		...(control.controlType === 'device'
			? {
					onColor: control.commands.on?.color ?? null,
					offColor: control.commands.off?.color ?? null
				}
			: { color: control.color ?? null }),
		...(control.controlType === 'timed-trigger' ||
		(control.controlType === 'device' && control.stateless)
			? { activeDurationMs: control.activeDurationMs ?? null }
			: {})
	};
}
export function applyConfiguration(
	base: DashboardControl[],
	defaultTabs: DashboardTab[],
	snapshot: ConfigurationSnapshot
) {
	const controls = structuredClone(base);
	const byId = new Map(controls.map((control) => [control.id, control]));
	for (const [id, slots] of Object.entries(snapshot.overrides)) {
		const control = byId.get(id);
		if (!control) throw new ConfigValidationError(`Onbekend bedieningselement: ${id}`);
		for (const [key, value] of Object.entries(slots)) {
			const slot = key as SceneSlot;
			if (!editableSlots(control).includes(slot))
				throw new ConfigValidationError(`Onbekende scène-actie: ${id}`);
			if (value) (slot === 'status' ? statusDeviceIdSchema : sceneIdSchema).parse(value);
			if (control.controlType !== 'device') control.sceneId = value;
			else if (slot === 'status') control.statusdeviceid = value || undefined;
			else if (slot !== 'scene') {
				const cloud = control.commands[slot]?.cloud;
				for (const target of cloud ? (Array.isArray(cloud) ? cloud : [cloud]) : []) {
					if (target.endpoint.includes('/scene/manual_run'))
						target.payload = { ...target.payload, id: value };
				}
			}
		}
	}
	for (const [id, values] of Object.entries(snapshot.metadata)) {
		const control = byId.get(id);
		if (!control) throw new ConfigValidationError(`Onbekend bedieningselement: ${id}`);
		if (values.label !== undefined) control.label = values.label;
		if (values.enabled !== undefined) control.enabled = values.enabled;
		if (values.placement !== undefined) {
			if (control.placement !== 'main' && control.placement !== 'advanced')
				throw new ConfigValidationError('Deze losse actie kan niet worden verplaatst.');
			control.placement = values.placement;
			if (values.placement === 'advanced') {
				delete control.tabId;
				delete control.pushNumber;
			}
		}
		if (values.tabId !== undefined || values.pushNumber !== undefined) {
			if (control.placement !== 'main')
				throw new ConfigValidationError(
					'Alleen hoofdknoppen kunnen van tab of positie veranderen.'
				);
			if (values.tabId !== undefined) control.tabId = values.tabId;
			if (values.pushNumber !== undefined) control.pushNumber = values.pushNumber;
		}
		if (control.controlType === 'device') {
			if (values.color !== undefined)
				throw new ConfigValidationError('Gebruik de kleuren voor Aan en Uit.');
			for (const slot of ['on', 'off'] as const) {
				const color = values[slot === 'on' ? 'onColor' : 'offColor'];
				if (color !== undefined) {
					const command = control.commands[slot];
					if (!command && color !== null) throw new ConfigValidationError('Onbekende kleuractie.');
					if (command) command.color = color ?? undefined;
				}
			}
		} else {
			if (values.onColor !== undefined || values.offColor !== undefined)
				throw new ConfigValidationError('Deze knop heeft één kleur.');
			if (values.color !== undefined) control.color = values.color ?? undefined;
		}
		if (values.activeDurationMs !== undefined) {
			if (
				control.controlType === 'trigger' ||
				(control.controlType === 'device' && !control.stateless)
			)
				throw new ConfigValidationError('Deze knop heeft geen tijdelijke tijdsduur.');
			if (control.controlType === 'timed-trigger' && values.activeDurationMs === null)
				throw new ConfigValidationError('Een tijdknop vereist een tijdsduur.');
			control.activeDurationMs = values.activeDurationMs ?? undefined;
		}
	}
	const tabs = structuredClone(snapshot.tabs ?? defaultTabs).sort((a, b) => a.order - b.order);
	const errors = validateConfiguration(controls, tabs);
	if (errors.length) throw new ConfigValidationError(errors.join('\n'));
	return { controls, tabs };
}
/** Revision comparison and persistence must share one queue, including resets and restores. */
export function createMutationQueue() {
	let tail: Promise<unknown> = Promise.resolve();
	return function serialize<T>(operation: () => Promise<T>): Promise<T> {
		const pending = tail.then(operation);
		tail = pending.catch(() => undefined);
		return pending;
	};
}

export function normalizeHomeNumbering(
	base: DashboardControl[],
	snapshot: ConfigurationSnapshot
): ConfigurationSnapshot {
	if (snapshot.homeNumbering === 'column') return snapshot;
	const next = structuredClone(snapshot);
	next.homeNumbering = 'column';
	for (const [id, values] of Object.entries(next.metadata)) {
		const control = base.find((control) => control.id === id);
		if (
			control?.placement === 'main' &&
			(values.tabId ?? control.tabId ?? 'home') === 'home' &&
			values.pushNumber !== undefined &&
			values.pushNumber >= 1 &&
			values.pushNumber <= 9
		)
			values.pushNumber = rowNumberToColumn(values.pushNumber);
	}
	return next;
}
