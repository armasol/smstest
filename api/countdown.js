import { sb } from './lib/supabase.js';

const DEFAULT_MINUTES = 5;
const MAX_MINUTES = 10;
const MIN_MINUTES = 1;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

async function getCountdown() {
  const rows = await sb('countdown_control?select=ends_at,enabled&limit=1');
  const row = rows?.[0] || {};
  const enabled = row.enabled !== false;
  const endsAt = row.ends_at || null;
  const minutes = row.minutes || DEFAULT_MINUTES;
  return { enabled, minutes, endsAt: enabled && endsAt && new Date(endsAt).getTime() > Date.now() ? endsAt : null };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return json(res, 200, await getCountdown());
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const enabled = req.body?.enabled !== false;
    const requestedMinutes = Number(req.body?.minutes);
    const minutes = Number.isInteger(requestedMinutes) && requestedMinutes >= MIN_MINUTES && requestedMinutes <= MAX_MINUTES ? requestedMinutes : DEFAULT_MINUTES;
    const endsAt = enabled ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
    await sb('countdown_control?id=eq.true', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ enabled, ends_at: endsAt, minutes, updated_at: new Date().toISOString() })
    });
    return json(res, 200, { enabled, endsAt, minutes });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Countdown unavailable' });
  }
}
