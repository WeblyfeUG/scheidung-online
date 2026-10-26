/* ============================================================
   Kanzlei-HQ v2 — B1 Login (2FA) · B2 Posteingang/Akten · B3 Anfrage ·
   B4 Akte (7 Reiter) · B5 Vorlagen · B6 Einstellungen.
   Ohne Framework, ohne Inline-Styles (CSP). Routing über location.hash:
   #/posteingang · #/akten · #/a/<id>[/<reiter>] · #/vorlagen · #/einstellungen
   API: /api/hq/<route> (Cookie-Sitzung), siehe HQ-README.md
   ============================================================ */
(function () {
  'use strict';

  /* ===================== 1 Konstanten ===================== */
  var STATUS = ['neu', 'in_pruefung', 'mandat_angeboten', 'unterschrieben', 'fragebogen_vollstaendig', 'antrag_vorbereitung', 'eingereicht', 'termin', 'abgeschlossen', 'erstgespraech', 'abgesagt', 'widerrufen'];
  var LABEL = { neu: 'Neu', in_pruefung: 'In Prüfung', mandat_angeboten: 'Mandat angeboten', unterschrieben: 'Unterschrieben', fragebogen_vollstaendig: 'Fragebogen vollständig', antrag_vorbereitung: 'Antrag in Vorbereitung', eingereicht: 'Eingereicht', termin: 'Termin steht', abgeschlossen: 'Abgeschlossen', erstgespraech: 'Erstgespräch', abgesagt: 'Abgesagt', widerrufen: 'Widerrufen' };
  var KETTE = ['neu', 'in_pruefung', 'mandat_angeboten', 'unterschrieben', 'fragebogen_vollstaendig', 'antrag_vorbereitung', 'eingereicht', 'termin', 'abgeschlossen'];
  var KETTE_KURZ = ['Neu', 'In Prüfung', 'Mandat angeboten', 'Unterschrieben', 'Fragebogen', 'Antrag', 'Eingereicht', 'Termin', 'Abgeschlossen'];
  var QUELLEN = [['antrag', 'Online-Antrag'], ['kostenrahmen', 'Kostenformular'], ['nachricht', 'Kontakt'], ['checkliste_pdf', 'Checkliste']];
  var KI = { gruen: 'Online-Weg passt', gelb: 'Gespräch empfohlen', rot: 'Dringend / Konflikt' };
  var REITER = [['uebersicht', 'Übersicht'], ['angaben', 'Angaben'], ['dokumente', 'Dokumente'], ['kosten', 'Gegenstandswert & Kosten'], ['antrag', 'Scheidungsantrag'], ['termine', 'Termine'], ['kommunikation', 'Kommunikation']];
  var ENTWURF = {
    mandat: 'ich habe mir Ihre Angaben angesehen. Ihre Situation eignet sich gut für den Weg über unsere Online-Scheidung, und ich übernehme Ihr Verfahren gern.',
    erstgespraech: 'vielen Dank für Ihre Anfrage. Einige Punkte möchte ich gern persönlich mit Ihnen besprechen, bevor wir den Antrag vorbereiten.',
    kosten: 'wie gewünscht erhalten Sie vorab eine Übersicht der voraussichtlichen Kosten.',
    absage: 'vielen Dank für Ihr Vertrauen. Ihre Anfrage betrifft leider ein Rechtsgebiet, das ich nicht vertrete. Bei der Suche hilft die Anwaltssuche der Rechtsanwaltskammer Celle.',
    frei: ''
  };
  var DOK_ARTEN = [['heiratsurkunde', 'Heiratsurkunde'], ['geburtsurkunde', 'Geburtsurkunde'], ['ehevertrag', 'Ehevertrag'], ['vollmacht_pdf', 'Mandat / Vollmacht (PDF)'], ['antrag_docx', 'Scheidungsantrag (Word)'], ['antrag_pdf', 'Scheidungsantrag (PDF)'], ['sonstiges', 'Sonstiges']];
  var QUELLE_DOK = { mandant: 'Mandant', kanzlei: 'Kanzlei', system: 'System' };
  var MAIL_STATUS = { gesendet: 'Gesendet', fehler: 'Fehler', geplant: 'Entwurf' };
  var EREIGNIS = {
    eingang: 'Anfrage eingegangen', status: 'Status geändert', notiz: 'Notizen gespeichert', wiedervorlage: 'Wiedervorlage', mail_gesendet: 'E-Mail gesendet', mail_fehler: 'E-Mail fehlgeschlagen', mail_geplant: 'E-Mail-Entwurf angelegt',
    ki: 'KI-Einordnung', spam: 'Als Spam markiert', kein_spam: 'Spam-Markierung aufgehoben', akte: 'Akte geändert', dokument: 'Word-Dokument erzeugt', dokument_hochgeladen: 'Dokument hochgeladen', dokument_geloescht: 'Dokument gelöscht',
    angaben_geaendert: 'Angaben geändert (Kanzlei)', kosten: 'Kosten angepasst', kosten_gesendet: 'Kostenübersicht gesendet', termin: 'Termin eingetragen', termin_geloescht: 'Termin gelöscht',
    link_neu: 'Neuer Link angefordert', keine_reaktion: 'Keine Reaktion nach Erinnerungen', checkliste_gesendet: 'Checkliste gesendet', fragebogen_vollstaendig: 'Fragebogen vollständig', antrag: 'Antragsfelder geändert'
  };
  var FEHLER = {
    netz: 'Keine Verbindung zum Server.', store_failed: 'Datenbank nicht erreichbar. Bitte in einer Minute erneut versuchen.', store_not_configured: 'Datenbank nicht eingerichtet.',
    mandat_texte_fehlen: 'Mandat anbieten ist gesperrt: Widerrufsbelehrung und Gebührenhinweis fehlen noch (Vorlagen).', keine_email: 'Keine E-Mail-Adresse hinterlegt.',
    az_gericht_fehlt: 'Bitte das Aktenzeichen des Gerichts eingeben.', invalid_fields: 'Bitte Eingaben prüfen.', unknown_placeholders: 'Unbekannte Platzhalter', forbidden: 'Nur für Admins.',
    invalid_type: 'Dateityp nicht erlaubt (JPG, PNG, HEIC, PDF, DOCX).', file_too_large: 'Datei größer als 10 MB.', ki_not_configured: 'KI ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt).', ki_inaktiv: 'KI ist in den Einstellungen ausgeschaltet.',
    invalid_email: 'Ungültige E-Mail-Adresse.', already_sent: 'Diese E-Mail wurde bereits gesendet.', not_found: 'Nicht gefunden – evtl. gelöscht.', empty_text: 'Der Text darf nicht leer sein.'
  };
  var DATEN_LABEL = {
    'situation.mindestens_ein_jahr_getrennt': 'Mindestens ein Jahr getrennt?', 'situation.heiratsdatum': 'Heiratsdatum', 'situation.trennung_beginn': 'Beginn der Trennung', 'situation.bundesland': 'Letztes gemeinsames Bundesland',
    'situation.ehewohnung_plz': 'PLZ letzte Ehewohnung', 'situation.ehewohnung_ort': 'Ort letzte Ehewohnung', 'ehepartner.name': 'Name', 'ehepartner.anschrift': 'Anschrift',
    'kinder.vorhanden': 'Gemeinsame minderjährige Kinder?', 'kinder.anzahl': 'Anzahl', 'kinder.wohnort': 'Leben überwiegend', 'scheidung.einvernehmlich': 'Einvernehmlich?', 'scheidung.vertretung_wagner': 'Vertretung durch Frau Wagner?',
    'ergaenzung.anschrift': 'Anschrift Antragsteller/in', 'ergaenzung.staatsangehoerigkeit': 'Staatsangehörigkeit', 'ergaenzung.ehevertrag': 'Ehevertrag?', 'ergaenzung.nettoeinkommen_antragsteller': 'Nettoeinkommen (eigenes)',
    'ergaenzung.nettoeinkommen_antragsgegner': 'Nettoeinkommen (Partner/in)', 'ergaenzung.kind_1': 'Kind 1', 'ergaenzung.kind_2': 'Kind 2', 'ergaenzung.kind_3': 'Kind 3', 'ergaenzung.kind_4': 'Kind 4',
    c_telefon: 'Telefon'
  };
  var DATEN_GRUPPEN = [['situation', 'Situation'], ['ehepartner', 'Ehepartner/in'], ['kinder', 'Kinder'], ['scheidung', 'Scheidung'], ['ergaenzung', 'Ergänzende Angaben']];

  /* ===================== 2 Helfer ===================== */
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kinder) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    (Array.isArray(kinder) ? kinder : kinder === undefined || kinder === null ? [] : [kinder]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function leeren(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function datum(v, mitZeit) {
    if (!v) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    if (m) return m[3] + '.' + m[2] + '.' + m[1];
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    var s = pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
    return mitZeit ? s + ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : s;
  }
  function relativ(iso) {
    var d = new Date(iso), diff = Date.now() - d.getTime(), min = Math.floor(diff / 6e4);
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var tage = Math.round((heute - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (min < 1) return 'gerade eben';
    if (min < 60) return 'vor ' + min + ' Min.';
    if (tage === 0) return 'Heute ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (tage === 1) return 'Gestern';
    if (tage < 7) return 'vor ' + tage + ' Tagen';
    return datum(iso);
  }
  function eur(n) { return (Math.round(Number(n) * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function eur0(n) { return Math.round(Number(n)).toLocaleString('de-DE') + ' €'; }
  function name(a) { return [a.vorname, a.nachname].filter(Boolean).join(' ') || a.email || a.nummer; }
  function quelleLabel(typ) { var q = QUELLEN.filter(function (x) { return x[0] === typ; })[0]; return q ? q[1] : typ; }
  function statusChip(s) { return h('span', { class: 'chip st-' + s, text: LABEL[s] || s }); }
  function quelleChip(typ) { return h('span', { class: 'chip chip-quelle', text: quelleLabel(typ) }); }
  function kiChip(ampel, titel) { return ampel ? h('span', { class: 'ki ki-' + ampel, title: titel || null }, [h('i'), KI[ampel]]) : h('span', { class: 'ki ki-leer', text: '—' }); }
  function fehlerText(r) { return (r && FEHLER[r.error]) || (r && r.error ? 'Fehler: ' + r.error : 'Unbekannter Fehler.'); }

  /* ===================== 3 API ===================== */
  function api(method, route, query, body, opts) {
    var url = '/api/hq/' + route + (query ? '?' + query : '');
    var init = { method: method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      if (opts && opts.roh) { init.body = body; Object.assign(init.headers, opts.headers || {}); }
      else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    }
    return fetch(url, init).then(function (r) {
      if (opts && opts.blob && r.ok) return r.blob().then(function (b) { return { ok: true, blob: b, headers: r.headers, status: r.status }; });
      return r.json().catch(function () { return { ok: false, error: 'ungueltige_antwort' }; }).then(function (j) {
        j.status = r.status;
        if (r.status === 401 && route !== 'login') sitzungAbgelaufen();
        return j;
      });
    }, function () { return { ok: false, error: 'netz', status: 0 }; });
  }

  /* ===================== 4 Zustand ===================== */
  var S = {
    user: '', admin: false, modul: 'posteingang', ansicht: 'liste', q: '', fStatus: '', fQuelle: '', offset: 0,
    liste: null, laden: false, detail: null, akte: null, antrag: null, reiter: 'uebersicht', entwurf: {}, vorlageWahl: {},
    dirty: null, timer: null, vorlagen: null, vSel: 'A1.1', vEdit: false, einst: null, wiederholen: null
  };
  var main = $('main');

  /* ===================== 5 Toast + Banner ===================== */
  var toastTimer = null;
  function toast(text, art, aktion) {
    var t = $('toast');
    clearTimeout(toastTimer);
    t.className = 'toast sichtbar' + (art === 'warn' ? ' warn' : art === 'fehler' ? ' fehler' : '');
    t.querySelector('.toast-icon').textContent = art === 'fehler' ? '!' : art === 'warn' ? '!' : '✓';
    $('toast-text').textContent = text;
    var btn = $('toast-btn');
    btn.hidden = !aktion;
    btn.onclick = null;
    if (aktion) { btn.textContent = aktion.text; btn.onclick = function () { t.className = 'toast'; aktion.fn(); }; }
    toastTimer = setTimeout(function () { t.className = 'toast' + (art === 'warn' ? ' warn' : art === 'fehler' ? ' fehler' : ''); }, aktion ? 5000 : art === 'fehler' ? 5000 : 2800);
  }
  function banner(text, retry) {
    $('banner').hidden = !text;
    $('banner-text').textContent = text || '';
    S.wiederholen = retry || null;
    main.classList.toggle('gedimmt', !!text);
  }
  $('banner-retry').addEventListener('click', function () { banner(''); if (S.wiederholen) S.wiederholen(); });
  function serverFehler(r, retry) {
    if (r.status === 401) return true;
    if (r.status === 0 || r.status >= 500) { banner(fehlerText(r), retry); return true; }
    return false;
  }

  /* ===================== 6 Modal ===================== */
  var modalOk = null, modalZuvor = null;
  function modalOeffnen(cfg) {
    modalZuvor = document.activeElement;
    $('modal-titel').textContent = cfg.titel;
    $('modal-sub').textContent = cfg.sub || '';
    var inhalt = $('modal-inhalt');
    leeren(inhalt);
    (cfg.inhalt || []).forEach(function (x) { if (x) inhalt.appendChild(x); });
    var ok = $('modal-ok');
    ok.textContent = cfg.okText || 'Jetzt senden';
    ok.className = 'btn ' + (cfg.gefahr ? 'btn-gefahr' : 'btn-primaer');
    ok.disabled = !!cfg.gesperrt;
    ok.hidden = !!cfg.ohneOk;
    modalOk = cfg.onOk;
    $('modal').hidden = false;
    var f = inhalt.querySelector('input, textarea, select');
    (f || ok).focus();
  }
  function modalSchliessen() { $('modal').hidden = true; modalOk = null; if (modalZuvor && modalZuvor.focus) modalZuvor.focus(); }
  $('modal-x').addEventListener('click', modalSchliessen);
  $('modal-abbrechen').addEventListener('click', modalSchliessen);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) modalSchliessen(); });
  $('modal-ok').addEventListener('click', function () {
    if (!modalOk) return;
    var ok = $('modal-ok');
    ok.disabled = true;
    Promise.resolve(modalOk()).then(function (schliessen) { ok.disabled = false; if (schliessen !== false) modalSchliessen(); });
  });
  // Fokus im Dialog halten
  $('modal').addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call($('modal').querySelectorAll('button, input, select, textarea, a[href]'), function (x) { return !x.disabled && !x.hidden && x.offsetParent; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  function mailVorschauBox(v) {
    return [h('p', { class: 'modal-an' }, ['An ' + (v.an || '—') + ' · Betreff: ', h('b', { text: v.betreff })]), h('div', { class: 'mail-text', text: v.text.replace(/\[button:\s*([^|\]]+?)\s*\|[^\]]*\]/g, '[ $1 ]').replace(/\[hinweis:\s*([\s\S]+?)\s*\]/g, '$1').replace(/\{\{(link_\w+)\}\}/g, '(persönlicher Link)').replace(/\[tabelle\]/g, '[Kostentabelle]') })];
  }

  /* ===================== 7 Login (B1) ===================== */
  var loginSchritt = 1, einladungToken = '';
  function loginZeigen(schritt, opts) {
    loginSchritt = schritt || 1;
    opts = opts || {};
    $('boot').hidden = true;
    $('app').hidden = true;
    $('login').hidden = false;
    $('login-schritt1').hidden = loginSchritt !== 1;
    $('login-schritt2').hidden = loginSchritt !== 2;
    $('login-schritt3').hidden = loginSchritt !== 3;
    $('login-zurueck').hidden = loginSchritt !== 2;
    $('login-titel').textContent = { 1: 'Anmelden', 2: 'Zwei-Faktor-Code', 3: 'Passwort festlegen' }[loginSchritt];
    $('login-text').textContent = opts.text || { 1: 'Interner Bereich der Kanzlei Janine D. Wagner. Zugang nur für berechtigte Personen.', 2: 'Bitte geben Sie den sechsstelligen Code aus Ihrer Authenticator-App ein.', 3: '' }[loginSchritt];
    $('login-btn').textContent = { 1: 'Weiter', 2: 'Anmelden', 3: 'Passwort speichern' }[loginSchritt];
    $('login-btn').hidden = !!opts.ohneButton;
    $('login-err').hidden = true;
    $('login-ok').hidden = !opts.ok;
    $('login-ok').textContent = opts.ok || '';
    if (opts.email) $('login-name').value = opts.email;
    (loginSchritt === 1 ? (opts.email ? $('login-pw') : $('login-name')) : loginSchritt === 2 ? $('login-code') : $('einl-pw1')).focus();
  }
  /* Einladungslink #/einladung/<token>: Passwort selbst festlegen */
  function einladungZeigen(token) {
    einladungToken = token;
    history.replaceState(null, '', location.pathname);
    api('GET', 'einladung', 'token=' + encodeURIComponent(token)).then(function (r) {
      if (r.ok) { loginZeigen(3, { text: 'Willkommen' + (r.name ? ', ' + r.name : '') + '! Legen Sie hier Ihr persönliches Passwort für ' + r.email + ' fest.' }); return; }
      loginZeigen(3, { ohneButton: true, text: r.error === 'link_expired' ? 'Dieser Einladungslink ist abgelaufen. Bitte lassen Sie sich von der Kanzlei erneut einladen.' : 'Dieser Einladungslink ist ungültig oder wurde bereits verwendet. Falls Sie Ihr Passwort schon festgelegt haben, melden Sie sich einfach an.' });
      $('login-schritt3').hidden = true;
      $('login-zurueck').hidden = false;
      $('login-neu').textContent = 'Zur Anmeldung';
    });
  }
  function sitzungAbgelaufen() { if (!$('login').hidden) return; loginZeigen(1); $('login-err').hidden = false; $('login-err').textContent = 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.'; }
  $('pw-toggle').addEventListener('click', function () {
    var pw = $('login-pw'), an = pw.type === 'password';
    pw.type = an ? 'text' : 'password';
    this.setAttribute('aria-pressed', String(an));
    this.setAttribute('aria-label', an ? 'Passwort verbergen' : 'Passwort anzeigen');
  });
  $('login-neu').addEventListener('click', function () { $('login-neu').textContent = 'Anderes Konto verwenden'; loginZeigen(1); });
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('login-err'), btn = $('login-btn');
    if (loginSchritt === 3) {
      var p1 = $('einl-pw1').value, p2 = $('einl-pw2').value;
      if (p1.length < 10) { err.hidden = false; err.textContent = 'Das Passwort muss mindestens 10 Zeichen lang sein.'; return; }
      if (p1 !== p2) { err.hidden = false; err.textContent = 'Die beiden Passwörter stimmen nicht überein.'; return; }
      btn.disabled = true;
      api('POST', 'einladung', '', { token: einladungToken, passwort: p1 }).then(function (r) {
        btn.disabled = false;
        if (r.ok) { $('einl-pw1').value = ''; $('einl-pw2').value = ''; loginZeigen(1, { email: r.email, ok: 'Passwort gespeichert. Sie können sich jetzt mit Ihrer E-Mail-Adresse anmelden.' }); return; }
        err.hidden = false;
        err.textContent = { link_expired: 'Der Einladungslink ist abgelaufen. Bitte erneut einladen lassen.', link_invalid: 'Der Einladungslink ist ungültig oder wurde bereits verwendet.', password_too_short: 'Das Passwort muss mindestens 10 Zeichen lang sein.', rate_limited: 'Zu viele Versuche. Bitte kurz warten.' }[r.error] || 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
      });
      return;
    }
    var body = loginSchritt === 1 ? { name: $('login-name').value.trim(), passwort: $('login-pw').value } : { code: $('login-code').value.replace(/\s/g, '') };
    if (loginSchritt === 1 && (!body.name || !body.passwort)) { err.hidden = false; err.textContent = 'Bitte E-Mail bzw. Benutzername und Passwort eingeben.'; return; }
    if (loginSchritt === 2 && !/^\d{6}$/.test(body.code)) { err.hidden = false; err.textContent = 'Bitte den sechsstelligen Code eingeben.'; return; }
    btn.disabled = true;
    api('POST', 'login', '', body).then(function (r) {
      btn.disabled = false;
      if (r.ok && r.schritt === 2) { $('login-pw').value = ''; loginZeigen(2); return; }
      if (r.ok) { $('login-pw').value = ''; $('login-code').value = ''; start(r); return; }
      err.hidden = false;
      err.textContent = { invalid_login: 'E-Mail/Benutzername oder Passwort stimmt nicht.', invalid_code: 'Der Code stimmt nicht. Bitte erneut versuchen.', code_expired: 'Der Anmeldeschritt ist abgelaufen. Bitte erneut mit Passwort anmelden.', locked: 'Zu viele Fehlversuche. Bitte in 10 Minuten erneut versuchen.', hq_not_configured: 'HQ ist nicht eingerichtet (HQ_USERS/HQ_SECRET).' }[r.error] || 'Anmeldung fehlgeschlagen.';
      if (r.error === 'code_expired') setTimeout(function () { loginZeigen(1); }, 1500);
    });
  });
  $('logout').addEventListener('click', function () {
    if (!verlassenOk()) return;
    api('DELETE', 'login').then(function () { S.liste = null; loginZeigen(1); });
  });

  function start(r) {
    S.user = r.user; S.admin = !!r.admin;
    $('user-name').textContent = r.name || r.user;
    $('boot').hidden = true; $('login').hidden = true; $('app').hidden = false;
    route();
  }

  /* ===================== 8 Routing + Dirty-Schutz ===================== */
  function verlassenOk() {
    if (!S.dirty) return true;
    if (window.confirm('Ungespeicherte Änderungen (' + S.dirty + ') verwerfen?')) { S.dirty = null; return true; }
    return false;
  }
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  var letzterHash = location.hash;
  window.addEventListener('hashchange', function () {
    if (S.dirty && !verlassenOk()) { history.replaceState(null, '', letzterHash); return; }
    route();
  });
  function navigiere(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  function route() {
    var einl = /^#\/einladung\/([A-Za-z0-9_-]{40,60})$/.exec(location.hash);
    if (einl) { clearInterval(S.timer); einladungZeigen(einl[1]); return; }
    letzterHash = location.hash;
    var teile = (location.hash || '#/posteingang').replace(/^#\/?/, '').split('/');
    var modul = teile[0] || 'posteingang';
    clearInterval(S.timer);
    banner('');
    if (modul === 'a' && teile[1]) { S.reiter = teile[2] || 'uebersicht'; navAktiv(S.detail && S.detail.akte ? 'akten' : S.modul); detailLaden(teile[1]); return; }
    if (['posteingang', 'akten', 'vorlagen', 'einstellungen'].indexOf(modul) < 0) modul = 'posteingang';
    if (modul !== S.modul && (modul === 'posteingang' || modul === 'akten')) { S.fStatus = ''; S.offset = 0; }
    S.modul = modul;
    navAktiv(modul);
    if (modul === 'vorlagen') vorlagenZeigen();
    else if (modul === 'einstellungen') einstellungenZeigen();
    else { listeZeigen(); S.timer = setInterval(function () { if (!document.hidden && $('modal').hidden) listeLaden(true); }, 60000); }
    main.focus({ preventScroll: true });
  }
  function navAktiv(modul) {
    Array.prototype.forEach.call(document.querySelectorAll('.module a'), function (a) {
      var an = a.getAttribute('data-modul') === modul;
      a.classList.toggle('aktiv', an);
      if (an) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function titelSetzen(neu) {
    document.title = (neu ? '(' + neu + ' neu) ' : '') + 'HQ · Scheidung-Online';
    $('nav-neu').hidden = !neu;
    $('nav-neu').textContent = neu || '';
  }

  /* ===================== 9 B2 Posteingang / Akten ===================== */
  var listeEl = null, ergebnisEl = null, kpiEl = null, spamEl = null;
  function listeZeigen() {
    leeren(main);
    kpiEl = h('div', { class: 'kpis' });
    var such = h('input', { id: 'suche', type: 'search', placeholder: 'Suche: Name, E-Mail, Aktenzeichen', autocomplete: 'off', value: S.q, 'aria-label': 'Suche' });
    var suchTimer = null;
    such.addEventListener('input', function () { clearTimeout(suchTimer); suchTimer = setTimeout(function () { S.q = such.value.trim(); S.offset = 0; listeLaden(); }, 300); });
    var stSel = h('select', { 'aria-label': 'Status', onchange: function () { S.fStatus = stSel.value; S.offset = 0; listeLaden(); } },
      [h('option', { value: '', text: 'Alle Status' }), h('option', { value: 'antraege_pruefen', text: 'Anträge zu prüfen' })].concat(STATUS.map(function (s) { return h('option', { value: s, text: LABEL[s] }); })));
    stSel.value = S.fStatus;
    var qSel = h('select', { 'aria-label': 'Quelle', onchange: function () { S.fQuelle = qSel.value; S.offset = 0; listeLaden(); } },
      [h('option', { value: '', text: 'Alle Quellen' })].concat(QUELLEN.map(function (q) { return h('option', { value: q[0], text: q[1] }); })));
    qSel.value = S.fQuelle;
    var reset = h('button', { type: 'button', class: 'link', text: 'Filter zurücksetzen', onclick: function () { S.q = ''; S.fStatus = ''; S.fQuelle = ''; S.offset = 0; listeZeigen(); } });
    reset.hidden = !(S.q || S.fStatus || S.fQuelle);
    var bListe = h('button', { type: 'button', text: 'Liste', 'aria-pressed': String(S.ansicht === 'liste'), onclick: function () { S.ansicht = 'liste'; listeZeigen(); } });
    var bKanban = h('button', { type: 'button', text: 'Kanban', 'aria-pressed': String(S.ansicht === 'kanban'), onclick: function () { S.ansicht = 'kanban'; listeZeigen(); } });
    ergebnisEl = h('p', { class: 'ergebnis', 'aria-live': 'polite' });
    listeEl = h('div');
    spamEl = h('div');
    main.appendChild(h('section', { 'aria-label': S.modul === 'akten' ? 'Akten' : 'Posteingang' }, [
      h('h1', { class: 'vh', text: S.modul === 'akten' ? 'Akten' : 'Posteingang' }),
      kpiEl,
      h('div', { class: 'filter' }, [such, stSel, qSel, reset, h('div', { class: 'umschalter', role: 'group', 'aria-label': 'Ansicht' }, [bListe, bKanban])]),
      ergebnisEl, listeEl, spamEl
    ]));
    if (S.liste && S.liste.modul === S.modul) listeRendern(); else listeEl.appendChild(skeleton());
    listeLaden();
  }
  function skeleton() { return h('div', { class: 'skeleton', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(function () { return h('div', null, [h('i'), h('i')]); })); }

  var listeAnfrage = 0;
  function listeLaden(still) {
    var nr = ++listeAnfrage;
    var q = 'modul=' + S.modul + '&offset=' + S.offset + (S.fStatus ? '&status=' + encodeURIComponent(S.fStatus) : '') + (S.fQuelle ? '&quelle=' + S.fQuelle : '') + (S.q ? '&q=' + encodeURIComponent(S.q) : '');
    return api('GET', 'anfragen', q).then(function (r) {
      if (nr !== listeAnfrage || !listeEl || !document.body.contains(listeEl)) return;
      if (!r.ok) { if (!serverFehler(r, function () { listeLaden(); })) toast(fehlerText(r), 'fehler'); return; }
      banner('');
      S.liste = r;
      titelSetzen(r.kpi.neu);
      listeRendern();
    });
  }

  function listeRendern() {
    var r = S.liste;
    // Kennzahlen
    leeren(kpiEl);
    [['neu', 'Neue Anfragen', 'kpi-neu', 'Warten auf Prüfung'], ['mandat_angeboten', 'Warten auf Unterschrift', 'kpi-gold', 'Mandat angeboten'], ['unterschrieben', 'Warten auf Fragebogen', 'kpi-gold', 'Mandat unterschrieben'],
      ['antraege_pruefen', 'Anträge zu prüfen', 'kpi-navy', 'Fragebogen vollständig'], ['termin', 'Termine diese Woche', 'kpi-gruen', 'Gerichtstermine']].forEach(function (k) {
      var n = { neu: r.kpi.neu, mandat_angeboten: r.kpi.warten_unterschrift, unterschrieben: r.kpi.warten_fragebogen, antraege_pruefen: r.kpi.antraege_pruefen, termin: r.kpi.termine_woche }[k[0]];
      kpiEl.appendChild(h('button', { type: 'button', class: 'kpi ' + k[2] + (S.fStatus === k[0] ? ' aktiv' : ''), 'aria-pressed': String(S.fStatus === k[0]), onclick: function () {
        S.fStatus = S.fStatus === k[0] ? '' : k[0]; S.offset = 0;
        if (k[0] !== 'neu' && k[0] !== 'mandat_angeboten' && S.modul === 'posteingang' && S.fStatus) { /* Filter gilt auch im Posteingang */ }
        listeZeigen();
      } }, [h('span', { class: 'kpi-label', text: k[1] }), h('span', { class: 'kpi-n', text: String(n || 0) }), h('span', { class: 'kpi-sub', text: k[3] })]));
    });
    var filterAktiv = !!(S.q || S.fStatus || S.fQuelle);
    ergebnisEl.textContent = r.treffer + (r.treffer === 1 ? ' Eintrag' : ' Einträge') + (filterAktiv ? ' für die gewählten Filter' : '') + ' · Stand ' + datum(r.stand, true).split(' · ')[1];
    leeren(listeEl);
    if (!r.anfragen.length) {
      listeEl.appendChild(h('div', { class: 'leer' }, [h('p', { text: filterAktiv ? 'Keine Treffer für diese Filter.' : S.modul === 'akten' ? 'Noch keine Akten – Akten entstehen, sobald ein Mandat unterschrieben ist.' : 'Noch keine Anfragen eingegangen. Neue Anfragen von der Website erscheinen hier automatisch.' }),
        filterAktiv ? h('button', { type: 'button', class: 'btn btn-zweit btn-klein', text: 'Filter zurücksetzen', onclick: function () { S.q = ''; S.fStatus = ''; S.fQuelle = ''; listeZeigen(); } }) : null]));
    } else if (S.ansicht === 'kanban') {
      listeEl.appendChild(kanban(r.anfragen));
    } else {
      listeEl.appendChild(h('div', { class: 'liste', role: 'list' }, [
        h('div', { class: 'liste-kopf', 'aria-hidden': 'true' }, [h('span', { text: 'Name' }), h('span', { text: 'Eingang' }), h('span', { class: 'spalte-quelle', text: 'Quelle' }), h('span', { text: 'KI-Einordnung' }), h('span', { text: 'Status' }), h('span', { text: 'Nächste Aktion' }), h('span')])
      ].concat(r.anfragen.map(function (a) {
        return h('button', { type: 'button', class: 'liste-zeile', role: 'listitem', 'data-id': a.id, onclick: function () { navigiere('#/a/' + a.id); } }, [
          h('span', { class: 'zelle-name' }, [h('span', { class: 'name', text: name(a) }), h('span', { class: 'sub', text: (a.az_kanzlei ? a.az_kanzlei + ' · ' : a.nummer + ' · ') + (a.email || '') })]),
          h('span', { class: 'eingang', title: datum(a.created_at, true), text: relativ(a.created_at) }),
          h('span', { class: 'spalte-quelle' }, quelleChip(a.typ)),
          h('span', null, kiChip(a.ki_ampel, a.ki_zusammenfassung)),
          h('span', null, statusChip(a.status)),
          h('span', { class: 'aktion' + (a.status === 'neu' ? ' fett' : ''), text: a.naechste_aktion }),
          h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })
        ]);
      }))));
      if (r.treffer > r.offset + r.anfragen.length || r.offset > 0) {
        listeEl.appendChild(h('div', { class: 'mehr' }, [
          r.offset > 0 ? h('button', { type: 'button', class: 'btn btn-zweit btn-klein', text: '← Vorherige', onclick: function () { S.offset = Math.max(0, r.offset - r.limit); listeLaden(); } }) : null, ' ',
          r.treffer > r.offset + r.anfragen.length ? h('button', { type: 'button', class: 'btn btn-zweit btn-klein', text: 'Weitere →', onclick: function () { S.offset = r.offset + r.limit; listeLaden(); } }) : null
        ]));
      }
    }
    // Spam
    leeren(spamEl);
    if (S.modul === 'posteingang') {
      spamEl.appendChild(h('details', { class: 'spam' }, [h('summary', { text: 'Spam-Verdacht (' + r.spam.length + ')' }), r.spam.length ? h('ul', null, r.spam.map(function (s) {
        return h('li', null, [h('span', null, [h('b', { text: s.name }), h('small', { text: (s.grund || 'ohne Angabe') + ' · ' + datum(s.created_at) })]), h('span', { class: 'btns' }, [
          h('button', { type: 'button', class: 'btn btn-zweit btn-klein', text: 'Kein Spam', onclick: function () { api('POST', 'aktion', 'id=' + s.id, { art: 'kein_spam' }).then(function (x) { if (x.ok) { toast('Zurück im Posteingang.'); listeLaden(); } else toast(fehlerText(x), 'fehler'); }); } }),
          h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Löschen', onclick: function () { loeschenDialog({ id: s.id, nummer: s.nummer }, 'Spam'); } })
        ])]);
      })) : h('p', { class: 'muted small', text: 'Kein Spam-Verdacht.' })]));
    }
  }

  function kanban(liste) {
    var spalten = (S.modul === 'akten' ? ['unterschrieben', 'fragebogen_vollstaendig', 'antrag_vorbereitung', 'eingereicht', 'termin', 'abgeschlossen', 'widerrufen'] : STATUS);
    return h('div', { class: 'kanban' }, spalten.map(function (s) {
      var karten = liste.filter(function (a) { return a.status === s; });
      if (!karten.length && ['abgesagt', 'widerrufen', 'abgeschlossen'].indexOf(s) >= 0) return null;
      return h('div', { class: 'spalte' }, [h('div', { class: 'spalte-kopf' }, [h('span', { text: LABEL[s] }), h('span', { text: String(karten.length) })]),
        h('div', { class: 'spalte-karten' }, karten.map(function (a) {
          return h('button', { type: 'button', class: 'kkarte', onclick: function () { navigiere('#/a/' + a.id); } }, [
            h('span', { class: 'kkarte-kopf' }, [h('span', { text: name(a) }), a.ki_ampel ? h('i', { class: 'ki-punkt ki-' + a.ki_ampel, title: KI[a.ki_ampel] }) : null]),
            h('small', { text: quelleLabel(a.typ) + ' · ' + relativ(a.created_at) }), h('em', { text: a.naechste_aktion })
          ]);
        }))]);
    }));
  }

  /* Tastatur: / Suche · ↑/↓ Liste · Esc Modal */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('modal').hidden) { modalSchliessen(); return; }
    var tag = (e.target.tagName || '').toLowerCase();
    var tippt = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if (e.key === '/' && !tippt && $('suche')) { e.preventDefault(); $('suche').focus(); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !tippt) {
      var zeilen = Array.prototype.slice.call(document.querySelectorAll('.liste-zeile, .kkarte'));
      if (!zeilen.length) return;
      var i = zeilen.indexOf(document.activeElement);
      e.preventDefault();
      i = e.key === 'ArrowDown' ? Math.min(zeilen.length - 1, i + 1) : Math.max(0, i - 1);
      zeilen[i].focus();
    }
  });

  /* ===================== 10 Detail laden ===================== */
  function detailLaden(id) {
    if (!S.detail || S.detail.anfrage.id !== id) { leeren(main); main.appendChild(skeleton()); }
    return api('GET', 'anfragen', 'id=' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) {
        if (serverFehler(r, function () { detailLaden(id); })) return;
        leeren(main);
        main.appendChild(h('div', { class: 'leer' }, [h('p', { text: fehlerText(r) }), h('a', { class: 'btn btn-zweit btn-klein', href: '#/posteingang', text: 'Zum Posteingang' })]));
        return;
      }
      S.detail = r;
      navAktiv(r.akte ? 'akten' : 'posteingang');
      if (r.akte) return akteLaden(id);
      S.akte = null;
      anfrageZeigen();
    });
  }

  /* ===================== 11 B3 Anfrage-Detail ===================== */
  function anfrageZeigen() {
    var d = S.detail, a = d.anfrage;
    leeren(main);
    if (!own(S.vorlageWahl, a.id)) S.vorlageWahl[a.id] = a.ki && a.ki.vorschlag === 'absage' ? 'absage' : a.ki && a.ki.vorschlag === 'erstgespraech' ? 'erstgespraech' : 'mandat';
    if (!own(S.entwurf, a.id)) S.entwurf[a.id] = ENTWURF[S.vorlageWahl[a.id]];
    var gesperrt = !d.mandat_freigabe.frei;
    var aktionen = h('div', { class: 'aktionen' }, [
      h('button', { type: 'button', class: 'btn btn-primaer', text: 'Mandat anbieten', onclick: function () { aktionDialog('mandat_anbieten'); } }),
      h('button', { type: 'button', class: 'btn btn-zweit', text: 'Erstgespräch vorschlagen', onclick: function () { aktionDialog('erstgespraech'); } }),
      h('button', { type: 'button', class: 'btn btn-zweit', text: 'Kostenübersicht senden', onclick: function () { aktionDialog('kosten'); } }),
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Absagen', onclick: function () { aktionDialog('absage'); } }),
      a.spam ? h('button', { type: 'button', class: 'btn btn-ghost', text: 'Kein Spam', onclick: function () { spamSetzen(false); } })
        : h('button', { type: 'button', class: 'btn btn-ghost', text: 'Als Spam markieren', onclick: function () { aktionDialog('spam'); } })
    ]);
    var nachricht = (a.daten && (a.daten.nachricht || a.daten.c_nachricht)) || '';
    var notizen = h('textarea', { rows: '4', 'aria-label': 'Interne Notizen', placeholder: 'Interne Notizen, Telefonate, Rückfragen …', value: a.notizen || '' });
    var notizOk = h('span', { class: 'ok-text', 'aria-live': 'polite' });
    notizen.addEventListener('input', function () { S.dirty = notizen.value !== (a.notizen || '') ? 'Notizen' : null; notizOk.textContent = ''; });
    var wahl = h('select', { 'aria-label': 'Vorlage für den Antwortentwurf' }, [['mandat', 'Vorlage: Mandat anbieten'], ['erstgespraech', 'Vorlage: Erstgespräch vorschlagen'], ['kosten', 'Vorlage: Kostenübersicht'], ['absage', 'Vorlage: Absage'], ['frei', 'Freier Text']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    wahl.value = S.vorlageWahl[a.id];
    var entwurf = h('textarea', { rows: '9', 'aria-label': 'Antwortentwurf', value: S.entwurf[a.id] });
    wahl.addEventListener('change', function () { S.vorlageWahl[a.id] = wahl.value; S.entwurf[a.id] = ENTWURF[wahl.value]; entwurf.value = S.entwurf[a.id]; });
    entwurf.addEventListener('input', function () { S.entwurf[a.id] = entwurf.value; });

    main.appendChild(h('section', { 'aria-label': 'Anfrage ' + a.nummer }, [
      h('button', { type: 'button', class: 'zurueck', text: '← Posteingang', onclick: function () { navigiere('#/posteingang'); } }),
      h('header', { class: 'detail-kopf' }, [
        h('div', null, [h('div', { class: 'nummer', text: a.nummer }), h('h2', { text: name(a) }), h('div', { class: 'meta' }, [quelleChip(a.typ), statusChip(a.status), a.spam ? h('span', { class: 'chip st-widerrufen', text: 'Spam' }) : null, h('span', { text: 'Eingang ' + datum(a.created_at, true) }),
          a.email ? h('span', null, ['· ', h('a', { href: 'mailto:' + a.email, text: a.email })]) : null, a.telefon ? h('span', null, ['· ', h('a', { href: 'tel:' + a.telefon.replace(/[^\d+]/g, ''), text: a.telefon })]) : null])]),
        aktionen
      ]),
      gesperrt ? h('div', { class: 'hinweis' }, ['Mandat anbieten ist erst möglich, wenn die Texte „' + d.mandat_freigabe.fehlend.join('“ und „') + '“ gepflegt sind. ', h('a', { href: '#/vorlagen', text: 'Zu den Vorlagen' })]) : null,
      h('div', { class: 'zwei-spalten' }, [
        h('div', null, [
          nachricht ? h('section', { class: 'karte gold' }, [h('h3', { text: 'Nachricht der Person' }), h('p', { class: 'nachricht', text: nachricht })]) : null,
          h('section', { class: 'karte' }, [h('h3', { text: a.typ === 'antrag' ? 'Angaben aus dem Online-Antrag' : 'Angaben' }), angabenListe(a)]),
          h('section', { class: 'karte' }, [h('h3', { text: 'Interne Notizen' }), notizen, h('div', { class: 'zeile' }, [h('button', { type: 'button', class: 'btn btn-primaer btn-klein', text: 'Notizen speichern', onclick: function (e) {
            var b = e.currentTarget; b.disabled = true;
            api('PATCH', 'anfragen', 'id=' + a.id, { notizen: notizen.value }).then(function (r) {
              b.disabled = false;
              if (r.ok) { a.notizen = r.anfrage.notizen; S.dirty = null; notizOk.textContent = 'Gespeichert ' + pad2(new Date().getHours()) + ':' + pad2(new Date().getMinutes()); }
              else toast(fehlerText(r), 'fehler');
            });
          } }), notizOk])])
        ]),
        h('div', null, [
          kiKarte(a),
          h('section', { class: 'karte' }, [h('div', { class: 'karten-kopf' }, [h('h3', { text: 'Antwortentwurf' }), wahl]), entwurf, h('p', { class: 'muted small', text: 'Der Entwurf wird beim Senden der jeweiligen Aktion als persönlicher Text übernommen.' })]),
          h('section', { class: 'karte' }, [h('h3', { text: 'Verlauf' }), verlaufListe(d.verlauf), h('p', { class: 'small' }, h('button', { type: 'button', class: 'link rot', text: 'Anfrage endgültig löschen …', onclick: function () { loeschenDialog(a); } }))])
        ])
      ])
    ]));
  }

  function angabenListe(a) {
    var d = a.daten || {}, zeilen = [];
    if (a.typ === 'kostenrahmen') { zeilen.push(h('dt', { text: 'Telefon' }), h('dd', { text: d.c_telefon || '—' })); }
    DATEN_GRUPPEN.forEach(function (g) {
      var o = d[g[0]];
      if (!o || typeof o !== 'object') return;
      var keys = Object.keys(o).filter(function (k) { return o[k] !== '' && o[k] !== null && o[k] !== undefined; });
      if (!keys.length) return;
      zeilen.push(h('div', { class: 'gruppe', text: g[1] }));
      keys.forEach(function (k) {
        var v = o[k];
        if (/datum|beginn/.test(k)) v = datum(v);
        zeilen.push(h('dt', { text: DATEN_LABEL[g[0] + '.' + k] || k }), h('dd', { text: String(v) }));
      });
    });
    if (!zeilen.length) return h('p', { class: 'muted', text: 'Keine weiteren Formularangaben — Kontakt und Nachricht stehen oben.' });
    return h('dl', { class: 'dl' }, zeilen);
  }

  function kiKarte(a) {
    var k = a.ki;
    var neu = h('button', { type: 'button', class: 'link', text: k ? 'Neu einordnen' : 'KI-Einordnung starten', onclick: function () {
      neu.disabled = true; neu.textContent = 'Wird eingeordnet …';
      api('POST', 'ki', 'id=' + a.id).then(function (r) {
        neu.disabled = false;
        if (r.ok) { toast('KI-Einordnung aktualisiert.'); detailLaden(a.id); }
        else { toast(fehlerText(r), 'fehler'); neu.textContent = k ? 'Neu einordnen' : 'KI-Einordnung starten'; }
      });
    } });
    if (!k) return h('section', { class: 'karte' }, [h('div', { class: 'karten-kopf' }, [h('h3', { text: 'KI-Einordnung' }), neu]), h('p', { class: 'muted', text: 'Noch keine Einordnung vorhanden.' })]);
    return h('section', { class: 'karte' }, [
      h('div', { class: 'karten-kopf' }, [h('h3', { text: 'KI-Einordnung' }), h('span', { class: 'ki-gross ki-' + k.ampel }, [h('i', { class: 'ki-punkt ki-' + k.ampel }), KI[k.ampel]])]),
      h('p', { class: 'ki-text', text: k.zusammenfassung }),
      k.begruendung ? h('p', { class: 'small muted' }, [h('b', { text: 'Begründung: ' }), k.begruendung]) : null,
      k.punkte && k.punkte.length ? h('ul', { class: 'ki-liste' }, k.punkte.map(function (p) { return h('li', { text: p }); })) : null,
      h('p', { class: 'ki-fuss' }, [h('span', { class: 'info-i', 'aria-hidden': 'true', text: 'i' }), 'KI-Vorschlag, bitte prüfen.' + (k.pseudonymisiert !== false ? ' Es wurden nur pseudonymisierte Daten verarbeitet.' : '') + ' · ', neu])
    ]);
  }

  function verlaufListe(v) {
    if (!v || !v.length) return h('p', { class: 'muted', text: 'Noch keine Einträge.' });
    return h('ol', { class: 'verlauf' }, v.slice(0, 60).map(function (e) {
      var d = e.details || {}, t = EREIGNIS[e.art] || e.art;
      if (e.art === 'status') t = 'Status: ' + (LABEL[d.von] || d.von || '–') + ' → ' + (LABEL[d.nach] || d.nach);
      else if (/^mail_/.test(e.art)) t += ': ' + (d.betreff || d.vorlage || '') + (d.fehler ? ' (' + d.fehler + ')' : '');
      else if (e.art === 'ki') t += ': ' + (KI[d.ampel] || '');
      else if (e.art === 'termin') t += ': ' + datum(d.datum) + ' ' + (d.uhrzeit || '');
      else if (e.art === 'akte' && d.feld) t = { az_kanzlei: 'Aktenzeichen Kanzlei', az_gericht: 'Aktenzeichen Gericht', gericht: 'Gericht' }[d.feld] + ': ' + (d.nach || '—');
      else if (e.art === 'dokument_hochgeladen' || e.art === 'dokument_geloescht') t += ': ' + (d.name || '');
      else if (e.art === 'notiz' && d.text) t = d.text;
      return h('li', null, [h('time', { datetime: e.zeit, text: datum(e.zeit, true) }), h('span', null, [t, ' ', h('span', { class: 'wer', text: '· ' + (e.benutzer || 'system') })])]);
    }));
  }

  /* Aktion mit E-Mail-Vorschau (B3/B4) */
  var AKTION_CFG = {
    mandat_anbieten: { titel: 'Mandat anbieten', vorlage: 'A1.2', ok: 'Jetzt senden', sub: 'Status wird „Mandat angeboten“. Der persönliche Link ist 14 Tage gültig.' },
    erstgespraech: { titel: 'Erstgespräch vorschlagen', vorlage: 'A1.3', ok: 'Jetzt senden', sub: 'Status wird „Erstgespräch“.' },
    kosten: { titel: 'Kostenübersicht senden', vorlage: 'A1.5', ok: 'Jetzt senden', sub: 'Kein Statuswechsel. Werte aus Reiter „Gegenstandswert & Kosten“.' },
    absage: { titel: 'Anfrage absagen', vorlage: 'A1.abs', ok: 'Absage senden', gefahr: true, sub: 'Status wird „Abgesagt“.' },
    abgeschlossen: { titel: 'Scheidung rechtskräftig', vorlage: 'A1.9', ok: 'Abschließen und senden', sub: 'Status wird „Abgeschlossen“.' }
  };
  function aktionDialog(art) {
    var a = (S.akte || S.detail).anfrage;
    if (art === 'spam') {
      var grund = h('input', { placeholder: 'z. B. Werbung, kein Bezug zum Familienrecht', maxlength: '200' });
      modalOeffnen({ titel: 'Als Spam markieren', sub: name(a) + ' · ' + a.nummer, inhalt: [h('label', null, ['Grund (optional)', grund])], okText: 'Als Spam markieren', gefahr: true, onOk: function () {
        return api('POST', 'aktion', 'id=' + a.id, { art: 'spam', text: grund.value }).then(function (r) {
          if (!r.ok) { toast(fehlerText(r), 'fehler'); return false; }
          toast('Als Spam markiert.', 'ok', { text: 'Rückgängig', fn: function () { spamSetzen(false, a.id); } });
          navigiere('#/posteingang');
        });
      } });
      return;
    }
    if (art === 'mandat_anbieten' && S.detail && !S.detail.mandat_freigabe.frei) { toast(FEHLER.mandat_texte_fehlen, 'fehler'); return; }
    var cfg = AKTION_CFG[art];
    var text = S.entwurf[a.id] != null ? S.entwurf[a.id] : '';
    if (art === 'kosten' && S.vorlageWahl[a.id] !== 'kosten' && S.akte) text = ENTWURF.kosten;
    if (art === 'abgeschlossen') text = '';
    var box = h('div', null, h('p', { class: 'muted', text: 'Vorschau wird geladen …' }));
    modalOeffnen({ titel: cfg.titel, sub: cfg.sub, inhalt: [box], okText: cfg.ok, gefahr: cfg.gefahr, gesperrt: true, onOk: function () {
      return api('POST', 'aktion', 'id=' + a.id, { art: art, text: text }).then(function (r) {
        if (!r.ok) { toast(fehlerText(r), 'fehler'); return false; }
        var m = r.mail;
        if (m && m.status === 'fehler') toast('Status gesetzt, aber E-Mail fehlgeschlagen (' + (m.fehler || 'unbekannt') + '). Siehe Kommunikation.', 'warn');
        else if (m && m.status === 'geplant') toast('Status gesetzt. E-Mail liegt als Entwurf in „Kommunikation“.', 'warn');
        else toast(cfg.titel + ': E-Mail gesendet.');
        delete S.entwurf[a.id];
        detailLaden(a.id);
      });
    } });
    api('POST', 'mails', 'id=' + a.id, { vorlage: cfg.vorlage, persoenlicher_text: text, vorschau: true }).then(function (r) {
      leeren(box);
      if (!r.ok) { box.appendChild(h('p', { class: 'fehler-text', text: fehlerText(r) })); return; }
      mailVorschauBox(r.vorschau).forEach(function (x) { box.appendChild(x); });
      if (!r.vorschau.an) box.appendChild(h('div', { class: 'hinweis-rot', text: 'Keine E-Mail-Adresse hinterlegt.' }));
      $('modal-ok').disabled = !r.vorschau.an;
    });
  }
  function spamSetzen(spam, id) {
    var aid = id || (S.akte || S.detail).anfrage.id;
    api('POST', 'aktion', 'id=' + aid, { art: spam ? 'spam' : 'kein_spam' }).then(function (r) {
      if (r.ok) { toast(spam ? 'Als Spam markiert.' : 'Spam-Markierung aufgehoben.'); if (location.hash.indexOf(aid) >= 0) detailLaden(aid); else if (S.liste) listeLaden(); }
      else toast(fehlerText(r), 'fehler');
    });
  }
  function loeschenDialog(a, art) {
    var grund = h('input', { placeholder: 'z. B. Löschwunsch, Spam, Testeintrag', maxlength: '300' });
    modalOeffnen({ titel: 'Endgültig löschen?', sub: (art || 'Anfrage') + ' ' + (a.nummer || '') + ' mit allen Dokumenten, E-Mails und Links. Das kann nicht rückgängig gemacht werden.', inhalt: [h('label', null, ['Grund (für den Löschnachweis, ohne Personendaten)', grund])], okText: 'Endgültig löschen', gefahr: true, onOk: function () {
      return api('DELETE', 'anfragen', 'id=' + a.id, { grund: grund.value }).then(function (r) {
        if (!r.ok) { toast(fehlerText(r), 'fehler'); return false; }
        toast('Gelöscht. Löschnachweis gespeichert.');
        S.detail = null; S.akte = null;
        if (location.hash.indexOf(a.id) >= 0) navigiere('#/posteingang'); else listeLaden();
      });
    } });
  }

  /* ===================== 12 B4 Akte ===================== */
  function akteLaden(id) {
    return Promise.all([api('GET', 'akte', 'id=' + id), api('GET', 'antrag', 'id=' + id)]).then(function (rs) {
      var r = rs[0];
      if (!r.ok) { if (!serverFehler(r, function () { akteLaden(id); })) toast(fehlerText(r), 'fehler'); return; }
      S.akte = r;
      S.antrag = rs[1].ok ? rs[1] : null;
      akteZeigen();
    });
  }
  function akteZeigen() {
    var k = S.akte, a = k.anfrage, sache = [k.angaben.as_nachname || a.nachname, k.angaben.ag_nachname].filter(Boolean).join(' ./. ');
    var fehltN = S.antrag ? S.antrag.warnungen.filter(function (w) { return w.art === 'fehlt'; }).length : 0;
    if (!REITER.some(function (r) { return r[0] === S.reiter; })) S.reiter = 'uebersicht';
    var y = window.pageYOffset;
    leeren(main);
    var inhalt = h('div', { role: 'tabpanel', id: 'reiter-inhalt', 'aria-labelledby': 'tab-' + S.reiter });
    main.appendChild(h('section', { 'aria-label': 'Akte ' + (a.az_kanzlei || a.nummer) }, [
      h('button', { type: 'button', class: 'zurueck', text: '← Akten', onclick: function () { navigiere('#/akten'); } }),
      h('header', { class: 'detail-kopf' }, [
        h('div', null, [h('div', { class: 'nummer', text: 'AKTE ' + (a.az_kanzlei || a.nummer) }), h('h2', { text: sache || name(a) }), h('div', { class: 'meta' }, [statusChip(a.status), h('span', { text: name(a) + (a.email ? ' · ' + a.email : '') }), a.telefon ? h('span', { text: '· ' + a.telefon }) : null,
          k.widerruf_laeuft ? h('span', { class: 'widerruf-badge', text: 'Widerrufsfrist läuft bis ' + datum(a.widerruf_bis) }) : null])]),
        h('div', { class: 'aktionen' }, [a.email ? h('a', { class: 'btn btn-zweit btn-klein', href: 'mailto:' + a.email, text: 'E-Mail' }) : null,
          h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Aktenzeichen kopieren', onclick: function () {
            var t = a.az_kanzlei || a.nummer;
            (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Aktenzeichen ' + t + ' kopiert.'); }, function () { toast('Kopieren nicht möglich: ' + t, 'warn'); });
          } })])
      ]),
      h('div', { class: 'reiter', role: 'tablist' }, REITER.map(function (r) {
        return h('a', { href: '#/a/' + a.id + '/' + r[0], role: 'tab', id: 'tab-' + r[0], 'aria-selected': String(S.reiter === r[0]), 'aria-controls': 'reiter-inhalt' }, [r[1], r[0] === 'antrag' && fehltN ? h('span', { class: 'badge-warn', text: String(fehltN) }) : null]);
      })),
      inhalt
    ]));
    ({ uebersicht: reiterUebersicht, angaben: reiterAngaben, dokumente: reiterDokumente, kosten: reiterKosten, antrag: reiterAntrag, termine: reiterTermine, kommunikation: reiterKommunikation })[S.reiter](inhalt);
    if (y) window.scrollTo(0, y);
  }

  /* B4-1 Übersicht */
  function reiterUebersicht(box) {
    var k = S.akte, a = k.anfrage;
    var idx = KETTE.indexOf(a.status);
    var azK = h('input', { value: a.az_kanzlei || '', maxlength: '60' });
    var azG = h('input', { value: a.az_gericht || '', placeholder: 'z. B. 612 F 1234/26', maxlength: '60' });
    var ger = h('input', { value: a.gericht || '', placeholder: k.gericht_vorschlag ? 'Vorschlag: ' + k.gericht_vorschlag : 'z. B. Amtsgericht Hannover', maxlength: '120' });
    function speichern(feld, el) {
      el.addEventListener('change', function () {
        var body = {}; body[feld] = el.value.trim();
        api('PATCH', 'anfragen', 'id=' + a.id, body).then(function (r) { if (r.ok) { a[feld] = r.anfrage[feld]; toast('Gespeichert.'); } else toast(fehlerText(r), 'fehler'); });
      });
    }
    speichern('az_kanzlei', azK); speichern('az_gericht', azG); speichern('gericht', ger);
    var weitere = [];
    if (['termin', 'eingereicht'].indexOf(a.status) >= 0) weitere.push(h('button', { type: 'button', class: 'btn btn-primaer btn-klein', text: 'Scheidung rechtskräftig – abschließen …', onclick: function () { aktionDialog('abgeschlossen'); } }));
    if (a.status !== 'widerrufen' && a.status !== 'abgeschlossen') weitere.push(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Mandat widerrufen …', onclick: function () {
      modalOeffnen({ titel: 'Mandat als widerrufen markieren?', sub: 'Status wird „Widerrufen“. Es wird keine E-Mail gesendet.', okText: 'Als widerrufen markieren', gefahr: true, onOk: function () {
        var vorher = a.status;
        return api('POST', 'aktion', 'id=' + a.id, { art: 'widerrufen' }).then(function (r) {
          if (!r.ok) { toast(fehlerText(r), 'fehler'); return false; }
          toast('Status: Widerrufen.', 'ok', { text: 'Rückgängig', fn: function () { api('PATCH', 'anfragen', 'id=' + a.id, { status: vorher }).then(function () { detailLaden(a.id); }); } });
          detailLaden(a.id);
        });
      } });
    } }));
    box.appendChild(h('section', { class: 'karte' }, [h('h3', { text: 'Status' }), h('ol', { class: 'kette' }, KETTE.map(function (s, i) {
      var cls = a.status === 'abgeschlossen' || (idx >= 0 && i < idx) ? 'erledigt' : i === idx ? 'aktuell' : '';
      return h('li', { class: cls, 'aria-current': i === idx ? 'step' : null }, [h('span', { class: 'balken', 'aria-hidden': 'true' }), h('span', { text: KETTE_KURZ[i] })]);
    })), a.status === 'widerrufen' ? h('p', { class: 'hinweis-rot', text: 'Das Mandat wurde widerrufen.' }) : null]));
    box.appendChild(h('div', { class: 'zwei-spalten' }, [
      h('section', { class: 'karte' }, [h('h3', { text: 'Checkliste' }), h('ul', { class: 'checkliste' }, k.checkliste.map(function (c) {
        return h('li', { class: c.ok ? 'ok' : 'offen' }, [h('span', { class: 'icon', 'aria-hidden': 'true', text: c.ok ? '✓' : '–' }), h('span', { text: c.label }), h('small', { text: c.entfaellt ? 'entfällt' : c.ok ? 'vorhanden' : 'offen' })]);
      }))]),
      h('section', { class: 'karte' }, [h('h3', { text: 'Aktenzeichen' }), h('div', { class: 'feld-raster' }, [h('label', null, ['Kanzlei', azK]), h('label', null, ['Gericht', azG]), h('label', { class: 'voll' }, ['Zuständiges Familiengericht', ger])]),
        h('dl', { class: 'dl' }, [h('dt', { text: 'Mandat unterschrieben' }), h('dd', { text: a.unterschrieben_am ? datum(a.unterschrieben_am, true) + (k.mandat && k.mandat.ort ? ' in ' + k.mandat.ort : '') : '—' }),
          h('dt', { text: 'Widerrufsfrist' }), h('dd', { text: a.widerruf_bis ? (k.widerruf_laeuft ? 'läuft bis ' : 'abgelaufen am ') + datum(a.widerruf_bis) + (k.mandat && k.mandat.sofort_taetig ? ' · Tätigwerden vorab gewünscht' : '') : '—' }),
          h('dt', { text: 'Gericht' }), h('dd', { text: a.gericht || (k.gericht_vorschlag ? k.gericht_vorschlag + ' (Vorschlag)' : '—') }),
          h('dt', { text: 'Nächster Schritt' }), h('dd', null, h('b', { text: a.naechste_aktion }))]),
        weitere.length ? h('div', { class: 'zeile' }, weitere) : null])
    ]));
    box.appendChild(h('div', { class: 'zwei-spalten' }, [
      h('section', { class: 'karte' }, [h('h3', { text: 'Interne Notizen' }), notizFeld(a)]),
      h('section', { class: 'karte' }, [h('h3', { text: 'Verlauf' }), verlaufListe(k.verlauf), h('p', { class: 'small' }, h('button', { type: 'button', class: 'link rot', text: 'Akte endgültig löschen …', onclick: function () { loeschenDialog(a, 'Akte'); } }))])
    ]));
  }
  function notizFeld(a) {
    var t = h('textarea', { rows: '4', 'aria-label': 'Interne Notizen', value: a.notizen || '' });
    var ok = h('span', { class: 'ok-text' });
    t.addEventListener('input', function () { S.dirty = t.value !== (a.notizen || '') ? 'Notizen' : null; ok.textContent = ''; });
    return h('div', null, [t, h('div', { class: 'zeile' }, [h('button', { type: 'button', class: 'btn btn-primaer btn-klein', text: 'Notizen speichern', onclick: function () {
      api('PATCH', 'anfragen', 'id=' + a.id, { notizen: t.value }).then(function (r) { if (r.ok) { a.notizen = r.anfrage.notizen; S.dirty = null; ok.textContent = 'Gespeichert'; } else toast(fehlerText(r), 'fehler'); });
    } }), ok])]);
  }

  /* B4-2 Angaben (Kanzlei-Änderungen) */
  function reiterAngaben(box) {
    var k = S.akte, a = k.anfrage;
    var aend = (k.fragebogen && k.fragebogen.kanzlei_aenderungen) || {};
    var felder = {};
    k.felder.forEach(function (f) { felder[f.key] = f; });
    var werte = JSON.parse(JSON.stringify(k.angaben));
    if (!Array.isArray(werte.kinder)) werte.kinder = [];
    if (!Array.isArray(werte.anrechte)) werte.anrechte = [];
    var geaendert = {};
    var saveBtn = h('button', { type: 'button', class: 'btn btn-primaer btn-klein', text: 'Änderungen speichern', disabled: true });
    var ok = h('span', { class: 'ok-text', 'aria-live': 'polite' });
    function markiere(key) { geaendert[key] = true; saveBtn.disabled = false; S.dirty = 'Angaben'; ok.textContent = ''; }
    var raster = h('div', { class: 'angaben' });
    k.gruppen.forEach(function (g) {
      raster.appendChild(h('div', { class: 'gruppe', text: g[0] }));
      g[1].forEach(function (key) {
        var f = felder[key]; if (!f) return;
        var id = 'fb-' + key, el;
        var kopf = h('span', null, [f.label, aend[key] ? h('span', { class: 'badge-geaendert', title: 'vorher: ' + (aend[key].alt === '' ? '(leer)' : String(aend[key].alt)) + ' · ' + aend[key].benutzer + ', ' + datum(aend[key].zeit, true), text: 'geändert' }) : null]);
        if (f.typ === 'check') {
          el = h('input', { type: 'checkbox', id: id, checked: werte[key] === true });
          el.addEventListener('change', function () { werte[key] = el.checked; markiere(key); });
          raster.appendChild(h('div', { class: 'feld check-feld' + (aend[key] ? ' geaendert' : '') }, h('label', { for: id }, [el, kopf])));
          return;
        }
        if (f.typ === 'wahl') el = h('select', { id: id }, [h('option', { value: '', text: '—' })].concat(f.optionen.map(function (o) { return h('option', { value: o, text: o }); })));
        else el = h('input', { id: id, type: f.typ === 'date' ? 'date' : 'text', placeholder: '—' });
        el.value = werte[key] == null ? '' : werte[key];
        el.addEventListener(f.typ === 'wahl' ? 'change' : 'input', function () { werte[key] = el.value.trim(); markiere(key); });
        raster.appendChild(h('div', { class: 'feld' + (aend[key] ? ' geaendert' : '') }, [h('label', { for: id }, kopf), el]));
      });
      if (g[0] === 'Kinder') raster.appendChild(unterliste('Kinder', werte.kinder, [['vorname', 'Vorname'], ['nachname', 'Nachname'], ['geburtsdatum', 'Geburtsdatum', 'date']], function () { return { vorname: '', nachname: werte.as_nachname || '', geburtsdatum: '' }; }, function () { markiere('kinder'); }, aend.kinder));
      if (g[0] === 'Einkommen & Altersvorsorge') raster.appendChild(unterliste('Rentenanrechte', werte.anrechte, [['art', 'Art', 'anrecht'], ['traeger', 'Träger'], ['nummer', 'Nummer'], ['inhaber', 'Inhaber', 'inhaber']], function () { return { art: 'gesetzlich', traeger: 'Deutsche Rentenversicherung', nummer: '', inhaber: 'ich' }; }, function () { markiere('anrechte'); }, aend.anrechte));
    });
    saveBtn.addEventListener('click', function () {
      var daten = {};
      Object.keys(geaendert).forEach(function (key) { daten[key] = werte[key]; });
      saveBtn.disabled = true;
      api('PATCH', 'fragebogen', 'id=' + a.id, { daten: daten }).then(function (r) {
        if (!r.ok) { saveBtn.disabled = false; toast(r.error === 'invalid_fields' ? 'Bitte prüfen: ' + Object.keys(r.felder || {}).map(function (x) { return (felder[x] || {}).label || x; }).join(', ') : fehlerText(r), 'fehler'); return; }
        S.dirty = null;
        toast(r.unveraendert ? 'Keine Änderungen.' : 'Angaben gespeichert.');
        akteLaden(a.id);
      });
    });
    var stand = k.fragebogen ? (k.fragebogen.vollstaendig_am ? 'Fragebogen vollständig seit ' + datum(k.fragebogen.vollstaendig_am, true) : 'Fragebogen in Bearbeitung (Schritt ' + (k.fragebogen.schritt || 0) + ' von 7)') : 'Noch kein Fragebogen – Werte aus der Anfrage vorbelegt.';
    box.appendChild(h('section', { class: 'karte' }, [
      h('div', { class: 'karten-kopf' }, [h('div', null, [h('h3', { text: 'Angaben aus dem Fragebogen' }), h('p', { class: 'muted small' }, [stand + '. Editierbar; Änderungen der Kanzlei werden markiert ', h('span', { class: 'badge-geaendert', text: 'geändert' }), '.'])]), h('div', { class: 'zeile' }, [ok, saveBtn])]),
      raster
    ]));
  }
  function unterliste(titel, liste, spalten, neu, beiAenderung, geaendertInfo) {
    var box = h('div', { class: 'unterliste' });
    function zeichne() {
      leeren(box);
      box.appendChild(h('label', null, [titel, geaendertInfo ? h('span', { class: 'badge-geaendert', text: 'geändert' }) : null]));
      liste.forEach(function (eintrag, i) {
        box.appendChild(h('div', { class: 'unterliste-zeile' }, spalten.map(function (sp) {
          var el;
          if (sp[2] === 'anrecht') el = h('select', { 'aria-label': sp[1] }, Object.keys(S.akte.anrecht_arten).map(function (k) { return h('option', { value: k, text: S.akte.anrecht_arten[k] }); }));
          else if (sp[2] === 'inhaber') el = h('select', { 'aria-label': sp[1] }, [h('option', { value: 'ich', text: 'Antragsteller/in' }), h('option', { value: 'ehepartner', text: 'Ehepartner/in' })]);
          else el = h('input', { type: sp[2] === 'date' ? 'date' : 'text', placeholder: sp[1], 'aria-label': sp[1] + ' ' + (i + 1) });
          el.value = eintrag[sp[0]] || (sp[2] === 'anrecht' ? 'gesetzlich' : sp[2] === 'inhaber' ? 'ich' : '');
          el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', function () { eintrag[sp[0]] = el.value.trim(); beiAenderung(); });
          return el;
        }).concat([h('button', { type: 'button', class: 'link rot', text: 'Entfernen', onclick: function () { liste.splice(i, 1); beiAenderung(); zeichne(); } })])));
      });
      box.appendChild(h('div', null, h('button', { type: 'button', class: 'btn btn-zweit btn-klein', text: '+ ' + (titel === 'Kinder' ? 'Kind' : 'Anrecht') + ' hinzufügen', onclick: function () { liste.push(neu()); beiAenderung(); zeichne(); } })));
    }
    zeichne();
    return box;
  }

  /* B4-3 Dokumente */
  function reiterDokumente(box) {
    var k = S.akte, a = k.anfrage;
    var art = h('select', { 'aria-label': 'Art des Dokuments' }, DOK_ARTEN.map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
    art.value = 'sonstiges';
    var input = h('input', { type: 'file', hidden: true, accept: '.pdf,.jpg,.jpeg,.png,.heic,.docx,application/pdf,image/jpeg,image/png,image/heic' });
    var status = h('span', { class: 'muted small', 'aria-live': 'polite' });
    var btn = h('button', { type: 'button', class: 'btn btn-zweit btn-klein', text: 'Dokument hochladen', onclick: function () { input.click(); } });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0]; input.value = '';
      if (!f) return;
      btn.disabled = true;
      hochladen(f, art.value, a.id, function (p) { status.textContent = 'Lädt … ' + p + ' %'; }).then(function (r) {
        btn.disabled = false; status.textContent = '';
        if (r.ok) { toast(f.name + ' hochgeladen.'); akteLaden(a.id); } else toast(fehlerText(r), 'fehler');
      });
    });
    var namen = {}; DOK_ARTEN.forEach(function (x) { namen[x[0]] = x[1]; });
    box.appendChild(h('section', { class: 'karte' }, [
      h('div', { class: 'karten-kopf' }, [h('h3', { text: 'Dokumente (' + k.dokumente.length + ')' }), h('div', { class: 'upload-zeile' }, [art, btn, input, status])]),
      k.dokumente.length ? h('div', { class: 'doks' }, k.dokumente.map(function (d) {
        var url = '/api/hq/datei?dok=' + d.id;
        var vorschau = /^image\/(jpeg|png)$/.test(d.mime) ? h('img', { src: url, alt: '', loading: 'lazy' }) : (d.mime === 'application/pdf' ? 'PDF' : /word/.test(d.mime) ? 'DOCX' : 'Datei') + '\n' + d.name;
        return h('article', { class: 'dok' }, [
          h('a', { class: 'dok-vorschau', href: url, target: '_blank', rel: 'noopener', 'aria-label': d.name + ' öffnen' }, vorschau),
          h('div', { class: 'dok-info' }, [h('b', { text: d.name, title: d.name }), h('small', { text: (namen[d.art] || d.art) + ' · ' + Math.max(1, Math.round(d.groesse / 1024)) + ' KB · ' + datum(d.created_at) }),
            h('div', { class: 'zeile' }, [h('span', { class: 'chip q-' + d.quelle, text: QUELLE_DOK[d.quelle] || d.quelle }), h('button', { type: 'button', class: 'link rot small', text: 'Löschen', onclick: function () {
              modalOeffnen({ titel: 'Dokument löschen?', sub: d.name, okText: 'Löschen', gefahr: true, onOk: function () {
                return api('DELETE', 'dokumente', 'id=' + a.id + '&dok=' + d.id).then(function (r) { if (!r.ok) { toast(fehlerText(r), 'fehler'); return false; } toast('Dokument gelöscht.'); akteLaden(a.id); });
              } });
            } })])])
        ]);
      })) : h('p', { class: 'muted', text: 'Noch keine Dokumente in dieser Akte.' })
    ]));
  }
  function hochladen(datei, art, id, fortschritt) {
    if (datei.size > 10 * 1024 * 1024) return Promise.resolve({ ok: false, error: 'file_too_large' });
    var n = datei.name.toLowerCase();
    var typ = datei.type || (/\.pdf$/.test(n) ? 'application/pdf' : /\.heic$/.test(n) ? 'image/heic' : /\.docx$/.test(n) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : '');
    var TEIL = 3 * 1024 * 1024, anzahl = Math.max(1, Math.ceil(datei.size / TEIL)), uid = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), i = 0;
    function weiter() {
      fortschritt(Math.round(i / anzahl * 100));
      return api('POST', 'dokumente', 'id=' + id + '&art=' + art + '&upload=' + uid + '&teil=' + i + '&teile=' + anzahl, datei.slice(i * TEIL, (i + 1) * TEIL), { roh: true, headers: { 'Content-Type': typ || 'application/octet-stream', 'X-Dateiname': encodeURIComponent(datei.name) } })
        .then(function (r) { if (!r.ok) return r; i++; return i < anzahl ? weiter() : r; });
    }
    return weiter();
  }

  /* B4-4 Kosten */
  function reiterKosten(box) {
    var k = S.akte, a = k.anfrage, K = k.kosten, g = k.kosten_grundlagen;
    var ergebnis = h('div');
    var felder = {};
    function feld(key, label, wert) {
      var el = h('input', { name: key, inputmode: 'decimal', value: wert == null ? '' : String(wert) });
      felder[key] = el;
      return h('label', { class: 'feld-' + key }, [label, el]);
    }
    var grund = h('div', { class: 'feld-raster' }, [
      feld('ek_as', 'Netto Antragsteller/in (€/Monat)', g.ek_as), feld('ek_ag', 'Netto Antragsgegner/in (€/Monat)', g.ek_ag),
      feld('anrechte', 'Anzahl Rentenanrechte', g.anrechte), h('span'),
      feld('wert_scheidung', 'Verfahrenswert Scheidung (€)', Math.round(K.wert_scheidung)), feld('wert_va', 'Wert Versorgungsausgleich (€)', Math.round(K.wert_va))
    ]);
    function markieren(K2) {
      felder.wert_scheidung.parentNode.classList.toggle('feld-ueber', !!K2.ueberschrieben.wert_scheidung);
      felder.wert_va.parentNode.classList.toggle('feld-ueber', !!K2.ueberschrieben.wert_va);
    }
    function tabelle(K2) {
      leeren(ergebnis);
      var z = [['Verfahrenswert Scheidung', eur0(K2.wert_scheidung)], ['Wert Versorgungsausgleich', eur0(K2.wert_va), K2.anrechte + ' Anrecht' + (K2.anrechte === 1 ? '' : 'e')], ['Gesamtwert', eur0(K2.gesamtwert)],
        ['Gerichtskosten', eur(K2.gerichtskosten), '2,0 Gebühr KV 1110 FamGKG'], ['Verfahrensgebühr', eur(K2.verfahrensgebuehr), '1,3 Gebühr VV 3100 RVG'], ['Terminsgebühr', eur(K2.terminsgebuehr), '1,2 Gebühr VV 3104 RVG'],
        ['Auslagenpauschale', eur(K2.auslagen), 'VV 7002 RVG'], ['Umsatzsteuer 19 %', eur(K2.ust), 'VV 7008 RVG'], ['Anwaltskosten inkl. USt', eur(K2.anwaltskosten), null, 1], ['Voraussichtlich gesamt', eur(K2.gesamt), null, 1]];
      ergebnis.appendChild(h('table', { class: 'kosten-tab' }, h('tbody', null, z.map(function (x) { return h('tr', { class: x[3] ? 'summe' : null }, [h('td', null, [x[0], x[2] ? h('small', { text: x[2] }) : null]), h('td', { text: x[1] })]); }))));
      ergebnis.appendChild(h('p', { class: 'muted small', text: K2.hinweis + ' ' + K2.stand + '.' }));
      markieren(K2);
    }
    var t = null;
    function aendern(body) {
      clearTimeout(t);
      t = setTimeout(function () {
        api('PUT', 'kosten', 'id=' + a.id, body).then(function (r) {
          if (!r.ok) { toast(fehlerText(r), 'fehler'); return; }
          k.kosten = r.kosten; k.kosten_grundlagen = r.grundlagen; a.kosten = a.kosten || {};
          tabelle(r.kosten);
          if (!body.wert_scheidung && !document.activeElement.isSameNode(felder.wert_scheidung)) felder.wert_scheidung.value = Math.round(r.kosten.wert_scheidung);
          if (!body.wert_va && !document.activeElement.isSameNode(felder.wert_va)) felder.wert_va.value = Math.round(r.kosten.wert_va);
        });
      }, 400);
    }
    Object.keys(felder).forEach(function (key) {
      felder[key].addEventListener('input', function () {
        var body = {}; body[key] = felder[key].value.trim() || null;
        // Einkommen/Anrechte ändern → automatische Werte neu, solange nicht überschrieben
        aendern(body);
      });
    });
    var vorschuss = h('input', { type: 'checkbox', checked: !!(a.kosten && a.kosten.vorschuss_bezahlt) });
    vorschuss.addEventListener('change', function () { api('PUT', 'kosten', 'id=' + a.id, { vorschuss_bezahlt: vorschuss.checked }).then(function (r) { if (r.ok) toast(vorschuss.checked ? 'Vorschuss als bezahlt markiert.' : 'Vorschuss als offen markiert.'); }); });
    box.appendChild(h('div', { class: 'zwei-spalten' }, [
      h('section', { class: 'karte' }, [h('h3', { text: 'Grundlagen' }), h('p', { class: 'muted small', text: 'Automatisch aus dem Fragebogen. Jede Zahl lässt sich überschreiben (Goldrand).' }), grund,
        h('p', { class: 'muted small' }, ['Scheidung: dreifaches gemeinsames Nettoeinkommen (§ 43 FamGKG), mindestens 3.000 €. Versorgungsausgleich: 10 % je Anrecht, mindestens 1.000 € (§ 50 FamGKG). ',
          h('button', { type: 'button', class: 'link', text: 'Überschreibungen zurücksetzen', onclick: function () {
            api('PUT', 'kosten', 'id=' + a.id, { wert_scheidung: null, wert_va: null, ek_as: null, ek_ag: null, anrechte: null }).then(function (r) { if (r.ok) { toast('Zurückgesetzt.'); akteLaden(a.id); } });
          } })]),
        h('label', { class: 'check-zeile' }, [vorschuss, 'Vorschuss bezahlt'])]),
      h('section', { class: 'karte' }, [h('h3', { text: 'Ergebnis' }), ergebnis, h('button', { type: 'button', class: 'btn btn-primaer', text: 'Kostenübersicht an Mandant senden', onclick: function () { aktionDialog('kosten'); } })])
    ]));
    tabelle(K);
  }

  /* B4-5 Scheidungsantrag */
  function reiterAntrag(box) {
    var k = S.akte, a = k.anfrage, an = S.antrag;
    if (!an) { box.appendChild(h('p', { class: 'fehler-text', text: 'Antrag konnte nicht geladen werden.' })); return; }
    var word = h('button', { type: 'button', class: 'btn btn-primaer', text: 'Als Word herunterladen', onclick: function () {
      word.disabled = true; word.textContent = 'Wird erstellt …';
      api('GET', 'dokument', 'id=' + a.id + '&typ=scheidungsantrag', undefined, { blob: true }).then(function (r) {
        word.disabled = false; word.textContent = 'Als Word herunterladen';
        if (!r.ok) { toast(fehlerText(r), 'fehler'); return; }
        var cd = r.headers.get('Content-Disposition') || '', m = /filename="([^"]+)"/.exec(cd);
        var link = h('a', { href: URL.createObjectURL(r.blob), download: m ? m[1] : 'Scheidungsantrag.docx' });
        document.body.appendChild(link); link.click(); link.remove();
        var offen = (r.headers.get('X-Offene-Felder') || '').split(',').filter(Boolean);
        toast(offen.length ? 'Word erstellt – offene Felder: ' + offen.length : 'Word-Datei erstellt.', offen.length ? 'warn' : 'ok');
        if (['unterschrieben', 'fragebogen_vollstaendig'].indexOf(a.status) >= 0) detailLaden(a.id);
      });
    } });
    var vollmacht = h('button', { type: 'button', class: 'btn btn-zweit', text: 'Vollmacht (Word)', onclick: function () {
      api('GET', 'dokument', 'id=' + a.id + '&typ=vollmacht', undefined, { blob: true }).then(function (r) {
        if (!r.ok) { toast(fehlerText(r), 'fehler'); return; }
        var m = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '');
        var link = h('a', { href: URL.createObjectURL(r.blob), download: m ? m[1] : 'Vollmacht.docx' }); document.body.appendChild(link); link.click(); link.remove();
      });
    } });
    var eingereicht = ['eingereicht', 'termin', 'abgeschlossen'].indexOf(a.status) >= 0;
    var bea = h('button', { type: 'button', class: 'btn btn-zweit', text: eingereicht ? 'Eingereicht am ' + datum(a.eingereicht_am) : 'Als eingereicht markieren (beA)', disabled: eingereicht || a.status === 'widerrufen', onclick: beaDialog });
    var fehlt = an.warnungen.filter(function (w) { return w.art === 'fehlt'; });
    box.appendChild(h('div', { class: 'spalten-antrag' }, [
      h('section', { class: 'karte antrag', 'aria-label': 'Vorschau Scheidungsantrag' }, an.absaetze.map(function (p) {
        return h('p', { class: (p.fett ? 'fett ' : '') + (p.mitte ? 'mitte' : '') }, p.seg.map(function (s) {
          if (s.quelle === 'fest') return document.createTextNode(s.text);
          return h('span', { class: s.quelle === 'fehlt' ? 'seg-fehlt' : 'seg-auto', title: s.label + (s.quelle === 'fehlt' ? ' fehlt' : ' (automatisch)'), text: s.text });
        }));
      })),
      h('div', null, [h('section', { class: 'karte eng' }, [
        h('h3', { text: 'Prüfung' }),
        an.warnungen.length ? h('ul', { class: 'warnungen' }, an.warnungen.map(function (w) { return h('li', { class: w.art === 'fehlt' ? 'fehlt' : null, text: w.text }); })) : h('p', { class: 'hinweis-ok' }, [h('span', { class: 'icon', 'aria-hidden': 'true', text: '✓' }), 'Alle Angaben vollständig.']),
        fehlt.length ? h('p', { class: 'small' }, h('a', { href: '#/a/' + a.id + '/angaben', text: 'Fehlende Angaben im Reiter „Angaben“ ergänzen' })) : null,
        h('p', { class: 'legende' }, [h('span', null, [h('i', { class: 'l-auto' }), 'automatisch eingesetzt']), h('span', null, [h('i', { class: 'l-fehlt' }), 'fehlt'])]),
        h('div', { class: 'btn-stapel' }, [word, vollmacht, bea]),
        h('p', { class: 'muted small', text: 'Der Versand über beA erfolgt in der Kanzleisoftware. Hier wird nur der Status gesetzt und die Mandanten-E-Mail ausgelöst.' }),
        h('p', { class: 'muted small', text: 'Gericht: ' + (an.gericht || '—') + (a.gericht ? '' : ' (Vorschlag, änderbar im Reiter „Übersicht“)') })
      ])])
    ]));
  }
  function beaDialog() {
    var a = S.akte.anfrage;
    var az = h('input', { value: a.az_gericht || '', placeholder: 'z. B. 612 F 1234/26', maxlength: '60', required: true });
    var box = h('div', null, h('p', { class: 'muted', text: 'Vorschau wird geladen …' }));
    modalOeffnen({ titel: 'Als eingereicht markieren', sub: 'Status wird „Eingereicht“, die Mandantin/der Mandant erhält E-Mail A1.7 mit Link zur Status-Seite.', inhalt: [h('label', null, ['Aktenzeichen des Gerichts (Pflicht)', az]), box], okText: 'Eingereicht – E-Mail senden', onOk: function () {
      if (!az.value.trim()) { toast(FEHLER.az_gericht_fehlt, 'fehler'); az.focus(); return false; }
      return api('POST', 'aktion', 'id=' + a.id, { art: 'bea', az_gericht: az.value.trim() }).then(function (r) {
        if (!r.ok) { toast(fehlerText(r), 'fehler'); return false; }
        toast(r.mail && r.mail.status === 'fehler' ? 'Eingereicht, aber E-Mail fehlgeschlagen. Siehe Kommunikation.' : 'Als eingereicht markiert, E-Mail gesendet.', r.mail && r.mail.status === 'fehler' ? 'warn' : 'ok');
        detailLaden(a.id);
      });
    } });
    api('POST', 'mails', 'id=' + a.id, { vorlage: 'A1.7', vorschau: true }).then(function (r) { leeren(box); if (r.ok) mailVorschauBox(r.vorschau).forEach(function (x) { box.appendChild(x); }); });
  }

  /* B4-6 Termine */
  function reiterTermine(box) {
    var k = S.akte, a = k.anfrage;
    var dat = h('input', { type: 'date' }), zeit = h('input', { type: 'time', value: '10:00' }), ort = h('input', { placeholder: (a.gericht || 'Amtsgericht Hannover') + ', Saal …', maxlength: '200' });
    var art = h('select', null, [['scheidung', 'Scheidungstermin (Gericht)'], ['erstgespraech', 'Erstgespräch'], ['sonstiges', 'Sonstiges']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var btn = h('button', { type: 'button', class: 'btn btn-primaer', text: 'Termin speichern und Mandant informieren' });
    art.addEventListener('change', function () { btn.textContent = art.value === 'scheidung' ? 'Termin speichern und Mandant informieren' : 'Termin speichern'; });
    btn.addEventListener('click', function () {
      if (!dat.value || !zeit.value || !ort.value.trim()) { toast('Bitte Datum, Uhrzeit und Ort angeben.', 'fehler'); return; }
      btn.disabled = true;
      api('POST', 'termine', 'id=' + a.id, { datum: dat.value, uhrzeit: zeit.value, ort: ort.value.trim(), art: art.value }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { toast(fehlerText(r), 'fehler'); return; }
        toast(r.mail ? (r.mail.status === 'gesendet' ? 'Termin gespeichert, E-Mail gesendet.' : 'Termin gespeichert, E-Mail: ' + (MAIL_STATUS[r.mail.status] || r.mail.status)) : 'Termin gespeichert.', r.mail && r.mail.status === 'fehler' ? 'warn' : 'ok');
        detailLaden(a.id);
      });
    });
    var MON = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
    box.appendChild(h('div', { class: 'zwei-spalten' }, [
      h('section', { class: 'karte' }, [h('h3', { text: 'Termin eintragen' }), h('p', { class: 'muted small', text: 'Ein Scheidungstermin löst die E-Mail „Vorbereitung auf den Gerichtstermin“ aus und setzt den Status auf „Termin steht“.' }),
        h('div', { class: 'feld-raster' }, [h('label', { class: 'voll' }, ['Art', art]), h('label', null, ['Datum', dat]), h('label', null, ['Uhrzeit', zeit]), h('label', { class: 'voll' }, ['Ort / Saal', ort])]), h('div', { class: 'zeile' }, btn)]),
      h('section', { class: 'karte' }, [h('h3', { text: 'Termine dieser Akte' }), k.termine.length ? h('ul', { class: 'termine' }, k.termine.map(function (t) {
        var p = t.datum.split('-');
        return h('li', null, [h('span', { class: 'datumkachel' }, [p[2], h('small', { text: MON[Number(p[1]) - 1] })]), h('span', null, [h('b', { text: { scheidung: 'Scheidungstermin', erstgespraech: 'Erstgespräch', sonstiges: 'Termin' }[t.art] + ' · ' + datum(t.datum) + ', ' + String(t.uhrzeit).slice(0, 5) + ' Uhr' }), h('small', { text: t.ort })]),
          h('button', { type: 'button', class: 'link rot small', text: 'Löschen', onclick: function () { api('DELETE', 'termine', 'id=' + a.id + '&termin=' + t.id).then(function (r) { if (r.ok) { toast('Termin gelöscht.'); akteLaden(a.id); } }); } })]);
      })) : h('p', { class: 'muted', text: 'Noch kein Termin eingetragen.' })])
    ]));
  }

  /* B4-7 Kommunikation */
  function reiterKommunikation(box) {
    var k = S.akte, a = k.anfrage;
    var liste = h('ol', { class: 'mails' }, k.mails.map(function (m) {
      var details = h('div', { hidden: true });
      details.appendChild(h('div', { class: 'mail-text', text: m.text }));
      if (m.status !== 'gesendet') details.appendChild(h('div', { class: 'mail-aktion' }, [m.fehler ? h('span', { class: 'fehler-text', text: 'Fehler: ' + m.fehler }) : null, h('button', { type: 'button', class: 'btn btn-primaer btn-klein', text: m.status === 'geplant' ? 'Freigeben und senden' : 'Erneut senden', onclick: function (e) {
        var b = e.currentTarget; b.disabled = true;
        api('POST', 'mails-erneut', 'mail=' + m.id).then(function (r) { b.disabled = false; if (r.ok && r.gesendet) { toast('E-Mail gesendet.'); akteLaden(a.id); } else toast(r.ok ? 'Versand fehlgeschlagen: ' + (r.mail.fehler || '') : fehlerText(r), 'fehler'); });
      } })]));
      var zeile = h('button', { type: 'button', class: 'mail-zeile', 'aria-expanded': 'false', onclick: function () { var auf = details.hidden; details.hidden = !auf; zeile.setAttribute('aria-expanded', String(auf)); } }, [
        h('time', { text: datum(m.gesendet_am || m.created_at, true) }), h('span', null, [h('b', { text: m.betreff }), h('small', { text: m.vorlage + ' · an ' + m.an })]), h('span', { class: 'chip m-' + m.status, text: MAIL_STATUS[m.status] || m.status })]);
      return h('li', null, [zeile, details]);
    }));
    // Neue E-Mail
    var wahl = h('select');
    var an = h('input', { type: 'email', placeholder: a.email || 'E-Mail-Adresse', 'aria-label': 'Empfänger' });
    var betreff = h('input', { readonly: true, 'aria-label': 'Betreff' });
    var text = h('textarea', { rows: '12', 'aria-label': 'Text' });
    var anhaenge = h('div', { class: 'anhaenge' });
    var senden = h('button', { type: 'button', class: 'btn btn-primaer', text: 'E-Mail senden' });
    var info = h('p', { class: 'muted small', text: 'Platzhalter für persönliche Links ({{link_…}}) werden beim Senden erzeugt. Zeilen [button: …] werden als Button dargestellt.' });
    function laden() {
      api('POST', 'mails', 'id=' + a.id, { vorlage: wahl.value, vorschau: true }).then(function (r) {
        if (!r.ok) { toast(fehlerText(r), 'fehler'); return; }
        betreff.value = r.vorschau.betreff; text.value = r.vorschau.text;
        an.value = wahl.value === 'A1.10' ? '' : '';
        an.placeholder = wahl.value === 'A1.10' ? 'E-Mail-Adresse des Ehepartners' : (a.email || '');
      });
    }
    function vorlagenFuellen(vorlagen) {
      vorlagen.filter(function (v) { return !v.dokument; }).forEach(function (v) { wahl.appendChild(h('option', { value: v.id, text: v.id + ' · ' + v.name })); });
      wahl.value = 'A1.6';
      laden();
    }
    if (S.vorlagen) vorlagenFuellen(S.vorlagen.vorlagen); else api('GET', 'vorlagen').then(function (r) { if (r.ok) { S.vorlagen = r; vorlagenFuellen(r.vorlagen); } });
    wahl.addEventListener('change', laden);
    k.dokumente.forEach(function (d) { anhaenge.appendChild(h('label', null, [h('input', { type: 'checkbox', value: String(d.id) }), d.name])); });
    senden.addEventListener('click', function () {
      var ids = Array.prototype.map.call(anhaenge.querySelectorAll('input:checked'), function (x) { return Number(x.value); });
      if (wahl.value === 'A1.10' && !an.value.trim()) { toast('Bitte die E-Mail-Adresse des Ehepartners eintragen.', 'fehler'); an.focus(); return; }
      senden.disabled = true;
      api('POST', 'mails', 'id=' + a.id, { vorlage: wahl.value, text: text.value, an: an.value.trim() || undefined, anhaenge: ids }).then(function (r) {
        senden.disabled = false;
        if (!r.ok) { toast(fehlerText(r), 'fehler'); return; }
        toast(r.gesendet ? 'E-Mail gesendet.' : 'Versand fehlgeschlagen – siehe Liste.', r.gesendet ? 'ok' : 'fehler');
        akteLaden(a.id);
      });
    });
    box.appendChild(h('div', { class: 'zwei-spalten' }, [
      h('section', { class: 'karte' }, [h('h3', { text: 'E-Mails dieser Akte (' + k.mails.length + ')' }), k.mails.length ? liste : h('p', { class: 'muted', text: 'Noch keine E-Mails gesendet.' })]),
      h('section', { class: 'karte' }, [h('h3', { text: 'Neue E-Mail' }), h('label', { class: 'formular-feld' }, ['Vorlage', wahl]), h('label', { class: 'formular-feld' }, ['An (leer = ' + (a.email || 'Mandant') + ')', an]),
        h('label', { class: 'formular-feld' }, ['Betreff', betreff]), h('label', { class: 'formular-feld' }, ['Text', text]), info,
        k.dokumente.length ? h('div', null, [h('p', { class: 'small muted', text: 'Anhänge aus der Akte (z. B. Vorschussrechnung):' }), anhaenge]) : null, senden])
    ]));
  }

  /* ===================== 13 B5 Vorlagen ===================== */
  function vorlagenZeigen() {
    leeren(main);
    main.appendChild(skeleton());
    api('GET', 'vorlagen').then(function (r) {
      if (!r.ok) { if (!serverFehler(r, vorlagenZeigen)) toast(fehlerText(r), 'fehler'); return; }
      S.vorlagen = r; S.vEdit = false;
      vorlagenRendern();
    });
  }
  function phSegmente(text) {
    return String(text || '').split(/(\{\{\s*\w+\s*\}\})/).filter(Boolean).map(function (t) { return /^\{\{/.test(t) ? h('span', { class: 'ph', text: t }) : document.createTextNode(t); });
  }
  function vorlagenRendern() {
    var r = S.vorlagen, v = r.vorlagen.filter(function (x) { return x.id === S.vSel; })[0] || r.vorlagen[0];
    S.vSel = v.id;
    leeren(main);
    var mails = r.vorlagen.filter(function (x) { return !x.dokument; }), doks = r.vorlagen.filter(function (x) { return x.dokument; });
    function eintrag(x) {
      var auto = null;
      if (!x.dokument) {
        var cb = h('input', { type: 'checkbox', checked: !!x.automatisch, disabled: !r.admin, 'aria-label': x.id + ' automatisch senden' });
        cb.addEventListener('change', function () { speichern({ id: x.id, automatisch: cb.checked }, cb.checked ? x.id + ': wird automatisch gesendet.' : x.id + ': nur noch als Entwurf.'); });
        auto = h('label', { class: 'auto' }, [cb, 'automatisch']);
      } else if (!String(x.text || '').trim()) auto = h('span', { class: 'fehlt', text: 'Text fehlt' });
      return h('li', null, [h('button', { type: 'button', class: 'v', 'aria-current': String(x.id === v.id), onclick: function () { if (S.vEdit && !verlassenOk()) return; S.vSel = x.id; S.vEdit = false; S.dirty = null; vorlagenRendern(); } }, [h('span', { class: 'vid', text: x.id }), h('span', { class: 'vname', text: x.name })]), auto]);
    }
    var rechts;
    if (S.vEdit) {
      var bt = h('input', { value: v.betreff, 'aria-label': 'Betreff' });
      var tx = h('textarea', { 'aria-label': 'Text', value: v.text });
      var fehler = h('p', { class: 'fehler-text', hidden: true });
      [bt, tx].forEach(function (el) { el.addEventListener('input', function () { S.dirty = 'Vorlage ' + v.id; }); });
      var zuletzt = tx;
      bt.addEventListener('focus', function () { zuletzt = bt; }); tx.addEventListener('focus', function () { zuletzt = tx; });
      rechts = h('section', { class: 'karte editor' }, [
        h('div', { class: 'karten-kopf' }, [h('h3', { text: 'Bearbeiten · ' + v.id }), h('span', { class: 'muted small', text: v.name })]),
        v.dokument ? null : h('label', { class: 'betreff-feld' }, ['Betreff', bt]),
        h('label', null, ['Text', tx]),
        h('p', { class: 'muted small', text: 'Absätze durch Leerzeile trennen. Sonderzeilen: [button: Beschriftung | {{link_…}}], [hinweis: Text], [tabelle] (nur Kosten).' }),
        h('p', { class: 'small' }, ['Platzhalter einfügen: ', h('span', { class: 'ph-chips' }, r.platzhalter.map(function (p) {
          return h('button', { type: 'button', class: 'ph', text: '{{' + p + '}}', onclick: function () {
            var el = zuletzt, s = el.selectionStart || el.value.length, e = el.selectionEnd || s;
            el.value = el.value.slice(0, s) + '{{' + p + '}}' + el.value.slice(e); el.focus(); el.selectionStart = el.selectionEnd = s + p.length + 4; S.dirty = 'Vorlage ' + v.id;
          } });
        }))]),
        fehler,
        h('div', { class: 'zeile' }, [h('button', { type: 'button', class: 'btn btn-primaer', text: 'Speichern', onclick: function () {
          speichern({ id: v.id, betreff: v.dokument ? undefined : bt.value, text: tx.value }, v.id + ' gespeichert.', fehler);
        } }), h('button', { type: 'button', class: 'btn btn-zweit', text: 'Abbrechen', onclick: function () { S.dirty = null; S.vEdit = false; vorlagenRendern(); } }),
        v.geaendert ? h('button', { type: 'button', class: 'link', text: 'Auf Standardtext zurücksetzen', onclick: function () { speichern({ id: v.id, zuruecksetzen: true }, v.id + ' zurückgesetzt.'); } }) : null])
      ]);
    } else {
      rechts = h('section', { class: 'karte vorschau-sticky' }, [
        h('div', { class: 'karten-kopf' }, [h('h3', { text: 'Vorschau · ' + v.id }), h('span', { class: 'muted small', text: v.dokument ? 'Dokument im Mandat (A2)' : v.automatisch ? 'wird automatisch gesendet' : 'nur Entwurf / manuell' })]),
        v.dokument ? null : h('p', { class: 'muted small', text: 'Betreff' }), v.dokument ? null : h('p', { class: 'betreff' }, h('b', null, phSegmente(v.betreff))),
        h('p', { class: 'muted small', text: 'Text' }),
        String(v.text || '').trim() ? h('div', { class: 'vorschau-box' }, phSegmente(v.text)) : h('div', { class: 'hinweis', text: 'Text folgt von der Kanzlei. Ohne diesen Text kann kein Mandat angeboten werden.' }),
        h('p', { class: 'muted small' }, v.geaendert ? 'Geändert ' + datum(v.aktualisiert_am, true) + ' von ' + (v.aktualisiert_von || '—') : 'Standardtext'),
        r.admin ? h('button', { type: 'button', class: 'btn btn-zweit', text: 'Bearbeiten', onclick: function () { S.vEdit = true; vorlagenRendern(); } }) : h('p', { class: 'muted small', text: 'Bearbeiten nur für Admins.' })
      ]);
    }
    main.appendChild(h('section', { 'aria-label': 'Vorlagen' }, [h('h1', { class: 'vh', text: 'Vorlagen' }), h('div', { class: 'spalten-vorlagen' }, [
      h('div', null, [
        h('section', { class: 'karte' }, [h('h3', { text: 'E-Mail-Vorlagen' }), h('ul', { class: 'vliste' }, mails.map(eintrag))]),
        h('section', { class: 'karte' }, [h('h3', { text: 'Texte im Mandat (A2)' }), h('ul', { class: 'vliste' }, doks.map(eintrag))]),
        h('section', { class: 'karte' }, [h('h3', { text: 'Word-Vorlagen' }), h('ul', { class: 'dokv' }, r.dokumentvorlagen.map(function (d) {
          return h('li', null, [h('b', { text: d.name }), h('small', { text: 'api/_templates/' + d.datei }), h('span', { class: 'ph-chips' }, d.platzhalter.map(function (p) { return h('span', { class: 'ph', text: '{{' + p + '}}' }); }))]);
        }))])
      ]),
      rechts
    ])]));
  }
  function speichern(body, okText, fehlerEl) {
    api('PUT', 'vorlagen', '', body).then(function (r) {
      if (!r.ok) {
        var t = r.error === 'unknown_placeholders' ? 'Unbekannte Platzhalter: ' + r.platzhalter.map(function (p) { return '{{' + p + '}}'; }).join(', ') : fehlerText(r);
        if (fehlerEl) { fehlerEl.hidden = false; fehlerEl.textContent = t; } else toast(t, 'fehler');
        return;
      }
      S.vorlagen.vorlagen = r.vorlagen; S.vEdit = false; S.dirty = null;
      toast(okText);
      vorlagenRendern();
    });
  }

  /* ===================== 14 B6 Einstellungen ===================== */
  var EINST = [
    ['oeffnungszeiten', 'Öffnungszeiten', 'Erscheinen in E-Mails und auf der Status-Seite.', [['mo_do', 'Montag–Donnerstag'], ['fr', 'Freitag']]],
    ['antwortzeiten', 'Antwortzeiten', 'Zusagen in der Eingangsbestätigung (Platzhalter {{antwortzeit}}).', [['anfrage', 'Anfragen'], ['kosten', 'Kostenübersicht']]],
    ['mail', 'E-Mail', 'Absender der Mandanten-E-Mails, Empfänger interner Benachrichtigungen, Link für Terminbuchung (A1.3).', [['absender', 'Absender'], ['empfaenger_intern', 'Interner Empfänger'], ['termin_link', 'Link Terminbuchung']]],
    ['ki', 'KI-Einordnung', 'Neue Anfragen werden automatisch eingeordnet. Pseudonymisiert: Namen, E-Mail, Telefon, Straße werden vorher entfernt.', [['aktiv', 'KI-Einordnung aktiv', 'bool'], ['pseudonymisiert', 'Nur pseudonymisierte Daten', 'bool']]],
    ['erinnerungen', 'Erinnerungen', 'Automatische Erinnerung (A1.4), wenn Unterschrift oder Fragebogen fehlen.', [['erste_tage', 'Erste Erinnerung nach … Tagen', 'zahl'], ['zweite_tage', 'Zweite Erinnerung nach … Tagen', 'zahl']]],
    ['kanzlei', 'Kanzlei', 'Fußzeile der E-Mails und Kontaktkarte im Mandanten-Bereich.', [['name', 'Name'], ['anschrift', 'Anschrift'], ['telefon', 'Telefon'], ['email', 'E-Mail'], ['ort', 'Ort']]]
  ];
  /* B6 · Nutzer und Team: feste Zugänge (Vercel) + eingeladene Personen */
  var STATUS_BENUTZER = { aktiv: ['aktiv', 'int-aktiv'], eingeladen: ['eingeladen – Passwort noch nicht gesetzt', 'int-test'], gesperrt: ['gesperrt', 'int-aus'] };
  function teamKarte(r) {
    var box = h('section', { class: 'karte' });
    var linkBox = h('div');
    function linkAnzeigen(x, email) {
      leeren(linkBox);
      if (x.mail && x.mail.ok) { linkBox.appendChild(h('p', { class: 'hinweis-ok', text: 'Einladung an ' + email + ' gesendet.' })); return; }
      var feld = h('input', { readonly: true, value: x.link || '', 'aria-label': 'Einladungslink' });
      linkBox.appendChild(h('div', { class: 'hinweis' }, [
        h('p', { text: 'Die E-Mail an ' + email + ' konnte nicht zugestellt werden (' + ((x.mail && x.mail.fehler) || 'unbekannt') + '). Solange in Resend keine eigene Domain bestätigt ist, gehen Mails nur an die Konto-Adresse. Bitte den Link selbst an ' + email + ' weitergeben (7 Tage gültig):' }),
        feld,
        h('div', { class: 'zeile' }, h('button', { type: 'button', class: 'btn btn-zweit btn-klein', text: 'Link kopieren', onclick: function () {
          feld.select();
          (navigator.clipboard ? navigator.clipboard.writeText(feld.value) : Promise.reject()).then(function () { toast('Link kopiert.'); }, function () { document.execCommand('copy'); toast('Link kopiert.'); });
        } }))
      ]));
    }
    function aktion(b, body, okText) {
      api('PATCH', 'benutzer', 'id=' + b.id, body).then(function (x) {
        if (!x.ok) { toast(x.error === 'not_yourself' ? 'Den eigenen Zugang kann man nicht ändern.' : fehlerText(x), 'fehler'); return; }
        if (body.erneut_einladen) { linkAnzeigen(x, b.email); toast('Neue Einladung erstellt.'); } else toast(okText);
        teamLaden();
      });
    }
    var tbody = h('tbody');
    function zeilen(liste) {
      leeren(tbody);
      liste.forEach(function (b) {
        var st = STATUS_BENUTZER[b.status] || [b.status, ''];
        var knoepfe = [];
        if (r.admin && b.quelle === 'einladung' && b.email !== S.user) {
          if (b.status !== 'aktiv') knoepfe.push(h('button', { type: 'button', class: 'link', text: 'Einladung erneut senden', onclick: function () { aktion(b, { erneut_einladen: true }); } }));
          if (b.status === 'aktiv') knoepfe.push(h('button', { type: 'button', class: 'link', text: 'Passwort zurücksetzen', onclick: function () { aktion(b, { erneut_einladen: true }); } }));
          knoepfe.push(h('button', { type: 'button', class: 'link', text: b.status === 'gesperrt' ? 'Entsperren' : 'Sperren', onclick: function () { aktion(b, { aktiv: b.status === 'gesperrt' }, b.status === 'gesperrt' ? 'Zugang entsperrt.' : 'Zugang gesperrt.'); } }));
          knoepfe.push(h('button', { type: 'button', class: 'link', text: b.rolle === 'Admin' ? 'zu Mitarbeit' : 'zu Admin', onclick: function () { aktion(b, { rolle: b.rolle === 'Admin' ? 'mitarbeit' : 'admin' }, 'Rolle geändert.'); } }));
          knoepfe.push(h('button', { type: 'button', class: 'link rot', text: 'Entfernen', onclick: function () {
            modalOeffnen({ titel: 'Zugang entfernen?', sub: b.email + ' kann sich danach nicht mehr anmelden.', okText: 'Entfernen', gefahr: true, onOk: function () {
              return api('DELETE', 'benutzer', 'id=' + b.id).then(function (x) { if (!x.ok) { toast(fehlerText(x), 'fehler'); return false; } toast('Zugang entfernt.'); teamLaden(); });
            } });
          } }));
        }
        tbody.appendChild(h('tr', null, [
          h('td', null, [h('b', { text: b.name }), b.email && b.email !== b.name ? h('div', { class: 'muted small', text: b.email }) : null, b.quelle === 'fest' ? h('div', { class: 'muted small', text: 'fester Zugang (Vercel)' }) : null]),
          h('td', { text: b.rolle }),
          h('td', { class: st[1], text: st[0] + (b.quelle === 'fest' ? (b.zwei_faktor ? ' · 2FA' : '') : '') }),
          h('td', null, knoepfe.length ? h('div', { class: 'team-aktionen' }, knoepfe) : null)
        ]));
      });
    }
    function teamLaden() { api('GET', 'benutzer').then(function (x) { if (x.ok) zeilen(x.benutzer); }); }
    zeilen(r.benutzer);
    var email = h('input', { type: 'email', placeholder: 'name@kanzlei.de', autocomplete: 'off', 'aria-label': 'E-Mail-Adresse' });
    var name = h('input', { placeholder: 'z. B. Janine D. Wagner', maxlength: '80', 'aria-label': 'Name' });
    var rolle = h('select', { 'aria-label': 'Rolle' }, [h('option', { value: 'mitarbeit', text: 'Mitarbeit' }), h('option', { value: 'admin', text: 'Admin (Vorlagen, Einstellungen, Team)' })]);
    var senden = h('button', { type: 'button', class: 'btn btn-primaer', text: 'Einladung senden', onclick: function () {
      var e = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { toast('Bitte eine gültige E-Mail-Adresse eingeben.', 'fehler'); email.focus(); return; }
      senden.disabled = true;
      api('POST', 'benutzer', '', { email: e, name: name.value.trim(), rolle: rolle.value }).then(function (x) {
        senden.disabled = false;
        if (!x.ok) { toast(x.error === 'already_exists' ? 'Diese Person hat bereits einen aktiven Zugang.' : fehlerText(x), 'fehler'); return; }
        linkAnzeigen(x, e);
        email.value = ''; name.value = '';
        teamLaden();
      });
    } });
    box.appendChild(h('h3', { text: 'Nutzer und Team' }));
    box.appendChild(h('table', { class: 'tabelle' }, [h('thead', null, h('tr', null, [h('th', { text: 'Person' }), h('th', { text: 'Rolle' }), h('th', { text: 'Status' }), h('th', { text: '' })])), tbody]));
    if (r.admin) {
      box.appendChild(h('h3', { class: 'abstand-oben', text: 'Person einladen' }));
      box.appendChild(h('p', { class: 'muted small', text: 'Die Person erhält eine E-Mail mit einem persönlichen Link (7 Tage gültig), legt ihr Passwort selbst fest und meldet sich danach mit ihrer E-Mail-Adresse an.' }));
      box.appendChild(h('div', { class: 'einst-raster' }, [h('label', null, ['E-Mail-Adresse', email]), h('label', null, ['Name (optional)', name]), h('label', null, ['Rolle', rolle])]));
      box.appendChild(h('div', { class: 'zeile' }, senden));
      box.appendChild(linkBox);
    } else box.appendChild(h('p', { class: 'muted small', text: 'Einladen und Verwalten nur für Admins.' }));
    return box;
  }

  function einstellungenZeigen() {
    leeren(main);
    main.appendChild(skeleton());
    api('GET', 'einstellungen').then(function (r) {
      if (!r.ok) { if (!serverFehler(r, einstellungenZeigen)) toast(fehlerText(r), 'fehler'); return; }
      S.einst = r;
      leeren(main);
      var felder = {};
      var gespeichert = h('span', { class: 'ok-text', text: r.stand ? 'Zuletzt gespeichert ' + datum(r.stand, true) : '' });
      var gruppen = EINST.map(function (g) {
        return h('section', { class: 'karte' }, [h('h3', { text: g[1] }), h('p', { class: 'muted small', text: g[2] }), h('div', { class: 'einst-raster' }, g[3].map(function (f) {
          var wert = r.einstellungen[g[0]][f[0]], el;
          if (f[2] === 'bool') { el = h('input', { type: 'checkbox', checked: !!wert, disabled: !r.admin }); felder[g[0] + '.' + f[0]] = el; return h('label', { class: 'einst-bool' }, [el, f[1]]); }
          el = h('input', { value: wert == null ? '' : String(wert), disabled: !r.admin, inputmode: f[2] === 'zahl' ? 'numeric' : null });
          el.addEventListener('input', function () { S.dirty = 'Einstellungen'; });
          felder[g[0] + '.' + f[0]] = el;
          return h('label', null, [f[1], el]);
        }))]);
      });
      var INT = { aktiv: ['aktiv', 'int-aktiv'], testmodus: ['Testmodus (nur Protokoll)', 'int-test'], nicht_eingerichtet: ['nicht eingerichtet', 'int-aus'], lokal: ['lokale Datei', 'int-test'], supabase: ['Supabase', 'int-aktiv'] };
      main.appendChild(h('section', { class: 'einst', 'aria-label': 'Einstellungen' }, [h('h1', { class: 'vh', text: 'Einstellungen' }),
        r.admin ? null : h('div', { class: 'hinweis', text: 'Nur Admins können Einstellungen ändern.' })].concat(gruppen).concat([
        teamKarte(r),
        h('section', { class: 'karte' }, [h('h3', { text: 'Anbindungen' }), h('table', { class: 'tabelle' }, h('tbody', null, [['E-Mail-Versand', r.integration.mail], ['KI (Anthropic)', r.integration.ki], ['Tägliche Erinnerungen', r.integration.cron], ['Datenbank', r.integration.speicher]].map(function (x) {
          var s = INT[x[1]] || [x[1], ''];
          return h('tr', null, [h('td', { text: x[0] }), h('td', { class: s[1], text: s[0] })]);
        })))]),
        r.admin ? h('div', { class: 'zeile' }, [h('button', { type: 'button', class: 'btn btn-primaer', text: 'Einstellungen speichern', onclick: function (e) {
          var body = {};
          EINST.forEach(function (g) { body[g[0]] = {}; g[3].forEach(function (f) { var el = felder[g[0] + '.' + f[0]]; body[g[0]][f[0]] = f[2] === 'bool' ? el.checked : f[2] === 'zahl' ? Number(el.value) : el.value; }); });
          var b = e.currentTarget; b.disabled = true;
          api('PUT', 'einstellungen', '', body).then(function (x) { b.disabled = false; if (x.ok) { S.dirty = null; gespeichert.textContent = 'Gespeichert ' + datum(x.stand, true); toast('Einstellungen gespeichert.'); } else toast(fehlerText(x), 'fehler'); });
        } }), gespeichert]) : null
      ])));
    });
  }

  /* ===================== 15 Start ===================== */
  function boot() {
    var einl = /^#\/einladung\/([A-Za-z0-9_-]{40,60})$/.exec(location.hash);
    if (einl) { einladungZeigen(einl[1]); return; }
    api('GET', 'login').then(function (r) {
      if (r.ok) { start(r); return; }
      if (r.status === 401) { loginZeigen(1); return; }
      $('boot-text').textContent = r.error === 'hq_not_configured' ? 'HQ ist nicht eingerichtet (HQ_USERS / HQ_SECRET fehlen).' : 'Server nicht erreichbar.';
      $('boot-retry').hidden = false;
    });
  }
  $('boot-retry').addEventListener('click', function () { $('boot-retry').hidden = true; $('boot-text').textContent = 'HQ wird geladen …'; boot(); });
  boot();
})();
