import crypto from 'node:crypto';
import { sb } from './supabase.js';
import { sendSms } from './hushsms.js';
import { getPonsStatus } from './pons.js';

const CLAIM_TTL_SECONDS = 30 * 60;
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export async function createLaunchClaim({ phone, draft }) {
  const status = await getPonsStatus();
  const token = crypto.randomBytes(24).toString('base64url');
  const salt = `0x${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + CLAIM_TTL_SECONDS * 1000).toISOString();

  await sb('launch_claims', {
    method: 'POST',
    body: JSON.stringify({
      token_hash: hashToken(token),
      phone,
      draft,
      launch_config_id: status.launchConfigId,
      salt,
      status: 'pending',
      expires_at: expiresAt
    })
  });

  return { token, expiresAt };
}

export async function getClaimByToken(token) {
  const rows = await sb(`launch_claims?token_hash=eq.${hashToken(token)}&select=*`);
  const row = rows?.[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now() && row.status === 'pending') {
    await sb(`launch_claims?token_hash=eq.${hashToken(token)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'expired', updated_at: new Date().toISOString() })
    }).catch(() => {});
    return { ...row, status: 'expired' };
  }
  return row;
}

export async function markSubmitted(token, txHash) {
  await sb(`launch_claims?token_hash=eq.${hashToken(token)}&status=eq.pending`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'submitted', tx_hash: txHash, updated_at: new Date().toISOString() })
  }).catch(() => {});
}

export async function markConfirmed(token, { phone, draft, tokenAddress, curveAddress }) {
  const rows = await sb(`launch_claims?token_hash=eq.${hashToken(token)}&status=in.(pending,submitted)`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'confirmed',
      token_address: tokenAddress,
      curve_address: curveAddress,
      updated_at: new Date().toISOString()
    })
  });

  if (!Array.isArray(rows) || rows.length === 0) return; // already confirmed by a concurrent poll
  const explorer = `https://robinhoodchain.blockscout.com/token/${tokenAddress}`;
  await sendSms({
    to: phone,
    body: `LIVE ✓\n${draft.name} · $${draft.symbol}\nToken: ${tokenAddress}\n${explorer}`
  }).catch((error) => console.error('claim confirm sms failed', error));
}

export async function markFailed(token, { phone, draft, error }) {
  const rows = await sb(`launch_claims?token_hash=eq.${hashToken(token)}&status=in.(pending,submitted)`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'failed', error, updated_at: new Date().toISOString() })
  });

  if (!Array.isArray(rows) || rows.length === 0) return;
  await sendSms({
    to: phone,
    body: `Launch failed: ${error}\n${draft.name} · $${draft.symbol} was not created. No funds were taken by us — check your wallet history.`
  }).catch((sendError) => console.error('claim fail sms failed', sendError));
}
