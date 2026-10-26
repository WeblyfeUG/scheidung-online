/* ============================================================
   Kostenorientierung Scheidung (Verbund Scheidung + Versorgungs-
   ausgleich). Gebührentabellen in der seit 01.06.2025 geltenden
   Fassung (KostBRÄG 2025, BGBl. 2025 I Nr. 109):
   - § 13 Abs. 1 RVG / Anlage 2 RVG
   - § 28 Abs. 1 FamGKG / Anlage 2 FamGKG
   Werte:
   - Scheidung: 3 × gemeinsames Monatsnetto, mindestens 3.000 € (§ 43 FamGKG)
   - Versorgungsausgleich: je Anrecht 10 % des dreimonatigen gemeinsamen
     Nettoeinkommens, insgesamt mindestens 1.000 € (§ 50 Abs. 1 FamGKG)
   - Gericht: 2,0 Verfahrensgebühr (KV 1110 FamGKG) aus dem Gesamtwert
   - Anwältin: 1,3 Verfahrensgebühr (VV 3100) + 1,2 Terminsgebühr (VV 3104)
     + 20 € Auslagenpauschale (VV 7002) + 19 % USt (VV 7008)
   Unverbindliche Orientierung — Festsetzung durch das Gericht.
   ============================================================ */

/* Stufen: [bis Wert, Schrittweite, Erhöhung je angefangenem Schritt] */
const RVG = { basis: 51.5, stufen: [[2000, 500, 41.5], [10000, 1000, 59.5], [25000, 3000, 55], [50000, 5000, 86], [200000, 15000, 99.5], [500000, 30000, 140], [Infinity, 50000, 175]] };
const FAMGKG = { basis: 40, stufen: [[2000, 500, 21], [10000, 1000, 22.5], [25000, 3000, 30.5], [50000, 5000, 40.5], [200000, 15000, 140], [500000, 30000, 210], [Infinity, 50000, 210]] };
const STAND = 'Gebührentabellen RVG/FamGKG in der Fassung ab 01.06.2025';
const HINWEIS = 'Unverbindliche Orientierung nach RVG und FamGKG. Die endgültige Festsetzung nimmt das Gericht vor.';

/* Volle Gebühr (1,0) für einen Wert nach § 13 RVG bzw. § 28 FamGKG */
function gebuehr(tab, wert) {
  let g = tab.basis;
  let unten = 500;
  for (const [bis, schritt, plus] of tab.stufen) {
    if (wert <= unten) break;
    const oben = Math.min(wert, bis);
    g += Math.ceil((oben - unten) / schritt) * plus;
    unten = bis;
  }
  return Math.round(g * 100) / 100;
}

/* "2.600", "2600,50", 2600 → Zahl (Euro) */
function zahl(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v == null ? '' : v).trim().replace(/\s|€/g, '');
  if (!s) return 0;
  const norm = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const n = Number(norm.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const r2 = (n) => Math.round(n * 100) / 100;

/* eingabe: { ek_as, ek_ag, anrechte, wert_scheidung?, wert_va? } (Überschreibungen optional) */
function berechnen(eingabe) {
  const ekAs = zahl(eingabe.ek_as);
  const ekAg = zahl(eingabe.ek_ag);
  const anrechte = Math.max(0, Math.min(30, Math.round(zahl(eingabe.anrechte))));
  const dreiMonate = 3 * (ekAs + ekAg);
  const wsAuto = Math.max(3000, dreiMonate);
  const vaAuto = anrechte > 0 ? Math.max(1000, 0.1 * dreiMonate * anrechte) : 0;
  const hat = (k) => eingabe[k] !== undefined && eingabe[k] !== null && String(eingabe[k]).trim() !== '';
  const ws = hat('wert_scheidung') ? zahl(eingabe.wert_scheidung) : wsAuto;
  const va = hat('wert_va') ? zahl(eingabe.wert_va) : vaAuto;
  const gesamtwert = ws + va;
  const gerichtGebuehr = gebuehr(FAMGKG, gesamtwert);
  const anwaltGebuehr = gebuehr(RVG, gesamtwert);
  const gerichtskosten = r2(2 * gerichtGebuehr);
  const vg = r2(1.3 * anwaltGebuehr);
  const tg = r2(1.2 * anwaltGebuehr);
  const auslagen = 20;
  const netto = r2(vg + tg + auslagen);
  const ust = r2(netto * 0.19);
  const anwaltskosten = r2(netto + ust);
  return {
    ek_as: ekAs, ek_ag: ekAg, anrechte,
    wert_scheidung: r2(ws), wert_va: r2(va), wert_scheidung_auto: r2(wsAuto), wert_va_auto: r2(vaAuto),
    ueberschrieben: { wert_scheidung: hat('wert_scheidung') && r2(ws) !== r2(wsAuto), wert_va: hat('wert_va') && r2(va) !== r2(vaAuto) },
    gesamtwert: r2(gesamtwert),
    gerichtskosten, verfahrensgebuehr: vg, terminsgebuehr: tg, auslagen, ust, anwaltskosten,
    gesamt: r2(gerichtskosten + anwaltskosten),
    stand: STAND, hinweis: HINWEIS
  };
}

const eur = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const eur0 = (n) => Math.round(Number(n)).toLocaleString('de-DE') + ' €';

/* Zeilen für die Ergebnistabelle (B4-4) und die E-Mail A1.5 */
function tabelle(k) {
  return [
    ['Gegenstandswert Scheidung', eur0(k.wert_scheidung)],
    ['Gegenstandswert Versorgungsausgleich', eur0(k.wert_va)],
    ['Gerichtskosten (voraussichtlich)', eur(k.gerichtskosten)],
    ['Anwaltskosten inkl. USt (voraussichtlich)', eur(k.anwaltskosten)],
    ['Gesamt (voraussichtlich)', eur(k.gesamt), 1]
  ];
}

/* Grundlagen aus Fragebogen bzw. Online-Antrag */
function grundlagen(anfrage, fragebogen) {
  const fb = fragebogen || {};
  const erg = (anfrage.daten && anfrage.daten.ergaenzung) || {};
  const ekAs = fb.ek_as || erg.nettoeinkommen_antragsteller || '';
  const ekAg = fb.ek_ag || erg.nettoeinkommen_antragsgegner || '';
  const anrechte = Array.isArray(fb.anrechte) ? fb.anrechte.length : '';
  return Object.assign({ ek_as: ekAs, ek_ag: ekAg, anrechte }, anfrage.kosten || {});
}

module.exports = { berechnen, gebuehr, tabelle, grundlagen, zahl, eur, eur0, RVG, FAMGKG, STAND, HINWEIS };
