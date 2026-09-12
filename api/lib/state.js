import crypto from 'node:crypto';

const memory = new Map();
const hasRedis = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40);
const sessionKey = (sender) => `launchsms:session:${digest(sender)}`;
const webhookKey = (fingerprint) => `launchsms:webhook:${digest(fingerprint)}`;

async function redis(command, ...args) {
  const base = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const path = [command, ...args].map(v => encodeURIComponent(String(v))).join('/');
  const response = await fetch(`${base}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Redis ${command} failed (${response.status})`);
  return (await response.json()).result;
}

export async function setSession(sender, payload, ttlSeconds = 3600) {
  const key = sessionKey(sender);
  if (hasRedis()) {
    await redis('SET', key, JSON.stringify(payload), 'EX', ttlSeconds);
    return;
  }
  memory.set(key, { payload, expires: Date.now() + ttlSeconds * 1000 });
}

export async function getSession(sender) {
  const key = sessionKey(sender);
  if (hasRedis()) {
    const value = await redis('GET', key);
    return value ? JSON.parse(value) : null;
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
  if (hasRedis()) {
    await redis('DEL', key);
    return;
  }
  memory.delete(key);
}

export async function claimWebhook(fingerprint, ttlSeconds = 86400) {
  const key = webhookKey(fingerprint);
  if (hasRedis()) {
    const result = await redis('SET', key, '1', 'NX', 'EX', ttlSeconds);
    return result === 'OK';
  }
  const existing = memory.get(key);
  if (existing && Date.now() < existing.expires) return false;
  memory.set(key, { payload: true, expires: Date.now() + ttlSeconds * 1000 });
  return true;
}

export function stateBackend() {
  return hasRedis() ? 'upstash' : 'memory';
}
