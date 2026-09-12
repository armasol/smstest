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
