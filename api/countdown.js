import { sb } from './lib/supabase.js';

const TEN_MINUTES = 10 * 60 * 1000;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

async function getCountdown() {
  const rows = await sb('countdown_control?select=ends_at&limit=1');
  const endsAt = rows?.[0]?.ends_at || null;
  return endsAt && new Date(endsAt).getTime() > Date.now() ? endsAt : null;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return json(res, 200, { endsAt: await getCountdown() });
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const endsAt = new Date(Date.now() + TEN_MINUTES).toISOString();
    await sb('countdown_control?id=eq.true', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ends_at: endsAt, updated_at: new Date().toISOString() })
    });
    return json(res, 200, { endsAt });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Countdown unavailable' });
  }
}
