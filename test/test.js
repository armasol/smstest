const messages = document.getElementById('testerMessages');
const form = document.getElementById('testerForm');
const input = document.getElementById('testerInput');
const key = 'imessagefun-test-session';
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
const countdownToggle = document.getElementById('countdownToggle');
const countdownMinutes = document.getElementById('countdownMinutes');
const countdownStatus = document.getElementById('countdownStatus');
let countdownMinutesValue = 5;
const countdownLabel = countdownTrigger?.querySelector('span');
let countdownEndsAt = null;
let countdownEnabled = true;
async function updateCountdown(enabled, message) {
  countdownTrigger.disabled = true;
  countdownReset.disabled = true;
  countdownToggle.disabled = true;
  countdownStatus.textContent = message;
  try {
    const response = await fetch('/api/countdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, minutes: Number(countdownMinutes?.value) || countdownMinutesValue })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update countdown');
    countdownMinutesValue = data.minutes || Number(countdownMinutes?.value) || 5;
    if (countdownMinutes) countdownMinutes.value = String(countdownMinutesValue);
    countdownStatus.textContent = data.enabled ? `Live across the site for ${countdownMinutesValue} minute${countdownMinutesValue === 1 ? '' : 's'}.` : 'Countdown is off across the site.';
    window.dispatchEvent(new CustomEvent('countdown:updated', { detail: data }));
  } catch (error) {
    countdownStatus.textContent = error.message;
  } finally {
    countdownTrigger.disabled = false;
    countdownReset.disabled = false;
    countdownToggle.disabled = false;
  }
}
function resetCountdown() { return updateCountdown(true, 'Resetting sitewide countdown…'); }
countdownTrigger?.addEventListener('click', resetCountdown);
countdownReset?.addEventListener('click', resetCountdown);
countdownToggle?.addEventListener('click', () => updateCountdown(!countdownEnabled, 'Updating sitewide countdown…'));

const statusValue = document.getElementById('statusValue');
const statusToggle = document.getElementById('statusToggle');
const statusSave = document.getElementById('statusSave');
const statusMessage = document.getElementById('statusMessage');
let statusEnabled = true;
async function syncStatus() {
  try {
    const response = await fetch('/api/status-control', { cache: 'no-store' });
    const data = await response.json();
    statusEnabled = data.enabled !== false;
    if (statusValue) statusValue.value = data.value || 'NOT LAUNCHED';
    paintStatus();
  } catch {}
}
function paintStatus(message) {
  if (statusToggle) {
    statusToggle.textContent = statusEnabled ? 'STATUS ON' : 'STATUS OFF';
    statusToggle.setAttribute('aria-pressed', String(statusEnabled));
  }
  if (statusMessage && message) statusMessage.textContent = message;
}
async function saveStatus() {
  statusSave.disabled = true;
  statusToggle.disabled = true;
  statusMessage.textContent = 'Updating sitewide status…';
  try {
    const response = await fetch('/api/status-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: statusValue.value, enabled: statusEnabled }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update status');
    statusEnabled = data.enabled !== false;
    statusValue.value = data.value;
    paintStatus(statusEnabled ? 'Status is live across the site.' : 'Status is off across the site.');
  } catch (error) { statusMessage.textContent = error.message; }
  finally { statusSave.disabled = false; statusToggle.disabled = false; }
}
statusToggle?.addEventListener('click', () => { statusEnabled = !statusEnabled; paintStatus(); saveStatus(); });
statusSave?.addEventListener('click', saveStatus);
syncStatus();
setInterval(syncStatus, 15000);

function paintCountdown(endsAt = countdownEndsAt, enabled = countdownEnabled, minutes = countdownMinutesValue) {
  countdownMinutesValue = minutes || countdownMinutesValue;
  if (countdownMinutes) countdownMinutes.value = String(countdownMinutesValue);
  countdownEndsAt = endsAt || null;
  countdownEnabled = enabled !== false;
  const remaining = countdownEnabled && countdownEndsAt ? Math.max(0, (new Date(countdownEndsAt).getTime() - Date.now()) / 1000) : 0;
  if (countdownLabel) countdownLabel.textContent = remaining > 0 ? `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(Math.floor(remaining % 60)).padStart(2, '0')}` : `${String(countdownMinutesValue).padStart(2, '0')}:00`;
  if (countdownToggle) {
    countdownToggle.textContent = countdownEnabled ? 'COUNTDOWN ON' : 'COUNTDOWN OFF';
    countdownToggle.setAttribute('aria-pressed', String(countdownEnabled));
  }
  if (countdownStatus) countdownStatus.textContent = !countdownEnabled ? 'Countdown is off across the site.' : remaining > 0 ? 'Live across the site for 10 minutes.' : 'Countdown is idle. Reset it to 10:00.';
}
async function syncCountdown() {
  try {
    const response = await fetch('/api/countdown', { cache: 'no-store' });
    const data = await response.json();
    paintCountdown(data.endsAt, data.enabled, data.minutes);
  } catch {}
}
window.addEventListener('countdown:updated', event => paintCountdown(event.detail.endsAt, event.detail.enabled, event.detail.minutes));
syncCountdown();
setInterval(() => paintCountdown(), 1000);
setInterval(syncCountdown, 15000);
