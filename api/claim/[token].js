import { buildLaunchTransaction, getReceiptStatus } from '../lib/pons.js';
import { getClaimByToken, markConfirmed, markFailed, markSubmitted } from '../lib/claims.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const token = String(req.query?.token || '').trim();
  if (!token) return json(res, 400, { ok: false, error: 'Missing claim token' });

  const claim = await getClaimByToken(token).catch(() => null);
  if (!claim) return json(res, 404, { ok: false, error: 'This launch link was not found.' });
  if (claim.status === 'expired') return json(res, 410, { ok: false, error: 'This launch link has expired. Text LAUNCH to start again.', status: 'expired' });

  if (req.method === 'GET') {
    if (claim.status === 'confirmed') {
      return json(res, 200, {
        ok: true,
        status: 'confirmed',
        draft: claim.draft,
        token: claim.token_address,
        curve: claim.curve_address,
        explorerUrl: `https://robinhoodchain.blockscout.com/token/${claim.token_address}`
      });
    }
    if (claim.status === 'failed') {
      return json(res, 200, { ok: true, status: 'failed', draft: claim.draft, error: claim.error });
    }

    try {
      const tx = await buildLaunchTransaction(claim.draft, { launchConfigId: claim.launch_config_id, salt: claim.salt });
      return json(res, 200, { ok: true, status: claim.status, draft: claim.draft, tx });
    } catch (error) {
      return json(res, 200, { ok: false, status: claim.status, draft: claim.draft, error: error.message });
    }
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const txHash = String(body.txHash || '').trim();
    if (!txHash) return json(res, 400, { ok: false, error: 'Missing txHash' });

    if (claim.status === 'pending') await markSubmitted(token, txHash);
    if (claim.status === 'confirmed') {
      return json(res, 200, { ok: true, status: 'confirmed', token: claim.token_address, curve: claim.curve_address, explorerUrl: `https://robinhoodchain.blockscout.com/token/${claim.token_address}` });
    }
    if (claim.status === 'failed') return json(res, 200, { ok: true, status: 'failed', error: claim.error });

    const receipt = await getReceiptStatus(txHash).catch(() => ({ state: 'pending' }));
    if (receipt.state === 'pending') return json(res, 200, { ok: true, status: 'pending' });

    if (receipt.state === 'reverted') {
      await markFailed(token, { phone: claim.phone, draft: claim.draft, error: 'Transaction reverted on chain' });
      return json(res, 200, { ok: true, status: 'failed', error: 'Transaction reverted on chain' });
    }

    await markConfirmed(token, { phone: claim.phone, draft: claim.draft, tokenAddress: receipt.token, curveAddress: receipt.curve });
    return json(res, 200, {
      ok: true,
      status: 'confirmed',
      token: receipt.token,
      curve: receipt.curve,
      explorerUrl: `https://robinhoodchain.blockscout.com/token/${receipt.token}`
    });
  }

  return json(res, 405, { ok: false, error: 'GET or POST only' });
}
