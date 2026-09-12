import { isAddress } from 'viem';
import { clearSession, getSession, setSession } from './state.js';
import { dryRunDraft, launchFromDraft } from './pons.js';

const SESSION_TTL = 60 * 60;
const SKIP = /^(skip|none|n\/a|-|no)$/i;

const STEPS = [
  { key: 'name', prompt: '1/11 Token name?\nExample: Orbit' },
  { key: 'symbol', prompt: '2/11 Ticker?\nExample: ORBIT' },
  { key: 'description', prompt: '3/11 Short description?\nUp to 500 characters.' },
  { key: 'logo', prompt: '4/11 Logo URL?\nPaste https://... or ipfs://...' },
  { key: 'website', prompt: '5/11 Website?\nReply SKIP if none.' },
  { key: 'twitter', prompt: '6/11 X / Twitter URL?\nReply SKIP if none.' },
  { key: 'telegram', prompt: '7/11 Telegram URL?\nReply SKIP if none.' },
  { key: 'discord', prompt: '8/11 Discord URL?\nReply SKIP if none.' },
  { key: 'farcaster', prompt: '9/11 Farcaster URL?\nReply SKIP if none.' },
  { key: 'creatorFeeRecipient', prompt: '10/11 Creator fee wallet?\nSend a 0x EVM address.' },
  { key: 'economics', prompt: '11/11 Creator tax + buyback?\nReply like: 1%, YES\nOr: 0%, NO' }
];

function cleanUrl(value, optional = true) {
  const text = String(value || '').trim();
  if (optional && SKIP.test(text)) return '';
  if (text.startsWith('ipfs://')) return text;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch { return null; }
}

function validateStep(step, input) {
  const value = String(input || '').trim();
  if (!value) return { error: 'Send a value, or SKIP where allowed.' };

  switch (step.key) {
    case 'name':
      if (value.length > 64) return { error: 'Keep the token name under 64 characters.' };
      return { value };
    case 'symbol': {
      const symbol = value.replace(/^\$/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!symbol || symbol.length > 12) return { error: 'Ticker must be 1–12 letters/numbers. Example: ORBIT' };
      return { value: symbol };
    }
    case 'description':
      if (value.length > 500) return { error: 'Description must be 500 characters or less.' };
      return { value };
    case 'logo': {
      const url = cleanUrl(value, false);
      if (!url) return { error: 'Send a public https:// image URL or ipfs:// URI.' };
      return { value: url };
    }
    case 'website':
    case 'twitter':
    case 'telegram':
    case 'discord':
    case 'farcaster': {
      const url = cleanUrl(value, true);
      if (url === null) return { error: 'Send a valid https:// URL, or SKIP.' };
      return { value: url };
    }
    case 'creatorFeeRecipient':
      if (!isAddress(value)) return { error: 'That is not a valid EVM wallet. Send a 0x address.' };
      return { value };
    case 'economics': {
      const match = value.match(/^\s*([0-9]+(?:\.[0-9]{1,2})?)\s*%?\s*[,;/ ]+\s*(yes|no|on|off|true|false)\s*$/i);
      if (!match) return { error: 'Reply like: 1%, YES  — or —  0%, NO' };
      const pct = Number(match[1]);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: 'Creator tax must be between 0% and 100%.' };
      return {
        value: {
          creatorTaxBps: Math.round(pct * 100),
          buybackEnabled: /^(yes|on|true)$/i.test(match[2])
        }
      };
    }
    default:
      return { value };
  }
}

function review(draft, dryRun) {
  const links = [draft.website, draft.twitter, draft.telegram, draft.discord, draft.farcaster].filter(Boolean).length;
  return `REVIEW\n${draft.name} · $${draft.symbol}\n${draft.description}\nCreator: ${draft.creatorFeeRecipient.slice(0, 8)}…${draft.creatorFeeRecipient.slice(-6)}\nTax: ${(draft.creatorTaxBps / 100).toFixed(2)}% · Buyback: ${draft.buybackEnabled ? 'ON' : 'OFF'} · Links: ${links}\nNetwork: Robinhood Chain\n\nReply CONFIRM to ${dryRun ? 'run a safe test' : 'launch'}. Reply BACK to edit or CANCEL.`;
}

