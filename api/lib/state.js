import crypto from 'node:crypto';
import { hasSupabase, sb } from './supabase.js';

const memory = new Map();
const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40);
const sessionKey = (sender) => `launchsms:session:${digest(sender)}`;
const webhookKey = (fingerprint) => `launchsms:webhook:${digest(fingerprint)}`;

export async function setSession(sender, payload, ttlSeconds = 3600) {
  const key = sessionKey(sender);
  if (hasSupabase()) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await sb('sms_sessions', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ session_key: key, payload, expires_at: expiresAt, updated_at: new Date().toISOString() })
    });
    return;
  }
  memory.set(key, { payload, expires: Date.now() + ttlSeconds * 1000 });
}

export async function getSession(sender) {
  const key = sessionKey(sender);
  if (hasSupabase()) {
    const rows = await sb(`sms_sessions?session_key=eq.${encodeURIComponent(key)}&select=payload,expires_at`);
    const row = rows?.[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await sb(`sms_sessions?session_key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
      return null;
    }
    return row.payload;
  }
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    memory.delete(key);
    return null;
  }
  return entry.payload;
}

export async function clearSession(sender) {
  const key = sessionKey(sender);
  if (hasSupabase()) {
    await sb(`sms_sessions?session_key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
    return;
  }
  memory.delete(key);
}

export async function claimWebhook(fingerprint, ttlSeconds = 86400) {
  const key = webhookKey(fingerprint);
  if (hasSupabase()) {
    try {
      const rows = await sb('webhook_dedup', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ fingerprint: key })
      });
      return Array.isArray(rows) && rows.length > 0;
    } catch {
      return false;
    }
  }
  const existing = memory.get(key);
  if (existing && Date.now() < existing.expires) return false;
  memory.set(key, { payload: true, expires: Date.now() + ttlSeconds * 1000 });
  return true;
}

export function stateBackend() {
  return hasSupabase() ? 'supabase' : 'memory';
}
