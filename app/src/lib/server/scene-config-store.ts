import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { env } from '$env/dynamic/private';
import { devices } from '$lib/config/devices';
import { advancedControls } from '$lib/config/advanced';
import { triggers } from '$lib/config/triggers';
import type { DashboardControl } from '$lib/config/schema';
import {
	sceneIdSchema,
	statusDeviceIdSchema,
	sceneOverrideRequestSchema,
	sceneOverridesFileSchema,
	sceneResetRequestSchema,
	type SceneEditorEntry,
	type SceneOverridesFile,
	type SceneSlot
} from '$lib/config/scene-config-schema';

const SCENE_OVERRIDE_PATH = resolve(
	process.cwd(),
	env.SCENE_OVERRIDE_PATH ?? (env.NODE_ENV === 'production' ? '/data/scene-overrides.json' : 'scene-overrides.json')
);
const SCENE_OVERRIDE_BACKUP_PATH = `${SCENE_OVERRIDE_PATH}.bak`;
const baseControls = [...devices, ...advancedControls, ...triggers];
const baseControlById = new Map(baseControls.map((control) => [control.id, control]));

let cachedFile: SceneOverridesFile | null = null;
let loadPromise: Promise<SceneOverridesFile> | null = null;

function revisionFor(overrides: SceneOverridesFile['overrides']): string {
	return createHash('sha256')
		.update(JSON.stringify(overrides))
		.digest('hex')
		.slice(0, 16);
}

function emptyFile(): SceneOverridesFile {
	const overrides = {};
	return { version: 1, revision: revisionFor(overrides), updatedAt: Date.now(), overrides };
}

async function parseOverrideFile(path: string): Promise<SceneOverridesFile | null> {
	try {
		const parsed = sceneOverridesFileSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
		return parsed.success && parsed.data.revision === revisionFor(parsed.data.overrides)
			? parsed.data
			: null;
	} catch {
		return null;
	}
}

async function readOverrideFile(): Promise<SceneOverridesFile> {
	const current = await parseOverrideFile(SCENE_OVERRIDE_PATH);
	if (current) return current;
	const backup = await parseOverrideFile(SCENE_OVERRIDE_BACKUP_PATH);
	if (backup) return backup;
	try {
		await readFile(SCENE_OVERRIDE_PATH, 'utf8');
		console.warn('[scene-config] Invalid override files; using checked-in scene IDs');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			console.warn('[scene-config] Cannot read override files; using checked-in scene IDs');
		}
	}
	return emptyFile();
}

async function readOverrides(): Promise<SceneOverridesFile> {
	if (cachedFile) return cachedFile;
	loadPromise ??= readOverrideFile().then((file) => {
		cachedFile = file;
		return file;
	});
	return loadPromise;
}

function editableSlots(control: DashboardControl): SceneSlot[] {
	if (control.controlType === 'device') {
		const slots = (['on', 'off'] as SceneSlot[]).filter((slot) =>
			Boolean(control.commands[slot as 'on' | 'off'])
		);
		if (control.statusdeviceid?.trim()) slots.push('status');
		return slots;
	}
	return ['scene'];
}

function baseSceneId(control: DashboardControl, slot: SceneSlot): string | undefined {
	if (control.controlType === 'device' && slot === 'status') return control.statusdeviceid;
	if (control.controlType !== 'device' && slot === 'scene') return control.sceneId;
	if (control.controlType !== 'device' || slot === 'scene') return undefined;
	const command = control.commands[slot as 'on' | 'off'];
	const targets = command?.cloud
		? Array.isArray(command.cloud)
			? command.cloud
			: [command.cloud]
		: [];
	return targets.find((target) => target.endpoint.includes('/scene/manual_run'))?.payload?.id as
		| string
		| undefined;
}

