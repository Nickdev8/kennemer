import { env } from '$env/dynamic/private';
import { toPublicControls } from '$lib/config/public-controls';
import { tabs as defaultTabs } from '$lib/config/registry';
import { ConfigValidationError } from './config-editor-core';
import { runtimeMode } from './runtime-mode';
import { readConfigEditorState } from './scene-config-store';
import { authorizeSceneConfig } from './scene-config-auth';
import { publishConfiguration } from './device-state-events';

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
		editable: Boolean(env.KENNEMER_CONFIG_EDIT_PIN?.trim()),
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
	mutate: (input: unknown) => Promise<unknown>
) {
	const auth = authorizeSceneConfig(request, origin);
	if (auth) return configJson(auth, auth.status);
	try {
		await mutate(await request.json());
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
