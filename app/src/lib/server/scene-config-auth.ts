export type SceneConfigAuthFailure = {
	status: 403 | 503;
	error: string;
};

export function authorizeSceneConfig(
	request: Request,
	origin: string
): SceneConfigAuthFailure | null {
	const requestOrigin = request.headers.get('origin');
	const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
	const requestHost = forwardedHost || request.headers.get('host');
	let originHostMatchesRequest = false;
	if (requestOrigin && requestHost) {
		try {
			originHostMatchesRequest = new URL(requestOrigin).host === requestHost;
		} catch {
			originHostMatchesRequest = false;
		}
	}
	if (requestOrigin && requestOrigin !== origin && !originHostMatchesRequest) {
		return { status: 403, error: 'Ongeldige aanvraag.' };
	}

	return null;
}
