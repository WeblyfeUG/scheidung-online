/* ============================================================
   Mobile-Navigation — Drawer Toggle (geteilt: alle Seiten)
   ============================================================ */
(function () {
  'use strict';
  var toggle = document.getElementById('nav-toggle');
  var drawer = document.getElementById('nav-drawer');
  var scrim  = document.getElementById('nav-scrim');
  if (!toggle || !drawer) return;

  function open() {
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Menü schließen');
  }
  function close() {
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menü öffnen');
  }
  function toggleMenu() {
    if (document.body.classList.contains('nav-open')) close(); else open();
  }

  toggle.addEventListener('click', toggleMenu);
  if (scrim) scrim.addEventListener('click', close);

  // Klick auf einen Menüpunkt schließt das Menü
  drawer.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', close);
  });

  // Escape schließt
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  // Beim Wechsel auf Desktop-Breite Menü sicher schließen
  var mq = window.matchMedia('(min-width: 1241px)');
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function (ev) {
    if (ev.matches) close();
  });
})();
