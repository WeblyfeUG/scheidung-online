// Tweaks + FAQ Accordion + Mobile menu wiring
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentColor": "#C6A15B",
  "headlineFont": "Cormorant Garamond",
  "heroVariant": "split",
  "showFloatingCards": true
}/*EDITMODE-END*/;

function applyTweaks(t) {
  const root = document.documentElement;
  root.style.setProperty('--c-accent', t.accentColor);
  // Soft tint derived from accent
  const softMap = {
    '#C6A15B': '#E8D9B6', // gold
    '#6B8A6E': '#CBD8CC', // sage
    '#8C5A4C': '#D8C0B5', // terracotta
    '#5C6F8A': '#C5CCD8', // slate-blue
  };
  root.style.setProperty('--c-accent-soft', softMap[t.accentColor] || '#E8D9B6');
  root.style.setProperty('--ff-serif',
    `'${t.headlineFont}', Georgia, serif`);

  // Hero variant
  document.body.dataset.heroVariant = t.heroVariant;
  document.body.dataset.floating = t.showFloatingCards ? 'on' : 'off';

  const cards = document.querySelectorAll('.hero-floating-card');
  cards.forEach(c => c.style.display = t.showFloatingCards ? '' : 'none');
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => { applyTweaks(t); }, [t]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Akzentfarbe" />
      <TweakColor
        label="Accent"
        value={t.accentColor}
        options={['#C6A15B', '#6B8A6E', '#8C5A4C', '#5C6F8A']}
        onChange={(v) => setTweak('accentColor', v)}
      />
      <TweakSection label="Headline-Font" />
      <TweakSelect
        label="Serif"
        value={t.headlineFont}
        options={['Cormorant Garamond', 'Playfair Display', 'EB Garamond', 'Source Serif 4']}
        onChange={(v) => setTweak('headlineFont', v)}
      />
      <TweakSection label="Hero" />
      <TweakToggle
        label="Floating Cards"
        value={t.showFloatingCards}
        onChange={(v) => setTweak('showFloatingCards', v)}
      />
    </TweaksPanel>
  );
}

// Mount tweaks panel
const tweaksRoot = document.getElementById('tweaks-root');
if (tweaksRoot) {
  ReactDOM.createRoot(tweaksRoot).render(<App />);
}

/* ----------------- FAQ Accordion ----------------- */
document.querySelectorAll('.faq-item').forEach((item) => {
  const btn = item.querySelector('.faq-q');
  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    // Close all others
    document.querySelectorAll('.faq-item.open').forEach(o => o.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

/* ----------------- Mobile menu ----------------- */
const menuBtn = document.getElementById('menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
  });
  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => mobileMenu.classList.remove('open'));
  });
}

/* ----------------- Ablauf-Slider (mobil) ----------------- */
(function () {
  const track = document.querySelector('.process-timeline');
  const dotsWrap = document.querySelector('.process-dots');
  if (!track || !dotsWrap) return;
  const steps = Array.from(track.querySelectorAll('.process-step'));
  if (!steps.length) return;

  // Punkte erzeugen
  steps.forEach((step, i) => {
    const dot = document.createElement('button');
    dot.className = 'process-dot' + (i === 0 ? ' active' : '');
    dot.type = 'button';
    dot.setAttribute('aria-label', 'Zu Schritt ' + (i + 1));
    dot.addEventListener('click', () => {
      const tRect = track.getBoundingClientRect();
      const sRect = step.getBoundingClientRect();
      const delta = (sRect.left - tRect.left) - (track.clientWidth - step.clientWidth) / 2;
      track.scrollBy({ left: delta, behavior: 'smooth' });
    });
    dotsWrap.appendChild(dot);
  });
  const dots = Array.from(dotsWrap.children);

  // Aktiven Punkt beim Scrollen aktualisieren
  let raf = null;
  track.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const center = track.scrollLeft + track.clientWidth / 2;
      let best = 0, bestDist = Infinity;
      steps.forEach((step, i) => {
        const c = step.offsetLeft + step.offsetWidth / 2;
        const d = Math.abs(c - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      dots.forEach((dot, i) => dot.classList.toggle('active', i === best));
    });
  }, { passive: true });
})();
