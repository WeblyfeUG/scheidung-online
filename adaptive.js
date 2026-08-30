/* ============================================================
   Adaptive Auslieferung (v2.1): kleine Viewports (<768px) erhalten
   die dedizierte Mobile-Ansicht der jeweiligen Seite, der Hash
   bleibt erhalten. Override: ?desktop=1 erzwingt Desktop (Sitzung).
   Funktioniert mit und ohne .html in der URL (Clean URLs).
   ============================================================ */
(function () {
  'use strict';
  var wantDesktop = false;
  try { wantDesktop = new URLSearchParams(location.search).get('desktop') === '1'; } catch (e) {}
  try {
    if (wantDesktop) sessionStorage.setItem('prefer-desktop', '1');
    else if (sessionStorage.getItem('prefer-desktop') === '1') wantDesktop = true;
  } catch (e) { /* Storage gesperrt → expliziter Parameter zählt trotzdem */ }
  if (wantDesktop) return;
  if (window.innerWidth >= 768) return;

  var MAP = {
    '': 'mobil.html',
    'index': 'mobil.html',
    'Startseite': 'mobil.html',
    'scheidungsunterlagen': 'scheidungsunterlagen-mobil.html',
    'scheidung-ohne-anwalt': 'scheidung-ohne-anwalt-mobil.html',
    'scheidungskosten': 'scheidungskosten-mobil.html',
    'anwaeltin-hannover': 'anwaeltin-hannover-mobil.html'
  };
  var file = decodeURIComponent(location.pathname.split('/').pop()).replace(/\.html$/, '');
  var target = MAP[file];
  if (target) location.replace(target + location.hash);
})();
