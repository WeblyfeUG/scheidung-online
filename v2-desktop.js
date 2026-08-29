var __RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/* FAQ-Akkordeon */
(function () {
  'use strict';
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



  (function () {
    'use strict';

    /* ============================================================
       Make.com Webhook
       ============================================================ */
    const LEAD_ENDPOINT = '/api/lead'; /* Serverseitige Same-Origin-Route — validiert, rate-limitet, leitet weiter. Kein Webhook im Frontend. */

    const TOTAL = 6;
    const STORAGE_KEY = "scheidung-wizard-v2";

    const form         = document.getElementById('wz-form');
    const steps        = Array.from(document.querySelectorAll('#view-vorbereiten .wz-step'));
    const bar          = document.getElementById('bar');
    const pctEl        = document.getElementById('pct');
    const curStepEl    = document.getElementById('cur-step');
    const dotsWrap     = document.getElementById('dots');
    const btnBack      = document.getElementById('btn-back');
    const btnNext      = document.getElementById('btn-next');
    const feedback     = document.getElementById('feedback');
    const feedbackTxt  = document.getElementById('feedback-text');
    const successEl    = document.getElementById('success');
    const progressWrap = document.getElementById('progress-wrap');
    const submitError  = document.getElementById('submit-error');
    const childrenBlock= document.getElementById('children-block');

    let current = 1;

    /* Encouraging messages keyed by the step the user JUST completed */
    const FEEDBACK = {
      1: "Danke — so können wir Sie persönlich erreichen.",
      2: "Perfekt. Das hilft uns, Ihre Situation einzuschätzen.",
      3: "Gut gemacht. Die wichtigsten Personen sind erfasst.",
      4: "Vielen Dank. Wir sind fast fertig.",
      5: "Nur noch ein letzter Schritt."
    };

    /* ---- Build progress dots ---- */
    for (let i = 1; i <= TOTAL; i++) {
      const d = document.createElement('span');
      d.className = 'wz-dot';
      d.dataset.dot = i;
      dotsWrap.appendChild(d);
    }
    const dots = Array.from(dotsWrap.children);

    function updateProgress() {
      const pct = Math.round((current / TOTAL) * 100);
      bar.style.width = pct + '%';
      pctEl.textContent = pct;
      curStepEl.textContent = current;
      dots.forEach((d, idx) => {
        const n = idx + 1;
        d.classList.toggle('done', n < current);
        d.classList.toggle('active', n === current);
      });
    }

    function showStep(n, dir) {
      steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === n));
      current = n;
      updateProgress();
      btnBack.disabled = (n === 1);
      btnNext.querySelector('.label').textContent = (n === TOTAL) ? 'Scheidung jetzt starten' : 'Weiter';
      const top = progressWrap.getBoundingClientRect().top + window.pageYOffset - 90;
      if (window.pageYOffset > top + 40 || dir === 'back') {
        window.scrollTo({ top: Math.max(0, top), behavior: __RM ? 'auto' : 'smooth' });
      }
    }

    function showFeedback(forStep) {
      const msg = FEEDBACK[forStep];
      if (!msg) { feedback.classList.remove('show'); return; }
      feedbackTxt.textContent = msg;
      feedback.classList.remove('show');
      void feedback.offsetWidth;
      feedback.classList.add('show');
    }

    /* ============================================================
       Validation
       ============================================================ */
    function setErr(field, on) {
      const wrap = field.closest('.wz-field');
      if (!wrap) return;
      field.classList.toggle('invalid', on);
      const err = wrap.querySelector('.wz-err');
      if (err) err.classList.toggle('show', on);
    }

    function validateStep(n) {
      const stepEl = steps.find(s => Number(s.dataset.step) === n);
      let firstBad = null;

      /* text/date/email/select inputs (no radio, file, checkbox) */
      stepEl.querySelectorAll('input:not([type=radio]):not([type=file]):not([type=checkbox]), select, textarea').forEach(inp => {
        if (!inp.required) { setErr(inp, false); return; }
        /* skip the conditional children count unless visible */
        if (inp.id === 'k_anzahl') return;
        let bad = !inp.value.trim();
        if (!bad && inp.type === 'email') bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value.trim());
        setErr(inp, bad);
        if (bad && !firstBad) firstBad = inp;
      });

      /* radio groups */
      const radioGroups = {};
      stepEl.querySelectorAll('input[type=radio]').forEach(r => {
        (radioGroups[r.name] = radioGroups[r.name] || []).push(r);
      });
      Object.values(radioGroups).forEach(group => {
        const required = group.some(r => r.required);
        if (!required) return;
        const checked = group.some(r => r.checked);
        const wrap = group[0].closest('.wz-field');
        const err = wrap && wrap.querySelector('.wz-err');
        if (err) err.classList.toggle('show', !checked);
        if (!checked && !firstBad) firstBad = group[0];
      });

      /* Kinder-Anzahl (Schritt 4, wenn "Ja") */
      if (n === 4 && document.querySelector('input[name=k_vorhanden]:checked')?.value === 'Ja') {
        const inp = document.getElementById('k_anzahl');
        const bad = !inp.value.trim() || Number(inp.value) < 1;
        setErr(inp, bad);
        if (bad && !firstBad) firstBad = inp;
      }

      /* DSGVO-Einwilligung (Schritt 6) */
      if (n === 6) {
        const cb = document.getElementById('dsgvo');
        const consent = document.getElementById('consent');
        const err = document.getElementById('dsgvo-err');
        const bad = !cb.checked;
        consent.classList.toggle('invalid', bad);
        if (err) err.classList.toggle('show', bad);
        if (bad && !firstBad) firstBad = cb;
      }

      if (firstBad) {
        const target = firstBad.closest('.wz-field') || firstBad;
        const top = target.getBoundingClientRect().top + window.pageYOffset - 140;
        window.scrollTo({ top: Math.max(0, top), behavior: __RM ? 'auto' : 'smooth' });
        if (firstBad.focus) setTimeout(() => firstBad.focus({ preventScroll: true }), 300);
      }
      return !firstBad;
    }

    /* clear error on input/change */
    form.addEventListener('input', e => {
      if (e.target.classList && e.target.classList.contains('invalid')) setErr(e.target, false);
    });
    form.addEventListener('change', e => {
      if (e.target.type === 'radio') {
        const wrap = e.target.closest('.wz-field');
        const err = wrap && wrap.querySelector('.wz-err');
        if (err) err.classList.remove('show');
      }
      if (e.target.id === 'dsgvo' && e.target.checked) {
        document.getElementById('consent').classList.remove('invalid');
        document.getElementById('dsgvo-err').classList.remove('show');
      }
      save();
    });

    /* ============================================================
       Kinder — Anzahl ein-/ausblenden (Schritt 4)
       ============================================================ */
    form.addEventListener('change', e => {
      if (e.target.name === 'k_vorhanden') {
        childrenBlock.classList.toggle('show', e.target.value === 'Ja');
      }
    });

    /* ============================================================
       Zeichenzähler (Schritt 6)
       ============================================================ */
    const msgEl = document.getElementById('m_nachricht');
    const msgCount = document.getElementById('msg-count');
    if (msgEl && msgCount) {
      const updCount = () => { msgCount.textContent = msgEl.value.length + ' / 500'; };
      msgEl.addEventListener('input', updCount);
      updCount();
    }

    /* ============================================================
       localStorage autosave / restore
       ============================================================ */
    function collectScalar() {
      const data = {};
      form.querySelectorAll('input:not([type=file]):not([type=radio]):not([type=checkbox]), select, textarea').forEach(inp => {
        if (inp.name) data[inp.name] = inp.value;
      });
      form.querySelectorAll('input[type=radio]:checked').forEach(r => { data[r.name] = r.value; });
      return data;
    }
    let saveTimer;
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: current, scalar: collectScalar() }));
        } catch (e) {}
      }, 300);
    }
    form.addEventListener('input', save);

    function restore() {
      let saved;
      try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
      if (!saved) return;
      const s = saved.scalar || {};
      Object.keys(s).forEach(name => {
        const radios = form.querySelectorAll('input[type=radio][name="' + name + '"]');
        if (radios.length) {
          radios.forEach(r => { if (r.value === s[name]) r.checked = true; });
        } else {
          const f = form.querySelector('[name="' + name + '"]');
          if (f) f.value = s[name];
        }
      });
      if (s.k_vorhanden === 'Ja') childrenBlock.classList.add('show');
      if (msgEl && msgCount) msgCount.textContent = (msgEl.value || '').length + ' / 500';
    }

    /* ============================================================
       Navigation
       ============================================================ */
    btnNext.addEventListener('click', () => {
      if (!validateStep(current)) return;
      if (current === TOTAL) { submit(); return; }
      const completed = current;
      showStep(current + 1, 'next');
      showFeedback(completed);
      save();
    });
    btnBack.addEventListener('click', () => {
      if (current === 1) return;
      feedback.classList.remove('show');
      showStep(current - 1, 'back');
      save();
    });
    const heroStart = document.getElementById('hero-start');
    if (heroStart) heroStart.addEventListener('click', e => {
      e.preventDefault();
      const top = progressWrap.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: Math.max(0, top), behavior: __RM ? 'auto' : 'smooth' });
    });

    /* ============================================================
       Submit → Make.com webhook
       ============================================================ */
    function buildPayload() {
      const s = collectScalar();
      return {
        meta: {
          quelle: "Online-Scheidung Formular",
          gesendet_am: new Date().toISOString(),
          seite: location.href
        },
        kontakt: {
          vorname: s.a_vorname, nachname: s.a_nachname,
          email: s.a_email, telefon: s.a_telefon
        },
        situation: {
          mindestens_ein_jahr_getrennt: s.t_jahr_getrennt,
          heiratsdatum: s.e_datum,
          trennung_beginn: s.t_beginn,
          bundesland: s.t_bundesland
        },
        ehepartner: {
          name: s.p_name,
          anschrift: s.p_anschrift
        },
        kinder: {
          vorhanden: s.k_vorhanden || 'Nein',
          anzahl: s.k_vorhanden === 'Ja' ? (s.k_anzahl || '') : 0
        },
        scheidung: {
          einvernehmlich: s.s_einvernehmlich,
          vertretung_wagner: s.s_vertretung
        },
        nachricht: s.m_nachricht || '',
        dsgvo_zugestimmt: document.getElementById('dsgvo').checked
      };
    }

    async function submit() {
      if (submit.__busy) return;
      submit.__busy = true;
      submitError.classList.remove('show');
      btnNext.classList.add('loading');
      btnNext.disabled = true;
      btnBack.disabled = true;

      const payload = buildPayload();
      try {
        const res = await fetch(LEAD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        onSuccess();
      } catch (err) {
        console.error('Übertragung fehlgeschlagen:', err);
        btnNext.classList.remove('loading');
        btnNext.disabled = false;
        btnBack.disabled = false;
        submit.__busy = false;
        submitError.classList.add('show');
        const top = submitError.getBoundingClientRect().top + window.pageYOffset - 140;
        window.scrollTo({ top: Math.max(0, top), behavior: __RM ? 'auto' : 'smooth' });
      }
    }

    function onSuccess() {
    submit.__busy = false;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      form.style.display = 'none';
      progressWrap.style.display = 'none';
      successEl.classList.add('show');
      const top = successEl.getBoundingClientRect().top + window.pageYOffset - 110;
      window.scrollTo({ top: Math.max(0, top), behavior: __RM ? 'auto' : 'smooth' });
    }

    document.getElementById('retry-submit').addEventListener('click', submit);

    /* ---- init ---- */
    restore();
    updateProgress();
    showStep(1);
  })();
  

