import { sb } from './lib/supabase.js';

const TEN_MINUTES = 10 * 60 * 1000;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

async function getCountdown() {
  const rows = await sb('countdown_control?select=ends_at,enabled&limit=1');
  const row = rows?.[0] || {};
  const enabled = row.enabled !== false;
  const endsAt = row.ends_at || null;
  return { enabled, endsAt: enabled && endsAt && new Date(endsAt).getTime() > Date.now() ? endsAt : null };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return json(res, 200, await getCountdown());
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const enabled = req.body?.enabled !== false;
    const endsAt = enabled ? new Date(Date.now() + TEN_MINUTES).toISOString() : null;
    await sb('countdown_control?id=eq.true', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ enabled, ends_at: endsAt, updated_at: new Date().toISOString() })
    });
    return json(res, 200, { enabled, endsAt });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Countdown unavailable' });
  }
}
