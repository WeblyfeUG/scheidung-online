/* ============================================================
   Persönliche Links für den Mandanten-Bereich (ohne Konto).
   32 Byte Zufall (base64url) — gespeichert wird nur der SHA-256-Hash,
   der Klartext steht ausschließlich in der E-Mail.
   Je Anfrage und Zweck höchstens ein aktiver Link.
   ============================================================ */
const crypto = require('crypto');

const ZWECKE = ['mandat', 'fragebogen', 'status'];
const PFAD = { mandat: '/m/', fragebogen: '/f/', status: '/s/' };
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

async function erzeugen(store, anfrageId, zweck, tage = 14) {
  if (!ZWECKE.includes(zweck)) throw new Error('zweck');
  // Status-Links bleiben alle gültig (stehen in mehreren Statusmails); Mandat/Fragebogen: nur der neueste
  if (zweck !== 'status') await store.update('so_links', { anfrage_id: anfrageId, zweck, widerrufen: false }, { widerrufen: true });
  const token = crypto.randomBytes(32).toString('base64url');
  await store.insert('so_links', {
    anfrage_id: anfrageId, token_hash: hash(token), zweck,
    gueltig_bis: new Date(Date.now() + tage * 864e5).toISOString(), widerrufen: false
  });
  return token;
}

function url(basis, zweck, token) { return basis + PFAD[zweck] + token; }

/* Prüft den Token für einen der erlaubten Zwecke. Liefert { link, anfrage } oder { fehler } */
async function pruefen(store, token, zwecke) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { fehler: 'link_invalid' };
  const rows = await store.rows('so_links', { where: { token_hash: hash(token) }, limit: 1 });
  const link = rows[0];
  if (!link || !zwecke.includes(link.zweck)) return { fehler: 'link_invalid' };
  const anfrage = await store.getAnfrage(link.anfrage_id);
  if (!anfrage) return { fehler: 'link_invalid' };
  if (link.widerrufen) return { fehler: 'link_revoked', link, anfrage };
  if (new Date(link.gueltig_bis).getTime() < Date.now()) return { fehler: 'link_expired', link, anfrage };
  store.update('so_links', { id: link.id }, { zuletzt_verwendet: new Date().toISOString() }).catch(() => {});
  return { link, anfrage };
}

/* Aktiven Link eines Zwecks verlängern statt neu erzeugen geht nicht (Klartext unbekannt) → neuer Link */
module.exports = { erzeugen, pruefen, url, hash, ZWECKE };
