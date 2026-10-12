import type { RequestHandler } from './$types';
import { saveSceneOverrides } from '$lib/server/scene-config-store';
import { configJson, configPayload, configMutation } from '$lib/server/config-editor-api';
export const GET: RequestHandler = async () => {
	try {
		return configJson(await configPayload());
	} catch {
		return configJson({ ok: false, error: 'Configuratie kon niet worden gelezen.' }, 500);
	}
};
export const POST: RequestHandler = ({ request, url }) =>
	configMutation(request, url.origin, saveSceneOverrides);
