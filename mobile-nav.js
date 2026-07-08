/* Mobile-Version — Sheet-Menü, Sticky-CTA, FAQ-Akkordeon */
(function () {
  'use strict';

  /* ---- Sheet-Menü ---- */
  var burger = document.getElementById('m-burger');
  var scrim = document.getElementById('m-scrim');
  var sheet = document.getElementById('m-sheet');

  function closeMenu() {
    document.body.classList.remove('menu-open');
    if (burger) burger.setAttribute('aria-expanded', 'false');
  }
  if (burger) {
    burger.addEventListener('click', function () {
      var open = document.body.classList.toggle('menu-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  if (scrim) scrim.addEventListener('click', closeMenu);
  if (sheet) {
    sheet.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  /* ---- Sticky-CTA: erscheint nach dem Hero ---- */
  var bar = document.getElementById('m-stickybar');
  var sentinel = document.getElementById('m-sticky-sentinel');
  if (bar && sentinel) {
    var ticking = false;
    var updateBar = function () {
      ticking = false;
      bar.classList.toggle('show', sentinel.getBoundingClientRect().bottom < 60);
    };
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateBar);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    updateBar();
  } else if (bar) {
    bar.classList.add('show');
  }

  /* ---- FAQ-Akkordeon ---- */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', function () {
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (o) {
        o.classList.remove('open');
        var b = o.querySelector('.faq-q');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        q.setAttribute('aria-expanded', 'true');
      }
    });
  });
})();
