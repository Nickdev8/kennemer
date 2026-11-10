import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readVacationStatus } from '$lib/server/vacation-status';
export const GET: RequestHandler = async ({ url }) => {
	try {
		return json(await readVacationStatus(url.searchParams.get('refresh') === '1'), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch {
		return json(
			{
				state: 'unknown',
				rows: [],
				updatedAt: null,
				stale: true,
				simulation: false,
				message: 'Modusstatus niet beschikbaar.'
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	}
};