export async function processMessage({ from, body, forceDryRun = false }) {
  const text = String(body || '').trim();
  const upper = text.toUpperCase();
  const configuredMode = String(process.env.EXECUTION_MODE || 'dry-run').toLowerCase();
  const dryRun = forceDryRun || configuredMode !== 'mainnet';

  if (!text) return { reply: 'Text LAUNCH to start.' };

  if (['CANCEL', 'RESET', 'STOPLAUNCH'].includes(upper)) {
    await clearSession(from);
    return { reply: 'Cancelled. Text LAUNCH whenever you want to start again.' };
  }

  let session = await getSession(from);

  if (!session) {
    if (!['LAUNCH', 'START', 'CREATE'].includes(upper)) {
      return { reply: `Text LAUNCH to start your token launch.${dryRun ? '\nTEST MODE — no transaction will be sent.' : ''}` };
    }
    session = { stage: 'collect', step: 0, draft: {}, startedAt: Date.now() };
    await setSession(from, session, SESSION_TTL);
    return { reply: `LAUNCH/SMS\nLaunch a token from this thread.${dryRun ? '\nTEST MODE — no transaction will be sent.' : ''}\n\n${STEPS[0].prompt}` };
  }

  if (upper === 'BACK') {
    if (session.stage === 'review') {
      session.stage = 'collect';
      session.step = STEPS.length - 1;
      await setSession(from, session, SESSION_TTL);
      return { reply: STEPS[session.step].prompt };
    }
    session.step = Math.max(0, Number(session.step || 0) - 1);
    await setSession(from, session, SESSION_TTL);
    return { reply: STEPS[session.step].prompt };
  }

  if (session.stage === 'review') {
    if (!['CONFIRM', 'YES', 'LAUNCH', 'LAUNCH IT'].includes(upper)) {
      return { reply: 'Reply CONFIRM to continue, BACK to edit, or CANCEL.' };
    }

    if (dryRun) {
      const check = await dryRunDraft(session.draft);
      await clearSession(from);
      const chainLine = check.status
        ? `Pons read OK · fee ${check.status.launchFeeEth} ETH · gate ${check.status.canLaunch === null ? 'not checked' : check.status.canLaunch ? 'OPEN FOR WALLET' : 'CLOSED FOR WALLET'}`
        : `Pons read: ${check.error || 'unavailable'}`;
      return { reply: `TEST COMPLETE ✓\nNo transaction was sent.\n${session.draft.name} · $${session.draft.symbol}\n${chainLine}\n\nSet EXECUTION_MODE=mainnet + ENABLE_ONCHAIN_LAUNCH=true only when ready.` };
    }

    try {
      const result = await launchFromDraft(session.draft);
      await clearSession(from);
      return { reply: `LIVE ✓\n${session.draft.name} · $${session.draft.symbol}\nToken: ${result.token}\n${result.explorer}\nTx: ${result.transaction}` };
    } catch (error) {
      return { reply: `Launch stopped safely: ${error.message}\nYour draft is still saved. Reply CONFIRM to retry, BACK to edit, or CANCEL.` };
    }
  }

  const step = STEPS[Number(session.step || 0)];
  if (!step) {
    session.stage = 'review';
    await setSession(from, session, SESSION_TTL);
    return { reply: review(session.draft, dryRun) };
  }

  const result = validateStep(step, text);
  if (result.error) return { reply: `${result.error}\n\n${step.prompt}` };

  if (step.key === 'economics') Object.assign(session.draft, result.value);
  else session.draft[step.key] = result.value;

  session.step += 1;
  if (session.step >= STEPS.length) {
    session.stage = 'review';
    await setSession(from, session, SESSION_TTL);
    return { reply: review(session.draft, dryRun) };
  }

  await setSession(from, session, SESSION_TTL);
  return { reply: STEPS[session.step].prompt };
}
