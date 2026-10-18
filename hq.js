/* HQ — Anfragen (Modul 1) + Antragsentwurf (Modul 2). Spricht nur mit /api/hq/*. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var STATUS = {
    neu: 'Neu', in_bearbeitung: 'In Bearbeitung', rueckfrage: 'Rückfrage offen',
    mandat: 'Mandat erteilt', erledigt: 'Erledigt', abgelehnt: 'Abgelehnt / kein Mandat'
  };
  var TYP = { antrag: 'Online-Antrag', kostenrahmen: 'Kosteneinschätzung', nachricht: 'Nachricht', checkliste_pdf: 'Checkliste (PDF)' };
  var EREIGNIS = { eingang: 'Eingang über die Website', status: 'Status geändert', notiz: 'Notizen bearbeitet', antrag: 'Antragsfelder gespeichert', dokument: 'Dokument erzeugt' };

  /* Lesbare Bezeichnungen für die Formular-Payloads */
  var LABELS = {
    'kontakt.vorname': 'Vorname', 'kontakt.nachname': 'Nachname', 'kontakt.email': 'E-Mail', 'kontakt.telefon': 'Telefon',
    'situation.mindestens_ein_jahr_getrennt': 'Mindestens ein Jahr getrennt?', 'situation.heiratsdatum': 'Heiratsdatum',
    'situation.trennung_beginn': 'Beginn der Trennung', 'situation.bundesland': 'Letztes gemeinsames Bundesland',
    'situation.ehewohnung_plz': 'PLZ der letzten gemeinsamen Ehewohnung', 'situation.ehewohnung_ort': 'Ort der letzten gemeinsamen Ehewohnung',
    'kinder.wohnort': 'Bei wem leben die Kinder überwiegend?',
    'ehepartner.name': 'Ehepartner/in – Name', 'ehepartner.anschrift': 'Ehepartner/in – Anschrift',
    'kinder.vorhanden': 'Gemeinsame minderjährige Kinder?', 'kinder.anzahl': 'Anzahl Kinder',
    'scheidung.einvernehmlich': 'Einvernehmlich?', 'scheidung.vertretung_wagner': 'Vertretung durch Frau Wagner?',
    'ergaenzung.anschrift': 'Anschrift Antragsteller/in', 'ergaenzung.staatsangehoerigkeit': 'Staatsangehörigkeit',
    'ergaenzung.ehevertrag': 'Ehevertrag vorhanden?', 'ergaenzung.nettoeinkommen_antragsteller': 'Nettoeinkommen (eigenes)',
    'ergaenzung.nettoeinkommen_antragsgegner': 'Nettoeinkommen (Partner/in)', 'ergaenzung.kind_1': 'Kind 1', 'ergaenzung.kind_2': 'Kind 2',
    'ergaenzung.kind_3': 'Kind 3', 'ergaenzung.kind_4': 'Kind 4',
    nachricht: 'Nachricht', name: 'Name', email: 'E-Mail',
    c_vorname: 'Vorname', c_nachname: 'Nachname', c_email: 'E-Mail', c_telefon: 'Telefon', c_nachricht: 'Situation (Kurzbeschreibung)',
    dsgvo_zugestimmt: 'Datenschutz zugestimmt', cost_dsgvo: 'Datenschutz zugestimmt',
    'meta.quelle': 'Quelle', 'meta.seite': 'Seite', 'meta.gesendet_am': 'Gesendet am'
  };
  var GROUPS = { kontakt: 'Kontakt', situation: 'Situation', ehepartner: 'Ehepartner/in', kinder: 'Kinder', scheidung: 'Scheidung', ergaenzung: 'Ergänzende Angaben', meta: 'Technisch' };

  var state = { user: null, filter: { status: '', typ: '', q: '' }, liste: [], zaehler: null, current: null, mod: 'anfragen' };

  /* ---------- API ---------- */
  function api(method, url, body) {
    return fetch(url, {
      method: method, headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'bad_json' }; }).then(function (j) {
        if (r.status === 401 && !/login/.test(url)) { showLogin(); }
        j.__status = r.status; return j;
      });
    });
  }

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtDate(iso, withTime) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return iso;
    var opt = withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' };
    return d.toLocaleString('de-DE', opt).replace(',', ' ·');
  }
  function fmtVal(v) {
    if (v === true) return 'Ja'; if (v === false) return 'Nein';
    if (v === null || v === undefined || v === '') return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(8, 10) + '.' + v.slice(5, 7) + '.' + v.slice(0, 4);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDate(v, true);
    return String(v);
  }

  /* ---------- Login ---------- */
  function showLogin() {
    state.user = null;
    $('#app').hidden = true; $('#login').hidden = false;
    setTimeout(function () { $('#login-form [name=name]').focus(); }, 0);
  }
  function showApp(user) {
    state.user = user;
    $('#user-name').textContent = user;
    $('#login').hidden = true; $('#app').hidden = false;
    loadList();
  }
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, err = $('#login-err'); err.hidden = true;
    var btn = $('button', f); btn.disabled = true;
    api('POST', '/api/hq/login', { name: f.name.value.trim(), passwort: f.passwort.value }).then(function (j) {
      btn.disabled = false;
      if (j.ok) { f.passwort.value = ''; showApp(j.user); return; }
      err.textContent = j.error === 'locked' ? 'Zu viele Fehlversuche — bitte in 10 Minuten erneut versuchen.'
        : j.error === 'hq_not_configured' ? 'Das HQ ist noch nicht eingerichtet (Umgebungsvariablen fehlen).'
        : 'Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.';
      err.hidden = false;
    });
  });
  $('#logout').addEventListener('click', function () {
    api('DELETE', '/api/hq/login').then(showLogin);
  });

  /* ---------- Liste ---------- */
  function loadList() {
    var p = new URLSearchParams();
    if (state.filter.status) p.set('status', state.filter.status);
    if (state.filter.typ) p.set('typ', state.filter.typ);
    if (state.filter.q) p.set('q', state.filter.q);
    return api('GET', '/api/hq/anfragen?' + p.toString()).then(function (j) {
      if (!j.ok) { if (j.error === 'store_not_configured') toast('Datenbank nicht konfiguriert (SUPABASE_URL / SUPABASE_SERVICE_KEY).'); return; }
      state.liste = j.anfragen; state.zaehler = j.zaehler;
      renderChips(); renderList();
    });
  }
  function renderChips() {
    var z = state.zaehler || { status: {}, gesamt: 0 };
    var html = '<button class="chip' + (state.filter.status === '' ? ' active' : '') + '" data-s="">Alle<b>' + (z.gesamt || 0) + '</b></button>';
    Object.keys(STATUS).forEach(function (s) {
      html += '<button class="chip' + (state.filter.status === s ? ' active' : '') + '" data-s="' + s + '">' + STATUS[s] + '<b>' + (z.status[s] || 0) + '</b></button>';
    });
    $('#status-chips').innerHTML = html;
  }
  function renderList() {
    var box = $('#list');
    box.innerHTML = state.liste.map(function (a) {
      var name = [a.vorname, a.nachname].filter(Boolean).join(' ') || a.email || '—';
      return '<button class="item' + (state.current && state.current.id === a.id ? ' active' : '') + '" role="listitem" data-id="' + a.id + '">' +
        '<span class="nr">' + esc(a.nummer) + '</span>' +
        '<span class="when">' + esc(fmtDate(a.created_at, true)) + '</span>' +
        '<span class="nm">' + esc(name) + '</span>' +
        '<span class="sub">' + esc([a.email, a.telefon].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="tags"><span class="badge typ-' + a.typ + '">' + TYP[a.typ] + '</span><span class="badge st-' + a.status + '">' + STATUS[a.status] + '</span></span>' +
        '</button>';
    }).join('');
    $('#list-empty').hidden = state.liste.length > 0;
  }
  $('#status-chips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    state.filter.status = c.getAttribute('data-s'); loadList();
  });
  $('#typ').addEventListener('change', function (e) { state.filter.typ = e.target.value; loadList(); });
  var qTimer;
  $('#q').addEventListener('input', function (e) {
    clearTimeout(qTimer); qTimer = setTimeout(function () { state.filter.q = e.target.value.trim(); loadList(); }, 250);
  });
  $('#list').addEventListener('click', function (e) {
    var it = e.target.closest('.item'); if (!it) return;
    openDetail(it.getAttribute('data-id'));
  });

  /* ---------- Detail (Modul 1) ---------- */
  function openDetail(id) {
    return api('GET', '/api/hq/anfragen?id=' + encodeURIComponent(id)).then(function (j) {
      if (!j.ok) { toast('Anfrage konnte nicht geladen werden.'); return; }
      state.current = j; renderDetail(); renderList();
      $('#mod-antrag-btn').disabled = false;
      $('#mod-antrag-btn').title = '';
      if (window.innerWidth < 920) $('#detail').scrollIntoView({ behavior: 'smooth' });
    });
  }
  function kvRows(obj, prefix, out) {
    var keys = Object.keys(obj).filter(function (k) { return k !== 'meta'; });
    if (obj.meta) keys.push('meta');   // Technisches zuletzt
    keys.forEach(function (k) {
      var v = obj[k], path = prefix ? prefix + '.' + k : k;
      if (k === 'type') return;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out.push({ group: GROUPS[k] || k });
        kvRows(v, path, out);
      } else {
        out.push({ label: LABELS[path] || LABELS[k] || k, value: fmtVal(v) });
      }
    });
  }
  function renderDetail() {
    var a = state.current.anfrage;
    $('#detail-empty').hidden = true; $('#detail-card').hidden = false;
    $('#d-nummer').textContent = a.nummer;
    $('#d-name').textContent = [a.vorname, a.nachname].filter(Boolean).join(' ') || a.email || 'Ohne Namen';
    $('#d-meta').innerHTML = '<span class="badge typ-' + a.typ + '">' + TYP[a.typ] + '</span><span>Eingang ' + esc(fmtDate(a.created_at, true)) + '</span>' +
      (a.quelle ? '<span>· ' + esc(a.quelle) + '</span>' : '');
    var sel = $('#d-status');
    sel.innerHTML = Object.keys(STATUS).map(function (s) { return '<option value="' + s + '"' + (s === a.status ? ' selected' : '') + '>' + STATUS[s] + '</option>'; }).join('');

    $('#d-kontakt').innerHTML =
      '<dt>Name</dt><dd>' + esc([a.vorname, a.nachname].filter(Boolean).join(' ') || '—') + '</dd>' +
      '<dt>E-Mail</dt><dd>' + (a.email ? '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a>' : '—') + '</dd>' +
      '<dt>Telefon</dt><dd>' + (a.telefon ? '<a href="tel:' + esc(a.telefon.replace(/[^\d+]/g, '')) + '">' + esc(a.telefon) + '</a>' : '—') + '</dd>';

    var rows = []; kvRows(a.daten || {}, '', rows);
    $('#d-daten').innerHTML = rows.map(function (r) {
      return r.group ? '<div class="group">' + esc(r.group) + '</div>' : '<dt>' + esc(r.label) + '</dt><dd>' + esc(r.value) + '</dd>';
    }).join('') || '<dd class="muted">Keine Formulardaten.</dd>';

    $('#d-notizen').value = a.notizen || '';
    $('#notizen-saved').hidden = true; $('#antrag-saved').hidden = true;
    renderVerlauf();
    renderAntrag();
    setModule(state.mod === 'antrag' ? 'antrag' : 'anfragen');
  }
  function renderVerlauf() {
    var v = state.current.verlauf || [];
    $('#d-verlauf').innerHTML = v.map(function (e) {
      var d = e.details || {}, txt = EREIGNIS[e.art] || e.art;
      if (e.art === 'status') txt += ': ' + (STATUS[d.von] || d.von) + ' → ' + (STATUS[d.nach] || d.nach);
      if (e.art === 'dokument') txt += ': ' + (d.typ === 'vollmacht' ? 'Vollmacht' : 'Antragsentwurf') + (d.offen && d.offen.length ? ' (' + d.offen.length + ' Felder offen)' : '');
      return '<li><time>' + esc(fmtDate(e.zeit, true)) + '</time><span>' + esc(txt) + (e.benutzer ? ' <span class="muted">· ' + esc(e.benutzer) + '</span>' : '') + '</span></li>';
    }).join('') || '<li class="muted">Noch keine Einträge.</li>';
  }

  $('#d-status').addEventListener('change', function (e) {
    patch({ status: e.target.value }).then(function (ok) { if (ok) toast('Status gespeichert: ' + STATUS[e.target.value]); });
  });
  $('#save-notizen').addEventListener('click', function () {
    patch({ notizen: $('#d-notizen').value }).then(function (ok) { if (ok) { $('#notizen-saved').hidden = false; } });
  });
  function patch(body) {
    var id = state.current.anfrage.id;
    return api('PATCH', '/api/hq/anfragen?id=' + encodeURIComponent(id), body).then(function (j) {
      if (!j.ok) { toast('Speichern fehlgeschlagen.'); return false; }
      return api('GET', '/api/hq/anfragen?id=' + encodeURIComponent(id)).then(function (d) {
        if (d.ok) { state.current = d; renderVerlauf(); if (body.status) loadList(); if (body.antrag) renderAntrag(); }
        return true;
      });
    });
  }
  $('#delete').addEventListener('click', function () {
    var a = state.current.anfrage;
    if (!window.confirm('Anfrage ' + a.nummer + ' endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;
    api('DELETE', '/api/hq/anfragen?id=' + encodeURIComponent(a.id)).then(function (j) {
      if (!j.ok) { toast('Löschen fehlgeschlagen.'); return; }
      toast('Anfrage ' + a.nummer + ' gelöscht.');
      state.current = null; $('#detail-card').hidden = true; $('#detail-empty').hidden = false;
      $('#mod-antrag-btn').disabled = true; setModule('anfragen'); loadList();
    });
  });

  /* ---------- Modul 2: Antragsentwurf ---------- */
  function setModule(mod) {
    state.mod = mod;
    $$('.mod').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mod') === mod); });
    $$('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== mod; });
  }
  $$('.mod').forEach(function (b) {
    b.addEventListener('click', function () { if (!b.disabled) setModule(b.getAttribute('data-mod')); });
  });
  function renderAntrag() {
    var felder = state.current.antragsfelder || [], werte = state.current.antragswerte || {}, saved = state.current.anfrage.antrag || {};
    var html = '', grp = null;
    felder.forEach(function (f) {
      if (f.gruppe !== grp) { grp = f.gruppe; html += '<div class="grp">' + esc(grp) + '</div>'; }
      var v = werte[f.key] || '', pre = v && !Object.prototype.hasOwnProperty.call(saved, f.key);
      html += '<label' + (f.multiline ? ' class="wide"' : '') + '>' + esc(f.label) +
        (f.multiline ? '<textarea name="' + f.key + '" rows="2">' + esc(v) + '</textarea>'
          : '<input name="' + f.key + '" value="' + esc(v) + '"' + (pre ? ' class="prefilled" title="Aus der Anfrage übernommen"' : '') + ' />') +
        '</label>';
    });
    $('#antrag-form').innerHTML = html;
    var id = state.current.anfrage.id;
    $('#dl-antrag').href = '/api/hq/dokument?id=' + encodeURIComponent(id) + '&typ=antragsentwurf';
    $('#dl-vollmacht').href = '/api/hq/dokument?id=' + encodeURIComponent(id) + '&typ=vollmacht';
    var offen = felder.filter(function (f) { return !werte[f.key]; }).map(function (f) { return f.gruppe + ' · ' + f.label; });
    $('#offene-felder').textContent = offen.length ? 'Noch offen (' + offen.length + '): ' + offen.join(', ') : 'Alle Felder sind ausgefüllt.';
  }
  function antragWerte() {
    var out = {};
    $$('#antrag-form [name]').forEach(function (el) { out[el.name] = el.value; });
    return out;
  }
  $('#save-antrag').addEventListener('click', function () {
    patch({ antrag: antragWerte() }).then(function (ok) { if (ok) { $('#antrag-saved').hidden = false; toast('Antragsfelder gespeichert.'); } });
  });
  /* Vor dem Download ungespeicherte Änderungen mitnehmen */
  $$('#dl-antrag, #dl-vollmacht').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var cur = antragWerte(), saved = state.current.antragswerte || {}, dirty = Object.keys(cur).some(function (k) { return (cur[k] || '') !== (saved[k] || ''); });
      if (!dirty) { setTimeout(function () { patch({}); }, 1500); return; }
      e.preventDefault();
      patch({ antrag: cur }).then(function (ok) { if (ok) { window.location.href = a.href; setTimeout(function () { patch({}); }, 1500); } });
    });
  });

  /* ---------- Start ---------- */
  api('GET', '/api/hq/login').then(function (j) {
    if (j.ok) showApp(j.user);
    else if (j.error === 'hq_not_configured') { showLogin(); $('#login-err').textContent = 'Das HQ ist noch nicht eingerichtet (Umgebungsvariablen HQ_USERS / HQ_SECRET fehlen).'; $('#login-err').hidden = false; }
    else showLogin();
  });
})();
