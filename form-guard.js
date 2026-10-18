/* ============================================================
   Formular-Schutz (Feedback 12.10.): Plausibilitätsprüfung gegen
   Fantasie-Eingaben + unsichtbares Fangfeld + Mindest-Ausfüllzeit.
   Kein Captcha, keine Cookies. Die Route /api/lead prüft dieselben
   Regeln serverseitig noch einmal (dort ist die eigentliche Sperre).
   ============================================================ */
(function () {
  'use strict';
  var T0 = Date.now();
  var VOWELS = /[aeiouyäöüàáâéèêíìîóòôúùûæøå]/;
  var KEYBOARD = ['qwer', 'wert', 'ertz', 'rtzu', 'tzui', 'zuio', 'uiop', 'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl', 'yxcv', 'zxcv', 'xcvb', 'cvbn', 'vbnm'];
  var JUNK = ['test', 'asd', 'abc', 'xxx', 'bla', 'blabla', 'dummy', 'fake', 'spam', 'keine', 'nichts', 'egal'];

  /* true = sieht nach Tastatur-Geklimper aus */
  function gibberish(v) {
    var s = String(v || '').toLowerCase();
    var letters = s.replace(/[^a-zäöüßàáâéèêíìîóòôúùûæøåçñ]/g, '');
    if (!letters) return true;
    if (JUNK.indexOf(s.trim()) !== -1) return true;
    if (/(.)\1\1/.test(letters)) return true;
    for (var i = 0; i < KEYBOARD.length; i++) if (letters.indexOf(KEYBOARD[i]) !== -1) return true;
    var words = s.split(/[\s.,'’\/()-]+/);
    for (var j = 0; j < words.length; j++) {
      var w = words[j].replace(/[^a-zäöüßàáâéèêíìîóòôúùûæøåçñ]/g, '');
      if (w.length >= 4 && !VOWELS.test(w)) return true;
      if (/[^aeiouyäöüàáâéèêíìîóòôúùûæøå]{6,}/.test(w)) return true;
    }
    return false;
  }

  var RULES = {
    name: function (v) {
      return v.length >= 2 && v.length <= 80 && /^[\p{L}][\p{L}'’ .-]*$/u.test(v) && !gibberish(v);
    },
    ort: function (v) {
      return v.length >= 2 && v.length <= 60 && /^[\p{L}][\p{L}'’ .()\/-]*$/u.test(v) && !gibberish(v);
    },
    plz: function (v) {
      return /^\d{5}$/.test(v) && v !== '00000';
    },
    phone: function (v) {
      var d = v.replace(/\D/g, '');
      return /^[+0-9 ()\/-]{6,25}$/.test(v) && d.length >= 6 && d.length <= 15 && !/^(\d)\1+$/.test(d);
    },
    email: function (v) {
      /* keine ? & = # / < > " ' und keine Leerzeichen — Umlaut-/IDN-Adressen bleiben erlaubt */
      return v.length <= 254 && /^[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}\-]+(\.[\p{L}\p{N}\-]+)*\.[\p{L}]{2,}$/u.test(v);
    },
    address: function (v) {
      return v.length >= 5 && v.length <= 200 && /\p{L}{2,}/u.test(v) && !gibberish(v.replace(/[0-9]/g, ' '));
    }
  };

  var MSG = {
    name: 'Bitte prüfen Sie Ihre Eingabe — bitte nur Buchstaben, Leerzeichen und Bindestriche.',
    ort: 'Bitte geben Sie einen gültigen Ort an.',
    plz: 'Bitte geben Sie eine fünfstellige Postleitzahl an.',
    phone: 'Bitte geben Sie eine gültige Telefonnummer an (Ziffern, + und Leerzeichen).',
    email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.',
    address: 'Bitte prüfen Sie die Anschrift (Straße, PLZ, Ort).'
  };

  /* '' = in Ordnung, sonst Fehlermeldung */
  function check(type, value) {
    var v = String(value || '').trim();
    if (!v || !RULES[type]) return '';
    return RULES[type](v) ? '' : MSG[type];
  }

  /* Unsichtbares Fangfeld (ohne name → wird nie gespeichert/übertragen) */
  function protect(form) {
    if (!form || form.querySelector('.so-hp')) return;
    var w = document.createElement('div');
    w.setAttribute('aria-hidden', 'true');
    w.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;';
    w.innerHTML = '<label>Website<input class="so-hp" type="text" tabindex="-1" autocomplete="off"></label>';
    form.appendChild(w);
  }

  function meta(form) {
    var hp = form && form.querySelector('.so-hp');
    return { hp: hp ? hp.value : '', fill_ms: Date.now() - T0 };
  }

  var api = { check: check, gibberish: gibberish, protect: protect, meta: meta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; /* api/lead.js */
  else window.SOGuard = api;
})();
