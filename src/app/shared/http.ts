export async function postJson<ResponseBody>(
  url: string,
  body: unknown
): Promise<ResponseBody> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as ResponseBody & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}
