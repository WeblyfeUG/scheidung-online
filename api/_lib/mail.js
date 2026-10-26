/* ============================================================
   E-Mail-Versand (A1-Vorlagen) über einen transaktionalen Anbieter
   per REST. Anbieter: MAIL_PROVIDER=resend (MAIL_API_KEY) oder
   MAIL_PROVIDER=log (nur lokal/Test: nichts verlassen, als gesendet
   protokolliert). Ohne Konfiguration wird der Versuch als „fehler“
   (mail_not_configured) protokolliert — sichtbar im HQ, nie blockierend.
   Jeder Versand → Zeile in so_mails + Ereignis mail_gesendet.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vorlagenLib = require('./vorlagen');
const einstLib = require('./einstellungen');

const FARBE = { navy: '#1F3D57', text: '#172332', soft: '#49545F', line: '#DBE3E8', bg: '#FBFAF7' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function basisUrl(req) {
  if (process.env.LINK_BASE_URL) return process.env.LINK_BASE_URL.replace(/\/+$/, '');
  const host = req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  if (host) return ((req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http')) + '://' + host).replace(/\/+$/, '');
  return 'https://scheidung-online.vercel.app';
}

/* Platzhalterwerte aus Anfrage (+ Fragebogen) und Einstellungen */
function werteFuer(a, e, extra) {
  const fb = (extra && extra.fragebogen) || {};
  const vn = fb.as_vorname || a.vorname || '';
  const nn = fb.as_nachname || a.nachname || '';
  const agName = [fb.ag_vorname, fb.ag_nachname].filter(Boolean).join(' ') || ((a.daten && a.daten.ehepartner && a.daten.ehepartner.name) || '');
  return Object.assign({
    as_anrede: [vn, nn].filter(Boolean).join(' ') || 'und vielen Dank für Ihre Nachricht',
    as_name: [vn, nn].filter(Boolean).join(' '),
    as_vorname: vn, as_nachname: nn,
    ag_name: agName, ag_nachname: fb.ag_nachname || (agName.split(' ').pop() || ''),
    antwortzeit: e.antwortzeiten.anfrage, antwortzeit_kosten: e.antwortzeiten.kosten,
    oeffnungszeiten: einstLib.oeffnungszeitenText(e),
    kanzlei_telefon: e.kanzlei.telefon, kanzlei_email: e.kanzlei.email,
    link_termin: e.mail.termin_link || '',
    az_kanzlei: a.az_kanzlei || '', az_gericht: a.az_gericht || '', gericht: a.gericht || '',
    persoenlicher_text: ''
  }, extra && extra.werte);
}

