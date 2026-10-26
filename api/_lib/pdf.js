/* ============================================================
   PDF der unterschriebenen Mandatsdokumente (A2) mit pdf-lib:
   vier Dokumente, Bestätigungen, Unterschrift (PNG), Ort/Datum,
   Zeitstempel, IP-Hash, Dokumentversion.
   ============================================================ */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
/* Standardschriften kennen nur WinAnsi → alles andere ersetzen */
function sauber(s) {
  return String(s == null ? '' : s)
    .replace(/[‐-‒]/g, '-').replace(/→/g, '->').replace(/ | | /g, ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, (c) => (WIN_ANSI_EXTRA.includes(c) ? c : '?'));
}

const NAVY = rgb(0.122, 0.239, 0.341);
const TEXT = rgb(0.09, 0.137, 0.196);
const GRAU = rgb(0.286, 0.329, 0.373);

async function mandatPdf({ kanzlei, mandant, dokumente, bestaetigungen, sofortTaetig, ort, datum, zeit, ipHash, version, unterschriftPng }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Mandat – unterschriebene Dokumente');
  pdf.setAuthor(sauber(kanzlei));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4 = [595.28, 841.89];
  const RAND = 56;
  const BREITE = A4[0] - 2 * RAND;
  let seite = pdf.addPage(A4);
  let y = A4[1] - RAND;

  const neueSeite = () => { seite = pdf.addPage(A4); y = A4[1] - RAND; };
  const zeilen = (text, f, groesse) => {
    const out = [];
    sauber(text).split('\n').forEach((absatz) => {
      if (!absatz.trim()) { out.push(''); return; }
      let zeile = '';
      absatz.split(/\s+/).forEach((wort) => {
        const probe = zeile ? zeile + ' ' + wort : wort;
        if (f.widthOfTextAtSize(probe, groesse) > BREITE && zeile) { out.push(zeile); zeile = wort; }
        else zeile = probe;
      });
      out.push(zeile);
    });
    return out;
  };
  const schreibe = (text, { f = font, groesse = 10.5, farbe = TEXT, abstand = 4 } = {}) => {
    zeilen(text, f, groesse).forEach((z) => {
      if (y < RAND + groesse) neueSeite();
      if (z) seite.drawText(z, { x: RAND, y: y - groesse, size: groesse, font: f, color: farbe });
      y -= groesse * 1.45;
    });
    y -= abstand;
  };

  schreibe(kanzlei, { f: fett, groesse: 9, farbe: GRAU, abstand: 10 });
  schreibe('Mandat – unterschriebene Dokumente', { f: fett, groesse: 17, farbe: NAVY, abstand: 4 });
  schreibe('Mandant/in: ' + mandant, { groesse: 10.5, farbe: GRAU, abstand: 14 });

  dokumente.forEach((d, i) => {
    if (y < RAND + 80) neueSeite();
    schreibe('DOKUMENT ' + (i + 1), { f: fett, groesse: 8.5, farbe: GRAU, abstand: 0 });
    schreibe(d.titel, { f: fett, groesse: 12.5, farbe: NAVY, abstand: 4 });
    schreibe(d.text || 'Text folgt von der Kanzlei.', { groesse: 10.5 });
    schreibe('[x] Ich habe das Dokument gelesen und zur Kenntnis genommen.', { groesse: 9.5, farbe: GRAU, abstand: 14 });
  });

  if (y < RAND + 260) neueSeite();
  schreibe('Erklärungen', { f: fett, groesse: 12.5, farbe: NAVY });
  schreibe((sofortTaetig ? '[x] ' : '[ ] ') + 'Ich verlange ausdrücklich, dass die Kanzlei vor Ablauf der Widerrufsfrist tätig wird.', { groesse: 10 });
  schreibe('Bestätigt: ' + Object.keys(bestaetigungen).filter((k) => bestaetigungen[k]).join(', '), { groesse: 9.5, farbe: GRAU, abstand: 12 });
  schreibe(ort + ', den ' + datum, { groesse: 10.5, abstand: 6 });

  const bild = await pdf.embedPng(unterschriftPng);
  const scale = Math.min(220 / bild.width, 80 / bild.height, 1);
  const w = bild.width * scale;
  const h = bild.height * scale;
  if (y < RAND + h + 60) neueSeite();
  seite.drawImage(bild, { x: RAND, y: y - h, width: w, height: h });
  y -= h + 4;
  seite.drawLine({ start: { x: RAND, y }, end: { x: RAND + 240, y }, thickness: 0.6, color: GRAU });
  y -= 4;
  schreibe('Unterschrift ' + mandant, { groesse: 9, farbe: GRAU, abstand: 18 });
  schreibe('Elektronisch unterschrieben am ' + zeit + ' · IP-Hash ' + ipHash + ' · Dokumentversion ' + version, { groesse: 8, farbe: GRAU });

  return Buffer.from(await pdf.save());
}

module.exports = { mandatPdf, sauber };
