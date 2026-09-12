const memory = new Map();

const hasRedis = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const keyFor = (phone) => `launchsms:pending:${phone.replace(/[^+\d]/g, '')}`;

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

export async function setPending(phone, payload, ttlSeconds = 900) {
  const key = keyFor(phone);
  if (hasRedis()) {
    await redis('SET', key, JSON.stringify(payload), 'EX', ttlSeconds);
    return;
  }
  memory.set(key, { payload, expires: Date.now() + ttlSeconds * 1000 });
}

export async function getPending(phone) {
  const key = keyFor(phone);
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

export async function clearPending(phone) {
  const key = keyFor(phone);
  if (hasRedis()) {
    await redis('DEL', key);
    return;
  }
  memory.delete(key);
}
