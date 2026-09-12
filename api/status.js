import { getPonsStatus } from './lib/pons.js';
import { stateBackend } from './lib/state.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const pons = await getPonsStatus();
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, mode: process.env.EXECUTION_MODE || 'dry-run', state: stateBackend(), pons }));
  } catch (error) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, mode: process.env.EXECUTION_MODE || 'dry-run', state: stateBackend(), error: error.message }));
  }
}
