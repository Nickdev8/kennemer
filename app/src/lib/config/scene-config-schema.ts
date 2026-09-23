import { z } from 'zod';
import type { ControlPlacement, DashboardControl } from './schema';

export const sceneIdSchema = z
	.string()
	.trim()
	.regex(/^\d+$/, 'Gebruik alleen cijfers.')
	.max(32, 'Scène-ID is te lang.');

export const statusDeviceIdSchema = z
	.string()
	.trim()
	.regex(/^[0-9a-f]{12}(?:_\d+)?$/i, 'Gebruik een geldig Shelly statusdevice-ID.');

export const sceneSlotSchema = z.enum(['on', 'off', 'scene', 'status']);
const overrideValueSchema = z.string().trim().min(1).max(32);
export const sceneOverrideSchema = z.partialRecord(sceneSlotSchema, overrideValueSchema);

export const sceneOverridesFileSchema = z.object({
	version: z.literal(1),
	revision: z.string().regex(/^[a-f0-9]{16}$/),
	updatedAt: z.number().int().positive(),
	overrides: z.record(z.string().min(1), sceneOverrideSchema)
});

export const sceneOverrideRequestSchema = z.object({
	revision: z.string().regex(/^[a-f0-9]{16}$/),
	changes: z.array(
		z.object({
			controlId: z.string().min(1),
			slot: sceneSlotSchema,
			sceneId: overrideValueSchema
		})
	).max(100)
});

export const sceneResetRequestSchema = z.object({
	revision: z.string().regex(/^[a-f0-9]{16}$/),
	controlId: z.string().min(1).optional(),
	slot: sceneSlotSchema.optional()
});

export type SceneSlot = z.infer<typeof sceneSlotSchema>;
export type SceneOverridesFile = z.infer<typeof sceneOverridesFileSchema>;

export type SceneEditorEntry = {
	controlId: string;
	label: string;
	placement: ControlPlacement;
	controlType: DashboardControl['controlType'];
	slots: Partial<Record<SceneSlot, string>>;
};
