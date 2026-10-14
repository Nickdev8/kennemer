import { toPublicControls } from '$lib/config/public-controls';
import { tabs as defaultTabs } from '$lib/config/registry';
import { ConfigValidationError } from './config-editor-core';
import { runtimeMode } from './runtime-mode';
import { readConfigEditorState } from './scene-config-store';
import { authorizeSceneConfig } from './scene-config-auth';
import { publishConfiguration } from './device-state-events';
import { recordAuditEvent } from './audit-log';

export function configJson(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
}
export async function configPayload() {
	const { effective, editor, snapshot } = await readConfigEditorState();
	return {
		ok: true,
		editable: true,
		controls: toPublicControls(effective.controls),
		tabs: effective.tabs,
		defaultTabs,
		snapshot,
		mode: runtimeMode(),
		...editor
	};
}
export async function configMutation(
	request: Request,
	origin: string,
	mutate: (input: unknown) => Promise<unknown>,
	operation: 'save' | 'reset' | 'restore'
) {
	const eventTimestamp = new Date();
	const auth = authorizeSceneConfig(request, origin);
	if (auth) return configJson(auth, auth.status);
	try {
		const input: unknown = await request.json();
		await mutate(input);
		await recordAuditEvent(
			'configuration.changed',
			configurationAuditDetails(operation, input),
			eventTimestamp
		);
		publishConfiguration();
		return configJson(await configPayload());
	} catch (error) {
		if (error instanceof Error && error.message === 'CONFIG_REVISION_CONFLICT') {
			return configJson(
				{
					error:
						'De configuratie is intussen gewijzigd. Je concept is bewaard. Laad de actuele configuratie opnieuw.',
					conflict: true
				},
				409
			);
		}
		return configJson(
			{
				error:
					error instanceof ConfigValidationError
						? error.message
						: 'Ongeldige configuratie. Controleer labels, kleuren, acties, tabs en posities.'
			},
			400
		);
	}
}

function configurationAuditDetails(
	operation: 'save' | 'reset' | 'restore',
	input: unknown
): Record<string, string | number | boolean | string[]> {
	const request = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	const controlIds = new Set<string>();
	const fields = new Set<string>();
	for (const item of Array.isArray(request.changes) ? request.changes : []) {
		if (!item || typeof item !== 'object') continue;
		const change = item as Record<string, unknown>;
		if (typeof change.controlId === 'string') controlIds.add(change.controlId);
		if (typeof change.slot === 'string') fields.add(change.slot);
	}
	for (const item of Array.isArray(request.metadata) ? request.metadata : []) {
		if (!item || typeof item !== 'object') continue;
		const change = item as Record<string, unknown>;
		if (typeof change.controlId === 'string') controlIds.add(change.controlId);
		if (change.values && typeof change.values === 'object') {
			for (const field of Object.keys(change.values)) fields.add(field);
		}
	}
	if (request.importSnapshot) fields.add('import');
	if (request.tabs) fields.add('tabs');
	if (typeof request.controlId === 'string') controlIds.add(request.controlId);
	if (typeof request.slot === 'string') fields.add(request.slot);

	return {
		operation,
		controlIds: [...controlIds].slice(0, 100),
		fields: [...fields].slice(0, 100)
	};
}
