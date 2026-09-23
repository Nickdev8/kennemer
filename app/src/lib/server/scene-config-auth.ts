import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;

export type SceneConfigAuthFailure = {
	status: 403 | 429 | 503;
	error: string;
};

function pinMatches(provided: string, expected: string) {
	const providedBuffer = Buffer.from(provided);
	const expectedBuffer = Buffer.from(expected);
	return (
		providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
	);
}

export function authorizeSceneConfig(
	request: Request,
	origin: string
): SceneConfigAuthFailure | null {
	const requestOrigin = request.headers.get('origin');
	if (requestOrigin && requestOrigin !== origin) {
		return { status: 403, error: 'Ongeldige aanvraag.' };
	}

	const expected = env.KENNEMER_CONFIG_EDIT_PIN?.trim();
	if (!expected) {
		return { status: 503, error: 'Scène-ID bewerken is niet ingeschakeld.' };
	}

	const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
	const now = Date.now();
	const current = failedAttempts.get(key);
	if (current && current.resetAt > now && current.count >= MAX_FAILED_ATTEMPTS) {
		return { status: 429, error: 'Te veel mislukte pogingen. Probeer later opnieuw.' };
	}

	if (!pinMatches(request.headers.get('x-kennemer-config-pin') ?? '', expected)) {
		const next = current && current.resetAt > now ? current : { count: 0, resetAt: now + FAILURE_WINDOW_MS };
		next.count += 1;
		failedAttempts.set(key, next);
		return { status: 403, error: 'Onjuiste configuratie-PIN.' };
	}

	failedAttempts.delete(key);
	return null;
}
