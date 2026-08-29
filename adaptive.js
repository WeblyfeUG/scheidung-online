/* ============================================================
   Adaptive Auslieferung (v2): kleine Viewports (<768px) erhalten
   die dedizierte Mobile-App-Ansicht (mobil.html), der Hash
   (#start / #vorbereiten / #rechner) bleibt erhalten.
   Override: ?desktop=1 erzwingt Desktop für die Sitzung.
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
  var file = decodeURIComponent(location.pathname.split('/').pop());
  if (file === '' || file === 'index.html' || file === 'Startseite.html') {
    location.replace('mobil.html' + location.hash);
  }
})();
