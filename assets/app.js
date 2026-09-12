const PHONE = '+15550137117';
const SMS_BODY = 'LAUNCH @orbitlabs $ORBIT';

document.querySelectorAll('.sms-link').forEach(a => {
  a.href = `sms:${PHONE}?&body=${encodeURIComponent(SMS_BODY)}`;
});

const toast = document.getElementById('toast');
document.querySelectorAll('.copy-number').forEach(button => {
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(button.dataset.number); }
    catch { /* clipboard can be unavailable in local file previews */ }
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1400);
  });
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

const stage = document.getElementById('stage');
if (stage && matchMedia('(pointer:fine)').matches) {
  stage.addEventListener('pointermove', e => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5;
    const y = (e.clientY - r.top) / r.height - .5;
    stage.style.setProperty('--mx', `${x * 16}px`);
    stage.style.setProperty('--my', `${y * 12}px`);
  });
  stage.addEventListener('pointerleave', () => {
    stage.style.setProperty('--mx', '0px'); stage.style.setProperty('--my', '0px');
  });
}
