import { mkdir, readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { env } from '$env/dynamic/private';
import { controls as baseControls, tabs as baseTabs } from '$lib/config/registry';
import {
	configurationSnapshotSchema,
	sceneOverrideRequestSchema,
	sceneOverridesFileSchema,
	sceneOverridesV1Schema,
	sceneResetRequestSchema,
	sceneRestoreRequestSchema,
	type SceneEditorEntry,
	type SceneOverridesFile,
	type ConfigurationSnapshot
} from '$lib/config/scene-config-schema';
import {
	normalizeHomeNumbering,
	applyConfiguration,
	baseSceneId,
	controlMetadata,
	createMutationQueue,
	editableSlots
} from './config-editor-core';

const path = resolve(
	process.cwd(),
	env.SCENE_OVERRIDE_PATH ??
		(env.NODE_ENV === 'production' ? '/data/scene-overrides.json' : 'scene-overrides.json')
);
const backupPath = `${path}.bak`;
const previousPath = `${path}.previous.json`;
let cachedFile: SceneOverridesFile | null = null;
let loadPromise: Promise<SceneOverridesFile> | null = null;
let legacySource: string | null = null;
const serialize = createMutationQueue();

function freshFile(snapshot: ConfigurationSnapshot): SceneOverridesFile {
	return {
		...snapshot,
		revision: randomBytes(8).toString('hex'),
		updatedAt: Date.now(),
		placementDefaultsVersion: 1
	};
}
function emptySnapshot(): ConfigurationSnapshot {
	return { version: 2, homeNumbering: 'column', overrides: {}, metadata: {} };
}
function snapshotOf(file: SceneOverridesFile): ConfigurationSnapshot {
	return configurationSnapshotSchema.parse({
		version: 2,
		homeNumbering: 'column',
		overrides: file.overrides,
		metadata: file.metadata,
		...(file.tabs ? { tabs: file.tabs } : {})
	});
}
function migrateOverworkTimerPlacements(snapshot: ConfigurationSnapshot): ConfigurationSnapshot {
	const metadata = { ...snapshot.metadata };
	for (const id of ['Overwerktimer-1', 'Overwerktimer-2', 'Overwerktimer-3']) {
		const control = baseControls.find((entry) => entry.id === id);
		const saved = metadata[id];
		if (control?.controlType !== 'timed-trigger' || control.placement !== 'main') continue;
		if (saved?.placement !== 'advanced') continue;
		metadata[id] = {
			...saved,
			placement: 'main',
			tabId: control.tabId,
			pushNumber: control.pushNumber
		};
	}
	return { ...snapshot, metadata };
}
async function parseFile(
	candidate: string,
	allowLegacy = false
): Promise<SceneOverridesFile | null> {
	try {
		const raw = await readFile(candidate, 'utf8');
		const json: unknown = JSON.parse(raw);
		const parsed = sceneOverridesFileSchema.safeParse(json);
		if (parsed.success) {
			let normalized = normalizeHomeNumbering(baseControls, parsed.data);
			if (parsed.data.placementDefaultsVersion !== 1)
				normalized = migrateOverworkTimerPlacements(normalized);
			applyConfiguration(baseControls, baseTabs, normalized);
			if (!parsed.data.homeNumbering || parsed.data.placementDefaultsVersion !== 1) {
				legacySource = raw;
				return freshFile(normalized);
			}
			return parsed.data;
		}
		if (allowLegacy) {
			const legacy = sceneOverridesV1Schema.safeParse(json);
			if (
				legacy.success &&
				legacy.data.revision ===
					createHash('sha256')
						.update(JSON.stringify(legacy.data.overrides))
						.digest('hex')
						.slice(0, 16)
			) {
				// Removed registered controls cannot be used by the new editor or transports.
				const registered = new Map(baseControls.map((control) => [control.id, control]));
				const overrides = Object.fromEntries(
					Object.entries(legacy.data.overrides)
						.filter(([id]) => registered.has(id))
						.map(([id, slots]) => [
							id,
							Object.fromEntries(
								Object.entries(slots).filter(([slot]) =>
									editableSlots(registered.get(id)!).includes(
										slot as 'on' | 'off' | 'scene' | 'status'
									)
								)
							)
						])
				);
				const migrated = freshFile({
					version: 2,
					homeNumbering: 'column',
					overrides,
					metadata: {}
				});
				applyConfiguration(baseControls, baseTabs, migrated);
				legacySource = raw;
				return migrated;
			}
		}
	} catch {
		/* A malformed primary can recover from the last validated backup. */
	}
	return null;
}
async function readOverrides(): Promise<SceneOverridesFile> {
	if (cachedFile) return cachedFile;
	loadPromise ??= (async () => {
		const current = (await parseFile(path, true)) ?? (await parseFile(backupPath, true));
		if (current) return (cachedFile = current);
		try {
			await readFile(path, 'utf8');
			console.warn('[config] Invalid runtime configuration; using registered defaults');
		} catch {
			/* Missing file is normal. */
		}
		return (cachedFile = freshFile(emptySnapshot()));
	})();
	return loadPromise;
}
export async function readEffectiveConfiguration() {
	return applyConfiguration(baseControls, baseTabs, await readOverrides());
}
export async function readEffectiveControls() {
	return (await readEffectiveConfiguration()).controls;
}
export async function readSceneEditorEntries(
	file?: SceneOverridesFile
): Promise<{ entries: SceneEditorEntry[]; revision: string; canRestore: boolean }> {
	file ??= await readOverrides();
	const effective = applyConfiguration(baseControls, baseTabs, file);
	return {
		revision: file.revision,
		canRestore: Boolean(await parseFile(previousPath)),
		entries: baseControls.map((control, index) => ({
			controlId: control.id,
			label: effective.controls[index].label,
			placement: control.placement,
			controlType: control.controlType,
			slots: Object.fromEntries(
				editableSlots(control).map((slot) => [
					slot,
					file.overrides[control.id]?.[slot] ?? baseSceneId(control, slot) ?? ''
				])
			),
			defaults: Object.fromEntries(
				editableSlots(control).map((slot) => [slot, baseSceneId(control, slot) ?? ''])
			),
			metadata: controlMetadata(effective.controls[index]),
			defaultMetadata: controlMetadata(control)
		}))
	};
}
async function persist(next: SceneOverridesFile, current: SceneOverridesFile) {
	await mkdir(dirname(path), { recursive: true });
	const options = { encoding: 'utf8' as const, fsync: true };
	await writeFileAtomic(previousPath, JSON.stringify(current, null, 2), options);
	await writeFileAtomic(backupPath, legacySource ?? JSON.stringify(current, null, 2), options);
	await writeFileAtomic(path, JSON.stringify(next, null, 2), options);
	legacySource = null;
	cachedFile = next;
}
async function mutate(
	revision: string,
	change: (current: SceneOverridesFile) => ConfigurationSnapshot | Promise<ConfigurationSnapshot>
) {
	return serialize(async () => {
		const current = await readOverrides();
		if (revision !== current.revision) throw new Error('CONFIG_REVISION_CONFLICT');
		const snapshot = normalizeHomeNumbering(
			baseControls,
			configurationSnapshotSchema.parse(await change(current))
		);
		applyConfiguration(baseControls, baseTabs, snapshot);
		const next = freshFile(snapshot);
		await persist(next, current);
		return next;
	});
}
export async function saveSceneOverrides(input: unknown) {
	const request = sceneOverrideRequestSchema.parse(input);
	return mutate(request.revision, (current) => {
		if (request.importSnapshot) {
			if (request.changes.length || request.metadata || request.tabs)
				throw new Error('Import kan niet met losse wijzigingen worden gecombineerd.');
			return request.importSnapshot;
		}
		const next = snapshotOf(current);
		for (const change of request.changes) {
			next.overrides[change.controlId] ??= {};
			next.overrides[change.controlId][change.slot] = change.sceneId;
		}
		for (const change of request.metadata ?? []) {
			const values = { ...next.metadata[change.controlId], ...change.values };
			if (values.placement === 'advanced') {
				delete values.tabId;
				delete values.pushNumber;
			}
			next.metadata[change.controlId] = values;
		}
		if (request.tabs) next.tabs = request.tabs;
		return next;
	});
}
export async function resetSceneOverrides(input: unknown) {
	const request = sceneResetRequestSchema.parse(input);
	return mutate(request.revision, (current) => {
		if (!request.controlId && !request.slot) return emptySnapshot();
		if (!request.controlId) throw new Error('Een actie terugzetten vereist een bedieningselement.');
		const control = baseControls.find((control) => control.id === request.controlId);
		if (!control || (request.slot && !editableSlots(control).includes(request.slot)))
			throw new Error('Onbekend bedieningselement of onbekende actie.');
		const next = snapshotOf(current);
		if (request.slot) {
			delete next.overrides[request.controlId]?.[request.slot];
		} else {
			delete next.overrides[request.controlId];
			delete next.metadata[request.controlId];
		}
		return next;
	});
}
export async function restoreSceneOverrides(input: unknown) {
	const request = sceneRestoreRequestSchema.parse(input);
	return mutate(request.revision, async () => {
		const previous = await parseFile(previousPath);
		if (!previous) throw new Error('Geen geldige vorige configuratie beschikbaar.');
		return snapshotOf(previous);
	});
}
export async function exportConfiguration(): Promise<ConfigurationSnapshot> {
	return snapshotOf(await readOverrides());
}
export async function readConfigEditorState() {
	const file = await readOverrides();
	return {
		effective: applyConfiguration(baseControls, baseTabs, file),
		editor: await readSceneEditorEntries(file),
		snapshot: snapshotOf(file)
	};
}
