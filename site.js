/* ============================================================
   Seiten-Interaktionen Startseite (ehem. app.jsx, ohne React/Babel)
   FAQ-Akkordeon · Mobile-Menü (Legacy) · Ablauf-Slider (mobil)
   ============================================================ */
(function () {
  'use strict';

  /* ----------------- FAQ Accordion ----------------- */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var btn = item.querySelector('.faq-q');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (o) { o.classList.remove('open'); });
      if (!isOpen) item.classList.add('open');
    });
  });

  /* ----------------- Mobile menu (Legacy-Markup) ----------------- */
  var menuBtn = document.getElementById('menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function () {
      mobileMenu.classList.toggle('open');
    });
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { mobileMenu.classList.remove('open'); });
    });
  }

  /* ----------------- Ablauf-Slider (mobil) ----------------- */
  var track = document.querySelector('.process-timeline');
  var dotsWrap = document.querySelector('.process-dots');
  if (!track || !dotsWrap) return;
  var steps = Array.prototype.slice.call(track.querySelectorAll('.process-step'));
  if (!steps.length) return;

  steps.forEach(function (step, i) {
    var dot = document.createElement('button');
    dot.className = 'process-dot' + (i === 0 ? ' active' : '');
    dot.type = 'button';
    dot.setAttribute('aria-label', 'Zu Schritt ' + (i + 1));
    dot.addEventListener('click', function () {
      var tRect = track.getBoundingClientRect();
      var sRect = step.getBoundingClientRect();
      var delta = (sRect.left - tRect.left) - (track.clientWidth - step.clientWidth) / 2;
      track.scrollBy({ left: delta, behavior: 'smooth' });
    });
    dotsWrap.appendChild(dot);
  });
  var dots = Array.prototype.slice.call(dotsWrap.children);

  var raf = null;
  track.addEventListener('scroll', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      var center = track.scrollLeft + track.clientWidth / 2;
      var best = 0, bestDist = Infinity;
      steps.forEach(function (step, i) {
        var c = step.offsetLeft + step.offsetWidth / 2;
        var d = Math.abs(c - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      dots.forEach(function (dot, i) { dot.classList.toggle('active', i === best); });
    });
  }, { passive: true });
})();
