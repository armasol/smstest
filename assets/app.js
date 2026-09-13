const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const windowed = (x, a, b, c, d) => smooth(a, b, x) * (1 - smooth(c, d, x));

const expiredLaunchNumber = '+1 821-218-5906';
let publicPhone = '';
let publicDisplay = 'TEXT TO LAUNCH';

function renderPublicPhone(display, phone = publicPhone) {
  document.querySelectorAll('.public-phone').forEach(el => {
    el.textContent = display;
    if (el.matches('.copy-number')) el.dataset.number = phone;
  });
  document.querySelectorAll('.sms-link').forEach(a => {
    if (!phone) {
      a.href = '/docs#start';
      return;
    }
    a.href = `sms:${phone}?&body=${encodeURIComponent('LAUNCH')}`;
  });
}

async function hydrateConfig() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    const c = await r.json();
    publicPhone = String(c.phone || '').replace(/[^+\d]/g, '');
    publicDisplay = c.display || c.phone || 'TEXT TO LAUNCH';
  } catch {}

  renderPublicPhone(publicDisplay);
}
hydrateConfig();

const siteCountdown = document.getElementById('siteCountdown');
const siteCountdownLabel = document.getElementById('siteCountdownLabel');
const siteCountdownTime = document.getElementById('siteCountdownTime');
let countdownEndsAt = null;
function paintSiteCountdown() {
  if (!countdownEndsAt) {
    if (siteCountdown) siteCountdown.hidden = false;
    if (siteCountdownLabel) siteCountdownLabel.textContent = 'CONNECT NUMBER';
    if (siteCountdownTime) {
      siteCountdownTime.textContent = expiredLaunchNumber;
      siteCountdownTime.href = `sms:${expiredLaunchNumber.replace(/[^+\d]/g, '')}?&body=${encodeURIComponent('LAUNCH')}`;
    }
    renderPublicPhone(expiredLaunchNumber, expiredLaunchNumber.replace(/[^+\d]/g, ''));
    return;
  }
  const remaining = Math.max(0, (new Date(countdownEndsAt).getTime() - Date.now()) / 1000);
  if (remaining <= 0) {
    countdownEndsAt = null;
    paintSiteCountdown();
    return;
  }
  if (siteCountdown) siteCountdown.hidden = false;
  if (siteCountdownLabel) siteCountdownLabel.textContent = 'NUMBER LAUNCH IN';
  if (siteCountdownTime) {
    siteCountdownTime.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
    siteCountdownTime.removeAttribute('href');
  }
  renderPublicPhone(publicDisplay);
}
async function syncSiteCountdown() {
  try {
    const response = await fetch('/api/countdown', { cache: 'no-store' });
    const data = await response.json();
    countdownEndsAt = data.endsAt || null;
    paintSiteCountdown();
  } catch {}
}
syncSiteCountdown();
setInterval(syncSiteCountdown, 15000);
setInterval(paintSiteCountdown, 1000);

const toast = document.getElementById('toast');
document.querySelectorAll('.copy-number').forEach(button => {
  button.addEventListener('click', async () => {
    if (!publicPhone) { location.href = '/docs#start'; return; }
    try { await navigator.clipboard.writeText(publicPhone); } catch {}
    toast?.classList.add('show');
    setTimeout(() => toast?.classList.remove('show'), 1300);
  });
});

const revealObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add('visible');
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

const hero = document.getElementById('hero');
const phone = document.getElementById('phoneStage');
const copy = document.getElementById('heroCopy');
const wordText = document.getElementById('wordText');
const wordConfirm = document.getElementById('wordConfirm');
const wordLive = document.getElementById('wordLive');
const liveReceipt = document.getElementById('liveReceipt');
const cards = [document.getElementById('metaOne'), document.getElementById('metaTwo'), document.getElementById('metaThree')];
const scrollCue = document.getElementById('scrollCue');
const bubbles = [...document.querySelectorAll('#heroChat .bubble')];

