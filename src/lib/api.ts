export async function triggerAction(id: string) {
  const res = await fetch('/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id })
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const error = new Error(
      typeof payload.error === 'string' ? payload.error : 'Request failed'
    );
    if (payload.errorCode) {
      (error as Error & { code?: string }).code = payload.errorCode;
    }
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }

  return res.json().catch(() => ({}));
}

export interface StatusMap {
  [key: string]: {
    value: string;
    label: string;
    timestamp: number;
    error?: string;
  };
}

export async function fetchStatuses(keys: string[]): Promise<StatusMap> {
  if (keys.length === 0) {
    return {};
  }

  const params = new URLSearchParams();
  params.set('keys', keys.join(','));

  const res = await fetch(`/status?${params.toString()}`);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const message =
      typeof payload.error === 'string' ? payload.error : 'Kon status niet ophalen';
    throw new Error(message);
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    throw new Error('Ongeldig statusantwoord');
  }

  return (data as { statuses?: StatusMap }).statuses ?? {};
}
