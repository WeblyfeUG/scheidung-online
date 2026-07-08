/* ============================================================
   Adaptive Auslieferung: kleine Viewports → dedizierte Mobile-Seiten
   Override: ?desktop=1 (gilt für die Sitzung) erzwingt Desktop.
   ============================================================ */
(function () {
  'use strict';
  var MAP = {
    '': 'mobil-startseite.html',
    'index.html': 'mobil-startseite.html',
    'Startseite.html': 'mobil-startseite.html',
    'Scheidungskostenrechner.html': 'mobil-kostenrechner.html',
    'Online-Scheidung vorbereiten.html': 'mobil-scheidung-vorbereiten.html'
  };
  try {
    if (new URLSearchParams(location.search).get('desktop') === '1') {
      sessionStorage.setItem('prefer-desktop', '1');
      return;
    }
    if (sessionStorage.getItem('prefer-desktop') === '1') return;
  } catch (e) { /* Storage gesperrt → normal weiter */ }
  if (window.innerWidth > 640) return;
  var file = decodeURIComponent(location.pathname.split('/').pop());
  var target = MAP[file];
  if (target) location.replace(target + location.hash);
})();
