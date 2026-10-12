import type { RequestHandler } from './$types';
import { resetSceneOverrides } from '$lib/server/scene-config-store';
import { configMutation } from '$lib/server/config-editor-api';
export const POST: RequestHandler = ({ request, url }) =>
	configMutation(request, url.origin, resetSceneOverrides);
