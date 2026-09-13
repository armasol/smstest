const messages = document.getElementById('testerMessages');
const form = document.getElementById('testerForm');
const input = document.getElementById('testerInput');
const key = 'launchsms-test-session';
let sessionId = localStorage.getItem(key);
if (!sessionId) {
  sessionId = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9_-]/g, '');
  localStorage.setItem(key, sessionId);
}

function addMessage(text, who) {
  const div = document.createElement('div');
  div.className = `tester-msg ${who}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

async function send(text) {
  const body = String(text || '').trim();
  if (!body) return;
  addMessage(body, 'user');
  input.value = '';
  input.disabled = true;
  try {
    const response = await fetch('/api/test-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, body })
    });
    const data = await response.json();
    addMessage(data.reply || data.error || 'No response.', 'bot');
  } catch (error) {
    addMessage(`Tester error: ${error.message}`, 'bot');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
document.querySelectorAll('[data-quick]').forEach(button => button.addEventListener('click', () => send(button.dataset.quick)));

const countdownTrigger = document.getElementById('countdownTrigger');
const countdownReset = document.getElementById('countdownReset');
const countdownStatus = document.getElementById('countdownStatus');
const countdownLabel = countdownTrigger?.querySelector('span');
let countdownEndsAt = null;
async function resetCountdown() {
  countdownTrigger.disabled = true;
  countdownReset.disabled = true;
  countdownStatus.textContent = 'Resetting sitewide countdown…';
  try {
    const response = await fetch('/api/countdown', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to start countdown');
    countdownStatus.textContent = 'Live across the site for 10 minutes.';
    window.dispatchEvent(new CustomEvent('countdown:updated', { detail: data }));
  } catch (error) {
    countdownStatus.textContent = error.message;
  } finally {
    countdownTrigger.disabled = false;
    countdownReset.disabled = false;
  }
}
countdownTrigger?.addEventListener('click', resetCountdown);
countdownReset?.addEventListener('click', resetCountdown);

function paintCountdown(endsAt = countdownEndsAt) {
  countdownEndsAt = endsAt || null;
  const remaining = countdownEndsAt ? Math.max(0, (new Date(countdownEndsAt).getTime() - Date.now()) / 1000) : 0;
  if (countdownLabel) countdownLabel.textContent = remaining > 0 ? `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(Math.floor(remaining % 60)).padStart(2, '0')}` : '10:00';
  if (countdownStatus) countdownStatus.textContent = remaining > 0 ? 'Live across the site for 10 minutes.' : 'Countdown is idle. Reset it to 10:00.';
}
async function syncCountdown() {
  try {
    const response = await fetch('/api/countdown', { cache: 'no-store' });
    const data = await response.json();
    paintCountdown(data.endsAt);
  } catch {}
}
window.addEventListener('countdown:updated', event => paintCountdown(event.detail.endsAt));
syncCountdown();
setInterval(() => paintCountdown(), 1000);
setInterval(syncCountdown, 15000);
