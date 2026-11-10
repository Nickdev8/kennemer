import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isConfiguredShellyRoom } from '$lib/server/shelly-inventory-core';
import { controlShellyRoom, readShellyRooms } from '$lib/server/shelly-inventory';
export const GET: RequestHandler = async ({ url }) => {
	const room = url.searchParams.get('room') ?? undefined;
	if (room && !isConfiguredShellyRoom(room))
		return json({ error: 'Onbekende ruimte.' }, { status: 400 });
	const result = await readShellyRooms(room, url.searchParams.get('refresh') === '1');
	return json(result, { status: result.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
};
export const POST: RequestHandler = async ({ request, url }) => {
	if (request.headers.get('origin') && request.headers.get('origin') !== url.origin)
		return json({ error: 'Ongeldige herkomst.' }, { status: 403 });
	try {
		return json(await controlShellyRoom(await request.json()));
	} catch (error) {
		const message = error instanceof Error ? error.message : '';
		if (message === 'TIMEOUT')
			return json(
				{
					error: 'Shelly antwoordde niet. Controleer de werkelijke status voordat u opnieuw drukt.'
				},
				{ status: 504 }
			);
		return json(
			{
				error: [
					'Kies Aan of Uit.',
					'Apparaat hoort niet bij deze ruimte.',
					'Deze uitgang kan niet worden bediend.',
					'Ongeldige opdracht.',
					'Er loopt al een opdracht voor deze uitgang.',
					'Inventaris niet beschikbaar. Probeer later opnieuw.',
					'Shelly Cloud is tijdelijk bezet.',
					'Shelly heeft de opdracht geweigerd.',
					'Shelly Cloud niet bereikbaar.'
				].includes(message)
					? message
					: 'Opdracht kon niet worden uitgevoerd.'
			},
			{ status: 400 }
		);
	}
};
