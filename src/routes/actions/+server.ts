// src/routes/actions/+server.ts
import type { RequestHandler } from './$types';
import { actions } from '$lib/config/devices';
import { sendHttpAction } from '$lib/server/shelly-http';

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
    const msg = err instanceof Error ? err.message : 'Action failed';
    return new Response(JSON.stringify({ error: msg }), { status: 502 });
  }
};