(function () {
  'use strict';
  var form = document.getElementById('cost-contact-form');
  if (!form) return;
  var submitBtn = document.getElementById('cost-submit-btn');
  var successEl = document.getElementById('cost-success');

  function setErr(field, on) {
    var wrap = field.closest('.wz-field');
    if (!wrap) return;
    field.classList.toggle('invalid', on);
    var err = wrap.querySelector('.wz-err');
    if (err) err.classList.toggle('show', on);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var firstBad = null;
    form.querySelectorAll('input[required]:not([type=checkbox]), textarea[required]').forEach(function (inp) {
      var bad = !inp.value.trim();
      setErr(inp, bad);
      if (bad && !firstBad) firstBad = inp;
    });
    var cb = document.getElementById('cost-dsgvo');
    var consent = document.getElementById('cost-consent');
    var dsgvoErr = document.getElementById('cost-dsgvo-err');
    var cbBad = !cb.checked;
    consent.classList.toggle('invalid', cbBad);
    if (dsgvoErr) dsgvoErr.classList.toggle('show', cbBad);
    if (cbBad && !firstBad) firstBad = cb;
    if (firstBad) { firstBad.focus(); return; }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    var payload = { meta: { quelle: 'Kostenorientierung', gesendet_am: new Date().toISOString(), seite: location.href }, type: 'kostenrahmen' };
    form.querySelectorAll('input[name], textarea[name]').forEach(function (el) {
      if (el.type === 'checkbox') { payload[el.name] = el.checked; }
      else { payload[el.name] = el.value.trim(); }
    });
    fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.style.display = 'none';
        successEl.classList.add('show');
      })
      .catch(function (err) {
        console.error('Übertragung fehlgeschlagen:', err);
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        var errEl = document.getElementById('cost-submit-err');
        if (!errEl) {
          errEl = document.createElement('span');
          errEl.id = 'cost-submit-err';
          errEl.className = 'wz-err show';
          errEl.style.marginTop = '10px';
          errEl.textContent = 'Das hat leider nicht geklappt. Bitte versuchen Sie es erneut — oder rufen Sie uns einfach an.';
          submitBtn.parentNode.appendChild(errEl);
        } else { errEl.classList.add('show'); }
      });
  });

  form.addEventListener('input', function (e) {
    if (e.target.classList.contains('invalid')) setErr(e.target, false);
  });
  form.addEventListener('change', function (e) {
    if (e.target.id === 'cost-dsgvo' && e.target.checked) {
      document.getElementById('cost-consent').classList.remove('invalid');
      document.getElementById('cost-dsgvo-err').classList.remove('show');
    }
  });
})();

