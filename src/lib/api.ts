// src/lib/api.ts
export async function triggerAction(id: string) {
  const res = await fetch('/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id })
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error);
  }
}
