import crypto from 'node:crypto';

export function twiml(message) {
  const escaped = String(message)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

export function requestUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${req.url}`;
}

export function validateTwilioSignature(req, params) {
  if (String(process.env.TWILIO_VALIDATE_SIGNATURE || 'true').toLowerCase() !== 'true') return true;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers['x-twilio-signature'];
  if (!token || !signature) return false;

  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  const expected = crypto.createHmac('sha1', token).update(requestUrl(req) + sorted).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function normalizeBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  const params = new URLSearchParams(req.body);
  return Object.fromEntries(params.entries());
}
