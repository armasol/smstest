const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const windowed = (x, a, b, c, d) => smooth(a, b, x) * (1 - smooth(c, d, x));

let publicPhone = '';
let publicDisplay = 'CONNECT NUMBER';

async function hydrateConfig() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    const c = await r.json();
    publicPhone = String(c.phone || '').replace(/[^+\d]/g, '');
    publicDisplay = c.display || c.phone || 'CONNECT NUMBER';
  } catch {}

  document.querySelectorAll('.public-phone').forEach(el => {
    el.textContent = publicDisplay;
    if (el.matches('.copy-number')) el.dataset.number = publicPhone;
  });
  document.querySelectorAll('.sms-link').forEach(a => {
    if (!publicPhone) {
      a.href = '/docs#connect';
      return;
    }
    const body = encodeURIComponent('LAUNCH');
    a.href = `sms:${publicPhone}?&body=${body}`;
  });
}
hydrateConfig();

const toast = document.getElementById('toast');
document.querySelectorAll('.copy-number').forEach(button => {
  button.addEventListener('click', async () => {
    if (!publicPhone) { location.href = '/docs#connect'; return; }
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

  const introOut = 1 - smooth(.07, .20, p);
  copy.style.opacity = introOut;
  copy.style.transform = `translate3d(0,${mix(0, -70, smooth(.06,.22,p))}px,0) scale(${mix(1,.96,smooth(.06,.22,p))})`;
  copy.style.pointerEvents = p < .15 ? 'auto' : 'none';

  let scale;
  if (p < .28) scale = mix(1.46, .86, smooth(.02,.28,p));
  else scale = mix(.86, .70, smooth(.28,.72,p));
  const y = p < .25 ? mix(39, 4, smooth(0,.25,p)) : mix(4, 1, smooth(.25,.70,p));
  const x = mix(0, -17, smooth(.47,.72,p)) + mix(0, 30, smooth(.78,.97,p));
  const rot = mix(0, -7, smooth(.33,.60,p)) + mix(0, 10, smooth(.77,.96,p));
  phone.style.transform = `translate3d(${x}vw,${y}vh,0) scale(${scale}) rotateY(${rot}deg)`;
  phone.style.opacity = 1 - smooth(.91,.99,p);

  wordText.style.opacity = windowed(p,.17,.24,.36,.43);
  wordText.style.transform = `translate3d(${mix(-10,0,smooth(.17,.25,p))}vw,${mix(30,0,smooth(.17,.25,p))}px,0)`;
  wordConfirm.style.opacity = windowed(p,.40,.47,.60,.68);
  wordConfirm.style.transform = `translate3d(${mix(10,0,smooth(.40,.48,p))}vw,0,0)`;
  wordLive.style.opacity = windowed(p,.67,.74,.88,.95);
  wordLive.style.transform = `scale(${mix(.88,1,smooth(.67,.76,p))})`;

  const cardOpacity = windowed(p,.40,.50,.75,.84);
  cards.forEach((card, i) => {
    if (!card) return;
    card.style.opacity = cardOpacity;
    const sign = i === 1 ? 1 : -1;
    card.style.transform = `translate3d(0,${mix(40,0,smooth(.41 + i*.02,.54 + i*.02,p))}px,0) rotate(${sign * mix(4,0,smooth(.43,.58,p))}deg)`;
  });

  const receiptIn = smooth(.82,.91,p);
  liveReceipt.style.opacity = receiptIn;
  liveReceipt.style.transform = `translate3d(${mix(20,0,receiptIn)}vw,${mix(40,0,receiptIn)}px,0) scale(${mix(.92,1,receiptIn)})`;

  bubbles.forEach((bubble, i) => {
    const start = .22 + i * .065;
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
