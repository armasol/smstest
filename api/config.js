export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = 200;
  res.end(JSON.stringify({
    phone: process.env.PUBLIC_PHONE_NUMBER || '',
    display: process.env.PUBLIC_PHONE_DISPLAY || process.env.PUBLIC_PHONE_NUMBER || 'CONNECT NUMBER',
    executionMode: process.env.EXECUTION_MODE || 'dry-run'
  }));
}