let ticking = false;
function paintHero() {
  ticking = false;
  if (!hero || !phone) return;
  const rect = hero.getBoundingClientRect();
  const range = Math.max(1, hero.offsetHeight - innerHeight);
  const p = clamp(-rect.top / range);

  // Phase 1: the headline owns the first screen. The phone sits fully centered beneath it.
  const introOut = 1 - smooth(.075, .19, p);
  copy.style.opacity = introOut;
  copy.style.transform = `translate3d(-50%,${mix(0, -48, smooth(.055,.20,p))}px,0) scale(${mix(1,.975,smooth(.055,.20,p))})`;
  copy.style.pointerEvents = p < .14 ? 'auto' : 'none';

  // Phase 2: lift the phone straight into the center — never off to a side.
  const mobile = innerWidth <= 560;
  const tablet = innerWidth <= 900;
  const settle = smooth(.035, .235, p);
  const initialScale = mobile ? .56 : (tablet ? .58 : .60);
  const focusScale = mobile ? .79 : (tablet ? .81 : .84);
  const liftVh = mobile ? -52 : (tablet ? -50 : -49);
  const scale = p < .72 ? mix(initialScale, focusScale, settle) : mix(focusScale, focusScale * .95, smooth(.72,.86,p));
  const y = mix(0, liftVh, settle) + mix(0, -1.5, smooth(.42,.72,p));
  const rotX = mix(0, -1.2, smooth(.26,.48,p)) + mix(0, 1.2, smooth(.55,.76,p));
  const phoneOut = smooth(.82,.915,p);
  phone.style.transform = `translate3d(0,${y}vh,0) scale(${scale}) rotateX(${rotX}deg)`;
  phone.style.opacity = 1 - phoneOut;
  phone.style.filter = `blur(${mix(0,8,phoneOut)}px)`;

  // Large kinetic words remain centered behind the device.
  const textIn = windowed(p,.19,.265,.36,.445);
  wordText.style.opacity = textIn;
  wordText.style.transform = `translateX(-50%) translateY(${mix(34,0,smooth(.19,.28,p))}px) scale(${mix(.94,1,smooth(.19,.28,p))})`;

  const confirmIn = windowed(p,.41,.49,.60,.69);
  wordConfirm.style.opacity = confirmIn;
  wordConfirm.style.transform = `translateX(-50%) translateY(${mix(26,0,smooth(.41,.50,p))}px) scale(${mix(.95,1,smooth(.41,.50,p))})`;

  const liveWordIn = windowed(p,.66,.735,.83,.90);
  wordLive.style.opacity = liveWordIn;
  wordLive.style.transform = `translateX(-50%) translateY(${mix(22,0,smooth(.66,.75,p))}px) scale(${mix(.94,1,smooth(.66,.75,p))})`;

  const cardOpacity = windowed(p,.385,.49,.70,.80);
  cards.forEach((card, i) => {
    if (!card) return;
    card.style.opacity = cardOpacity;
    const sign = i === 1 ? 1 : -1;
    const rise = smooth(.40 + i*.018,.525 + i*.018,p);
    card.style.transform = `translate3d(0,${mix(38,0,rise)}px,0) rotate(${sign * mix(3.5,0,rise)}deg) scale(${mix(.96,1,rise)})`;
  });

  // Final phase: the phone dissolves and the onchain receipt replaces it in the same center line.
  const receiptIn = smooth(.825,.91,p);
  liveReceipt.style.opacity = receiptIn;
  liveReceipt.style.transform = `translateX(-50%) translateY(${mix(42,0,receiptIn)}px) scale(${mix(.92,1,receiptIn)})`;

  bubbles.forEach((bubble, i) => {
    const start = .205 + i * .067;
    const show = smooth(start, start + .045, p);
    bubble.style.opacity = show;
    bubble.style.transform = `translateY(${mix(14,0,show)}px) scale(${mix(.98,1,show)})`;
  });

  if (scrollCue) scrollCue.style.opacity = 1 - smooth(.02,.14,p);
  document.documentElement.style.setProperty('--hero-p', p.toFixed(4));
}
function queueHero() { if (!ticking) { ticking = true; requestAnimationFrame(paintHero); } }
addEventListener('scroll', queueHero, { passive: true });
addEventListener('resize', queueHero, { passive: true });
paintHero();
