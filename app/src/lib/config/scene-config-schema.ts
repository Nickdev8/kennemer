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
	.regex(/^[0-9a-f]{12}(?:_\d+)?$/i, 'Gebruik een geldig Shelly-status-ID.');
export const sceneSlotSchema = z.enum(['on', 'off', 'scene', 'status']);
const overrideValueSchema = z.string().trim().max(32);
export const sceneOverrideSchema = z.partialRecord(sceneSlotSchema, overrideValueSchema);
const revisionSchema = z.string().regex(/^[a-f0-9]{16}$/);
export const tabSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
		label: z.string().trim().min(1).max(80),
		order: z.number().int().min(0).max(999)
	})
	.strict();
export const controlOverrideSchema = z
	.object({
		label: z.string().trim().min(1).max(120).optional(),
		color: z.string().trim().max(32).nullable().optional(),
		onColor: z.string().trim().max(32).nullable().optional(),
		offColor: z.string().trim().max(32).nullable().optional(),
		tabId: z
			.string()
			.regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
			.optional(),
		pushNumber: z.number().int().min(1).max(99).optional(),
		enabled: z.boolean().optional(),
		activeDurationMs: z.number().int().positive().max(86_400_000).nullable().optional()
	})
	.strict();
export const sceneOverridesV1Schema = z
	.object({
		version: z.literal(1),
		revision: revisionSchema,
		updatedAt: z.number().int().positive(),
		overrides: z.record(z.string().min(1), sceneOverrideSchema)
	})
	.strict();
export const configurationSnapshotSchema = z
	.object({
		version: z.literal(2),
		homeNumbering: z.literal('column').optional(),
		overrides: z.record(z.string().min(1), sceneOverrideSchema),
		metadata: z.record(z.string().min(1), controlOverrideSchema),
		tabs: z.array(tabSchema).min(1).max(30).optional()
	})
	.strict();
export const sceneOverridesFileSchema = configurationSnapshotSchema.extend({
	revision: revisionSchema,
	updatedAt: z.number().int().positive()
});
export const sceneOverrideRequestSchema = z
	.object({
		revision: revisionSchema,
		changes: z
			.array(
				z
					.object({
						controlId: z.string().min(1),
						slot: sceneSlotSchema,
						sceneId: overrideValueSchema
					})
					.strict()
			)
			.max(200)
			.default([]),
		metadata: z
			.array(z.object({ controlId: z.string().min(1), values: controlOverrideSchema }).strict())
			.max(200)
			.optional(),
		tabs: z.array(tabSchema).min(1).max(30).optional(),
		importSnapshot: configurationSnapshotSchema.optional()
	})
	.strict();
export const sceneResetRequestSchema = z
	.object({
		revision: revisionSchema,
		controlId: z.string().min(1).optional(),
		slot: sceneSlotSchema.optional()
	})
	.strict();
export const sceneRestoreRequestSchema = z.object({ revision: revisionSchema }).strict();
export type SceneSlot = z.infer<typeof sceneSlotSchema>;
export type ControlOverride = z.infer<typeof controlOverrideSchema>;
export type ConfigurationSnapshot = z.infer<typeof configurationSnapshotSchema>;
export type SceneOverridesFile = z.infer<typeof sceneOverridesFileSchema>;
export type SceneEditorEntry = {
	controlId: string;
	label: string;
	placement: ControlPlacement;
	controlType: DashboardControl['controlType'];
	slots: Partial<Record<SceneSlot, string>>;
	defaults: Partial<Record<SceneSlot, string>>;
	metadata: ControlOverride;
	defaultMetadata: ControlOverride;
};
