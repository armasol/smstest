import crypto from 'node:crypto';
import { claimWebhook } from './lib/state.js';
import { processMessage } from './lib/flow.js';
import { readRawBody, sendSms, verifyHushSignature } from './lib/hushsms.js';

export const config = { api: { bodyParser: false } };

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });

  let raw;
  try { raw = await readRawBody(req); }
  catch { return json(res, 400, { ok: false, error: 'Could not read request body' }); }

  try {
    const valid = verifyHushSignature(raw, req.headers['x-hushsms-signature']);
    if (!valid) return json(res, 403, { ok: false, error: 'Invalid webhook signature' });
  } catch (error) {
    console.error('signature configuration error', error);
    return json(res, 500, { ok: false, error: error.message });
  }

  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); }
  catch { return json(res, 400, { ok: false, error: 'Invalid JSON' }); }

  if (payload.event !== 'message.received') return json(res, 200, { ok: true, ignored: true });
  const from = String(payload.from || '').trim();
  const body = String(payload.body || '').trim();
  const lineId = String(payload.line_id || process.env.HUSHSMS_LINE_ID || '').trim();
  if (!from || !body) return json(res, 200, { ok: true, ignored: true });

  const fingerprint = crypto.createHash('sha256')
    .update(`${lineId}|${from}|${body}|${payload.received_at || ''}`)
    .digest('hex');
  if (!(await claimWebhook(fingerprint))) return json(res, 200, { ok: true, duplicate: true });

  try {
    const result = await processMessage({ from, body });
    await sendSms({ lineId, to: from, body: result.reply });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('sms flow error', error);
    try { await sendSms({ lineId, to: from, body: `imessage.fun error: ${error.message}` }); } catch {}
    return json(res, 500, { ok: false, error: error.message });
  }
}