function html(bloecke, e, basis, anhangName, tabelle) {
  const teile = bloecke.map((b) => {
    if (b.art === 'button') return `<p style="margin:6px 0 18px"><a href="${esc(b.href)}" style="display:inline-block;background:${FARBE.navy};color:#ffffff;font-weight:600;text-decoration:none;padding:13px 22px;border-radius:8px">${esc(b.text)}</a></p>`;
    if (b.art === 'hinweis') return `<p style="margin:0 0 14px;font-size:13.5px;color:${FARBE.soft}">${esc(b.text)}</p>`;
    if (b.art === 'tabelle') {
      return '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:4px 0 16px">' + (tabelle || []).map((z) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid ${FARBE.line};color:${FARBE.soft};font-weight:${z[2] ? 700 : 400}">${esc(z[0])}</td><td style="padding:8px 0;border-bottom:1px solid ${FARBE.line};text-align:right;white-space:nowrap;font-weight:${z[2] ? 700 : 400}">${esc(z[1])}</td></tr>`).join('') + '</table>';
    }
    return `<p style="margin:0 0 14px;white-space:pre-line">${esc(b.text)}</p>`;
  }).join('');
  const anhang = anhangName ? `<p style="margin:0 0 14px;font-size:13.5px;color:${FARBE.soft}">Anhang: ${esc(anhangName)}</p>` : '';
  return `<!doctype html><html lang="de"><body style="margin:0;padding:24px 12px;background:${FARBE.bg};font-family:Inter,Arial,sans-serif;color:${FARBE.text}">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${FARBE.line};border-radius:12px;overflow:hidden">
<div style="padding:22px 24px 16px;border-bottom:1px solid ${FARBE.line};text-align:center"><img src="${esc(basis)}/assets/logo-scheidung-online.png" alt="Scheidung-Online" height="30" style="height:30px"></div>
<div style="padding:24px 24px 8px;font-size:15.5px;line-height:1.65">${teile}${anhang}
<p style="margin:0 0 14px">Mit freundlichen Grüßen<br><b>Janine D. Wagner</b><br><span style="color:${FARBE.soft}">Rechtsanwältin · Fachanwältin für Familienrecht</span></p></div>
<div style="padding:16px 24px 20px;border-top:1px solid ${FARBE.line};font-size:12.5px;color:${FARBE.soft};line-height:1.6">${esc(e.kanzlei.name)} · ${esc(e.kanzlei.anschrift)} · ${esc(e.kanzlei.telefon)}<br>${esc(einstLib.oeffnungszeitenText(e))} · <a href="${esc(basis)}/impressum" style="color:${FARBE.soft}">Impressum</a> · <a href="${esc(basis)}/datenschutz" style="color:${FARBE.soft}">Datenschutz</a></div>
</div></body></html>`;
}

function text(bloecke, e, tabelle) {
  return bloecke.map((b) => {
    if (b.art === 'button') return b.text + ': ' + b.href;
    if (b.art === 'tabelle') return (tabelle || []).map((z) => z[0] + ': ' + z[1]).join('\n');
    return b.text;
  }).join('\n\n') + '\n\nMit freundlichen Grüßen\nJanine D. Wagner\nRechtsanwältin · Fachanwältin für Familienrecht\n\n' +
    e.kanzlei.name + ' · ' + e.kanzlei.anschrift + ' · ' + e.kanzlei.telefon + '\n' + einstLib.oeffnungszeitenText(e);
}

/* Versand über den Anbieter. Liefert { ok, provider_id, fehler } */
async function zustellen({ an, betreff, html: h, text: t, anhaenge, absender, replyTo }) {
  const provider = (process.env.MAIL_PROVIDER || '').toLowerCase();
  if (provider === 'log') {
    console.log('[mail] (log) an', an.replace(/^(.).*@/, '$1…@'), '·', betreff);
    if (process.env.SO_MAIL_DIR) {
      try {
        fs.mkdirSync(process.env.SO_MAIL_DIR, { recursive: true });
        fs.writeFileSync(path.join(process.env.SO_MAIL_DIR, Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.json'),
          JSON.stringify({ an, betreff, text: t, html: h, anhaenge: (anhaenge || []).map((x) => ({ name: x.name, groesse: x.inhalt.length })) }, null, 1));
      } catch (e) { /* nur Test */ }
    }
    return { ok: true, provider_id: 'log' };
  }
  if (provider !== 'resend' || !process.env.MAIL_API_KEY) return { ok: false, fehler: 'mail_not_configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.MAIL_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: absender, to: [an], subject: betreff, html: h, text: t,
        reply_to: replyTo || undefined,
        attachments: (anhaenge || []).map((x) => ({ filename: x.name, content: x.inhalt.toString('base64') }))
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, fehler: 'provider_' + res.status + ': ' + String(body.message || body.name || '').slice(0, 150) };
    return { ok: true, provider_id: String(body.id || '') };
  } catch (e) {
    return { ok: false, fehler: 'provider_unreachable' };
  }
}

/* Persönliche Links nach dem Versand nicht im Protokoll aufbewahren */
function maskieren(t) { return String(t || '').replace(/(\/[mfs]\/)[A-Za-z0-9_-]{20,}/g, '$1…'); }

const CHECKLISTE = path.join(__dirname, '..', '..', 'downloads', 'scheidungsunterlagen-checkliste.pdf');

/* Zentrale Funktion: Vorlage rendern, senden (oder als „geplant“ ablegen), protokollieren.
   opts: { anfrage, vorlageId, an?, werte?, fragebogen?, tabelle?, anhaenge?, benutzer, req, erzwingen?, nurEntwurf?, eigenerText? } */
async function senden(store, opts) {
  const a = opts.anfrage;
  const [vorlagen, e] = await Promise.all([vorlagenLib.laden(store), einstLib.laden(store)]);
  const v = vorlagen.find((x) => x.id === opts.vorlageId);
  if (!v) throw new Error('unbekannte Vorlage ' + opts.vorlageId);
  const basis = basisUrl(opts.req);
  const werte = werteFuer(a, e, { fragebogen: opts.fragebogen, werte: opts.werte });
  const betreff = vorlagenLib.fuellen(v.betreff, werte).replace(/\s+/g, ' ').trim();
  const quelltext = typeof opts.eigenerText === 'string' ? opts.eigenerText : v.text;
  const bl = vorlagenLib.bloecke(quelltext, werte);
  const anhaenge = (opts.anhaenge || []).slice();
  if (v.anhang === 'checkliste') {
    try { anhaenge.push({ name: 'Checkliste Scheidungsunterlagen.pdf', inhalt: fs.readFileSync(CHECKLISTE) }); }
    catch (err) { console.error('[mail] Checkliste nicht gefunden:', err.message); }
  }
  const an = String(opts.an || a.email || '').trim();
  const h = html(bl, e, basis, anhaenge.map((x) => x.name).join(', '), opts.tabelle);
  const t = text(bl, e, opts.tabelle);
  const zeile = { anfrage_id: a.id, vorlage: v.id, an, betreff, text: t, status: 'geplant', provider_id: '', fehler: '', gesendet_am: null };

  const automatisch = opts.erzwingen || v.automatisch;
  if (opts.nurEntwurf || !automatisch) {
    const m = await store.insert('so_mails', zeile);
    await store.addEreignis({ anfrage_id: a.id, benutzer: opts.benutzer || 'system', art: 'mail_geplant', details: { vorlage: v.id, betreff } });
    return { mail: m, gesendet: false };
  }
  if (!an) {
    const m = await store.insert('so_mails', Object.assign(zeile, { status: 'fehler', fehler: 'keine_empfaengeradresse' }));
    return { mail: m, gesendet: false };
  }
  const r = await zustellen({ an, betreff, html: h, text: t, anhaenge, absender: e.mail.absender, replyTo: e.kanzlei.email });
  Object.assign(zeile, r.ok ? { status: 'gesendet', provider_id: r.provider_id || '', gesendet_am: new Date().toISOString(), text: maskieren(t) } : { status: 'fehler', fehler: r.fehler || 'unbekannt' });
  const m = await store.insert('so_mails', zeile);
  await store.addEreignis({ anfrage_id: a.id, benutzer: opts.benutzer || 'system', art: r.ok ? 'mail_gesendet' : 'mail_fehler', details: { vorlage: v.id, betreff, fehler: r.ok ? undefined : zeile.fehler } });
  if (!r.ok) console.error('[mail] Versand fehlgeschlagen:', v.id, zeile.fehler);
  return { mail: m, gesendet: r.ok };
}

/* Vorschau/Entwurf: Vorlage mit gefüllten Platzhaltern; persönliche Links bleiben als {{link_…}}
   stehen (werden erst beim Senden erzeugt). Sonderzeilen [button:…] bleiben erhalten. */
async function vorschau(store, { anfrage, vorlageId, werte, fragebogen, eigenerText }) {
  const [vorlagen, e] = await Promise.all([vorlagenLib.laden(store), einstLib.laden(store)]);
  const v = vorlagen.find((x) => x.id === vorlageId);
  if (!v || v.dokument) return null;
  const links = {};
  ['link_mandat', 'link_fragebogen', 'link_status'].forEach((k) => { links[k] = '{{' + k + '}}'; });
  const w = werteFuer(anfrage, e, { fragebogen, werte: Object.assign(links, werte) });
  return {
    vorlage: v.id, name: v.name, an: anfrage.email || '',
    betreff: vorlagenLib.fuellen(v.betreff, w).replace(/\s+/g, ' ').trim(),
    text: vorlagenLib.fuellen(typeof eigenerText === 'string' ? eigenerText : v.text, w),
    automatisch: v.automatisch
  };
}

/* Bereits protokollierte Mail (Entwurf oder Fehler) erneut zustellen */
async function erneut(store, mailZeile, anfrage, benutzer, req) {
  const e = await einstLib.laden(store);
  const bl = mailZeile.text.split(/\n\s*\n/).map((p) => ({ art: 'absatz', text: p }));
  // Der gespeicherte Text enthält bereits Gruß und Fußzeile → nur als Text zustellen
  const r = await zustellen({ an: mailZeile.an, betreff: mailZeile.betreff, html: html(bl.slice(0, -2), e, basisUrl(req)), text: mailZeile.text, absender: e.mail.absender, replyTo: e.kanzlei.email });
  const patch = r.ok ? { status: 'gesendet', provider_id: r.provider_id || '', fehler: '', gesendet_am: new Date().toISOString(), text: maskieren(mailZeile.text) } : { status: 'fehler', fehler: r.fehler || 'unbekannt' };
  const [m] = await store.update('so_mails', { id: mailZeile.id }, patch);
  await store.addEreignis({ anfrage_id: anfrage.id, benutzer, art: r.ok ? 'mail_gesendet' : 'mail_fehler', details: { vorlage: mailZeile.vorlage, betreff: mailZeile.betreff, erneut: true } });
  return { mail: m || Object.assign({}, mailZeile, patch), gesendet: r.ok };
}

/* Interne Benachrichtigung an die Kanzlei (kein Protokoll in so_mails, keine Personendaten außer Nummer) */
async function intern(store, betreff, zeilen, req) {
  const e = await einstLib.laden(store);
  if (!e.mail.empfaenger_intern) return;
  const basis = basisUrl(req);
  const bl = zeilen.map((z) => ({ art: 'absatz', text: z })).concat([{ art: 'button', text: 'Im HQ öffnen', href: basis + '/hq' }]);
  const r = await zustellen({ an: e.mail.empfaenger_intern, betreff, html: html(bl, e, basis), text: zeilen.join('\n\n') + '\n\n' + basis + '/hq', absender: e.mail.absender });
  if (!r.ok) console.error('[mail] interne Benachrichtigung fehlgeschlagen:', r.fehler);
}

module.exports = { vorschau, maskieren, senden, erneut, intern, werteFuer, basisUrl, html, text, zustellen, esc };
