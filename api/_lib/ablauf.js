/* ============================================================
   Statusmodell + Automatik (Abschnitt 4 und 6.3 der Übergabe).
   Jeder Statuswechsel läuft über setStatus(): Ereignis schreiben,
   Zeitstempel pflegen. E-Mails lösen die Aktionen unten aus —
   Mailfehler blockieren nie den Statuswechsel.
   ============================================================ */
const mail = require('./mail');
const links = require('./links');
const kostenLib = require('./kosten');
const { tagBerlin, plusTage } = require('./store');

const LABEL = {
  neu: 'Neu', in_pruefung: 'In Prüfung', mandat_angeboten: 'Mandat angeboten', unterschrieben: 'Unterschrieben',
  fragebogen_vollstaendig: 'Fragebogen vollständig', antrag_vorbereitung: 'Antrag in Vorbereitung', eingereicht: 'Eingereicht',
  termin: 'Termin steht', abgeschlossen: 'Abgeschlossen', erstgespraech: 'Erstgespräch', abgesagt: 'Abgesagt', widerrufen: 'Widerrufen'
};
const KETTE = ['neu', 'in_pruefung', 'mandat_angeboten', 'unterschrieben', 'fragebogen_vollstaendig', 'antrag_vorbereitung', 'eingereicht', 'termin', 'abgeschlossen'];
const AKTION = {
  neu: 'Prüfen und entscheiden', in_pruefung: 'Entscheiden: Mandat, Gespräch oder Absage', mandat_angeboten: 'Warten auf Unterschrift',
  unterschrieben: 'Warten auf Fragebogen', fragebogen_vollstaendig: 'Antrag prüfen und erstellen', antrag_vorbereitung: 'Antrag gegenlesen, über beA einreichen',
  eingereicht: 'Warten auf Gericht (Kostenvorschuss, VA-Fragebögen)', termin: 'Terminvorbereitung mit Mandant', abgeschlossen: '—',
  erstgespraech: 'Gespräch führen', abgesagt: '—', widerrufen: '—'
};
/* Ab hier gilt eine Anfrage als Akte (Modul „Akten“, Ansicht B4) */
const AKTE = ['unterschrieben', 'fragebogen_vollstaendig', 'antrag_vorbereitung', 'eingereicht', 'termin', 'abgeschlossen', 'widerrufen'];
const QUELLE = { antrag: 'Online-Antrag', kostenrahmen: 'Kostenformular', nachricht: 'Kontakt', checkliste_pdf: 'Checkliste' };

async function setStatus(store, anfrage, neu, benutzer, details) {
  if (!LABEL[neu]) throw new Error('invalid_status');
  const patch = Object.assign({}, details && details.patch);
  if (neu !== anfrage.status) patch.status = neu;
  const jetzt = new Date().toISOString();
  if (neu === 'unterschrieben' && !anfrage.unterschrieben_am) { patch.unterschrieben_am = jetzt; patch.widerruf_bis = plusTage(tagBerlin(new Date()), 14); }
  if (neu === 'fragebogen_vollstaendig' && !anfrage.fragebogen_vollstaendig_am) patch.fragebogen_vollstaendig_am = jetzt;
  if (neu === 'eingereicht') patch.eingereicht_am = jetzt;
  if (neu === 'abgeschlossen') patch.abgeschlossen_am = jetzt;
  if (!Object.keys(patch).length) return anfrage;
  const a = await store.updateAnfrage(anfrage.id, patch);
  if (neu !== anfrage.status) {
    await store.addEreignis({ anfrage_id: anfrage.id, benutzer, art: 'status', details: Object.assign({ von: anfrage.status, nach: neu }, details && details.info) });
  }
  return a;
}

async function fragebogenDaten(store, anfrageId) {
  const rows = await store.rows('so_fragebogen', { where: { anfrage_id: anfrageId }, limit: 1 });
  return rows[0] || null;
}

/* Kosten der Akte (Grundlagen aus Fragebogen/Antrag, Überschreibungen aus anfrage.kosten) */
async function kostenFuer(store, a) {
  const fb = await fragebogenDaten(store, a.id);
  return kostenLib.berechnen(kostenLib.grundlagen(a, fb && fb.daten));
}

function kostenWerte(k) {
  const f = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f0 = (n) => Math.round(Number(n)).toLocaleString('de-DE');
  return { wert_scheidung: f0(k.wert_scheidung), wert_va: f0(k.wert_va), gerichtskosten: f(k.gerichtskosten), anwaltskosten: f(k.anwaltskosten), gesamtkosten: f(k.gesamt), vorschuss: f(k.anwaltskosten) };
}

/* Persönliche Links für Platzhalter im Text erzeugen (nur beim tatsächlichen Senden) */
async function linkWerte(store, a, text, req) {
  const basis = mail.basisUrl(req);
  const w = {};
  const t = String(text || '');
  if (/\{\{\s*link_mandat\s*\}\}/.test(t)) w.link_mandat = links.url(basis, 'mandat', await links.erzeugen(store, a.id, 'mandat'));
  if (/\{\{\s*link_fragebogen\s*\}\}/.test(t)) w.link_fragebogen = links.url(basis, 'fragebogen', await links.erzeugen(store, a.id, 'fragebogen'));
  if (/\{\{\s*link_status\s*\}\}/.test(t)) w.link_status = links.url(basis, 'status', await links.erzeugen(store, a.id, 'status', 365));
  return w;
}

