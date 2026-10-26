/* ============================================================
   Datei-Uploads (Mandant + Kanzlei) in Teilen: Vercel nimmt höchstens
   4,5 MB je Request an, erlaubt sind 10 MB je Datei. Der Browser sendet
   Teile ≤ 3 MB als Roh-Body (Header X-Dateiname, Content-Type = MIME),
   Query: upload=<id>&teil=<i>&teile=<n>. Der letzte Teil setzt die Datei
   zusammen, prüft Typ (Magic Bytes) und Größe und legt sie ab.
   Pfad im Bucket: <anfrage_id>/<uuid>-<dateiname>
   ============================================================ */
const crypto = require('crypto');

const MAX = 10 * 1024 * 1024;
const TEIL_MAX = 3.5 * 1024 * 1024;
const MIME_MANDANT = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
const MIME_KANZLEI = MIME_MANDANT.concat(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const ARTEN = ['heiratsurkunde', 'geburtsurkunde', 'ehevertrag', 'vollmacht_pdf', 'antrag_docx', 'antrag_pdf', 'sonstiges'];
const ARTEN_MANDANT = ['heiratsurkunde', 'geburtsurkunde', 'ehevertrag', 'sonstiges'];

function readRaw(req, max) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const teile = [];
    let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { reject(Object.assign(new Error('too_large'), { code: 'file_too_large' })); req.destroy(); } else teile.push(c); });
    req.on('end', () => resolve(Buffer.concat(teile)));
    req.on('error', reject);
  });
}

/* Inhalt passt zum angegebenen Typ? */
function typErkannt(buf) {
  if (buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1|heif)$/.test(buf.slice(8, 12).toString('latin1'))) return 'image/heic';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return '';
}

function dateiname(s) {
  const roh = (() => { try { return decodeURIComponent(String(s || '')); } catch (e) { return String(s || ''); } })();
  const n = roh.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[_.]+|_+$/g, '').slice(0, 80);
  return n || 'datei';
}

/* Nimmt einen Teil an. Rückgabe: { fertig:false } oder { fertig:true, dokument } */
async function teilAnnehmen(store, req, { anfrageId, art, quelle, von, mimeErlaubt, artenErlaubt }) {
  const url = new URL(req.url, 'http://x');
  const uploadId = url.searchParams.get('upload') || '';
  const teil = parseInt(url.searchParams.get('teil') || '0', 10);
  const teileAnz = parseInt(url.searchParams.get('teile') || '1', 10);
  const fehler = (code) => Object.assign(new Error(code), { code });
  if (!/^[a-z0-9-]{8,40}$/i.test(uploadId) || !(teileAnz >= 1 && teileAnz <= 4) || !(teil >= 0 && teil < teileAnz)) throw fehler('invalid_upload');
  if (!artenErlaubt.includes(art)) throw fehler('invalid_art');
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!mimeErlaubt.includes(mime)) throw fehler('invalid_type');
  const buf = await readRaw(req, TEIL_MAX);
  if (!buf.length) throw fehler('empty_file');
  const tmp = `${anfrageId}/tmp/${uploadId}/${teil}`;
  if (teil < teileAnz - 1) { await store.putFile(tmp, buf, mime === 'image/heif' ? 'image/heic' : mime); return { fertig: false }; }

  const teile = [];
  for (let i = 0; i < teileAnz - 1; i++) teile.push(await store.readFile(`${anfrageId}/tmp/${uploadId}/${i}`));
  teile.push(buf);
  const ganz = Buffer.concat(teile);
  const aufraeumen = () => store.removeFiles(Array.from({ length: teileAnz - 1 }, (_, i) => `${anfrageId}/tmp/${uploadId}/${i}`)).catch(() => {});
  if (ganz.length > MAX) { await aufraeumen(); throw fehler('file_too_large'); }
  const erkannt = typErkannt(ganz);
  const passt = erkannt === mime || (erkannt === 'image/heic' && mime === 'image/heif');
  if (!passt) { await aufraeumen(); throw fehler('invalid_type'); }
  const name = dateiname(req.headers['x-dateiname']);
  const pfad = `${anfrageId}/${crypto.randomUUID()}-${name}`;
  await store.putFile(pfad, ganz, erkannt);
  await aufraeumen();
  const dokument = await store.insert('so_dokumente', { anfrage_id: anfrageId, name, art, quelle, pfad, mime: erkannt, groesse: ganz.length, hochgeladen_von: von });
  await store.addEreignis({ anfrage_id: anfrageId, benutzer: von, art: 'dokument_hochgeladen', details: { art, name } });
  return { fertig: true, dokument };
}

/* Alle Storage-Pfade einer Anfrage (für Löschen) */
async function allePfade(store, anfrageId) {
  const [doks, mandate] = await Promise.all([
    store.rows('so_dokumente', { where: { anfrage_id: anfrageId }, limit: 500 }),
    store.rows('so_mandate', { where: { anfrage_id: anfrageId }, limit: 5 })
  ]);
  const pfade = doks.map((d) => d.pfad);
  mandate.forEach((m) => { if (m.unterschrift_pfad) pfade.push(m.unterschrift_pfad); if (m.pdf_pfad) pfade.push(m.pdf_pfad); });
  return [...new Set(pfade.filter(Boolean))];
}

function dokumentOeffentlich(d) {
  return { id: d.id, name: d.name, art: d.art, quelle: d.quelle, mime: d.mime, groesse: d.groesse, created_at: d.created_at };
}

module.exports = { teilAnnehmen, readRaw, typErkannt, dateiname, allePfade, dokumentOeffentlich, MIME_MANDANT, MIME_KANZLEI, ARTEN, ARTEN_MANDANT, MAX };
