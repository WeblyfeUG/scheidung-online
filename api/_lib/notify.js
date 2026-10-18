/* ============================================================
   Benachrichtigung der Kanzlei bei neuer Anfrage — per Resend-HTTP-API
   (fetch, kein npm-Paket). Konfiguration ausschließlich über
   Umgebungsvariablen:
     RESEND_API_KEY  — API-Schlüssel von resend.com
     MAIL_FROM       — Absender, Domain bei Resend verifiziert
     MAIL_TO         — Empfänger, kommagetrennt
     RESEND_API_URL  — optional, nur für Tests (Standard: Resend)
   Fehlt eine Variable, wird still übersprungen. Ein Mailfehler darf
   das Speichern der Anfrage nie scheitern lassen — notifyNeueAnfrage
   wirft deshalb nie, sondern liefert { sent, reason }.
   ============================================================ */

const HQ_URL = 'https://scheidung-online.vercel.app/hq';
const DEFAULT_API_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8000;

const TYP_LABEL = {
  antrag: 'Online-Antrag',
  kostenrahmen: 'Kostenorientierung',
  nachricht: 'Nachricht',
  checkliste_pdf: 'Checkliste (PDF)'
};

function mailConfig() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const to = (process.env.MAIL_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key || !from || to.length === 0) return null;
  return { key, from, to, url: process.env.RESEND_API_URL || DEFAULT_API_URL };
}

const s = (v, max = 500) => (v === null || v === undefined ? '' : String(v)).trim().slice(0, max);

/* ISO-Datum (aus <input type=date>) → TT.MM.JJJJ; alles andere unverändert. */
function datumDE(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(v));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s(v);
}

function zeitDE(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
}

/* Gibt die wichtigsten Formularangaben je Typ als [Label, Wert]-Paare zurück (leere Werte weggelassen). */
function formularZeilen(anfrage) {
  const d = anfrage.daten || {};
  const rows = [];
  const add = (label, value) => { const v = s(value); if (v) rows.push([label, v]); };

  if (anfrage.typ === 'antrag') {
    const sit = d.situation || {};
    const p = d.ehepartner || {};
    const k = d.kinder || {};
    const sch = d.scheidung || {};
    add('Einvernehmlich', sch.einvernehmlich);
    add('Mind. ein Jahr getrennt', sit.mindestens_ein_jahr_getrennt);
    add('Tag der Eheschließung', datumDE(sit.heiratsdatum));
    add('Getrennt lebend seit', datumDE(sit.trennung_beginn));
    add('Letzte Ehewohnung', [s(sit.ehewohnung_plz), s(sit.ehewohnung_ort)].filter(Boolean).join(' '));
    add('Ehepartner/in', p.name);
    add('Anschrift Ehepartner/in', p.anschrift);
    if (k.vorhanden === 'Ja') {
      add('Gemeinsame Kinder', k.anzahl ? `Ja, ${s(k.anzahl)}` : 'Ja');
      add('Kinder leben', k.wohnort);
    } else if (k.vorhanden) {
      add('Gemeinsame Kinder', 'Nein');
    }
    add('Nachricht', s(d.nachricht, 2000));
  } else if (anfrage.typ === 'kostenrahmen') {
    add('Nachricht', s(d.c_nachricht, 2000));
  } else if (anfrage.typ === 'nachricht') {
    add('Nachricht', s(d.nachricht, 2000));
  }
  return rows;
}

function kontaktZeilen(anfrage) {
  const rows = [];
  const name = [s(anfrage.vorname), s(anfrage.nachname)].filter(Boolean).join(' ');
  if (name) rows.push(['Name', name]);
  if (s(anfrage.email)) rows.push(['E-Mail', s(anfrage.email)]);
  if (s(anfrage.telefon)) rows.push(['Telefon', s(anfrage.telefon)]);
  return rows;
}

function block(title, rows) {
  if (!rows.length) return '';
  const w = Math.max(...rows.map(([l]) => l.length));
  return title + '\n' + rows.map(([l, v]) => `  ${l.padEnd(w)}  ${v.replace(/\r?\n/g, '\n' + ' '.repeat(w + 4))}`).join('\n') + '\n\n';
}

/* Betreff ohne sensible Daten: Nummer, Typ, Name. */
function betreff(anfrage) {
  const name = [s(anfrage.vorname), s(anfrage.nachname)].filter(Boolean).join(' ');
  return ['Neue Anfrage ' + s(anfrage.nummer), TYP_LABEL[anfrage.typ] || s(anfrage.typ), name].filter(Boolean).join(' · ');
}

function mailText(anfrage) {
  const d = anfrage.daten || {};
  const meta = d.meta || {};
  const kopf = [
    ['Nummer', s(anfrage.nummer)],
    ['Typ', TYP_LABEL[anfrage.typ] || s(anfrage.typ)],
    ['Eingang', zeitDE(anfrage.created_at || meta.gesendet_am)],
    ['Quelle', s(anfrage.quelle) || '–']
  ].filter(([, v]) => v);
  if (s(anfrage.seite)) kopf.push(['Seite', s(anfrage.seite)]);

  return 'Über die Website ist eine neue Anfrage eingegangen.\n\n' +
    block('Anfrage', kopf) +
    block('Kontakt', kontaktZeilen(anfrage)) +
    block('Angaben aus dem Formular', formularZeilen(anfrage)) +
    'Im HQ öffnen: ' + HQ_URL + '\n\n' +
    '— Diese Nachricht wurde automatisch von scheidung-online erzeugt.\n';
}

/* Baut die Resend-Nachricht (auch für Tests exportiert). */
function buildMessage(anfrage, cfg) {
  return {
    from: cfg.from,
    to: cfg.to,
    subject: betreff(anfrage),
    text: mailText(anfrage),
    ...(s(anfrage.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(anfrage.email)) ? { reply_to: s(anfrage.email) } : {})
  };
}

/* Verschickt die Benachrichtigung; wirft nie. */
async function notifyNeueAnfrage(anfrage) {
  const cfg = mailConfig();
  if (!cfg) {
    console.log('[notify] Keine Mail-Konfiguration (RESEND_API_KEY/MAIL_FROM/MAIL_TO) — Benachrichtigung übersprungen.');
    return { sent: false, reason: 'not_configured' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildMessage(anfrage, cfg)),
      signal: ctrl.signal
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[notify] Resend ' + res.status + ': ' + text.slice(0, 300));
      return { sent: false, reason: 'http_' + res.status };
    }
    let id = '';
    try { id = JSON.parse(text).id || ''; } catch (e) { /* Antwort ohne JSON — unkritisch */ }
    console.log('[notify] Benachrichtigung für ' + s(anfrage.nummer) + ' verschickt' + (id ? ' (' + id + ')' : '') + '.');
    return { sent: true, id };
  } catch (e) {
    console.error('[notify] Versand fehlgeschlagen:', e.name === 'AbortError' ? 'Timeout' : e.message);
    return { sent: false, reason: e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { notifyNeueAnfrage, buildMessage, betreff, mailText, mailConfig, TYP_LABEL, HQ_URL };