(function(){
  function setActiveView(name){
    ['start','vorbereiten','rechner'].forEach(function(v){
      var el = document.getElementById('view-'+v);
      if (el) el.style.display = (v===name) ? '' : 'none';
    });
  }
  function routeFromHash(){
    var h = (location.hash || '').slice(1);
    if (h === 'vorbereiten' || h === 'rechner' || h === 'start' || !h) {
      setActiveView(h || 'start');
      window.scrollTo(0,0);
      return;
    }
    var el = document.getElementById(h);
    if (el) {
      var view = el.closest('.view-panel');
      if (view) setActiveView(view.id.replace('view-',''));
      var top = el.getBoundingClientRect().top + window.pageYOffset - 90;
      window.scrollTo({top: Math.max(0,top), behavior: __RM ? 'auto' : 'smooth'});
    }
  }
  window.addEventListener('hashchange', routeFromHash);
  routeFromHash();
})();

(function(){var n=document.querySelector('.topnav');if(!n)return;var t=null;window.addEventListener('scroll',function(){if(t)return;t=setTimeout(function(){n.classList.toggle('scrolled',window.scrollY>40);t=null;},80);},{passive:true});})();


/* ============================================================
   A11y-Laufzeit-Verdrahtung (Audit-Fixes) — hält das Markup
   byte-identisch zur Design-Referenz. Keine visuelle Änderung.
   ============================================================ */
