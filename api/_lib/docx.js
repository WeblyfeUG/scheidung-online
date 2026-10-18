/* ============================================================
   Minimaler ZIP-Leser/-Schreiber (nur was .docx braucht) +
   Platzhalter-Ersetzung in word/document.xml. Keine Abhängigkeiten.
   Die Vorlagen enthalten jeden {{platzhalter}} als einen
   zusammenhängenden Text-Lauf (so gebaut), daher reicht ein
   einfacher Textersatz.
   ============================================================ */
const zlib = require('zlib');
const { saeubern } = require('./http');

function readZip(buf) {
  // End of central directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip: kein Zentralverzeichnis');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('zip: Verzeichniseintrag ungültig');
    const method = buf.readUInt16LE(off + 10);
    const time = buf.readUInt16LE(off + 12);
    const date = buf.readUInt16LE(off + 14);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    // lokaler Header: eigene Namens-/Extra-Längen
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error('zip: Kompression ' + method + ' nicht unterstützt');
    if (data.length !== usize) throw new Error('zip: Größe stimmt nicht für ' + name);
    entries.push({ name, data, time, date });
    off += 46 + nlen + elen + clen;
  }
  return entries;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  entries.forEach((e) => {
    const name = Buffer.from(e.name, 'utf8');
    const comp = zlib.deflateRawSync(e.data, { level: 6 });
    const method = 8;
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt16LE(e.time || 0, 10); lh.writeUInt16LE(e.date || 0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10); ch.writeUInt16LE(e.time || 0, 12); ch.writeUInt16LE(e.date || 0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp);
    centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  });
  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

/* Steuerzeichen (außer Tab/LF/CR) sind in XML verboten und würden Word die Datei verweigern lassen. */
function xmlEscape(s) {
  return saeubern(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* Zeilenumbrüche im Wert werden zu Word-Umbrüchen innerhalb des Laufs. */
function xmlValue(s) {
  return String(s).split(/\r?\n/).map(xmlEscape).join('</w:t><w:br/><w:t xml:space="preserve">');
}

/* Füllt die Vorlage; fehlende Werte werden als sichtbare Lücke markiert.
   Schlüssel in `leer` (nicht zutreffende Felder) werden still durch '' ersetzt. */
function fillTemplate(templateBuf, values, { missing = '________', leer = [] } = {}) {
  const leerSet = new Set(leer);
  const entries = readZip(templateBuf);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new Error('docx: word/document.xml fehlt');
  let xml = doc.data.toString('utf8');
  const unresolved = new Set();
  xml = xml.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    const v = values[key];
    if (v === undefined || v === null || String(v).trim() === '') {
      if (leerSet.has(key)) return '';
      unresolved.add(key); return xmlEscape(missing);
    }
    return xmlValue(v);
  });
  doc.data = Buffer.from(xml, 'utf8');
  return { buffer: writeZip(entries), unresolved: [...unresolved] };
}

module.exports = { readZip, writeZip, fillTemplate };
