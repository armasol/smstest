const REST_BASE = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function hasSupabase() {
  return Boolean(REST_BASE() && SERVICE_KEY());
}

// Thin PostgREST client using the service-role key. Bypasses RLS by design —
// these tables have no anon/authenticated policies, so this is the only way in.
export async function sb(path, init = {}) {
  const key = SERVICE_KEY();
  const response = await fetch(`${REST_BASE()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    },
    cache: 'no-store'
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase ${init.method || 'GET'} ${path} failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
