/* ============================================================
   Mandanten-Bereich: /m/:token (A2 Mandat), /f/:token (A3 Fragebogen),
   /s/:token (A4 Status). Ohne Framework, ohne Inline-Styles (CSP).
   API: /api/m/*?token=…
   ============================================================ */
(function () {
  'use strict';

  var teile = location.pathname.split('/').filter(Boolean);
  var MODUS = { m: 'mandat', f: 'fragebogen', s: 'status' }[teile[0]] || '';
  var TOKEN = teile[1] || '';
  var app = document.getElementById('app');

  /* ---------- Helfer ---------- */
  function h(tag, attrs, kinder) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    (Array.isArray(kinder) ? kinder : kinder === undefined || kinder === null ? [] : [kinder]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function leeren(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function zeige(kinder) { leeren(app); (Array.isArray(kinder) ? kinder : [kinder]).forEach(function (k) { if (k) app.appendChild(k); }); window.scrollTo(0, 0); }
  function de(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (iso || ''); }
  function uhr(d) { d = d ? new Date(d) : new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function apiUrl(route, extra) { return '/api/m/' + route + '?token=' + encodeURIComponent(TOKEN) + (extra || ''); }

  function api(method, route, body, extra) {
    var opt = { method: method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(apiUrl(route, extra), opt).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'ungueltige_antwort' }; }).then(function (j) { j.status = r.status; return j; });
    }, function () { return { ok: false, error: 'netz', status: 0 }; });
  }

  function laden(text) {
    zeige(h('div', { class: 'laden', role: 'status' }, [h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { text: text || 'Wird geladen …' })]));
  }
  function netzFehler(retry) {
    zeige(h('div', { class: 'banner', role: 'alert' }, [h('span', { text: 'Die Seite konnte nicht geladen werden. Bitte prüfen Sie Ihre Internetverbindung.' }), h('button', { type: 'button', class: 'btn-klein', text: 'Erneut versuchen', onclick: retry })]));
  }

  /* Link ungültig / abgelaufen / ersetzt */
  function linkFehler(j) {
    var texte = {
      link_invalid: ['Dieser Link ist leider ungültig.', 'Bitte prüfen Sie, ob Sie den Link vollständig aus unserer E-Mail übernommen haben.'],
      link_expired: ['Dieser Link ist abgelaufen.', 'Aus Sicherheitsgründen gelten persönliche Links nur begrenzte Zeit. Wir senden Ihnen gern einen neuen Link.'],
      link_revoked: ['Dieser Link wurde durch einen neueren ersetzt.', 'Bitte verwenden Sie den Link aus unserer letzten E-Mail – oder fordern Sie einen neuen an.']
    }[j.error] || ['Die Seite ist nicht verfügbar.', 'Bitte rufen Sie uns an, wir helfen gern weiter.'];
    var info = h('div');
    var knopf = j.neuer_link_moeglich ? h('button', {
      type: 'button', class: 'btn', text: 'Neuen Link anfordern', onclick: function () {
        knopf.disabled = true;
        api('POST', 'link-neu').then(function (r) {
          leeren(info);
          info.appendChild(h('div', { class: r.ok ? 'info-ok' : 'banner', role: 'status', text: r.ok ? 'Wir haben Ihnen einen neuen Link per E-Mail gesendet. Bitte schauen Sie auch im Spam-Ordner nach.' : 'Das hat nicht geklappt. Bitte versuchen Sie es später erneut oder rufen Sie uns an.' }));
          if (!r.ok) knopf.disabled = false;
        });
      }
    }) : null;
    zeige(h('section', { class: 'leerseite' }, [h('h1', { text: texte[0] }), h('p', { text: texte[1] }), info, knopf, kontaktKurz()]));
  }
  function kontaktKurz() {
    return h('p', { class: 'klein-grau' }, ['Fragen? Telefon ', h('a', { href: 'tel:+4951154368383', text: '0511 54 36 83 83' }), ' · ', h('a', { href: 'mailto:kanzlei@scheidung-online.de', text: 'kanzlei@scheidung-online.de' })]);
  }
  function behandle(j, retry) {
    if (j.status === 0) { netzFehler(retry); return true; }
    if (/^link_/.test(j.error || '')) { linkFehler(j); return true; }
    if (j.error === 'rate_limited') { zeige(h('div', { class: 'banner', role: 'alert' }, [h('span', { text: 'Zu viele Aufrufe in kurzer Zeit. Bitte warten Sie einen Moment.' }), h('button', { type: 'button', class: 'btn-klein', text: 'Erneut versuchen', onclick: retry })])); return true; }
    if (!j.ok && j.status >= 500) { netzFehler(retry); return true; }
    return false;
  }

  /* ---------- Upload in Teilen (≤ 3 MB je Request, max. 10 MB) ---------- */
  var MIME = { 'image/jpeg': 1, 'image/png': 1, 'image/heic': 1, 'image/heif': 1, 'application/pdf': 1 };
  function dateiTyp(f) {
    if (f.type && MIME[f.type]) return f.type;
    var n = (f.name || '').toLowerCase();
    if (/\.heic$/.test(n)) return 'image/heic';
    if (/\.heif$/.test(n)) return 'image/heif';
    if (/\.pdf$/.test(n)) return 'application/pdf';
    if (/\.jpe?g$/.test(n)) return 'image/jpeg';
    if (/\.png$/.test(n)) return 'image/png';
    return '';
  }
  function hochladen(datei, art, fortschritt) {
    var typ = dateiTyp(datei);
    if (!typ) return Promise.resolve({ ok: false, error: 'invalid_type' });
    if (datei.size > 10 * 1024 * 1024) return Promise.resolve({ ok: false, error: 'file_too_large' });
    var TEIL = 3 * 1024 * 1024;
    var anzahl = Math.max(1, Math.ceil(datei.size / TEIL));
    var id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var i = 0;
    function naechster() {
      var stueck = datei.slice(i * TEIL, (i + 1) * TEIL);
      fortschritt(Math.round((i / anzahl) * 100));
      return fetch(apiUrl('upload', '&art=' + art + '&upload=' + id + '&teil=' + i + '&teile=' + anzahl), {
        method: 'POST', headers: { 'Content-Type': typ, 'X-Dateiname': encodeURIComponent(datei.name || 'datei') }, body: stueck
      }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'upload_failed' }; }); }, function () { return { ok: false, error: 'netz' }; })
        .then(function (j) { if (!j.ok) return j; i++; return i < anzahl ? naechster() : j; });
    }
    return naechster();
  }
  var UPLOAD_FEHLER = { invalid_type: 'Bitte ein Foto (JPG, PNG, HEIC) oder ein PDF wählen.', file_too_large: 'Die Datei ist größer als 10 MB.', netz: 'Keine Verbindung – bitte erneut versuchen.', rate_limited: 'Bitte einen Moment warten und erneut versuchen.' };

  /* Upload-Feld: Button + Statuszeile + Liste der eigenen Dateien dieser Art */
  function uploadFeld(art, dokumente, beiAenderung) {
    var input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/heic,image/heif,application/pdf,.heic,.pdf', hidden: true });
    var status = h('span', { class: 'upload-text', text: 'Foto oder PDF, max. 10 MB' });
    var liste = h('ul', { class: 'datei-liste' });
    var knopf = h('button', { type: 'button', class: 'btn-klein', text: 'Datei auswählen', onclick: function () { input.click(); } });
    function zeichne() {
      leeren(liste);
      dokumente.filter(function (d) { return d.art === art; }).forEach(function (d) {
        liste.appendChild(h('li', null, [
          h('a', { href: apiUrl('datei', '&dok=' + d.id), target: '_blank', rel: 'noopener', text: d.name }),
          h('button', { type: 'button', class: 'link-btn rot', text: 'Entfernen', 'aria-label': d.name + ' entfernen', onclick: function () {
            api('DELETE', 'upload', undefined, '&dok=' + d.id).then(function (j) {
              if (j.ok) { var idx = dokumente.indexOf(d); if (idx >= 0) dokumente.splice(idx, 1); zeichne(); if (beiAenderung) beiAenderung(); }
            });
          } })
        ]));
      });
      liste.hidden = !liste.firstChild;
    }
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      knopf.disabled = true;
      status.className = 'upload-text';
      hochladen(f, art, function (p) { status.textContent = 'Wird hochgeladen … ' + p + ' %'; }).then(function (j) {
        knopf.disabled = false;
        if (j.ok && j.dokument) {
          dokumente.push(j.dokument);
          status.className = 'upload-text ok';
          status.textContent = '✓ ' + j.dokument.name + ' hochgeladen';
          zeichne();
          if (beiAenderung) beiAenderung();
        } else {
          status.className = 'upload-text err';
          status.textContent = UPLOAD_FEHLER[j.error] || 'Das Hochladen hat nicht geklappt. Bitte erneut versuchen.';
        }
      });
    });
    zeichne();
    return h('div', null, [h('div', { class: 'upload' }, [knopf, status, input]), liste]);
  }

  /* ============================================================
     A2 · Mandat erteilen
     ============================================================ */
  function mandatStart() {
    laden();
    api('GET', 'mandat').then(function (j) {
      if (behandle(j, mandatStart)) return;
      if (!j.ok) { linkFehler(j); return; }
      if (j.unterschrieben) { mandatFertig(j, null); return; }
      if (!j.verfuegbar) { zeige(h('section', { class: 'leerseite' }, [h('h1', { text: 'Dieses Mandat ist nicht mehr verfügbar.' }), h('p', { text: 'Bitte rufen Sie uns an, wenn Sie Fragen haben.' }), kontaktKurz()])); return; }
      mandatFormular(j);
    });
  }

  function mandatFormular(j) {
    var gelesen = {};
    var name = [j.person.vorname, j.person.nachname].filter(Boolean).join(' ');
    var KEY = { 'DOK.auftrag': 'auftrag', 'DOK.widerruf': 'widerruf', 'DOK.gebuehren': 'gebuehren', 'DOK.datenschutz': 'datenschutz' };
    var texteFehlen = j.dokumente.some(function (d) { return d.platzhalter && d.id !== 'DOK.datenschutz'; });

    var dokKarten = j.dokumente.map(function (d, i) {
      var key = KEY[d.id];
      var koerperId = 'dok-' + i;
      var koerper = h('div', { id: koerperId, hidden: true }, d.platzhalter
        ? h('div', { class: 'platzhalter', text: 'Text folgt von der Kanzlei' })
        : h('div', { class: 'dok-text' }, d.text.split(/\n\s*\n/).map(function (p) { return h('p', { text: p }); })));
      var kopf = h('button', { type: 'button', class: 'dok-kopf', 'aria-expanded': 'false', 'aria-controls': koerperId, onclick: function () {
        var auf = kopf.getAttribute('aria-expanded') !== 'true';
        kopf.setAttribute('aria-expanded', String(auf));
        koerper.hidden = !auf;
      } }, [h('span', null, [h('span', { class: 'dok-nr', text: 'DOKUMENT ' + (i + 1) }), h('span', { class: 'dok-titel', text: d.titel })]), h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })]);
      var cb = h('input', { type: 'checkbox', onchange: function () { gelesen[key] = cb.checked; pruefe(); } });
      return h('article', { class: 'karte dok' }, [kopf, koerper, h('label', { class: 'check' }, [cb, 'Ich habe das Dokument gelesen und zur Kenntnis genommen.'])]);
    });

    var sofort = h('input', { type: 'checkbox' });
    var canvas = h('canvas', { class: 'sig', width: '640', height: '220', 'aria-label': 'Unterschriftsfeld – mit Finger oder Maus unterschreiben', role: 'img' });
    var sigHinweis = h('p', { class: 'klein-grau', text: 'Bitte unterschreiben Sie mit dem Finger oder der Maus.' });
    var ort = h('input', { class: 'eingabe', value: j.person.ort || '', autocomplete: 'address-level2', maxlength: '80', oninput: function () { pruefe(); } });
    var fehltText = h('p', { class: 'fehlt-text', 'aria-live': 'polite' });
    var meldung = h('div');
    var knopf = h('button', { type: 'button', class: 'btn', text: 'Verbindlich unterschreiben', onclick: absenden });
    var striche = 0;

    // Unterschrift zeichnen (Pointer Events, skaliert auf die Canvas-Auflösung)
    var ctx = canvas.getContext('2d');
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--navy').trim() || 'navy';
    var zeichnet = false;
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
    canvas.addEventListener('pointerdown', function (e) { zeichnet = true; canvas.setPointerCapture(e.pointerId); var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke(); e.preventDefault(); });
    canvas.addEventListener('pointermove', function (e) { if (!zeichnet) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    function ende() { if (!zeichnet) return; zeichnet = false; striche++; canvas.classList.add('ok'); sigHinweis.textContent = 'Danke. Sie können die Unterschrift jederzeit löschen und neu setzen.'; pruefe(); }
    canvas.addEventListener('pointerup', ende);
    canvas.addEventListener('pointercancel', ende);
    function loeschen() { ctx.clearRect(0, 0, canvas.width, canvas.height); striche = 0; canvas.classList.remove('ok'); sigHinweis.textContent = 'Bitte unterschreiben Sie mit dem Finger oder der Maus.'; pruefe(); }

    function fehlend() {
      var out = [];
      var offen = Object.keys(KEY).filter(function (id) { return !gelesen[KEY[id]]; }).length;
      if (offen) out.push(offen === 1 ? 'ein Dokument' : offen + ' Dokumente');
      if (!striche) out.push('Ihre Unterschrift');
      if (!ort.value.trim()) out.push('den Ort');
      return out;
    }
    function pruefe() {
      var f = fehlend();
      knopf.setAttribute('aria-disabled', f.length || texteFehlen ? 'true' : 'false');
      fehltText.textContent = texteFehlen ? 'Die Dokumente werden gerade von der Kanzlei vervollständigt. Bitte versuchen Sie es etwas später erneut.' : f.length ? 'Bitte noch ' + f.join(', ').replace(/, ([^,]*)$/, ' und $1') + ' bestätigen bzw. ergänzen.' : '';
    }
    function absenden() {
      if (knopf.getAttribute('aria-disabled') === 'true' || knopf.disabled) { pruefe(); return; }
      knopf.disabled = true;
      knopf.textContent = 'Wird übermittelt …';
      leeren(meldung);
      api('POST', 'mandat', { bestaetigungen: gelesen, sofort_taetig: sofort.checked, ort: ort.value.trim(), unterschrift: canvas.toDataURL('image/png') }).then(function (r) {
        if (r.ok) { mandatFertig(j, { ort: ort.value.trim(), fragebogen_url: r.fragebogen_url, pdf_dok: r.pdf_dok }); return; }
        if (r.error === 'already_signed') { mandatStart(); return; }
        if (/^link_/.test(r.error || '')) { linkFehler(r); return; }
        knopf.disabled = false;
        knopf.textContent = 'Verbindlich unterschreiben';
        var t = { invalid_signature: 'Die Unterschrift konnte nicht gelesen werden. Bitte löschen und erneut unterschreiben.', confirmations_required: 'Bitte bestätigen Sie alle vier Dokumente.', mandat_texte_fehlen: 'Die Dokumente werden gerade von der Kanzlei vervollständigt. Bitte versuchen Sie es später erneut.', netz: 'Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.' }[r.error] || 'Das hat leider nicht geklappt. Bitte versuchen Sie es erneut.';
        meldung.appendChild(h('div', { class: 'banner', role: 'alert', text: t }));
      });
    }

    zeige(h('section', null, [
      h('h1', { text: 'Guten Tag' + (name ? ', ' + name : '') }),
      h('p', { class: 'sub', text: 'Schön, dass Sie den Weg mit uns gehen möchten. So geht es jetzt weiter:' }),
      h('ol', { class: 'schritte' }, [
        h('li', null, [h('span', { class: 'nr', text: '1' }), h('span', { text: 'Sie lesen die vier Dokumente unten und bestätigen jeweils, dass Sie sie zur Kenntnis genommen haben.' })]),
        h('li', null, [h('span', { class: 'nr', text: '2' }), h('span', { text: 'Sie unterschreiben direkt hier mit dem Finger oder der Maus.' })]),
        h('li', null, [h('span', { class: 'nr', text: '3' }), h('span', { text: 'Danach füllen Sie den Fragebogen aus. Vieles ist schon vorausgefüllt.' })])
      ]),
      h('div', null, dokKarten),
      h('label', { class: 'check-karte' }, [sofort, h('span', null, ['Ich wünsche, dass die Kanzlei ', h('b', { text: 'vor Ablauf der Widerrufsfrist' }), ' tätig wird. Mir ist bekannt, dass ich bei einem Widerruf die bis dahin erbrachten Leistungen zu vergüten habe.'])]),
      h('article', { class: 'karte pad' }, [
        h('div', { class: 'sig-kopf' }, [h('b', { text: 'Ihre Unterschrift' }), h('button', { type: 'button', class: 'link-btn', text: 'Löschen', onclick: loeschen })]),
        canvas, sigHinweis,
        h('div', { class: 'zwei' }, [
          h('label', { class: 'lbl' }, ['Ort', ort]),
          h('label', { class: 'lbl' }, ['Datum', h('input', { class: 'eingabe', value: j.heute, readonly: true, tabindex: '-1' })])
        ])
      ]),
      fehltText, meldung, knopf,
      h('p', { class: 'klein-grau zentriert', text: 'Sie erhalten alle Dokumente nach der Unterschrift als PDF per E-Mail.' })
    ]));
    pruefe();
  }

  function mandatFertig(j, neu) {
    var pdf = neu ? neu.pdf_dok : j.pdf_dok;
    var datum = neu ? j.heute : (j.unterschrieben_am ? new Date(j.unterschrieben_am).toLocaleDateString('de-DE') : j.heute);
    zeige(h('section', { class: 'erfolg' }, [
      h('div', { class: 'erfolg-icon', 'aria-hidden': 'true', text: '✓' }),
      h('h1', { text: neu ? 'Danke, Ihr Mandat ist erteilt.' : 'Ihr Mandat ist bereits erteilt.' }),
      h('p', { class: 'sub', text: 'Unterschrieben am ' + datum + (neu && neu.ort ? ' in ' + neu.ort : '') + '. Frau Wagner meldet sich, sobald Ihre Angaben vollständig sind.' }),
      j.fragebogen_vollstaendig
        ? h('a', { class: 'btn', href: '/s/' + TOKEN, text: 'Zum Stand Ihres Verfahrens' })
        : h('a', { class: 'btn', href: '/f/' + TOKEN, text: 'Weiter zum Fragebogen' }),
      pdf ? h('a', { class: 'btn zweit', href: apiUrl('datei', '&dok=' + pdf), target: '_blank', rel: 'noopener', text: 'Unterschriebene Dokumente als PDF' }) : null
    ]));
  }

  /* ============================================================
     A3 · Fragebogen
     ============================================================ */
  function T(k, l, o) { return Object.assign({ k: k, l: l, typ: 'text' }, o || {}); }
  function D(k, l, o) { return Object.assign({ k: k, l: l, typ: 'date' }, o || {}); }
  function R(k, l, opts, o) { return Object.assign({ k: k, l: l, typ: 'radio', opts: opts }, o || {}); }
  var SCHRITTE = [
    { titel: 'Ihre Person', f: [T('as_vorname', 'Vorname', { halb: 1, ac: 'given-name' }), T('as_nachname', 'Nachname', { halb: 1, ac: 'family-name' }), T('as_geburtsname', 'Geburtsname', { ph: 'falls abweichend' }), D('as_geburtsdatum', 'Geburtsdatum', { ac: 'bday' }), T('as_staatsang', 'Staatsangehörigkeit', { ph: 'z. B. deutsch' }), T('as_strasse', 'Straße und Hausnummer', { ac: 'street-address' }), T('as_plz', 'PLZ', { halb: 1, ac: 'postal-code', im: 'numeric' }), T('as_ort', 'Ort', { halb: 1, ac: 'address-level2' }), T('as_telefon', 'Telefon', { input: 'tel', ac: 'tel' }), T('as_email', 'E-Mail', { input: 'email', ac: 'email' })] },
    { titel: 'Ihr Ehepartner', f: [T('ag_vorname', 'Vorname', { halb: 1 }), T('ag_nachname', 'Nachname', { halb: 1 }), T('ag_geburtsname', 'Geburtsname', { ph: 'falls abweichend' }), D('ag_geburtsdatum', 'Geburtsdatum'), T('ag_staatsang', 'Staatsangehörigkeit'), T('ag_strasse', 'Straße und Hausnummer'), T('ag_plz', 'PLZ', { halb: 1 }), T('ag_ort', 'Ort', { halb: 1 }), { k: 'ag_ausland', l: 'Wohnsitz', typ: 'check', checkText: 'Mein Ehepartner lebt im Ausland' }] },
    { titel: 'Ihre Ehe', f: [D('ehe_datum', 'Heiratsdatum'), T('ehe_standesamt', 'Standesamt (Ort)', { ph: 'z. B. Hannover' }), T('ehe_registernr', 'Heiratsregisternummer', { ph: 'z. B. E 123/2015', hilfe: 'Steht auf der Heiratsurkunde, z. B. E 123/2015.' }), { k: 'upload_heiratsurkunde', art: 'heiratsurkunde', l: 'Heiratsurkunde (Foto oder PDF, optional)', typ: 'upload', hilfe: 'Dann müssen Sie die Nummer nicht abtippen.' }, D('trennung_datum', 'Seit wann leben Sie getrennt?'), T('ehewhg_plz', 'Letzte gemeinsame Wohnung: PLZ', { halb: 1, im: 'numeric' }), T('ehewhg_ort', 'Ort', { halb: 1 }), R('ehewhg_noch_bewohnt', 'Wohnt einer von Ihnen noch dort?', ['Ja, ich', 'Ja, mein Ehepartner', 'Nein, niemand'])] },
    { titel: 'Kinder', f: [R('kinder_vorhanden', 'Haben Sie gemeinsame minderjährige Kinder?', ['Ja', 'Nein']), { k: 'kinder', l: 'Ihre Kinder', typ: 'kinder', wenn: ['kinder_vorhanden', 'Ja'] }, R('kinder_aufenthalt', 'Bei wem leben die Kinder überwiegend?', ['Bei mir', 'Bei meinem Ehepartner', 'Im Wechsel bei beiden'], { wenn: ['kinder_vorhanden', 'Ja'] }), { k: 'upload_geburtsurkunden', art: 'geburtsurkunde', l: 'Geburtsurkunden (optional)', typ: 'upload', wenn: ['kinder_vorhanden', 'Ja'] }] },
    { titel: 'Einigung & Folgesachen', f: [R('zustimmung', 'Stimmt Ihr Ehepartner der Scheidung zu?', ['Ja', 'Wahrscheinlich', 'Nein', 'Unklar']), R('fs_unterhalt', 'Ist der Unterhalt geklärt?', ['Ja', 'Nein', 'Nicht relevant']), R('fs_hausrat', 'Ist der Hausrat aufgeteilt?', ['Ja', 'Nein']), R('fs_sorge', 'Sorge- und Umgangsrecht einvernehmlich?', ['Ja', 'Nein', 'Keine Kinder']), R('anderweitig_anhaengig', 'Sind schon andere Familiensachen bei Gericht anhängig?', ['Nein', 'Ja']), R('ehevertrag', 'Ehevertrag oder Scheidungsfolgenvereinbarung vorhanden?', ['Nein', 'Ja']), { k: 'upload_ehevertrag', art: 'ehevertrag', l: 'Ehevertrag / Vereinbarung (optional)', typ: 'upload', wenn: ['ehevertrag', 'Ja'] }] },
    { titel: 'Einkommen & Altersvorsorge', f: [T('ek_as', 'Ihr monatliches Nettoeinkommen (ca., €)', { halb: 1, im: 'decimal' }), T('ek_ag', 'Nettoeinkommen Ihres Ehepartners (ca., €)', { halb: 1, im: 'decimal' }), { k: 'ek_hinweis', typ: 'hilfe', l: 'Eine ungefähre Angabe genügt, Nachweise sind nicht nötig.' }, { k: 'anrechte', l: 'Rentenanrechte (gesetzlich, betrieblich, privat …)', typ: 'anrechte', hilfe: 'Alles, was Sie oder Ihr Ehepartner während der Ehe an Altersvorsorge aufgebaut haben.' }, R('vkh', 'Möchten Sie Verfahrenskostenhilfe beantragen?', ['Nein', 'Ja, bitte prüfen'])] },
    { titel: 'Prüfen & absenden', summary: true }
  ];
  var FEHLER_TEXT = { pflicht: 'Bitte ausfüllen.', datum: 'Bitte ein gültiges Datum wählen.', email: 'Bitte eine gültige E-Mail-Adresse eingeben.', telefon: 'Bitte eine gültige Telefonnummer eingeben.', plz: 'Bitte eine fünfstellige PLZ eingeben.', betrag: 'Bitte einen Betrag in Euro eingeben, z. B. 2.500.', auswahl: 'Bitte eine Antwort wählen.', ungueltig: 'Bitte prüfen.' };
  var ANRECHT_ARTEN = [['gesetzlich', 'Gesetzliche Rente'], ['beamte', 'Beamtenversorgung'], ['betrieb', 'Betriebsrente'], ['privat', 'Private Rente'], ['berufsstaendisch', 'Berufsständische Versorgung']];

  var fb = null; // { daten, vorbelegt{}, dokumente[], schritt, fehler{}, offen{}, timer, speichert, gespeichertUm, mailAn }

  function fragebogenStart() {
    laden();
    api('GET', 'fragebogen').then(function (j) {
      if (behandle(j, fragebogenStart)) return;
      if (j.error === 'not_signed') { if (j.mandat_url) location.replace(j.mandat_url); else zeige(h('section', { class: 'leerseite' }, [h('h1', { text: 'Bitte zuerst das Mandat unterschreiben.' }), h('p', { text: 'Den Link dazu finden Sie in unserer E-Mail.' }), kontaktKurz()])); return; }
      if (!j.ok) { linkFehler(j); return; }
      if (j.fragebogen.vollstaendig) { fragebogenFertig(); return; }
      var vor = {};
      j.vorbelegt.forEach(function (k) { vor[k] = true; });
      fb = { daten: j.fragebogen.daten || {}, vorbelegt: vor, dokumente: j.dokumente || [], schritt: Math.min(Math.max(j.fragebogen.schritt || 0, 0), 6), fehler: {}, offen: {}, timer: null, speichert: false, gespeichertUm: j.fragebogen.updated_at ? uhr(j.fragebogen.updated_at) : '', mailAn: j.fragebogen.daten.as_email || '' };
      if (!Array.isArray(fb.daten.kinder)) fb.daten.kinder = [];
      if (!Array.isArray(fb.daten.anrechte)) fb.daten.anrechte = [];
      schrittZeigen();
    });
  }

  function sichtbar(f) { return !f.wenn || (fb.daten[f.wenn[0]] || '') === f.wenn[1]; }

  /* Hinweise (gleiche Regeln wie der Server) */
  function hinweise() {
    var d = fb.daten, out = [];
    if (d.zustimmung === 'Nein' || d.zustimmung === 'Unklar' || d.fs_unterhalt === 'Nein' || d.fs_hausrat === 'Nein' || d.fs_sorge === 'Nein') out.push({ schritt: 5, text: 'Wir besprechen das persönlich mit Ihnen. Sie können den Fragebogen trotzdem abschließen.' });
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trennung_datum || '');
    if (m) {
      var jetzt = new Date();
      var mon = (jetzt.getFullYear() - Number(m[1])) * 12 + (jetzt.getMonth() + 1 - Number(m[2])) - (jetzt.getDate() < Number(m[3]) ? 1 : 0);
      if (mon < 10) out.push({ schritt: 3, text: 'Der Antrag kann in der Regel erst nach etwa 10 Monaten Trennung gestellt werden. Wir melden uns zum richtigen Zeitpunkt.' });
    }
    if (d.ag_ausland === true) out.push({ schritt: 2, text: 'Ihr Ehepartner lebt im Ausland. Hier klären wir die Zuständigkeit persönlich mit Ihnen.' });
    return out;
  }

  /* Autosave: geänderte Felder gebündelt nach kurzer Pause */
  var statusEl = null;
  function speicherText() {
    if (!statusEl) return;
    statusEl.textContent = fb.speichert ? 'Speichert …' : fb.fehlerSpeichern ? 'Nicht gespeichert – wird erneut versucht' : fb.gespeichertUm ? 'Gespeichert um ' + fb.gespeichertUm : 'Wird automatisch gespeichert';
  }
  function aendern(k, v, sofort) {
    fb.daten[k] = v;
    fb.offen[k] = true;
    delete fb.vorbelegt[k];
    if (fb.fehler[k]) { delete fb.fehler[k]; var el = document.querySelector('[data-feld="' + k + '"]'); if (el) { el.classList.remove('fehler'); var fe = el.querySelector('.feld-fehler'); if (fe) fe.remove(); } }
    clearTimeout(fb.timer);
    fb.timer = setTimeout(speichern, sofort ? 50 : 1200);
  }
  function speichern(extra) {
    clearTimeout(fb.timer);
    var keys = Object.keys(fb.offen);
    if (!keys.length && !extra) return Promise.resolve({ ok: true });
    var daten = {};
    keys.forEach(function (k) { daten[k] = fb.daten[k]; });
    fb.offen = {};
    fb.speichert = true; speicherText();
    var body = Object.assign({ schritt: fb.schritt + 1, daten: daten }, extra || {});
    if (extra && extra.alleFelder) { delete body.alleFelder; SCHRITTE[fb.schritt].f.forEach(function (f) { if (f.typ !== 'upload' && f.typ !== 'hilfe') body.daten[f.k] = fb.daten[f.k] === undefined ? (f.typ === 'check' ? false : '') : fb.daten[f.k]; }); }
    return api('PATCH', 'fragebogen', body).then(function (r) {
      fb.speichert = false;
      if (r.status === 0 || r.status >= 500 || r.error === 'rate_limited') {
        keys.forEach(function (k) { fb.offen[k] = true; });
        fb.fehlerSpeichern = true; speicherText();
        fb.timer = setTimeout(speichern, 5000);
        return r;
      }
      fb.fehlerSpeichern = false;
      if (r.updated_at) fb.gespeichertUm = uhr(r.updated_at);
      speicherText();
      if (/^link_/.test(r.error || '')) linkFehler(r);
      if (r.error === 'already_submitted') fragebogenFertig();
      if (r.error === 'invalid_fields' && r.felder) { Object.keys(r.felder).forEach(function (k) { fb.fehler[k] = r.felder[k]; }); feldFehlerZeigen(); }
      return r;
    });
  }
  function feldFehlerZeigen() {
    Object.keys(fb.fehler).forEach(function (k) {
      var el = document.querySelector('[data-feld="' + k + '"]');
      if (!el || el.classList.contains('fehler')) return;
      el.classList.add('fehler');
      el.appendChild(h('p', { class: 'feld-fehler', id: 'err-' + k, text: FEHLER_TEXT[fb.fehler[k]] || FEHLER_TEXT.ungueltig }));
      var inp = el.querySelector('input, button');
      if (inp) inp.setAttribute('aria-describedby', 'err-' + k);
    });
  }

  function feldBauen(f) {
    var vor = fb.vorbelegt[f.k] && fb.daten[f.k] !== undefined && fb.daten[f.k] !== '';
    var cls = 'feld' + (f.halb ? ' halb' : '') + (vor ? ' vor' : '');
    var id = 'f-' + f.k;
    var label = function (forId) {
      return h(forId ? 'label' : 'span', { class: forId ? null : 'feld-l', for: forId || null, id: forId ? null : 'l-' + f.k }, [f.l, vor ? h('span', { class: 'badge', text: 'aus Ihrer Anfrage, bitte prüfen' }) : null]);
    };
    var kinder = [];
    if (f.typ === 'hilfe') return h('p', { class: 'feld feld-hilfe', text: f.l });
    if (f.typ === 'text' || f.typ === 'date') {
      var inp = h('input', { id: id, class: 'eingabe', type: f.typ === 'date' ? 'date' : (f.input || 'text'), value: fb.daten[f.k] || '', placeholder: f.ph || null, autocomplete: f.ac || 'off', inputmode: f.im || null, maxlength: '200' });
      inp.addEventListener('input', function () { aendern(f.k, inp.value.trim()); });
      inp.addEventListener('change', function () { aendern(f.k, inp.value.trim(), true); });
      kinder = [label(id), inp];
    } else if (f.typ === 'radio') {
      var gruppe = h('div', { class: 'pills', role: 'group', 'aria-labelledby': 'l-' + f.k });
      f.opts.forEach(function (o) {
        var b = h('button', { type: 'button', class: 'pill', 'aria-pressed': fb.daten[f.k] === o ? 'true' : 'false', text: o, onclick: function () {
          aendern(f.k, o, true);
          // abhängige Felder ein-/ausblenden
          if (SCHRITTE[fb.schritt].f.some(function (x) { return x.wenn && x.wenn[0] === f.k; })) schrittZeigen(true);
          else { Array.prototype.forEach.call(gruppe.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); }); hinweiseZeichnen(); }
        } });
        gruppe.appendChild(b);
      });
      kinder = [label(null), gruppe];
    } else if (f.typ === 'check') {
      var cb = h('input', { type: 'checkbox', id: id });
      cb.checked = fb.daten[f.k] === true;
      cb.addEventListener('change', function () { aendern(f.k, cb.checked, true); hinweiseZeichnen(); });
      kinder = [label(null), h('label', { class: 'feld-check' }, [cb, f.checkText])];
    } else if (f.typ === 'upload') {
      kinder = [label(null), uploadFeld(f.art, fb.dokumente)];
    } else if (f.typ === 'kinder') {
      kinder = [label(null), listeBauen('kinder', function (kd, i, neuZeichnen) {
        var vn = h('input', { class: 'eingabe', value: kd.vorname || '', placeholder: 'Vorname', 'aria-label': 'Vorname Kind ' + (i + 1) });
        var nn = h('input', { class: 'eingabe', value: kd.nachname || '', placeholder: 'Nachname', 'aria-label': 'Nachname Kind ' + (i + 1) });
        var gb = h('input', { class: 'eingabe', type: 'date', value: kd.geburtsdatum || '', 'aria-label': 'Geburtsdatum Kind ' + (i + 1) });
        vn.addEventListener('input', function () { kd.vorname = vn.value.trim(); aendern('kinder', fb.daten.kinder); });
        nn.addEventListener('input', function () { kd.nachname = nn.value.trim(); aendern('kinder', fb.daten.kinder); });
        gb.addEventListener('change', function () { kd.geburtsdatum = gb.value; aendern('kinder', fb.daten.kinder, true); });
        return [vn, nn, gb, h('button', { type: 'button', class: 'link-btn rot', text: 'Entfernen', onclick: function () { fb.daten.kinder.splice(i, 1); aendern('kinder', fb.daten.kinder, true); neuZeichnen(); } })];
      }, function () { return { vorname: '', nachname: fb.daten.as_nachname || '', geburtsdatum: '' }; }, '+ Kind hinzufügen')];
    } else if (f.typ === 'anrechte') {
      kinder = [label(null), listeBauen('anrechte', function (an, i, neuZeichnen) {
        var art = h('select', { class: 'eingabe voll', 'aria-label': 'Art des Anrechts ' + (i + 1) }, ANRECHT_ARTEN.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
        art.value = an.art || 'gesetzlich';
        var tr = h('input', { class: 'eingabe voll', value: an.traeger || '', placeholder: 'Träger, z. B. Deutsche Rentenversicherung', 'aria-label': 'Träger' });
        var nr = h('input', { class: 'eingabe', value: an.nummer || '', placeholder: 'Versicherungsnummer (falls bekannt)', 'aria-label': 'Versicherungsnummer' });
        var inh = h('select', { class: 'eingabe', 'aria-label': 'Inhaber' }, [h('option', { value: 'ich', text: 'Ich' }), h('option', { value: 'ehepartner', text: 'Mein Ehepartner' })]);
        inh.value = an.inhaber || 'ich';
        art.addEventListener('change', function () { an.art = art.value; aendern('anrechte', fb.daten.anrechte, true); });
        tr.addEventListener('input', function () { an.traeger = tr.value.trim(); aendern('anrechte', fb.daten.anrechte); });
        nr.addEventListener('input', function () { an.nummer = nr.value.trim(); aendern('anrechte', fb.daten.anrechte); });
        inh.addEventListener('change', function () { an.inhaber = inh.value; aendern('anrechte', fb.daten.anrechte, true); });
        return [art, tr, nr, inh, h('button', { type: 'button', class: 'link-btn rot voll', text: 'Entfernen', onclick: function () { fb.daten.anrechte.splice(i, 1); aendern('anrechte', fb.daten.anrechte, true); neuZeichnen(); } })];
      }, function () { return { art: 'gesetzlich', traeger: 'Deutsche Rentenversicherung', nummer: '', inhaber: 'ich' }; }, '+ Anrecht hinzufügen')];
    }
    var el = h('div', { class: cls, 'data-feld': f.k }, kinder);
    if (f.hilfe) el.appendChild(h('p', { class: 'feld-hilfe', text: f.hilfe }));
    return el;
  }

  function listeBauen(key, zeile, neu, plusText) {
    var box = h('div', { class: 'liste' });
    function zeichne() {
      leeren(box);
      fb.daten[key].forEach(function (eintrag, i) { box.appendChild(h('div', { class: 'liste-eintrag' }, zeile(eintrag, i, zeichne))); });
      box.appendChild(h('button', { type: 'button', class: 'btn-plus', text: plusText, onclick: function () {
        fb.daten[key].push(neu());
        aendern(key, fb.daten[key], true);
        zeichne();
        var inputs = box.querySelectorAll('.liste-eintrag:last-of-type input, .liste-eintrag:last-of-type select');
        if (inputs[0]) inputs[0].focus();
      } }));
    }
    zeichne();
    return box;
  }

  var hinweisBox = null;
  function hinweiseZeichnen() {
    if (!hinweisBox) return;
    leeren(hinweisBox);
    var summary = SCHRITTE[fb.schritt].summary;
    hinweise().filter(function (x) { return summary || x.schritt === fb.schritt + 1; }).forEach(function (x) { hinweisBox.appendChild(h('div', { class: 'hinweis', text: x.text })); });
  }

  function anzeigeWert(f) {
    var v = fb.daten[f.k];
    if (f.typ === 'check') return v ? 'Ja' : 'Nein';
    if (f.typ === 'date') return de(v);
    if (f.typ === 'kinder') return (v || []).map(function (k) { return [k.vorname, k.nachname].filter(Boolean).join(' ') + (k.geburtsdatum ? ', geb. ' + de(k.geburtsdatum) : ''); }).join('; ');
    if (f.typ === 'anrechte') return (v || []).map(function (a) { var art = ANRECHT_ARTEN.filter(function (x) { return x[0] === a.art; })[0]; return (art ? art[1] : a.art) + (a.traeger ? ' – ' + a.traeger : '') + ' (' + (a.inhaber === 'ehepartner' ? 'Ehepartner' : 'ich') + ')'; }).join('; ');
    if (f.typ === 'upload') { var n = fb.dokumente.filter(function (d) { return d.art === f.art; }).length; return n ? n + ' Datei' + (n > 1 ? 'en' : '') + ' hochgeladen' : ''; }
    return v == null ? '' : String(v);
  }

  function zusammenfassung() {
    return h('div', { class: 'summary' }, SCHRITTE.slice(0, 6).map(function (s, i) {
      var zeilen = [];
      s.f.filter(function (f) { return f.typ !== 'hilfe' && sichtbar(f); }).forEach(function (f) {
        var w = anzeigeWert(f);
        zeilen.push(h('dt', { text: f.l }), h('dd', { class: w ? null : 'leer', text: w || '—' }));
      });
      return h('article', { class: 'karte' }, [
        h('div', { class: 'summary-kopf' }, [h('span', { text: s.titel }), h('button', { type: 'button', class: 'link-btn', text: 'Bearbeiten', 'aria-label': s.titel + ' bearbeiten', onclick: function () { fb.schritt = i; schrittZeigen(); } })]),
        h('dl', null, zeilen)
      ]);
    }));
  }

  function schrittZeigen(behalteScroll) {
    var s = SCHRITTE[fb.schritt];
    var y = window.pageYOffset;
    statusEl = h('span', { 'aria-live': 'polite' });
    hinweisBox = h('div');
    var balken = h('i');
    balken.style.width = Math.round(((fb.schritt + 1) / 7) * 100) + '%';
    var infoBox = h('div');
    var weiter = h('button', { type: 'button', class: 'btn', text: s.summary ? 'Angaben absenden' : 'Weiter', onclick: function () { weiterKlick(weiter); } });
    var inhalt = s.summary
      ? [zusammenfassung(), h('p', { class: 'pruefsatz' }, [h('span', { class: 'haken', 'aria-hidden': 'true', text: '✓' }), 'Frau Wagner prüft alle Angaben persönlich, bevor der Antrag erstellt wird.'])]
      : [h('div', { class: 'felder' }, s.f.filter(sichtbar).map(feldBauen))];
    zeige(h('section', null, [
      h('h1', { class: 'klein', text: 'Angaben für Ihren Scheidungsantrag' }),
      h('div', { class: 'fortschritt-kopf' }, [
        h('div', { class: 'fortschritt-text' }, [h('b', { text: 'Schritt ' + (fb.schritt + 1) + ' von 7 · ' + s.titel }), statusEl]),
        h('div', { class: 'fortschritt', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': '7', 'aria-valuenow': String(fb.schritt + 1), 'aria-label': 'Fortschritt' }, balken)
      ]),
      s.summary ? null : h('p', { class: 'klein-grau', text: 'Falls Sie etwas nicht wissen, lassen Sie das Feld einfach frei.' }),
      h('div', null, inhalt),
      hinweisBox, infoBox,
      h('div', { class: 'zeile-btns' }, [
        fb.schritt > 0 ? h('button', { type: 'button', class: 'btn zweit zurueck', text: 'Zurück', onclick: function () { speichern(); fb.schritt--; schrittZeigen(); } }) : null,
        weiter
      ]),
      h('p', { class: 'spaeter' }, h('button', { type: 'button', class: 'link-btn', text: 'Später weitermachen', onclick: function (e) { spaeter(e.currentTarget, infoBox); } }))
    ]));
    if (behalteScroll) window.scrollTo(0, y);
    speicherText();
    hinweiseZeichnen();
    feldFehlerZeigen();
  }

  function weiterKlick(knopf) {
    knopf.disabled = true;
    if (SCHRITTE[fb.schritt].summary) {
      speichern().then(function () { return api('POST', 'fragebogen', {}); }).then(function (r) {
        knopf.disabled = false;
        if (r.ok || r.error === 'already_submitted') { fragebogenFertig(); return; }
        if (r.error === 'missing_fields') {
          r.felder.forEach(function (k) { fb.fehler[k] = 'pflicht'; });
          var erster = 6;
          SCHRITTE.forEach(function (s, i) { if (s.f && s.f.some(function (f) { return r.felder.indexOf(f.k) >= 0; })) erster = Math.min(erster, i); });
          fb.schritt = erster; schrittZeigen(); return;
        }
        if (!behandle(r, function () { schrittZeigen(); })) alert('Das Absenden hat nicht geklappt. Bitte versuchen Sie es erneut.');
      });
      return;
    }
    speichern({ pruefen: true, alleFelder: true }).then(function (r) {
      knopf.disabled = false;
      if (r.error === 'missing_fields') { r.felder.forEach(function (k) { fb.fehler[k] = 'pflicht'; }); feldFehlerZeigen(); fokusErsterFehler(); return; }
      if (r.error === 'invalid_fields') { fokusErsterFehler(); return; }
      if (!r.ok) return;
      fb.schritt++;
      schrittZeigen();
    });
  }
  function fokusErsterFehler() {
    var el = document.querySelector('.feld.fehler');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    var inp = el.querySelector('input, button, select');
    if (inp) inp.focus({ preventScroll: true });
  }

  function spaeter(knopf, box) {
    knopf.disabled = true;
    speichern().then(function () { return api('POST', 'weiter'); }).then(function (r) {
      knopf.disabled = false;
      leeren(box);
      box.appendChild(h('div', { class: r.ok ? 'info-ok' : 'banner', role: 'status', text: r.ok ? 'Wir haben Ihnen einen Link an ' + (fb.daten.as_email || 'Ihre E-Mail-Adresse') + ' gesendet. Damit können Sie jederzeit genau hier weitermachen.' : 'Der Link konnte nicht gesendet werden. Ihre Angaben sind trotzdem gespeichert.' }));
    });
  }

  function fragebogenFertig() {
    zeige(h('section', { class: 'erfolg' }, [
      h('div', { class: 'erfolg-icon', 'aria-hidden': 'true', text: '✓' }),
      h('h1', { text: 'Vielen Dank, Ihre Angaben sind angekommen.' }),
      h('p', { class: 'sub', text: 'Frau Wagner prüft alles persönlich und bereitet den Scheidungsantrag vor. Sie erhalten eine E-Mail, sobald es weitergeht.' }),
      h('a', { class: 'btn', href: '/s/' + TOKEN, text: 'Zum Stand Ihres Verfahrens' })
    ]));
  }

  /* ============================================================
     A4 · Status
     ============================================================ */
  function statusStart() {
    laden();
    api('GET', 'status').then(function (j) {
      if (behandle(j, statusStart)) return;
      if (!j.ok) { linkFehler(j); return; }
      var kopf = [j.kopf.as_nachname, j.kopf.ag_nachname].filter(Boolean).join(' ./. ') + (j.kopf.az_kanzlei ? ' · Unser Zeichen ' + j.kopf.az_kanzlei : '');
      var aktion = null;
      if (j.jetzt.aktion) aktion = h('a', { class: 'btn', href: (j.status === 'mandat_angeboten' ? '/m/' : '/f/') + TOKEN, text: j.jetzt.aktion.text });
      var dokumente = [];
      var unterlagen = h('div');
      function zeichneUnterlagen(liste) {
        leeren(unterlagen);
        if (!liste.length) { unterlagen.appendChild(h('p', { class: 'alles-da' }, [h('span', { class: 'haken', 'aria-hidden': 'true', text: '✓' }), 'Es fehlt nichts. Vielen Dank.'])); return; }
        unterlagen.appendChild(h('ul', { class: 'unterlagen' }, liste.map(function (u) {
          return h('li', null, [h('span', null, [h('b', { text: u.label }), h('small', { text: 'Foto oder PDF genügt' })]), j.darf_hochladen ? uploadFeld(u.art, dokumente, function () { statusStart(); }) : null]);
        })));
      }
      zeichneUnterlagen(j.fehlende_unterlagen || []);
      var termin = j.termin ? h('article', { class: 'karte pad' }, [h('h2', { class: 'h2', text: 'Ihr Gerichtstermin' }), h('div', { class: 'termin' }, [
        h('div', { class: 'termin-tag' }, [j.termin.datum.slice(0, 2), h('small', { text: j.termin.datum.slice(3, 5) + '.' + j.termin.datum.slice(8) })]),
        h('div', null, [h('b', { text: j.termin.datum + ', ' + j.termin.uhrzeit + ' Uhr' }), h('br'), j.termin.ort])
      ])]) : null;
      zeige(h('section', null, [
        h('h1', { text: 'Ihr Verfahren' }),
        h('p', { class: 'sub', text: kopf }),
        h('article', { class: 'karte pad' }, [h('h2', { class: 'h2', text: 'Was Sie jetzt tun können' }), h('p', { text: j.jetzt.text }), aktion]),
        termin,
        j.beendet ? null : h('article', { class: 'karte pad' }, [h('h2', { class: 'h2', text: 'Fehlende Unterlagen' }), unterlagen]),
        j.zeitleiste.length ? h('article', { class: 'karte pad' }, [h('h2', { class: 'h2', text: 'So geht es Schritt für Schritt' }), h('ol', { class: 'zeitleiste' }, j.zeitleiste.map(function (z, i) {
          return h('li', { class: z.zustand, 'aria-current': z.zustand === 'aktuell' ? 'step' : null }, [
            h('span', { class: 'punkt', 'aria-hidden': 'true', text: z.zustand === 'erledigt' ? '✓' : String(i + 1) }), h('span', { class: 'linie', 'aria-hidden': 'true' }),
            h('span', { class: 'z-text' }, [h('span', { class: 'z-titel', text: z.titel }), z.text && z.zustand !== 'offen' ? h('span', { class: 'z-sub', text: z.text }) : null])
          ]);
        }))]) : null,
        h('article', { class: 'kontakt' }, [h('h2', { text: 'Haben Sie noch Fragen? Wir sind gerne für Sie da.' }), h('p', null, ['Telefon ', h('a', { href: 'tel:' + j.kontakt.telefon.replace(/\s/g, '').replace(/^0/, '+49'), text: j.kontakt.telefon }), ' · ' + j.kontakt.oeffnungszeiten, h('br'), 'E-Mail ', h('a', { href: 'mailto:' + j.kontakt.email, text: j.kontakt.email })])])
      ]));
    });
  }

  /* ---------- Start ---------- */
  if (!MODUS || !/^[A-Za-z0-9_-]{40,60}$/.test(TOKEN)) { linkFehler({ error: 'link_invalid' }); return; }
  document.title = { mandat: 'Mandat erteilen', fragebogen: 'Fragebogen', status: 'Ihr Verfahren' }[MODUS] + ' · Scheidung-Online';
  ({ mandat: mandatStart, fragebogen: fragebogenStart, status: statusStart })[MODUS]();
})();
