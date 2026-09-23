import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { readEffectiveControls, readSceneEditorEntries, saveSceneOverrides } from '$lib/server/scene-config-store';
import { authorizeSceneConfig } from '$lib/server/scene-config-auth';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
}


async function configPayload() {
	const [config, editor] = await Promise.all([readEffectiveControls(), readSceneEditorEntries()]);
	return {
		ok: true,
		editable: Boolean(env.KENNEMER_CONFIG_EDIT_PIN?.trim()),
		controls: config,
		...editor
	};
}

export const GET: RequestHandler = async () => {
	try {
		return jsonResponse(await configPayload());
	} catch {
		return jsonResponse({ ok: false, error: 'Configuratie kon niet worden gelezen.' }, 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const authorizationError = authorizeSceneConfig(request, url.origin);
	if (authorizationError) return jsonResponse(authorizationError, authorizationError.status);

	try {
		const payload = await saveSceneOverrides(await request.json());
		return jsonResponse({ ...(await configPayload()), revision: payload.revision });
	} catch (error) {
		if (error instanceof Error && error.message === 'CONFIG_REVISION_CONFLICT') {
			return jsonResponse({ error: 'De configuratie is intussen gewijzigd. Ververs en probeer opnieuw.' }, 409);
		}
		return jsonResponse({ error: 'De scène-ID wijzigingen zijn ongeldig.' }, 400);
	}
};
