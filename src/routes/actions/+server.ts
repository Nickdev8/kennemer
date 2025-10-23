import type { RequestHandler } from './$types';
import { actions } from '$lib/config/devices';
import { sendHttpAction, ShellyHttpError } from '$lib/server/shelly-http';

export const POST: RequestHandler = async ({ request }) => {
  const { id } = await request.json();
  const action = actions.find((item) => item.id === id);

  if (!action) {
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 404 });
  }

  try {
    await sendHttpAction(action);
    return new Response(JSON.stringify({ ok: true }));
  } catch (err) {
    if (err instanceof ShellyHttpError) {
      return new Response(
        JSON.stringify({ error: err.message, errorCode: err.code }),
        { status: err.status || 502 }
      );
    }

    const msg = err instanceof Error ? err.message : 'Action failed';
    return new Response(JSON.stringify({ error: msg }), { status: 502 });
  }
};
