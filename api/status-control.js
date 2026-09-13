import { sb } from './lib/supabase.js';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

async function getStatus() {
  const rows = await sb('status_control?select=value,enabled&limit=1');
  const row = rows?.[0] || {};
  return { value: row.value || 'NOT LAUNCHED', enabled: row.enabled !== false };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return json(res, 200, await getStatus());
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const value = String(req.body?.value || 'NOT LAUNCHED').trim().slice(0, 80) || 'NOT LAUNCHED';
    const enabled = req.body?.enabled !== false;
    await sb('status_control?id=eq.true', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ value, enabled, updated_at: new Date().toISOString() })
    });
    return json(res, 200, { value, enabled });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Status unavailable' });
  }
}