(function () {
  'use strict';

  /* Feld <-> Fehlermeldung verknüpfen */
  document.querySelectorAll('.wz-field').forEach(function (field, i) {
    var input = field.querySelector('input, select, textarea');
    var err = field.querySelector('.wz-err');
    if (!input || !err) return;
    if (!err.id) err.id = (input.id || input.name || 'feld' + i) + '-err';
    var desc = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (desc.indexOf(err.id) === -1) { desc.push(err.id); input.setAttribute('aria-describedby', desc.join(' ')); }
  });

  /* Radiogruppen benennen (Frage-Label -> aria-labelledby) */
  document.querySelectorAll('.wz-choice').forEach(function (group, i) {
    if (!group.querySelector('input[type=radio]')) return;
    var field = group.closest('.wz-field');
    var label = field && field.querySelector('.wz-label');
    group.setAttribute('role', 'radiogroup');
    if (label) {
      if (!label.id) label.id = 'wz-gruppe-' + i;
      group.setAttribute('aria-labelledby', label.id);
    }
    if (group.querySelector('input[required]')) group.setAttribute('aria-required', 'true');
  });

  /* Übermittlungs- und Consent-Fehler als Alerts ansagen */
  ['submit-error', 'dsgvo-err', 'cost-dsgvo-err'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.setAttribute('role', 'alert');
  });

  /* Schrittanzeige als Live-Region */
  document.querySelectorAll('.wz-step-label').forEach(function (el) {
    el.setAttribute('aria-live', 'polite');
  });

  /* aria-invalid mit dem Fehlerzustand pflegen */
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      var t = m.target;
      if (t.classList && (t.matches('input, select, textarea'))) {
        t.setAttribute('aria-invalid', t.classList.contains('invalid') ? 'true' : 'false');
      }
    });
  }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });

  /* Erfolgszustand: Fokus auf die Überschrift setzen */
  document.querySelectorAll('.wz-success').forEach(function (succ) {
    new MutationObserver(function () {
      if (succ.classList.contains('show')) {
        var h = succ.querySelector('h2, h3, [class*=title]') || succ;
        h.setAttribute('tabindex', '-1');
        h.focus({ preventScroll: true });
      }
    }).observe(succ, { attributes: true, attributeFilter: ['class'] });
  });

  /* Toggle-Chips (Quiz, Rückruf): aria-pressed pflegen */
  document.querySelectorAll('#suit-quiz .sq-q, #cb-chips').forEach(function (group) {
    var btns = group.querySelectorAll('button');
    btns.forEach(function (b) { b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false'); });
    group.addEventListener('click', function () {
      btns.forEach(function (b) { b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false'); });
    });
  });
  ['sq-ok', 'sq-talk'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el && el.parentElement) el.parentElement.setAttribute('aria-live', 'polite');
  });

  /* Tab-Bar: aria-current synchron zum aktiven Tab, Landmarke eindeutig */
  var tabbar = document.querySelector('.app-tabbar');
  if (tabbar) {
    if (tabbar.getAttribute('aria-label') === 'Hauptnavigation') tabbar.setAttribute('aria-label', 'Bereiche');
    var syncTabs = function () {
      tabbar.querySelectorAll('a').forEach(function (a) {
        if (a.classList.contains('active')) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    };
    window.addEventListener('hashchange', function () { setTimeout(syncTabs, 0); });
    syncTabs();
  }

  /* Desktop-Nav: statisches (nie gepflegtes) aria-current entfernen */
  document.querySelectorAll('.topnav a[aria-current], .topnav-links a[aria-current], #nav-drawer a[aria-current]').forEach(function (a) {
    a.removeAttribute('aria-current');
  });

  /* Fokus-Rückgabe beim Schließen von Sheet/Drawer */
  function focusReturn(openClass, containerSel, triggerSel) {
    var trigger = document.querySelector(triggerSel);
    var container = document.querySelector(containerSel);
    if (!trigger || !container) return;
    new MutationObserver(function () {
      if (!document.body.classList.contains(openClass)) {
        if (container.contains(document.activeElement) || document.activeElement === document.body) {
          trigger.focus();
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  focusReturn('menu-open', '#m-sheet', '#m-burger');
  focusReturn('nav-open', '#nav-drawer', '#nav-toggle');
})();
