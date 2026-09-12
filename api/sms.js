import { parseLaunchCommand, fetchXProfile } from './lib/x.js';
import { getPending, setPending, clearPending } from './lib/state.js';
import { launchFromProfile } from './lib/pons.js';
import { normalizeBody, twiml, validateTwilioSignature } from './lib/twilio.js';

const reply = (res, message, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(twiml(message));
};

function phoneAllowed(phone) {
  if (String(process.env.ALLOW_PUBLIC_LAUNCHES || 'false').toLowerCase() === 'true') return true;
  const list = String(process.env.ALLOWED_PHONE_NUMBERS || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  return list.includes(phone);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 'POST only.', 405);
  const params = normalizeBody(req);
  if (!validateTwilioSignature(req, params)) return reply(res, 'Invalid webhook signature.', 403);

  const from = String(params.From || '').trim();
  const body = String(params.Body || '').trim();
  if (!from || !body) return reply(res, 'Text LAUNCH @handle $TICKER to start.');

  const normalized = body.toUpperCase();
  if (['CANCEL', 'STOPLAUNCH', 'NO'].includes(normalized)) {
    await clearPending(from);
    return reply(res, 'Launch cancelled. Text LAUNCH @handle $TICKER whenever you want to start again.');
  }

  if (['YES', 'CONFIRM', 'LAUNCH IT'].includes(normalized)) {
    const pending = await getPending(from);
    if (!pending) return reply(res, 'No pending launch. Text LAUNCH @handle $TICKER first.');
    if (!phoneAllowed(from)) return reply(res, 'This number is not enabled for sponsored launches yet.');

    try {
      const result = await launchFromProfile(pending);
      await clearPending(from);
      const where = result.token ? `Token: ${result.token}\n${result.explorer}` : `Tx: ${result.hash}\n${result.explorer}`;
      return reply(res, `LIVE. $${pending.ticker} launched on Robinhood Chain.\n${where}`);
    } catch (error) {
      console.error('launch failed', error);
      return reply(res, `Launch stopped safely: ${error.message}. Your draft is still saved; reply YES to retry or CANCEL.`);
    }
  }

  const command = parseLaunchCommand(body);
  if (!command) return reply(res, 'Try: LAUNCH @handle $TICKER\nI’ll pull the public X profile, show you the token, then wait for YES.');
  if (command.error) return reply(res, 'Add an X handle. Example: LAUNCH @orbitlabs $ORBIT');

  try {
    const profile = await fetchXProfile(command.handle);
    const payload = { profile, ticker: command.ticker, requestedAt: Date.now() };
    await setPending(from, payload, 15 * 60);
    const desc = profile.description ? `\n“${profile.description.slice(0, 120)}${profile.description.length > 120 ? '…' : ''}”` : '';
    return reply(res,
      `READY TO LAUNCH\n${profile.name} · $${command.ticker}\n@${profile.username}${desc}\n\nRobinhood Chain · ETH pair\nReply YES to deploy. Reply CANCEL to stop.`
    );
  } catch (error) {
    console.error('profile lookup failed', error);
    return reply(res, `Couldn’t read that X profile: ${error.message}. Check the handle and try again.`);
  }
}
