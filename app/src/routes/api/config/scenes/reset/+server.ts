import type { RequestHandler } from './$types';
import { resetSceneOverrides } from '$lib/server/scene-config-store';
import { authorizeSceneConfig } from '$lib/server/scene-config-auth';

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});

export const POST: RequestHandler = async ({ request, url, fetch }) => {
	const authorizationError = authorizeSceneConfig(request, url.origin);
	if (authorizationError) return jsonResponse(authorizationError, authorizationError.status);
	try {
		await resetSceneOverrides(await request.json());
		const response = await fetch('/api/config/scenes', { cache: 'no-store' });
		return new Response(await response.text(), {
			status: response.status,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	} catch (error) {
		if (error instanceof Error && error.message === 'CONFIG_REVISION_CONFLICT') {
			return jsonResponse({ error: 'De configuratie is intussen gewijzigd. Ververs en probeer opnieuw.' }, 409);
		}
		return jsonResponse({ error: 'Resetten van scène-ID wijzigingen is mislukt.' }, 400);
	}
};
