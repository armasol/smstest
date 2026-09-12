function cleanHandle(input = '') {
  const xUrl = input.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/i);
  if (xUrl) return xUrl[1];
  const at = input.match(/@([A-Za-z0-9_]{1,15})/);
  return at?.[1] || null;
}

export function parseLaunchCommand(body = '') {
  const text = body.trim();
  if (!/^launch\b/i.test(text)) return null;
  const handle = cleanHandle(text);
  if (!handle) return { error: 'Missing X handle' };

  const tickerMatch = text.match(/\$([A-Za-z][A-Za-z0-9]{1,9})\b/);
  const ticker = (tickerMatch?.[1] || handle).replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
  return { handle, ticker };
}

export async function fetchXProfile(handle) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return {
      username: handle,
      name: handle,
      description: `Token launched from @${handle} via Launch/SMS.`,
      profile_image_url: '',
      url: `https://x.com/${handle}`,
      source: 'fallback'
    };
  }

  const fields = 'description,name,profile_image_url,url,username,verified';
  const response = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=${fields}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`X profile lookup failed (${response.status})`);
  const json = await response.json();
  if (!json.data) throw new Error('X profile not found');

  const p = json.data;
  return {
    username: p.username,
    name: p.name || p.username,
    description: (p.description || `Token launched from @${p.username}.`).slice(0, 500),
    profile_image_url: (p.profile_image_url || '').replace('_normal.', '_400x400.'),
    url: p.url || `https://x.com/${p.username}`,
    source: 'x'
  };
}
