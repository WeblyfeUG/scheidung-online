/* ============================================================
   HQ — Übersicht (Dashboard), Anfragen, Antragsentwurf.
   Spricht nur mit /api/hq/*. Vanilla JS, kein Build-Schritt.
   Reihenfolge: Konstanten/Fehlertexte → Helfer → API → Zustand/Hash
   → Login → Übersicht → Liste → Detail (Reiter) → Antragsentwurf → Start.
   Reine Helfer werden in Node (ohne document) exportiert, damit sie
   testbar sind.
   ============================================================ */
(function () {
  'use strict';

  /* ===================== 1 Konstanten / Fehlertexte ===================== */
  var API = '/api/hq/anfragen';
  var API_LOGIN = '/api/hq/login';
  var API_DOK = '/api/hq/dokument';
  var LIMIT = 200;
  var TIMEOUT_MS = 10000;
  var TITEL = 'HQ · Scheidung-Online';

  var STATUS = {
    neu: 'Neu', in_bearbeitung: 'In Bearbeitung', rueckfrage: 'Rückfrage offen',
    mandat: 'Mandat erteilt', erledigt: 'Erledigt', abgelehnt: 'Abgelehnt / kein Mandat'
  };
  var CHIP_ORDER = ['', 'neu', 'rueckfrage', 'in_bearbeitung', 'mandat', 'erledigt', 'abgelehnt'];
  var CHIP_LABEL = { '': 'Alle', neu: 'Neu', rueckfrage: 'Rückfrage', in_bearbeitung: 'In Bearbeitung', mandat: 'Mandat', erledigt: 'Erledigt', abgelehnt: 'Abgelehnt' };
  var TYP = { antrag: 'Online-Antrag', kostenrahmen: 'Kosteneinschätzung', nachricht: 'Nachricht', checkliste_pdf: 'Checkliste (PDF)' };
  var EREIGNIS = {
    eingang: 'Eingang über die Website', status: 'Status geändert', notiz: 'Notizen bearbeitet',
    antrag: 'Antragsfelder gespeichert', dokument: 'Dokument erzeugt',
    wiedervorlage: 'Wiedervorlage gesetzt', checkliste_gesendet: 'Checkliste per E-Mail gesendet'
  };
  var GRUND = { neu: 'Neu', rueckfrage: 'Rückfrage offen', wiedervorlage: 'Wiedervorlage', checkliste: 'Checkliste senden' };
  var MODS = { uebersicht: 1, anfragen: 1, antrag: 1 };
  var TABS = { anfrage: 1, antrag: 1, verlauf: 1 };
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var EMAIL_OK = /^[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}\-]+(\.[\p{L}\p{N}\-]+)*\.[\p{L}]{2,}$/u;
  var ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

  /* Fehlertexte (Anhang B) — zentrale Übersetzung der Server-Codes */
  var FEHLER = {
    network: 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.',
    timeout: 'Der Server antwortet nicht (Zeitüberschreitung). Bitte erneut versuchen.',
    server: 'Serverfehler (HTTP {status}). Bitte in einer Minute erneut versuchen.',
    bad_json: 'Unerwartete Antwort vom Server (HTTP {status}).',
    store_failed: 'Datenbank nicht erreichbar. Bitte in einer Minute erneut versuchen.',
    store_not_configured: 'Datenbank nicht konfiguriert (SUPABASE_URL / SUPABASE_SERVICE_KEY).',
    hq_not_configured: 'Das HQ ist noch nicht eingerichtet (HQ_USERS / HQ_SECRET fehlen).',
    unauthorized: 'Sitzung abgelaufen — bitte erneut anmelden. Ungespeicherte Eingaben bleiben erhalten.',
    invalid_login: 'Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.',
    locked: 'Zu viele Fehlversuche — bitte in 10 Minuten erneut versuchen.',
    notes_too_long: 'Notizen sind zu lang (höchstens 10.000 Zeichen).',
    invalid_status: 'Ungültiger Status.',
    invalid_wiedervorlage: 'Ungültiges Datum für die Wiedervorlage.',
    not_found: 'Diese Anfrage existiert nicht mehr (vermutlich gelöscht).',
    document_failed: 'Das Dokument konnte nicht erzeugt werden.',
    invalid_request: 'Ungültige Anfrage an den Server.',
    invalid_id: 'Ungültige Anfrage an den Server.',
    invalid_body: 'Ungültige Anfrage an den Server.',
    invalid_event: 'Ungültige Anfrage an den Server.',
    method_not_allowed: 'Ungültige Anfrage an den Server.',
    abgebrochen: 'Anfrage abgebrochen.'
  };

  /* Lesbare Bezeichnungen für die Formular-Payloads */
  var LABELS = {
    'situation.mindestens_ein_jahr_getrennt': 'Mindestens ein Jahr getrennt?', 'situation.heiratsdatum': 'Heiratsdatum',
    'situation.trennung_beginn': 'Beginn der Trennung', 'situation.bundesland': 'Letztes gemeinsames Bundesland',
    'situation.ehewohnung_plz': 'PLZ der letzten gemeinsamen Ehewohnung', 'situation.ehewohnung_ort': 'Ort der letzten gemeinsamen Ehewohnung',
    'ehepartner.name': 'Ehepartner/in – Name', 'ehepartner.anschrift': 'Ehepartner/in – Anschrift',
    'kinder.vorhanden': 'Gemeinsame minderjährige Kinder?', 'kinder.anzahl': 'Anzahl Kinder', 'kinder.wohnort': 'Bei wem leben die Kinder überwiegend?',
    'scheidung.einvernehmlich': 'Einvernehmlich?', 'scheidung.vertretung_wagner': 'Vertretung durch Frau Wagner?',
    'ergaenzung.anschrift': 'Anschrift Antragsteller/in', 'ergaenzung.staatsangehoerigkeit': 'Staatsangehörigkeit',
    'ergaenzung.ehevertrag': 'Ehevertrag vorhanden?', 'ergaenzung.nettoeinkommen_antragsteller': 'Nettoeinkommen (eigenes)',
    'ergaenzung.nettoeinkommen_antragsgegner': 'Nettoeinkommen (Partner/in)',
    'ergaenzung.kind_1': 'Kind 1', 'ergaenzung.kind_2': 'Kind 2', 'ergaenzung.kind_3': 'Kind 3', 'ergaenzung.kind_4': 'Kind 4',
    nachricht: 'Nachricht', name: 'Name', email: 'E-Mail', telefon: 'Telefon',
    c_vorname: 'Vorname', c_nachname: 'Nachname', c_email: 'E-Mail', c_telefon: 'Telefon', c_nachricht: 'Situation (Kurzbeschreibung)',
    dsgvo_zugestimmt: 'Datenschutz zugestimmt', cost_dsgvo: 'Datenschutz zugestimmt',
    'meta.quelle': 'Quelle', 'meta.seite': 'Seite', 'meta.gesendet_am': 'Gesendet am'
  };
  var GROUPS = { kontakt: 'Kontakt', situation: 'Situation', ehepartner: 'Ehepartner/in', kinder: 'Kinder', scheidung: 'Scheidung', ergaenzung: 'Ergänzende Angaben', meta: 'Technisch' };
  var GROUP_ORDER = ['situation', 'ehepartner', 'kinder', 'scheidung', 'ergaenzung'];
  /* Schlüssel, die an anderer Stelle des Details stehen (Kontakt-Karte, Nachricht-Block, Technik) */
  var SKIP = { meta: 1, kontakt: 1, nachricht: 1, c_nachricht: 1, dsgvo_zugestimmt: 1, cost_dsgvo: 1, name: 1, email: 1, c_vorname: 1, c_nachname: 1, c_email: 1, c_telefon: 1, type: 1 };

  /* ===================== 2 Helfer (rein, ohne DOM) ===================== */
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* "YYYY-MM-DD" als lokales Datum (nicht UTC) */
  function isoTagLocal(s) {
    var m = ISO_TAG.exec(String(s || ''));
    return m ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(s);
  }
  function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'string' && ISO_TAG.test(v)) return isoTagLocal(v);
    return new Date(v);
  }
  /* TT.MM.JJJJ (· HH:MM) — unabhängig von der Browser-Locale */
  function fmtDate(v, withTime) {
    if (!v) return '';
    var d = toDate(v);
    if (isNaN(d.getTime())) return String(v);
    var s = pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
    return withTime ? s + ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : s;
  }
  /* "YYYY-MM-DD" → "TT.MM.JJJJ" ohne Zeitzonen-Umrechnung */
  function fmtDatum(s) {
    var m = ISO_TAG.exec(String(s || '').trim());
    return m ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : String(s || '');
  }
  /* "YYYY-MM-DD" → "TT.MM." (Badges) */
  function fmtWV(s) { return ISO_TAG.test(String(s || '')) ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' : String(s || ''); }
  function uhrzeit(v) { var d = v ? toDate(v) : new Date(); return isNaN(d.getTime()) ? '' : pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function jetztUhr() { return uhrzeit(new Date()); }
  function heuteISO(now) { var d = now ? new Date(now) : new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function startOfDay(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
  /* Kalendertage zwischen v und now (positiv = v liegt in der Vergangenheit) */
  function tageDiff(v, now) {
    var d = toDate(v), n = now ? toDate(now) : new Date();
    if (isNaN(d.getTime())) return 0;
    return Math.round((startOfDay(n) - startOfDay(d)) / 864e5);
  }
  function tageWort(n) { return n + (Math.abs(n) === 1 ? ' Tag' : ' Tagen'); }
  /* Relative Zeit für Listen: „gerade eben“, „vor 25 Min.“, „Heute 13:33“, „Gestern 13:33“, „vor 3 Tagen“, sonst TT.MM.JJJJ */
  function relZeit(iso, now) {
    if (!iso) return '';
    var d = toDate(iso);
    if (isNaN(d.getTime())) return String(iso);
    var n = now ? toDate(now) : new Date();
    var diff = n.getTime() - d.getTime();
    if (diff < 60e3) return 'gerade eben';
    var min = Math.floor(diff / 60e3);
    if (min < 60) return 'vor ' + min + ' Min.';
    var t = tageDiff(d, n), uhr = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (t <= 0) return 'Heute ' + uhr;
    if (t === 1) return 'Gestern ' + uhr;
    if (t < 7) return 'vor ' + tageWort(t);
    return fmtDate(d);
  }
  /* Alter einer Anfrage: „seit 3 Tagen“, „seit 5 Std.“, „seit 12 Min.“ */
  function alterText(iso, now) {
    if (!iso) return '';
    var d = toDate(iso);
    if (isNaN(d.getTime())) return '';
    var n = now ? toDate(now) : new Date();
    var ms = n.getTime() - d.getTime();
    if (ms < 60e3) return 'gerade eben';
    var min = Math.floor(ms / 60e3);
    if (min < 60) return 'seit ' + min + ' Min.';
    var h = Math.floor(min / 60);
    if (h < 24) return 'seit ' + h + ' Std.';
    return 'seit ' + tageWort(Math.floor(h / 24));
  }
  function fmtVal(v) {
    if (v === true) return '✓ Ja';
    if (v === false) return '– Nein';
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'string') {
      if (/^ja$/i.test(v.trim())) return '✓ Ja';
      if (/^nein$/i.test(v.trim())) return '– Nein';
      if (ISO_TAG.test(v)) return fmtDatum(v);
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDate(v, true);
    }
    return String(v);
  }
  /* Server-Code → Text (Anhang B); {status} wird ersetzt */
  function fehlerText(j) {
    var code = j && typeof j.error === 'string' ? j.error : '';
    var status = j && j.__status ? j.__status : 0;
    var t = FEHLER[code];
    if (!t) t = code ? 'Unerwarteter Fehler („' + code + '“).' : (status >= 500 ? FEHLER.server : 'Unerwarteter Fehler.');
    return t.replace('{status}', status || '?');
  }
  /* "#m=anfragen&a=<uuid>&t=antrag" → { m, a, t } (nur gültige Werte) */
  function parseHash(h) {
    var out = { m: '', a: '', t: '' };
    var s = String(h || '').replace(/^#/, '');
    if (!s) return out;
    s.split('&').forEach(function (part) {
      var i = part.indexOf('=');
      if (i < 1) return;
      var k = part.slice(0, i), v = part.slice(i + 1);
      try { v = decodeURIComponent(v); } catch (e) { return; }
      if (k === 'm' && own(MODS, v)) out.m = v;
      else if (k === 'a' && UUID.test(v)) out.a = v.toLowerCase();
      else if (k === 't' && own(TABS, v)) out.t = v;
    });
    return out;
  }
  function buildHash(o) {
    o = o || {};
    var h = '#m=' + (own(MODS, o.m) ? o.m : 'uebersicht');
    if (o.a) {
      h += '&a=' + o.a;
      if (o.t && o.t !== 'anfrage' && own(TABS, o.t)) h += '&t=' + o.t;
    }
    return h;
  }
  function displayName(a) {
    var n = [a.vorname, a.nachname].filter(Boolean).join(' ').trim();
    if (n) return n;
    if (a.typ === 'checkliste_pdf') return 'Checkliste angefordert';
    return a.email || 'Ohne Namen';
  }
  function mailtoUrl(a) {
    return 'mailto:' + encodeURIComponent(a.email) + '?subject=' + encodeURIComponent('Ihre Anfrage ' + a.nummer + ' – Scheidung-Online');
  }
  function telHref(t) { return String(t || '').replace(/[^\d+]/g, ''); }
  function seitePfad(u) {
    if (!u) return '';
    try { var x = new URL(u); return x.pathname + x.search; } catch (e) { return String(u); }
  }
  /* Formulardaten → Zeilen (feste Gruppenreihenfolge, Tiefe ≤ 3, max. 150 Zeilen) */
  function kvRows(daten) {
    var out = [];
    if (!daten || typeof daten !== 'object') return out;
    function walk(obj, prefix, depth) {
      Object.keys(obj).forEach(function (k) {
        if (out.length >= 150 || !own(obj, k)) return;
        var v = obj[k], path = prefix ? prefix + '.' + k : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (depth >= 3) return;
          out.push({ group: GROUPS[k] || k });
          walk(v, path, depth + 1);
        } else {
          out.push({ label: LABELS[path] || LABELS[k] || k, value: fmtVal(Array.isArray(v) ? v.join(', ') : v) });
        }
      });
    }
    var keys = Object.keys(daten).filter(function (k) { return own(daten, k) && !own(SKIP, k); });
    var ordered = GROUP_ORDER.filter(function (k) { return keys.indexOf(k) >= 0; })
      .concat(keys.filter(function (k) { return GROUP_ORDER.indexOf(k) < 0; }));
    ordered.forEach(function (k) {
      if (out.length >= 150) return;
      var v = daten[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) { out.push({ group: GROUPS[k] || k }); walk(v, k, 1); }
      else out.push({ label: LABELS[k] || k, value: fmtVal(Array.isArray(v) ? v.join(', ') : v) });
    });
    return out;
  }
  function checklisteText(origin) {
    return 'Guten Tag,\n\nvielen Dank für Ihr Interesse. Die Checkliste „Scheidungsunterlagen“ finden Sie hier als PDF:\n' +
      origin + '/downloads/scheidungsunterlagen-checkliste.pdf\n\nMit freundlichen Grüßen\nJanine D. Wagner\nRechtsanwältin · Fachanwältin für Familienrecht\nSchiffgraben 17 · 30159 Hannover';
  }

  /* Node-Selbsttests: reine Helfer exportieren, kein DOM anfassen */
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        FEHLER: FEHLER, STATUS: STATUS, TYP: TYP, EREIGNIS: EREIGNIS, EMAIL_OK: EMAIL_OK, UUID: UUID,
        relZeit: relZeit, alterText: alterText, tageDiff: tageDiff, fmtDate: fmtDate, fmtDatum: fmtDatum, fmtWV: fmtWV, fmtVal: fmtVal,
        fehlerText: fehlerText, parseHash: parseHash, buildHash: buildHash, kvRows: kvRows, displayName: displayName,
        mailtoUrl: mailtoUrl, telHref: telHref, seitePfad: seitePfad, heuteISO: heuteISO, checklisteText: checklisteText, esc: esc
      };
    }
    return;
  }

  /* ===================== 2b DOM-Helfer ===================== */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function on(sel, ev, fn) { var el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); return el; }
  function setText(sel, txt) { var el = $(sel); if (el) el.textContent = txt == null ? '' : String(txt); }
  function show(sel, sichtbar) { var el = $(sel); if (el) el.hidden = !sichtbar; }
  function setW(el, pct) { if (el) el.style.setProperty('--w', String(Math.max(0, Math.min(100, Number(pct) || 0)))); }
  function isMobile() { return window.matchMedia && window.matchMedia('(max-width: 920px)').matches; }
  /* Pending-Zustand für Buttons: Text wechseln, aria-busy, gesperrt */
  function busy(btn, an, text) {
    if (!btn) return;
    if (an) {
      if (!btn.getAttribute('data-label')) btn.setAttribute('data-label', btn.textContent);
      btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      if (text) btn.textContent = text;
    } else {
      btn.removeAttribute('aria-busy'); btn.disabled = false;
      var l = btn.getAttribute('data-label');
      if (l !== null) { btn.textContent = l; btn.removeAttribute('data-label'); }
    }
  }
  /* Toast: #toast (status/polite) für ok/info, #toast-alert (alert) für err */
  var toastTimer = { toast: null, alert: null };
  function toast(msg, opts) {
    opts = opts || {};
    var type = opts.type === 'err' || opts.type === 'info' ? opts.type : 'ok';
    var key = type === 'err' ? 'alert' : 'toast';
    var el = $(key === 'alert' ? '#toast-alert' : '#toast');
    if (!el) return;
    clearTimeout(toastTimer[key]);
    el.className = 'toast ' + type;
    el.textContent = '';
    var icon = document.createElement('span');
    icon.className = 't-icon'; icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'err' ? '!' : (type === 'ok' ? '✓' : 'i');
    var txt = document.createElement('span'); txt.className = 't-text';
    el.appendChild(icon); el.appendChild(txt);
    if (opts.action && typeof opts.action.fn === 'function') {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 't-action'; b.textContent = opts.action.label || 'OK';
      b.addEventListener('click', function () { hideToast(key); opts.action.fn(); });
      el.appendChild(b);
    }
    requestAnimationFrame(function () {
      el.classList.add('show');
      requestAnimationFrame(function () { txt.textContent = msg; });
    });
    var dauer = opts.dauer || (type === 'err' ? 5000 : (opts.action ? 5000 : 2600));
    toastTimer[key] = setTimeout(function () { hideToast(key); }, dauer);
  }
  function hideToast(key) { var el = $(key === 'alert' ? '#toast-alert' : '#toast'); if (el) el.classList.remove('show'); }
  function copyText(text, label) {
    if (!text) { toast('Nichts zum Kopieren.', { type: 'info' }); return; }
    var fertig = function () { toast(label + ' kopiert: ' + text, { type: 'ok' }); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'vh';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) fertig(); else toast('Kopieren nicht möglich — bitte manuell markieren: ' + text, { type: 'info', dauer: 6000 });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(fertig, fallback);
    else fallback();
  }

  /* ===================== 3 API ===================== */
  /* Rejected nie. Liefert immer { ok, error?, __status }. 401 (außer /login) → Login-Overlay. */
  function api(method, url, body, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, opts.timeout || TIMEOUT_MS);
    if (opts.holder) opts.holder.abort = function () { if (ctrl) ctrl.abort(); };
    var init = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (ctrl) init.signal = ctrl.signal;
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch(url, init).then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        if (!j || typeof j !== 'object' || Array.isArray(j)) j = { ok: false, error: r.status >= 500 ? 'server' : 'bad_json' };
        if (j.ok !== true) { j.ok = false; if (!j.error) j.error = r.status >= 500 ? 'server' : (r.status === 401 ? 'unauthorized' : 'bad_json'); }
        j.__status = r.status;
        if (r.status === 401 && !opts.noSession && !/\/login(\?|$)/.test(url)) { j.ok = false; j.error = 'unauthorized'; sessionAbgelaufen(); }
        return j;
      });
    }).catch(function () {
      return { ok: false, error: timedOut ? 'timeout' : (ctrl && ctrl.signal.aborted ? 'abgebrochen' : 'network'), __status: 0 };
    }).then(function (j) { clearTimeout(timer); return j; });
  }

  /* ===================== 4 Zustand / Hash ===================== */
  var state = {
    user: null, mod: '', tab: 'anfrage', sessionWeg: false,
    filter: { status: '', typ: '', q: '' },
    liste: null, treffer: 0, zaehler: null, offset: 0, limit: LIMIT, stand: null, listStand: null, lastLoad: 0,
    uebersicht: null,
    current: null, wantedId: null, wantedTab: '', detailGeschlossen: false,
    dirty: { notizen: false, antrag: false },
    pending: {}
  };
  function currentId() { return state.current && state.current.anfrage ? state.current.anfrage.id : null; }
  function effTyp() { return state.mod === 'antrag' ? 'antrag' : state.filter.typ; }
  function istDirty() { return !!(state.dirty.notizen || state.dirty.antrag); }
  function confirmDirty() {
    if (!istDirty()) return true;
    var nr = state.current && state.current.anfrage ? state.current.anfrage.nummer : 'dieser Anfrage';
    if (!window.confirm('Ungespeicherte Änderungen an ' + nr + ' verwerfen?')) return false;
    state.dirty.notizen = false; state.dirty.antrag = false; updateDirtyUI();
    return true;
  }
  function hashId() { return state.wantedId || currentId(); }
  function writeHash(replace) {
    var offen = !!hashId() && !state.detailGeschlossen && state.mod !== 'uebersicht';
    var h = buildHash({ m: state.mod || 'uebersicht', a: offen ? hashId() : '', t: offen ? state.tab : '' });
    if (location.hash === h) return;
    try { if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h); } catch (e) { location.hash = h; }
  }
  function applyHash(opts) {
    opts = opts || {};
    var h = parseHash(location.hash);
    var mod = h.m || 'uebersicht';
    var wechsel = (mod === 'uebersicht' && state.mod !== 'uebersicht') || (h.a && h.a !== currentId());
    if (wechsel && !confirmDirty()) { writeHash(); return; }
    setModule(mod, { fromHash: true });
    if (mod !== 'uebersicht' && h.a) {
      if (h.a === currentId()) {
        state.detailGeschlossen = false; showDetailView();
        setTab(h.t || state.tab, { silent: true });
      } else {
        openDetail(h.a, { fromHash: true, tab: h.t, force: true });
      }
    } else {
      state.detailGeschlossen = true; closeDetailView();
    }
    if (opts.initial) writeHash(true);
  }
  function setTitle(neu) { document.title = (neu ? '(' + neu + ' neu) ' : '') + TITEL; }

  /* ===================== 5 Boot / Login / Sitzung ===================== */
  function boot() {
    var b = $('#boot');
    b.hidden = false;
    setText('#boot-text', 'HQ wird geladen …');
    show('#boot-sub', false); show('#boot-retry', false); show('#boot-spinner', true);
    api('GET', API_LOGIN, undefined, { timeout: 8000, noSession: true }).then(function (j) {
      if (j.ok) { showApp(j.user); return; }
      if (j.error === 'network' || j.error === 'timeout' || j.error === 'server' || j.error === 'bad_json') { bootFehler(j); return; }
      showLogin(j.error === 'hq_not_configured' ? fehlerText(j) : '');
    });
  }
  function bootFehler(j) {
    setText('#boot-text', 'Server nicht erreichbar — bitte Verbindung prüfen');
    var sub = $('#boot-sub'); sub.textContent = fehlerText(j); sub.hidden = false;
    show('#boot-spinner', false);
    var r = $('#boot-retry'); r.hidden = false; r.disabled = false; r.focus();
  }
  function loginFehler(msg) { var el = $('#login-err'); el.textContent = msg || ''; el.hidden = !msg; }
  function showLogin(msg, overlay) {
    $('#boot').hidden = true;
    var login = $('#login'), app = $('#app');
    login.hidden = false;
    login.classList.toggle('overlay', !!overlay);
    if (overlay) { app.setAttribute('inert', ''); app.inert = true; }
    else app.hidden = true;
    loginFehler(msg);
    var name = $('#login-name'), pw = $('#login-pw');
    setTimeout(function () { (name.value ? pw : name).focus(); }, 0);
  }
  function hideLogin() {
    var login = $('#login'), app = $('#app');
    login.hidden = true; login.classList.remove('overlay');
    app.removeAttribute('inert'); app.inert = false;
  }
  /* 401 im laufenden Betrieb: Overlay, App bleibt im DOM, nichts wird geleert */
  function sessionAbgelaufen() {
    if (state.sessionWeg) return;
    state.sessionWeg = true;
    showLogin(FEHLER.unauthorized, true);
  }
  function showApp(user) {
    state.user = user; state.sessionWeg = false;
    setText('#user-name', user);
    $('#boot').hidden = true; hideLogin(); $('#app').hidden = false;
    applyHash({ initial: true });
  }
  function angemeldet(user) {
    if (state.sessionWeg) {
      state.sessionWeg = false; state.user = user; setText('#user-name', user); hideLogin();
      if (istDirty()) toast('Eingaben erhalten — jetzt speichern', { type: 'info', dauer: 4000 });
      else if (currentId()) openDetail(currentId(), { force: true, keepHash: true });
      if (state.mod === 'uebersicht') loadUebersicht(); else loadList();
      return;
    }
    showApp(user);
  }
  on('#login-form', 'submit', function (e) {
    e.preventDefault();
    var name = $('#login-name'), pw = $('#login-pw'), btn = $('#login-btn');
    var n = name.value.trim(), p = pw.value;
    if (!n || !p) { loginFehler('Bitte Benutzername und Passwort eingeben.'); (n ? pw : name).focus(); return; }
    loginFehler('');
    busy(btn, true, 'Anmelden …');
    api('POST', API_LOGIN, { name: n, passwort: p }, { noSession: true }).then(function (j) {
      busy(btn, false);
      if (j.ok) { pw.value = ''; angemeldet(j.user); return; }
      loginFehler(fehlerText(j));
      if (j.__status === 401 || j.error === 'invalid_login') { pw.value = ''; pw.focus(); }
    });
  });
  on('#pw-toggle', 'click', function () {
    var pw = $('#login-pw'), b = $('#pw-toggle');
    var zeigen = pw.type === 'password';
    pw.type = zeigen ? 'text' : 'password';
    b.setAttribute('aria-pressed', zeigen ? 'true' : 'false');
    b.setAttribute('aria-label', zeigen ? 'Passwort verbergen' : 'Passwort anzeigen');
    b.title = zeigen ? 'Passwort verbergen' : 'Passwort anzeigen';
    pw.focus();
  });
  on('#boot-retry', 'click', boot);
  on('#logout', 'click', function () {
    if (!confirmDirty()) return;
    busy($('#logout'), true, 'Abmelden …');
    api('DELETE', API_LOGIN, undefined, { noSession: true }).then(function () { window.location.replace('/hq'); });
  });

  /* ===================== 6 Module / Reiter ===================== */
  function setModule(mod, opts) {
    opts = opts || {};
    if (!own(MODS, mod)) mod = 'uebersicht';
    if (mod === 'uebersicht' && state.mod !== 'uebersicht' && !opts.fromHash && !confirmDirty()) return false;
    var vorher = state.mod;
    state.mod = mod;
    $$('.mod').forEach(function (b) {
      var akt = b.getAttribute('data-mod') === mod;
      b.classList.toggle('active', akt);
      if (akt) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var layout = $('#layout');
    layout.classList.toggle('mod-uebersicht', mod === 'uebersicht');
    layout.classList.toggle('mod-antrag', mod === 'antrag');
    $('#uebersicht').hidden = mod !== 'uebersicht';
    $('#typ-wrap').hidden = mod === 'antrag';
    setText('#detail-empty-h', mod === 'antrag' ? 'Online-Antrag auswählen' : 'Anfrage auswählen');
    setText('#detail-empty-p', mod === 'antrag'
      ? 'Links einen Online-Antrag auswählen, um den Antragsentwurf zu bearbeiten.'
      : 'Links eine Anfrage auswählen. Rechts erscheinen Angaben, Status, Notizen und die Reiter „Antragsentwurf“ und „Verlauf“.');
    if (mod === 'antrag' && state.current) setTab('antrag', { silent: true });
    // Detail-Sichtbarkeit: in der Übersicht nie; auf dem Handy zeigt ein Modulwechsel per Klick die Liste
    if (mod === 'uebersicht') closeDetailView();
    else if (state.current && !state.detailGeschlossen) {
      if (isMobile() && !opts.fromHash) { state.detailGeschlossen = true; closeDetailView(); }
      else showDetailView();
    }
    // Daten nur laden, wenn das Modul wechselt oder noch nichts da ist (Refresh-Buttons laden manuell)
    if (mod === 'uebersicht') { if (vorher !== mod || !state.uebersicht) loadUebersicht(); }
    else if (vorher !== mod || state.liste === null) loadList();
    if (!opts.fromHash) writeHash();
    return true;
  }
  $$('.mod').forEach(function (b) {
    b.addEventListener('click', function () { setModule(b.getAttribute('data-mod')); });
  });
  function setTab(tab, opts) {
    opts = opts || {};
    if (!own(TABS, tab)) tab = 'anfrage';
    state.tab = tab;
    $$('.tab').forEach(function (b) {
      var akt = b.getAttribute('data-tab') === tab;
      b.setAttribute('aria-selected', akt ? 'true' : 'false');
      b.tabIndex = akt ? 0 : -1;
    });
    $$('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== tab; });
    updateMobileActions();
    if (!opts.silent) writeHash();
  }
  on('.tabs', 'click', function (e) {
    var b = e.target.closest('.tab');
    if (b) setTab(b.getAttribute('data-tab'));
  });
  on('.tabs', 'keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var tabs = $$('.tab'), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    e.preventDefault(); tabs[n].focus(); setTab(tabs[n].getAttribute('data-tab'));
  });

  /* ===================== 7 Übersicht ===================== */
  var ueSeq = 0, ueHolder = null;
  function loadUebersicht() {
    var seq = ++ueSeq;
    if (ueHolder && ueHolder.abort) ueHolder.abort();
    ueHolder = {};
    var pane = $('#uebersicht');
    pane.setAttribute('aria-busy', 'true');
    if (!state.uebersicht) { show('#ue-sk', true); show('#ue-body', false); }
    else $('#ue-body').classList.add('dim');
    return api('GET', API + '?uebersicht=1', undefined, { holder: ueHolder }).then(function (j) {
      if (seq !== ueSeq) return false;
      pane.setAttribute('aria-busy', 'false');
      show('#ue-sk', false); $('#ue-body').classList.remove('dim');
      if (!j.ok) {
        if (j.error !== 'unauthorized' && j.error !== 'abgebrochen') {
          setText('#ue-err-text', fehlerText(j)); show('#ue-err', true);
          if (state.uebersicht) { show('#ue-body', true); $('#ue-body').classList.add('dim'); }
        }
        return false;
      }
      show('#ue-err', false);
      state.uebersicht = j; state.lastLoad = Date.now();
      show('#ue-body', true);
      try { renderUebersicht(j); } catch (e) { if (window.console) console.error(e); toast('Übersicht konnte nicht dargestellt werden.', { type: 'err' }); }
      merkeNeue(j.letzte, j.stand);
      setTitle(j.zaehler && j.zaehler.status ? j.zaehler.status.neu : 0);
      return true;
    });
  }
  function renderUebersicht(u) {
    var z = u.zaehler || {}, st = z.status || {}, e = u.eingaenge || {};
    setText('#k-neu', st.neu || 0);
    setText('#k-neu-sub', (e.heute || 0) + (e.heute === 1 ? ' Eingang heute' : ' Eingänge heute'));
    setText('#k-bearb', st.in_bearbeitung || 0);
    setText('#k-rueck', st.rueckfrage || 0);
    setText('#k-mandat', st.mandat || 0);
    setText('#k-ueber', u.ueberfaellig || 0);
    $('#k-ueber-kpi').classList.toggle('warn', (u.ueberfaellig || 0) > 0);
    setText('#k-ueber-sub', u.heute_faellig ? 'davon ' + u.heute_faellig + ' heute fällig' : (u.ueberfaellig ? 'Zusage überschritten' : 'alles im Zeitrahmen'));

    setText('#e-heute', e.heute || 0); setText('#e-7', e.tage7 || 0); setText('#e-30', e.tage30 || 0);
    var bars = $('#e-bars'); bars.textContent = '';
    var je = Array.isArray(e.je_tag_30) ? e.je_tag_30 : [];
    var max = je.reduce(function (m, t) { return Math.max(m, t.n || 0); }, 0);
    je.forEach(function (t, i) {
      var b = document.createElement('i');
      setW(b, max ? (t.n || 0) / max * 100 : 0);
      if (i === je.length - 1) b.classList.add('heute'); else if (t.n) b.classList.add('hat');
      b.title = (t.tag ? fmtDatum(t.tag).slice(0, 6) : '') + ': ' + (t.n || 0);
      bars.appendChild(b);
    });
    setText('#e-bars-von', je.length && je[0].tag ? fmtDatum(je[0].tag).slice(0, 6) : '');
    var typen = $('#e-typen'); typen.textContent = '';
    var nt = e.nach_typ_30 || {}, t30 = e.tage30 || 0;
    Object.keys(TYP).forEach(function (k) {
      var n = nt[k] || 0;
      var row = document.createElement('div'); row.className = 'hbar ' + k;
      var l = document.createElement('span'); l.className = 'hl'; l.textContent = TYP[k];
      var i = document.createElement('i'); setW(i, t30 ? n / t30 * 100 : 0);
      var num = document.createElement('span'); num.className = 'hn'; num.textContent = String(n);
      row.appendChild(l); row.appendChild(i); row.appendChild(num);
      typen.appendChild(row);
    });

    var hb = Array.isArray(u.handlungsbedarf) ? u.handlungsbedarf : [];
    var gesamt = u.handlungsbedarf_gesamt || hb.length;
    setText('#hb-count', hb.length ? '(' + gesamt + ')' : '');
    $('#hb-list').innerHTML = hb.map(hbRow).join('');
    show('#hb-empty', !hb.length);
    var mehr = gesamt - hb.length, hm = $('#hb-more');
    hm.hidden = mehr <= 0;
    hm.textContent = mehr > 0 ? mehr + ' weitere im Modul Anfragen (Filter Neu/Rückfrage)' : '';

    var letzte = Array.isArray(u.letzte) ? u.letzte : [];
    $('#letzte-list').innerHTML = letzte.map(letzteRow).join('');
    show('#letzte-empty', !letzte.length);
    setText('#ue-stand', 'Datenbank: ' + (u.speicher === 'supabase' ? 'Supabase' : 'Datei (lokal)') + ' · Stand ' + uhrzeit(u.stand));
  }
  function hbRow(h) {
    var grund = GRUND[h.grund] || h.grund || '';
    if (h.grund === 'wiedervorlage' && h.wiedervorlage) grund = 'Wiedervorlage ' + fmtWV(h.wiedervorlage);
    var alter, cls = 'age';
    if (h.grund === 'rueckfrage') {
      alter = 'Rückfrage seit ' + tageWort(Math.max(0, tageDiff(h.updated_at || h.created_at)));
    } else if (h.grund === 'wiedervorlage' && h.wiedervorlage) {
      var d = tageDiff(h.wiedervorlage);
      if (h.faellig_heute || d === 0) { alter = 'heute fällig'; cls += ' due'; }
      else if (d > 0) alter = 'überfällig seit ' + tageWort(d);
      else alter = 'fällig in ' + tageWort(-d);
    } else {
      alter = alterText(h.created_at);
    }
    if (h.ueberfaellig) cls += ' warn';
    return '<li><button type="button" class="hb-row" data-id="' + esc(h.id) + '">' +
      '<span class="nr">' + esc(h.nummer) + '</span><span class="nm">' + esc(displayName(h)) + '</span>' +
      '<span class="tags"><span class="badge typ">' + esc(TYP[h.typ] || h.typ) + '</span>' +
      '<span class="badge grund grund-' + esc(h.grund) + '">' + esc(grund) + '</span>' +
      '<span class="' + cls + '" title="Eingang ' + esc(fmtDate(h.created_at, true)) + '">' + esc(alter) + '</span></span>' +
      '<span class="chev" aria-hidden="true">›</span></button></li>';
  }
  function letzteRow(l) {
    return '<li><button type="button" class="hb-row" data-id="' + esc(l.id) + '">' +
      '<span class="nr">' + esc(l.nummer) + '</span><span class="nm">' + esc(displayName(l)) + '</span>' +
      '<span class="tags"><span class="badge typ">' + esc(TYP[l.typ] || l.typ) + '</span>' +
      '<span class="badge st st-' + esc(l.status) + '">' + esc(STATUS[l.status] || l.status) + '</span>' +
      '<span class="age" title="' + esc(fmtDate(l.created_at, true)) + '">' + esc(relZeit(l.created_at)) + '</span></span>' +
      '<span class="chev" aria-hidden="true">›</span></button></li>';
  }
  function ueRowClick(e) {
    var b = e.target.closest('.hb-row');
    if (!b) return;
    var id = b.getAttribute('data-id');
    if (id !== currentId() && !confirmDirty()) return;
    setModule('anfragen');
    openDetail(id, { force: true });
  }
  on('#hb-list', 'click', ueRowClick);
  on('#letzte-list', 'click', ueRowClick);
  on('#kpis', 'click', function (e) {
    var k = e.target.closest('.kpi');
    if (!k) return;
    state.filter.status = k.getAttribute('data-status') || '';
    state.filter.typ = ''; state.filter.q = '';
    $('#typ').value = ''; $('#q').value = '';
    setModule('anfragen');
  });
  on('#ue-refresh', 'click', function () { loadUebersicht(); });
  on('#ue-retry', 'click', function () { loadUebersicht(); });

  /* ===================== 8 Liste ===================== */
  function initChips() {
    $('#status-chips').innerHTML = CHIP_ORDER.map(function (s) {
      return '<button type="button" class="chip" data-s="' + s + '" aria-pressed="false">' + CHIP_LABEL[s] + '<b>0</b></button>';
    }).join('');
  }
  function renderChips() {
    var z = state.zaehler || { status: {}, gesamt: 0 };
    $$('#status-chips .chip').forEach(function (c) {
      var s = c.getAttribute('data-s'), akt = s === state.filter.status;
      c.classList.toggle('active', akt);
      c.setAttribute('aria-pressed', akt ? 'true' : 'false');
      var b = $('b', c);
      if (b) b.textContent = String(s === '' ? (z.gesamt || 0) : ((z.status && z.status[s]) || 0));
    });
  }
  function filterAktiv() { return !!(state.filter.status || state.filter.q || (state.mod !== 'antrag' && state.filter.typ)); }
  function renderFilterState() {
    renderChips();
    var t = $('#typ'); if (t.value !== state.filter.typ) t.value = state.filter.typ;
    show('#reset-filter', filterAktiv());
  }
  function renderResult() {
    var n = state.liste ? state.liste.length : 0;
    var gesamt = state.zaehler ? (state.zaehler.gesamt || 0) : 0;
    var treffer = state.treffer || 0;
    var txt = '';
    if (state.liste) {
      txt = filterAktiv() ? treffer + ' von ' + gesamt : gesamt + (gesamt === 1 ? ' Anfrage' : ' Anfragen');
      if (treffer > n) txt += ' · ' + n + ' von ' + treffer + ' angezeigt';
    }
    setText('#result-text', txt);
    show('#reset-filter', filterAktiv());
    show('#more', !!state.liste && treffer > n);
  }
  function renderEmpty() {
    var leer = !!state.liste && !state.liste.length;
    show('#list-empty', leer);
    if (!leer) return;
    var keine = !!state.zaehler && state.zaehler.gesamt === 0 && !filterAktiv();
    setText('#list-empty-text', keine
      ? (state.mod === 'antrag' ? 'Noch keine Online-Anträge eingegangen.' : 'Noch keine Anfragen eingegangen. Neue Eingänge erscheinen hier automatisch.')
      : 'Keine Treffer für diese Filter.');
    show('#list-empty-reset', !keine);
  }
  function sepGruppe(iso, now) {
    var t = tageDiff(iso, now);
    return t <= 0 ? 'Heute' : t === 1 ? 'Gestern' : t < 7 ? 'Diese Woche' : 'Älter';
  }
  function wvBadge(wv, now) {
    if (!wv) return '';
    var heute = heuteISO(now);
    var cls = wv < heute ? ' warn' : (wv === heute ? ' due' : '');
    return '<span class="wv' + cls + '" title="Wiedervorlage ' + esc(fmtDatum(wv)) + '">WV ' + esc(fmtWV(wv)) + '</span>';
  }
  function itemHtml(a, aktiv, now) {
    var name = displayName(a);
    var sub = [];
    if (a.email && a.email !== name) sub.push(a.email);
    if (a.telefon) sub.push(a.telefon);
    var tags = '<span class="badge typ">' + esc(TYP[a.typ] || a.typ) + '</span>' +
      '<span class="badge st st-' + esc(a.status) + '">' + esc(STATUS[a.status] || a.status) + '</span>';
    if (a.status === 'neu' && a.typ !== 'checkliste_pdf' && now.getTime() - toDate(a.created_at).getTime() > 48 * 3600e3) {
      tags += '<span class="age warn">' + esc(alterText(a.created_at, now)) + '</span>';
    }
    tags += wvBadge(a.wiedervorlage, now);
    return '<button type="button" class="item' + (aktiv ? ' active' : '') + '" data-id="' + esc(a.id) + '" aria-current="' + (aktiv ? 'true' : 'false') + '" tabindex="-1">' +
      '<span class="nr">' + esc(a.nummer) + '</span>' +
      '<span class="when" title="' + esc(fmtDate(a.created_at, true)) + '">' + esc(relZeit(a.created_at, now)) + '</span>' +
      '<span class="nm">' + esc(name) + '</span>' +
      (sub.length ? '<span class="sub">' + esc(sub.join(' · ')) + '</span>' : '') +
      '<span class="tags">' + tags + '</span></button>';
  }
  function iconHtml(a) {
    if (a.email && EMAIL_OK.test(a.email)) {
      return '<a class="item-icon" href="' + esc(mailtoUrl(a)) + '" title="E-Mail an ' + esc(a.email) + '" aria-label="E-Mail an ' + esc(a.email) + '">✉</a>';
    }
    if (a.telefon) {
      return '<a class="item-icon" href="tel:' + esc(telHref(a.telefon)) + '" title="Anrufen: ' + esc(a.telefon) + '" aria-label="Anrufen: ' + esc(a.telefon) + '">☎</a>';
    }
    return '';
  }
  function renderList() {
    var liste = state.liste || [], cur = hashId(), now = new Date();
    var fokus = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('item')
      ? document.activeElement.getAttribute('data-id') : null;
    var html = '', grp = null;
    liste.forEach(function (a) {
      var g = sepGruppe(a.created_at, now);
      if (g !== grp) { grp = g; html += '<li class="list-sep" aria-hidden="true">' + g + '</li>'; }
      html += '<li class="list-row">' + itemHtml(a, cur === a.id, now) + iconHtml(a) + '</li>';
    });
    $('#list').innerHTML = html;
    rovingTabindex();
    if (fokus) { var el = $('#list .item[data-id="' + fokus + '"]'); if (el) el.focus(); }
    renderEmpty();
  }
  function rovingTabindex() {
    var items = $$('#list .item'), cur = hashId(), ziel = null;
    items.forEach(function (it) { it.tabIndex = -1; if (!ziel && it.getAttribute('data-id') === cur) ziel = it; });
    if (!ziel && items.length) ziel = items[0];
    if (ziel) ziel.tabIndex = 0;
  }
  function markActive(id) {
    $$('#list .item').forEach(function (it) {
      var akt = !!id && it.getAttribute('data-id') === id;
      it.classList.toggle('active', akt);
      it.setAttribute('aria-current', akt ? 'true' : 'false');
    });
    rovingTabindex();
  }
  function aktualisiereZeile(a) {
    if (!a || !state.liste) return;
    var i = -1;
    state.liste.some(function (x, idx) { if (x.id === a.id) { i = idx; return true; } return false; });
    if (i < 0) return;
    var alt = state.liste[i];
    state.liste[i] = { id: alt.id, nummer: a.nummer || alt.nummer, typ: a.typ || alt.typ, status: a.status || alt.status, vorname: a.vorname, nachname: a.nachname, email: a.email, telefon: a.telefon, quelle: a.quelle, wiedervorlage: a.wiedervorlage || null, created_at: a.created_at || alt.created_at, updated_at: a.updated_at || alt.updated_at };
    renderList();
  }
  function entferneAusListe(id) {
    if (!state.liste) return;
    var vorher = state.liste.length;
    state.liste = state.liste.filter(function (x) { return x.id !== id; });
    if (state.liste.length !== vorher) { state.treffer = Math.max(0, state.treffer - 1); renderList(); renderResult(); }
  }
  /* Neue Eingänge seit dem letzten Stand (Serverzeit) → Info-Toast */
  function merkeNeue(rows, stand) {
    var prev = state.stand;
    if (stand) state.stand = stand;
    if (!prev || !Array.isArray(rows)) return;
    var neue = rows.filter(function (r) { return r && r.created_at && r.created_at > prev; });
    if (neue.length) toast(neue.length + (neue.length === 1 ? ' neue Anfrage' : ' neue Anfragen'), { type: 'info' });
  }
  var listSeq = 0, listHolder = null;
  function loadList(opts) {
    opts = opts || {};
    var seq = ++listSeq;
    if (listHolder && listHolder.abort) listHolder.abort();
    listHolder = {};
    renderFilterState();
    var pane = $('#list-pane');
    pane.setAttribute('aria-busy', 'true');
    var leer = state.liste === null;
    show('#list-sk', leer && !opts.append);
    if (!leer) $('#list').classList.add('dim');
    var more = $('#more');
    if (opts.append) busy(more, true, 'Lädt …');
    var offset = opts.append ? (state.offset || 0) + (state.limit || LIMIT) : 0;
    var p = new URLSearchParams();
    if (state.filter.status) p.set('status', state.filter.status);
    var typ = effTyp();
    if (typ) p.set('typ', typ);
    if (state.filter.q) p.set('q', state.filter.q);
    if (offset) p.set('offset', String(offset));
    return api('GET', API + '?' + p.toString(), undefined, { holder: listHolder }).then(function (j) {
      if (seq !== listSeq) return false;
      pane.setAttribute('aria-busy', 'false');
      show('#list-sk', false); $('#list').classList.remove('dim');
      if (opts.append) busy(more, false);
      if (!j.ok) {
        if (j.error !== 'unauthorized' && j.error !== 'abgebrochen') {
          setText('#list-err-text', fehlerText(j)); show('#list-err', true);
          if (state.liste) $('#list').classList.add('dim');
        }
        return false;
      }
      show('#list-err', false);
      var rows = Array.isArray(j.anfragen) ? j.anfragen : [];
      state.liste = opts.append && state.liste ? state.liste.concat(rows) : rows;
      state.treffer = typeof j.treffer === 'number' ? j.treffer : state.liste.length;
      state.zaehler = j.zaehler || state.zaehler;
      state.offset = j.offset || 0; state.limit = j.limit || LIMIT;
      state.listStand = j.stand || new Date().toISOString(); state.lastLoad = Date.now();
      if (!opts.append) merkeNeue(rows, j.stand);
      if (!typ) setTitle(state.zaehler && state.zaehler.status ? state.zaehler.status.neu : 0);
      renderChips(); renderList(); renderResult();
      setText('#list-stand-text', 'Stand ' + uhrzeit(state.listStand));
      return true;
    });
  }
  on('#status-chips', 'click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    state.filter.status = c.getAttribute('data-s') || '';
    loadList();
  });
  on('#typ', 'change', function (e) { state.filter.typ = e.target.value; loadList(); });
  var qTimer = null;
  on('#q', 'input', function (e) {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () {
      var v = e.target.value.trim();
      if (v === state.filter.q) return;
      state.filter.q = v; loadList();
    }, 250);
  });
  on('#q', 'keydown', function (e) {
    if (e.key === 'Escape' && e.target.value) { e.target.value = ''; state.filter.q = ''; loadList(); }
    if (e.key === 'ArrowDown') { var first = $('#list .item[tabindex="0"]') || $('#list .item'); if (first) { e.preventDefault(); first.focus(); } }
  });
  function resetFilter() {
    state.filter = { status: '', typ: '', q: '' };
    $('#q').value = ''; $('#typ').value = '';
    loadList();
  }
  on('#reset-filter', 'click', resetFilter);
  on('#list-empty-reset', 'click', resetFilter);
  on('#list-refresh', 'click', function () { loadList(); });
  on('#list-retry', 'click', function () { loadList(); });
  on('#more', 'click', function () { loadList({ append: true }); });
  on('#list', 'click', function (e) {
    if (e.target.closest('.item-icon')) { e.stopPropagation(); return; }
    var it = e.target.closest('.item');
    if (it) openDetail(it.getAttribute('data-id'));
  });
  on('#list', 'keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var items = $$('#list .item');
    if (!items.length) return;
    var i = items.indexOf(document.activeElement);
    var n = i < 0 ? 0 : (e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1));
    e.preventDefault(); items[n].focus();
  });

  /* ===================== 9 Detail ===================== */
  function showDetailView() {
    $('#layout').classList.add('show-detail');
    if (isMobile()) window.scrollTo(0, 0);
  }
  function closeDetailView() { $('#layout').classList.remove('show-detail'); }
  function mobileZurueck() {
    closeDetailView();
    state.detailGeschlossen = true;
    writeHash();
    var akt = $('#list .item.active') || $('#list .item');
    if (akt) akt.focus();
  }
  function zeigePlatzhalter() {
    $('#detail-card').hidden = true; $('#detail-empty').hidden = false;
    markActive(null);
  }
  function openDetail(id, opts) {
    opts = opts || {};
    if (!id) return Promise.resolve(false);
    var cur = currentId();
    if (cur !== id && !opts.force && !confirmDirty()) return Promise.resolve(false);
    if (cur === id && istDirty()) {
      // gleiche Anfrage mit ungespeicherten Eingaben: nur anzeigen, nicht neu laden
      state.detailGeschlossen = false; showDetailView();
      if (opts.tab) setTab(opts.tab, { silent: true });
      if (!opts.fromHash && !opts.keepHash) writeHash();
      return Promise.resolve(true);
    }
    if (cur !== id) { state.dirty.notizen = false; state.dirty.antrag = false; updateDirtyUI(); }
    state.wantedId = id; state.wantedTab = opts.tab || ''; state.detailGeschlossen = false;
    markActive(id); showDetailView();
    if (!opts.fromHash && !opts.keepHash) writeHash();
    var pane = $('#detail');
    pane.setAttribute('aria-busy', 'true');
    if (state.current) $('#detail-card').classList.add('dim');
    return api('GET', API + '?id=' + encodeURIComponent(id)).then(function (j) {
      if (state.wantedId !== id) return false;
      pane.setAttribute('aria-busy', 'false');
      $('#detail-card').classList.remove('dim');
      if (!j.ok) {
        state.wantedId = currentId();
        if (j.error === 'not_found') { entferneAusListe(id); if (!currentId() || cur === id) { state.current = null; state.wantedId = null; zeigePlatzhalter(); } }
        markActive(currentId());
        if (j.error !== 'unauthorized') toast(fehlerText(j), { type: 'err' });
        return false;
      }
      var vorher = state.current;
      state.current = j;
      try { renderDetail(vorher); }
      catch (e) { if (window.console) console.error(e); toast('Anfrage konnte nicht dargestellt werden.', { type: 'err' }); }
      return true;
    });
  }
  function renderMeta() {
    var a = state.current && state.current.anfrage;
    if (!a) return;
    $('#d-meta').innerHTML = '<span class="badge typ">' + esc(TYP[a.typ] || a.typ) + '</span>' +
      '<span class="badge st st-' + esc(a.status) + '">' + esc(STATUS[a.status] || a.status) + '</span>' +
      '<span title="' + esc(fmtDate(a.created_at, true)) + '">Eingang ' + esc(relZeit(a.created_at)) + '</span>' +
      (a.quelle ? '<span>· ' + esc(a.quelle) + '</span>' : '') + wvBadge(a.wiedervorlage);
    var wv = $('#d-wiedervorlage');
    if (wv.value !== (a.wiedervorlage || '')) wv.value = a.wiedervorlage || '';
    var sel = $('#d-status');
    if (!sel.disabled && sel.value !== a.status) sel.value = a.status;
  }
  function renderDetail(vorher) {
    var c = state.current, a = c.anfrage, d = a.daten || {};
    $('#detail-empty').hidden = true; $('#detail-card').hidden = false;
    setText('#d-nummer', a.nummer); setText('#mobile-nummer', a.nummer);
    setText('#d-name', displayName(a));
    var sel = $('#d-status'); sel.disabled = false; sel.value = a.status;
    var wv = $('#d-wiedervorlage'); wv.disabled = false; wv.value = a.wiedervorlage || '';
    renderMeta();

    var msg = typeof d.nachricht === 'string' ? d.nachricht : (typeof d.c_nachricht === 'string' ? d.c_nachricht : '');
    $('#d-nachricht').hidden = !msg.trim();
    setText('#d-nachricht-text', msg);

    var mailOk = !!(a.email && EMAIL_OK.test(a.email));
    var emailHtml = a.email
      ? (mailOk ? '<a href="' + esc(mailtoUrl(a)) + '">' + esc(a.email) + '</a>' : esc(a.email) + '<span class="badge invalid">ungültige Adresse</span>')
      : '—';
    $('#d-kontakt').innerHTML = '<dt>Name</dt><dd>' + esc([a.vorname, a.nachname].filter(Boolean).join(' ') || '—') + '</dd>' +
      '<dt>E-Mail</dt><dd>' + emailHtml + '</dd>' +
      '<dt>Telefon</dt><dd>' + (a.telefon ? '<a href="tel:' + esc(telHref(a.telefon)) + '">' + esc(a.telefon) + '</a>' : '—') + '</dd>';
    var mailBtn = $('#btn-mail');
    mailBtn.disabled = !mailOk;
    mailBtn.title = mailOk ? 'E-Mail an ' + a.email : 'Keine gültige E-Mail-Adresse';
    $('#copy-mail').disabled = !a.email;
    $('#copy-tel').disabled = !a.telefon;

    var consent = d.dsgvo_zugestimmt === true || d.cost_dsgvo === true;
    var dsg = $('#d-dsgvo');
    dsg.className = 'dsgvo' + (consent ? ' ok' : '');
    dsg.textContent = consent
      ? '✓ Datenschutz zugestimmt am ' + fmtDate((d.meta && d.meta.gesendet_am) || a.created_at, true)
      : '– Keine Datenschutz-Zustimmung gespeichert';

    var rows = kvRows(d);
    $('#d-daten').innerHTML = rows.length
      ? rows.map(function (r) { return r.group ? '<div class="group">' + esc(r.group) + '</div>' : '<dt>' + esc(r.label) + '</dt><dd>' + esc(r.value) + '</dd>'; }).join('')
      : '<dd class="empty">Keine weiteren Formularangaben — Kontakt und Nachricht stehen oben.</dd>';
    var m = d.meta || {};
    $('#d-meta-kv').innerHTML = '<dt>Quelle</dt><dd>' + esc(m.quelle || a.quelle || '—') + '</dd>' +
      '<dt>Seite</dt><dd>' + esc(seitePfad(m.seite || a.seite) || '—') + '</dd>' +
      '<dt>Gesendet am</dt><dd>' + esc(m.gesendet_am ? fmtDate(m.gesendet_am, true) : '—') + '</dd>' +
      '<dt>Letzte Änderung</dt><dd>' + esc(fmtDate(a.updated_at, true) || '—') + '</dd>' +
      '<dt>ID</dt><dd>' + esc(a.id) + '</dd>';
    $('#d-tech').open = false;

    $('#checkliste-card').hidden = a.typ !== 'checkliste_pdf';
    $('#d-notizen').value = a.notizen || '';
    syncNotizenPrint();
    show('#notizen-saved', false); show('#antrag-saved', false);
    $('#del-grund').value = '';
    renderVerlauf();
    renderAntrag();

    var tab = state.wantedTab || state.tab;
    state.wantedTab = '';
    if (state.mod === 'antrag') tab = 'antrag';
    else if (tab === 'antrag' && a.typ !== 'antrag' && vorher && vorher.anfrage && vorher.anfrage.typ === 'antrag' && vorher.anfrage.id !== a.id) tab = 'anfrage';
    setTab(tab, { silent: true });
    updateDirtyUI();
    $('#print-info').textContent = 'Anfrage ' + a.nummer + ' · gedruckt am ' + fmtDate(new Date(), true) + ' von ' + (state.user || '');
    writeHash(true);
  }
  function renderVerlauf() {
    var v = (state.current && Array.isArray(state.current.verlauf)) ? state.current.verlauf : [];
    $('#d-verlauf').innerHTML = v.map(function (e) {
      var d = e.details || {}, txt = EREIGNIS[e.art] || e.art || 'Ereignis';
      if (e.art === 'status') txt += ': ' + (STATUS[d.von] || d.von || '—') + ' → ' + (STATUS[d.nach] || d.nach || '—');
      else if (e.art === 'dokument') txt += ': ' + (d.typ === 'vollmacht' ? 'Vollmacht' : 'Antragsentwurf') + (d.offen && d.offen.length ? ' (' + d.offen.length + (d.offen.length === 1 ? ' Feld offen)' : ' Felder offen)') : '');
      else if (e.art === 'antrag') { var n = Array.isArray(d.felder) ? d.felder.length : (typeof d.felder === 'number' ? d.felder : 0); if (n) txt += ' (' + n + (n === 1 ? ' Feld)' : ' Felder)'); }
      else if (e.art === 'wiedervorlage') txt = d.nach ? 'Wiedervorlage gesetzt auf ' + fmtDatum(d.nach) : 'Wiedervorlage entfernt';
      else if (e.art === 'eingang' && d.quelle) txt += ' (' + d.quelle + ')';
      else if (e.art === 'checkliste_gesendet' && d.email) txt += ' an ' + d.email;
      return '<li><time datetime="' + esc(e.zeit) + '">' + esc(fmtDate(e.zeit, true)) + '</time><span>' + esc(txt) +
        (e.benutzer ? ' <span class="muted">· ' + esc(e.benutzer) + '</span>' : '') + '</span></li>';
    }).join('') || '<li class="muted">Noch keine Einträge.</li>';
  }
  /* PATCH auf eine Anfrage; aktualisiert Zustand nur, wenn sie noch geöffnet ist */
  function patchId(id, body) {
    if (!id) return Promise.resolve(false);
    if (state.pending[id]) return Promise.resolve(false);
    state.pending[id] = true;
    return api('PATCH', API + '?id=' + encodeURIComponent(id), body).then(function (j) {
      delete state.pending[id];
      if (!j.ok) {
        if (j.error !== 'unauthorized') toast(fehlerText(j), { type: 'err' });
        if (j.error === 'not_found') entferneAusListe(id);
        return false;
      }
      if (currentId() === id && j.anfrage) {
        state.current.anfrage = j.anfrage;
        if (j.antragswerte) {
          state.current.antragswerte = j.antragswerte;
          state.current.vorbelegt = j.vorbelegt || state.current.vorbelegt;
          state.current.nichtZutreffend = j.nichtZutreffend || [];
          state.current.hinweise = j.hinweise || {};
        }
        aktualisiereZeile(j.anfrage); renderMeta();
      }
      return reloadCurrent(id).then(function () { return true; });
    });
  }
  function patch(body) { return patchId(currentId(), body); }
  /* Detail neu laden (Verlauf, Werte) ohne Reiter/Eingaben anzufassen */
  function reloadCurrent(id) {
    return api('GET', API + '?id=' + encodeURIComponent(id)).then(function (d) {
      if (d.ok && currentId() === id) {
        state.current = d;
        renderVerlauf(); renderMeta(); aktualisiereZeile(d.anfrage);
      }
      return d.ok;
    });
  }
  function initStatusSelect() {
    $('#d-status').innerHTML = Object.keys(STATUS).map(function (s) { return '<option value="' + s + '">' + STATUS[s] + '</option>'; }).join('');
  }
  on('#d-status', 'change', function (e) {
    var a = state.current && state.current.anfrage;
    var sel = e.target;
    if (!a) return;
    var id = a.id, von = a.status, nach = sel.value;
    if (von === nach) return;
    if (state.pending[id]) { sel.value = von; return; }
    sel.disabled = true;
    patchId(id, { status: nach }).then(function (ok) {
      sel.disabled = false;
      if (!ok) { if (currentId() === id) sel.value = state.current.anfrage.status; return; }
      toast('Status gespeichert: ' + (STATUS[nach] || nach), {
        type: 'ok', dauer: 5000,
        action: { label: 'Rückgängig', fn: function () {
          if (currentId() === id) sel.disabled = true;
          patchId(id, { status: von }).then(function (ok2) {
            if (currentId() === id) { sel.disabled = false; sel.value = state.current.anfrage.status; }
            if (ok2) { toast('Status zurückgesetzt: ' + (STATUS[von] || von), { type: 'ok' }); loadList(); }
          });
        } }
      });
      loadList();
    });
  });
  on('#d-wiedervorlage', 'change', function (e) {
    var a = state.current && state.current.anfrage;
    var inp = e.target;
    if (!a) return;
    var id = a.id, wert = inp.value || null;
    if (wert === (a.wiedervorlage || null)) return;
    if (state.pending[id]) { inp.value = a.wiedervorlage || ''; return; }
    inp.disabled = true;
    patchId(id, { wiedervorlage: wert }).then(function (ok) {
      inp.disabled = false;
      if (!ok) { if (currentId() === id) inp.value = state.current.anfrage.wiedervorlage || ''; return; }
      toast(wert ? 'Wiedervorlage ' + fmtDatum(wert) + ' gesetzt' : 'Wiedervorlage entfernt', { type: 'ok' });
    });
  });
  function markDirty(k) {
    state.dirty[k] = true;
    show(k === 'notizen' ? '#notizen-saved' : '#antrag-saved', false);
    updateDirtyUI();
  }
  function updateDirtyUI() {
    $('#save-notizen').classList.toggle('dirty', state.dirty.notizen);
    $('#save-antrag').classList.toggle('dirty', state.dirty.antrag);
    updateMobileActions();
  }
  function updateMobileActions() {
    var ma = $('#mobile-actions'), b = $('#mobile-save');
    if (!state.current || state.tab === 'verlauf') { ma.hidden = true; return; }
    ma.hidden = false;
    if (!b.getAttribute('aria-busy')) b.textContent = state.tab === 'antrag' ? 'Felder speichern' : 'Notizen speichern';
    b.classList.toggle('dirty', state.tab === 'antrag' ? state.dirty.antrag : state.dirty.notizen);
  }
  function syncNotizenPrint() { setText('#notizen-print', $('#d-notizen').value); }
  on('#d-notizen', 'input', function () { markDirty('notizen'); syncNotizenPrint(); });
  function saveNotizen() {
    var id = currentId();
    if (!id || state.pending[id]) return Promise.resolve(false);
    var btn = $('#save-notizen'), mb = $('#mobile-save');
    busy(btn, true, 'Speichert …'); busy(mb, true, 'Speichert …');
    return patchId(id, { notizen: $('#d-notizen').value }).then(function (ok) {
      busy(btn, false); busy(mb, false);
      if (ok && currentId() === id) {
        state.dirty.notizen = false; updateDirtyUI();
        var s = $('#notizen-saved'); s.textContent = 'Gespeichert um ' + jetztUhr(); s.hidden = false;
      }
      return ok;
    });
  }
  on('#save-notizen', 'click', function () { saveNotizen(); });
  on('#mobile-save', 'click', function () { if (state.tab === 'antrag') saveAntrag(); else saveNotizen(); });
  on('#mobile-back', 'click', mobileZurueck);
  on('#btn-mail', 'click', function () {
    var a = state.current && state.current.anfrage;
    if (!a || !a.email) return;
    if (!EMAIL_OK.test(a.email)) { toast('E-Mail-Adresse ungültig — bitte manuell kopieren.', { type: 'err' }); return; }
    window.location.href = mailtoUrl(a);
  });
  on('#btn-print', 'click', function () {
    var a = state.current && state.current.anfrage;
    if (!a) return;
    syncNotizenPrint();
    $('#print-info').textContent = 'Anfrage ' + a.nummer + ' · gedruckt am ' + fmtDate(new Date(), true) + ' von ' + (state.user || '');
    window.print();
  });
  on('#btn-copy', 'click', function () { var a = state.current && state.current.anfrage; if (a) copyText(a.nummer, 'Nummer'); });
  on('#copy-mail', 'click', function () { var a = state.current && state.current.anfrage; if (a) copyText(a.email, 'E-Mail'); });
  on('#copy-tel', 'click', function () { var a = state.current && state.current.anfrage; if (a) copyText(a.telefon, 'Telefon'); });
  on('#btn-checkliste-mail', 'click', function () {
    var a = state.current && state.current.anfrage;
    if (!a || !a.email) return;
    if (!EMAIL_OK.test(a.email)) { toast('E-Mail-Adresse ungültig — bitte manuell kopieren.', { type: 'err' }); return; }
    window.location.href = 'mailto:' + encodeURIComponent(a.email) + '?subject=' + encodeURIComponent('Ihre Checkliste Scheidungsunterlagen') +
      '&body=' + encodeURIComponent(checklisteText(window.location.origin));
  });
  on('#btn-checkliste-done', 'click', function () {
    var a = state.current && state.current.anfrage;
    if (!a || a.typ !== 'checkliste_pdf') return;
    if (!window.confirm('Checkliste als gesendet markieren? Der Status wird auf „Erledigt“ gesetzt.')) return;
    var id = a.id, btn = $('#btn-checkliste-done');
    if (state.pending[id]) return;
    busy(btn, true, 'Speichert …');
    patchId(id, { status: 'erledigt', ereignis: 'checkliste_gesendet' }).then(function (ok) {
      busy(btn, false);
      if (!ok) return;
      if (currentId() === id) $('#d-status').value = 'erledigt';
      toast('Checkliste als gesendet markiert — Status „Erledigt“.', { type: 'ok' });
      loadList();
    });
  });
  on('#delete', 'click', function () {
    var a = state.current && state.current.anfrage;
    if (!a) return;
    if (!window.confirm('Anfrage ' + a.nummer + ' endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;
    var btn = $('#delete');
    busy(btn, true, 'Löscht …');
    var grund = $('#del-grund').value.trim();
    api('DELETE', API + '?id=' + encodeURIComponent(a.id), { grund: grund }).then(function (j) {
      busy(btn, false);
      if (!j.ok) { if (j.error !== 'unauthorized') toast(fehlerText(j), { type: 'err' }); return; }
      toast('Anfrage ' + a.nummer + ' gelöscht.', { type: 'ok' });
      state.dirty.notizen = false; state.dirty.antrag = false; updateDirtyUI();
      entferneAusListe(a.id);
      state.current = null; state.wantedId = null; state.detailGeschlossen = true;
      zeigePlatzhalter(); closeDetailView();
      if (state.mod === 'uebersicht') setModule('anfragen'); else { writeHash(); loadList(); }
    });
  });

  /* ===================== 10 Antragsentwurf ===================== */
  function antragKontext() {
    var c = state.current || {};
    return { felder: Array.isArray(c.antragsfelder) ? c.antragsfelder : [], werte: c.antragswerte || {}, vorbelegt: c.vorbelegt || {}, nz: Array.isArray(c.nichtZutreffend) ? c.nichtZutreffend : [], hinweise: c.hinweise || {} };
  }
  function istDatumFeld(f) { return f.hint === 'TT.MM.JJJJ' || f.key === 'datum' || /(geburtsdatum|heiratsdatum|trennungsdatum)$/.test(f.key); }
  function istNumFeld(f) { return !!f.numerisch || /^(gegenstandswert_|nettoeinkommen_)/.test(f.key); }
  function renderAntrag() {
    var c = state.current;
    if (!c) return;
    var k = antragKontext(), a = c.anfrage;
    var sichtbar = k.felder.filter(function (f) { return k.nz.indexOf(f.key) < 0; });
    var html = '', grp = null;
    sichtbar.forEach(function (f) {
      if (f.gruppe !== grp) {
        grp = f.gruppe;
        var inGrp = sichtbar.filter(function (x) { return x.gruppe === grp; });
        var voll = inGrp.filter(function (x) { return String(k.werte[x.key] == null ? '' : k.werte[x.key]).trim(); }).length;
        html += '<div class="grp"><span>' + esc(grp) + '</span><span class="gcount" data-grp="' + esc(grp) + '">' + voll + '/' + inGrp.length + '</span></div>';
      }
      var v = k.werte[f.key] == null ? '' : String(k.werte[f.key]);
      // „aus Anfrage“ nur für Werte aus dem Formular — datum/wegen sind feste Vorgaben
      var offen = !v.trim(), pre = !offen && f.key !== 'datum' && f.key !== 'wegen' && k.vorbelegt[f.key] === v;
      var id = 'af-' + f.key;
      var cls = (offen ? 'open ' : '') + (pre ? 'pre' : '');
      var ph = istDatumFeld(f) ? 'TT.MM.JJJJ' : '________ (aus Urkunde)';
      var attrs = ' id="' + id + '" name="' + esc(f.key) + '" class="' + cls.trim() + '" placeholder="' + ph + '" maxlength="600"' + (istNumFeld(f) ? ' inputmode="numeric"' : '');
      html += '<div class="fld' + (f.multiline ? ' wide' : '') + '"><label for="' + id + '">' + esc(f.label) + (pre ? '<span class="pre-badge">aus Anfrage</span>' : '') + '</label>' +
        (f.multiline ? '<textarea' + attrs + ' rows="3">' + esc(v) + '</textarea>' : '<input' + attrs + ' value="' + esc(v) + '" />') +
        (k.hinweise[f.key] ? '<small class="hint">' + esc(k.hinweise[f.key]) + '</small>' : '') + '</div>';
    });
    $('#antrag-form').innerHTML = html;
    $('#antrag-hint').hidden = !(a.typ !== 'antrag' && a.status !== 'mandat');
    renderAntragFortschritt();
  }
  function renderAntragFortschritt() {
    var k = antragKontext(), form = $('#antrag-form');
    var sichtbar = k.felder.filter(function (f) { return k.nz.indexOf(f.key) < 0; });
    var offen = sichtbar.filter(function (f) {
      var el = form.elements[f.key];
      var v = el ? el.value : (k.werte[f.key] == null ? '' : k.werte[f.key]);
      return !String(v).trim();
    });
    var voll = sichtbar.length - offen.length;
    setText('#antrag-progress-text', voll + ' von ' + sichtbar.length + ' Feldern ausgefüllt');
    setW($('#antrag-progress'), sichtbar.length ? voll / sichtbar.length * 100 : 0);
    $$('#antrag-form .gcount').forEach(function (g) {
      var name = g.getAttribute('data-grp');
      var inGrp = sichtbar.filter(function (f) { return f.gruppe === name; });
      var v = inGrp.filter(function (f) { return offen.indexOf(f) < 0; }).length;
      g.textContent = v + '/' + inGrp.length;
    });
    $('#offene-felder').innerHTML = offen.map(function (f) {
      return '<button type="button" class="field-chip" data-key="' + esc(f.key) + '">' + esc(f.gruppe + ' · ' + f.label) + '</button>';
    }).join('');
    setText('#offene-label', offen.length ? 'Noch offen (' + offen.length + '):' : 'Alle Felder sind ausgefüllt.');
  }
  on('#antrag-form', 'input', function (e) {
    var el = e.target;
    if (!el || !el.name) return;
    el.classList.toggle('open', !el.value.trim());
    if (el.classList.contains('pre') && antragKontext().vorbelegt[el.name] !== el.value) el.classList.remove('pre');
    markDirty('antrag');
    renderAntragFortschritt();
  });
  on('#antrag-form', 'submit', function (e) { e.preventDefault(); saveAntrag(); });
  on('#offene-felder', 'click', function (e) {
    var b = e.target.closest('.field-chip');
    if (!b) return;
    var el = $('#antrag-form').elements[b.getAttribute('data-key')];
    if (!el) return;
    if (state.tab !== 'antrag') setTab('antrag');
    el.focus();
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  /* Nur Felder senden, die vom geladenen Stand abweichen (Datum wird so nicht eingefroren) */
  function antragWerte() {
    var out = {}, k = antragKontext(), form = $('#antrag-form');
    k.felder.forEach(function (f) {
      var el = form.elements[f.key];
      if (!el) return;
      var alt = k.werte[f.key] == null ? '' : String(k.werte[f.key]);
      if (el.value !== alt) out[f.key] = el.value;
    });
    return out;
  }
  function saveAntrag() {
    var id = currentId();
    if (!id || state.pending[id]) return Promise.resolve(false);
    var btn = $('#save-antrag'), mb = $('#mobile-save');
    busy(btn, true, 'Speichert …'); busy(mb, true, 'Speichert …');
    return patchId(id, { antrag: antragWerte() }).then(function (ok) {
      busy(btn, false); busy(mb, false);
      if (ok && currentId() === id) {
        state.dirty.antrag = false; updateDirtyUI();
        renderAntrag();
        var s = $('#antrag-saved'); s.textContent = 'Gespeichert um ' + jetztUhr(); s.hidden = false;
        toast('Antragsfelder gespeichert.', { type: 'ok' });
      }
      return ok;
    });
  }
  on('#save-antrag', 'click', function () { saveAntrag(); });
  /* Download per fetch: erst ungespeicherte Felder sichern, dann Datei holen und Verlauf aktualisieren */
  function download(typ, btn) {
    var a = state.current && state.current.anfrage;
    if (!a) return;
    var id = a.id, name = typ === 'vollmacht' ? 'Vollmacht' : 'Antragsentwurf';
    busy(btn, true, 'Wird erzeugt …');
    var vorab = state.dirty.antrag ? saveAntrag() : Promise.resolve(true);
    vorab.then(function (ok) {
      if (!ok) return null;
      return fetch(API_DOK + '?id=' + encodeURIComponent(id) + '&typ=' + encodeURIComponent(typ), { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return { ok: false, error: r.status >= 500 ? 'server' : 'bad_json' }; }).then(function (j) {
            j.__status = r.status;
            if (r.status === 401) { sessionAbgelaufen(); return null; }
            toast(fehlerText(j), { type: 'err' });
            return null;
          });
        }
        var cd = r.headers.get('Content-Disposition') || '';
        var m = /filename="?([^";]+)"?/.exec(cd);
        var fname = m ? m[1] : name + '_' + a.nummer + '.docx';
        var offen = (r.headers.get('X-Offene-Felder') || '').split(',').filter(Boolean);
        return r.blob().then(function (blob) {
          var url = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href = url; link.download = fname; link.className = 'vh';
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
          toast(name + ' erzeugt' + (offen.length ? ' — ' + offen.length + (offen.length === 1 ? ' Feld noch offen' : ' Felder noch offen') : ''), { type: 'ok', dauer: 4000 });
          return reloadCurrent(id);
        });
      }).catch(function () { toast(FEHLER.network, { type: 'err' }); return null; });
    }).then(function () { busy(btn, false); });
  }
  on('#dl-antrag', 'click', function (e) { download('antragsentwurf', e.currentTarget); });
  on('#dl-vollmacht', 'click', function (e) { download('vollmacht', e.currentTarget); });

  /* ===================== 11 Global: Tastatur, Hash, Auto-Refresh ===================== */
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName;
    var inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
    if (!state.user || state.sessionWeg) return;
    if (e.key === '/' && !inField && state.mod !== 'uebersicht' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var q = $('#q');
      if (q) { e.preventDefault(); q.focus(); q.select(); }
    }
    if (e.key === 'Escape' && isMobile() && $('#layout').classList.contains('show-detail')) {
      if (inField) { t.blur(); return; }
      mobileZurueck();
    }
  });
  window.addEventListener('popstate', function () { if (state.user) applyHash(); });
  window.addEventListener('beforeunload', function (e) {
    if (istDirty()) { e.preventDefault(); e.returnValue = ''; }
  });
  function autoRefresh() {
    if (document.visibilityState !== 'visible' || !state.user || state.sessionWeg || istDirty()) return;
    if (state.mod === 'uebersicht') loadUebersicht(); else loadList();
  }
  setInterval(autoRefresh, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - state.lastLoad > 60000) autoRefresh();
  });

  /* ===================== 12 Start ===================== */
  initChips();
  initStatusSelect();
  setTab('anfrage', { silent: true });
  boot();
})();
