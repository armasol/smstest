import { processMessage } from './lib/flow.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  const enabled = String(process.env.ENABLE_WEB_TESTER || 'true').toLowerCase() !== 'false';
  if (!enabled) return json(res, 404, { ok: false, error: 'Tester disabled' });

  const sessionId = String(req.body?.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const body = String(req.body?.body || '').slice(0, 1200);
  if (!sessionId || !body) return json(res, 400, { ok: false, error: 'sessionId and body are required' });

  try {
    const result = await processMessage({ from: `webtest:${sessionId}`, body, forceDryRun: true });
    return json(res, 200, { ok: true, reply: result.reply });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}