export async function readEffectiveControls(): Promise<DashboardControl[]> {
	const file = await readOverrides();
	return baseControls.map((control) => {
		const override = file.overrides[control.id];
		if (!override) return control;
		const next = structuredClone(control);
		for (const slot of editableSlots(next)) {
			const sceneId = override[slot];
			if (!sceneId) continue;
			if (next.controlType === 'device' && slot === 'status') {
				if (statusDeviceIdSchema.safeParse(sceneId).success) next.statusdeviceid = sceneId;
			} else if (next.controlType === 'device' && slot !== 'scene') {
				const command = next.commands[slot as 'on' | 'off'];
				if (!command?.cloud) continue;
				const targets = Array.isArray(command.cloud) ? command.cloud : [command.cloud];
				for (const target of targets) {
					if (target.endpoint.includes('/scene/manual_run')) {
						target.payload = { ...(target.payload ?? {}), id: sceneId };
					}
				}
			} else if (next.controlType !== 'device' && slot === 'scene') {
				next.sceneId = sceneId;
			}
		}
		return next;
	});
}

export async function readSceneEditorEntries(): Promise<{
	entries: SceneEditorEntry[];
	revision: string;
}> {
	const file = await readOverrides();
	return {
		revision: file.revision,
		entries: baseControls.map((control) => ({
			controlId: control.id,
			label: control.label,
			placement: control.placement,
			controlType: control.controlType,
			slots: Object.fromEntries(
				editableSlots(control).map((slot) => [
					slot,
					file.overrides[control.id]?.[slot] ?? baseSceneId(control, slot) ?? ''
				])
			) as Partial<Record<SceneSlot, string>>
		}))
	};
}

function validateChanges(
	changes: Array<{ controlId: string; slot: SceneSlot; sceneId: string }>,
	current: SceneOverridesFile['overrides']
) {
	const next = structuredClone(current);
	for (const change of changes) {
		const control = baseControlById.get(change.controlId);
		if (!control || !editableSlots(control).includes(change.slot)) {
			throw new Error('Onbekende scène-actie.');
		}
		const sceneId =
			change.slot === 'status'
				? statusDeviceIdSchema.parse(change.sceneId)
				: sceneIdSchema.parse(change.sceneId);
		next[change.controlId] ??= {};
		next[change.controlId][change.slot] = sceneId;
	}
	return next;
}

async function persist(file: SceneOverridesFile): Promise<void> {
	await mkdir(dirname(SCENE_OVERRIDE_PATH), { recursive: true });
	if (cachedFile) {
		await writeFileAtomic(SCENE_OVERRIDE_BACKUP_PATH, JSON.stringify(cachedFile, null, 2), {
			encoding: 'utf8',
			fsync: true
		});
	}
	await writeFileAtomic(SCENE_OVERRIDE_PATH, JSON.stringify(file, null, 2), {
		encoding: 'utf8',
		fsync: true
	});
	cachedFile = file;
}

export async function saveSceneOverrides(input: unknown): Promise<SceneOverridesFile> {
	const request = sceneOverrideRequestSchema.parse(input);
	const current = await readOverrides();
	if (request.revision !== current.revision) throw new Error('CONFIG_REVISION_CONFLICT');
	const overrides = validateChanges(request.changes, current.overrides);
	const next: SceneOverridesFile = {
		version: 1,
		revision: revisionFor(overrides),
		updatedAt: Date.now(),
		overrides
	};
	sceneOverridesFileSchema.parse(next);
	await persist(next);
	return next;
}

export async function resetSceneOverrides(input: unknown): Promise<SceneOverridesFile> {
	const request = sceneResetRequestSchema.parse(input);
	const current = await readOverrides();
	if (request.revision !== current.revision) throw new Error('CONFIG_REVISION_CONFLICT');
	const overrides = structuredClone(current.overrides);
	if (request.controlId && request.slot) {
		delete overrides[request.controlId]?.[request.slot];
		if (Object.keys(overrides[request.controlId] ?? {}).length === 0) {
			delete overrides[request.controlId];
		}
	} else if (!request.controlId && !request.slot) {
		Object.keys(overrides).forEach((id) => delete overrides[id]);
	} else {
		throw new Error('Reset vereist een controlId en slot, of geen van beide.');
	}
	const next: SceneOverridesFile = {
		version: 1,
		revision: revisionFor(overrides),
		updatedAt: Date.now(),
		overrides
	};
	await persist(next);
	return next;
}
