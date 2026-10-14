import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export type SceneConfigAuthFailure = {
	status: 403 | 503;
	error: string;
};

function pinMatches(provided: string, expected: string) {
	const providedBuffer = Buffer.from(provided);
	const expectedBuffer = Buffer.from(expected);
	return (
		providedBuffer.length === expectedBuffer.length &&
		timingSafeEqual(providedBuffer, expectedBuffer)
	);
}

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

	const expected = env.KENNEMER_CONFIG_EDIT_PIN?.trim();
	if (!expected) {
		return { status: 503, error: 'Scène-ID bewerken is niet ingeschakeld.' };
	}

	if (!pinMatches(request.headers.get('x-kennemer-config-pin') ?? '', expected)) {
		return { status: 403, error: 'Onjuiste configuratie-PIN.' };
	}

	return null;
}