/* ---------- HQ-Aktionen (B3/B4) ---------- */
const AKTIONEN = ['mandat_anbieten', 'erstgespraech', 'kosten', 'absage', 'spam', 'kein_spam', 'bea', 'abgeschlossen', 'in_pruefung', 'widerrufen'];

async function aktion(store, a, art, { text, az_gericht: azG, benutzer, req, mandatFreigegeben }) {
  const persoenlich = typeof text === 'string' ? text.trim().slice(0, 4000) : '';
  const fb = await fragebogenDaten(store, a.id);
  const fbDaten = fb ? fb.daten : null;
  const basis = mail.basisUrl(req);
  let ergebnis = { anfrage: a, mail: null };

  if (art === 'mandat_anbieten') {
    if (!mandatFreigegeben) { const e = new Error('mandat_texte_fehlen'); e.code = 'mandat_texte_fehlen'; throw e; }
    if (!a.email) { const e = new Error('keine_email'); e.code = 'keine_email'; throw e; }
    const token = await links.erzeugen(store, a.id, 'mandat');
    const az = a.az_kanzlei || (a.nummer || '').replace(/^SO-/, '20');
    const neu = await setStatus(store, a, 'mandat_angeboten', benutzer, { patch: a.az_kanzlei ? {} : { az_kanzlei: az } });
    const m = await mail.senden(store, { anfrage: neu, vorlageId: 'A1.2', fragebogen: fbDaten, werte: { persoenlicher_text: persoenlich, link_mandat: links.url(basis, 'mandat', token) }, benutzer, req, erzwingen: true });
    ergebnis = { anfrage: neu, mail: m.mail };
  } else if (art === 'erstgespraech') {
    const neu = await setStatus(store, a, 'erstgespraech', benutzer);
    const m = await mail.senden(store, { anfrage: neu, vorlageId: 'A1.3', fragebogen: fbDaten, werte: { persoenlicher_text: persoenlich }, benutzer, req, erzwingen: true });
    ergebnis = { anfrage: neu, mail: m.mail };
  } else if (art === 'kosten') {
    const k = kostenLib.berechnen(kostenLib.grundlagen(a, fbDaten));
    const m = await mail.senden(store, { anfrage: a, vorlageId: 'A1.5', fragebogen: fbDaten, werte: Object.assign({ persoenlicher_text: persoenlich || 'wie gewünscht erhalten Sie eine Übersicht der voraussichtlichen Kosten.' }, kostenWerte(k)), tabelle: kostenLib.tabelle(k), benutzer, req, erzwingen: true });
    await store.addEreignis({ anfrage_id: a.id, benutzer, art: 'kosten_gesendet', details: { gesamt: k.gesamt } });
    ergebnis = { anfrage: a, mail: m.mail };
  } else if (art === 'absage') {
    const neu = await setStatus(store, a, 'abgesagt', benutzer);
    const m = await mail.senden(store, { anfrage: neu, vorlageId: 'A1.abs', fragebogen: fbDaten, werte: { persoenlicher_text: persoenlich || 'vielen Dank für Ihr Vertrauen. Leider können wir Ihre Anfrage nicht übernehmen.' }, benutzer, req, erzwingen: true });
    ergebnis = { anfrage: neu, mail: m.mail };
  } else if (art === 'spam' || art === 'kein_spam') {
    const neu = await store.updateAnfrage(a.id, { spam: art === 'spam', spam_grund: art === 'spam' ? (persoenlich || 'Manuell als Spam markiert').slice(0, 200) : '' });
    await store.addEreignis({ anfrage_id: a.id, benutzer, art, details: {} });
    ergebnis = { anfrage: neu, mail: null };
  } else if (art === 'bea') {
    const az = typeof azG === 'string' ? azG.trim().slice(0, 60) : '';
    if (!az) { const e = new Error('az_gericht_fehlt'); e.code = 'az_gericht_fehlt'; throw e; }
    const neu = await setStatus(store, a, 'eingereicht', benutzer, { patch: { az_gericht: az }, info: { az_gericht: az } });
    const token = await links.erzeugen(store, a.id, 'status', 365);
    const m = await mail.senden(store, { anfrage: neu, vorlageId: 'A1.7', fragebogen: fbDaten, werte: { gericht: neu.gericht || 'zuständigen Amtsgericht', link_status: links.url(basis, 'status', token) }, benutzer, req });
    ergebnis = { anfrage: neu, mail: m.mail };
  } else if (art === 'abgeschlossen') {
    const neu = await setStatus(store, a, 'abgeschlossen', benutzer);
    const m = await mail.senden(store, { anfrage: neu, vorlageId: 'A1.9', fragebogen: fbDaten, benutzer, req });
    ergebnis = { anfrage: neu, mail: m.mail };
  } else if (art === 'in_pruefung' || art === 'widerrufen') {
    ergebnis = { anfrage: await setStatus(store, a, art, benutzer), mail: null };
  } else {
    const e = new Error('invalid_action'); e.code = 'invalid_action'; throw e;
  }
  return ergebnis;
}

module.exports = { linkWerte, LABEL, KETTE, AKTION, AKTE, QUELLE, AKTIONEN, setStatus, aktion, fragebogenDaten, kostenFuer, kostenWerte };
