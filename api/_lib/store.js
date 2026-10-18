/* ============================================================
   Datenzugriff für Anfragen + Ereignisse.
   Produktion: Supabase (PostgREST) mit dem service_role-Key —
   beides nur aus Umgebungsvariablen (SUPABASE_URL,
   SUPABASE_SERVICE_KEY), nie im Frontend.
   Lokal/Test: JSON-Datei, wenn SO_STORE_FILE gesetzt ist.
   ============================================================ */
const fs = require('fs');
const crypto = require('crypto');

const STATUS = ['neu', 'in_bearbeitung', 'rueckfrage', 'mandat', 'erledigt', 'abgelehnt'];
const TYPEN = ['antrag', 'kostenrahmen', 'nachricht', 'checkliste_pdf'];

/* ---------- Supabase ---------- */
function sbConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const cfg = sbConfig();
  const headers = {
    apikey: cfg.key,
    Authorization: 'Bearer ' + cfg.key,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(cfg.url + '/rest/v1/' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error('supabase ' + res.status + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

const supabaseStore = {
  async insertAnfrage(row) {
    const rows = await sb('so_anfragen', { method: 'POST', body: row, prefer: 'return=representation' });
    return rows[0];
  },
  async listAnfragen({ status, typ, q, limit = 200 } = {}) {
    const params = new URLSearchParams();
    params.set('select', 'id,nummer,typ,status,vorname,nachname,email,telefon,quelle,created_at,updated_at');
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    if (status) params.set('status', 'eq.' + status);
    if (typ) params.set('typ', 'eq.' + typ);
    if (q) {
      const like = '*' + q.replace(/[%*,()]/g, ' ').trim() + '*';
      params.set('or', `(nummer.ilike.${like},vorname.ilike.${like},nachname.ilike.${like},email.ilike.${like},telefon.ilike.${like})`);
    }
    return sb('so_anfragen?' + params.toString());
  },
  async getAnfrage(id) {
    const rows = await sb('so_anfragen?id=eq.' + encodeURIComponent(id) + '&limit=1');
    return rows[0] || null;
  },
  async updateAnfrage(id, patch) {
    const rows = await sb('so_anfragen?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', body: patch, prefer: 'return=representation'
    });
    return rows[0] || null;
  },
  async deleteAnfrage(id) {
    await sb('so_anfragen?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  },
  async addEreignis(row) {
    await sb('so_ereignisse', { method: 'POST', body: row, prefer: 'return=minimal' });
  },
  async listEreignisse(anfrageId) {
    return sb('so_ereignisse?anfrage_id=eq.' + encodeURIComponent(anfrageId) + '&order=zeit.desc&limit=200');
  },
  async counts() {
    const rows = await sb('so_anfragen?select=status,typ');
    return tally(rows);
  }
};

/* ---------- JSON-Datei (nur lokal) ---------- */
function fileStore(file) {
  const load = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { seq: 0, anfragen: [], ereignisse: [] }; }
  };
  const save = (db) => fs.writeFileSync(file, JSON.stringify(db, null, 1));
  return {
    async insertAnfrage(row) {
      const db = load();
      db.seq += 1;
      const now = new Date().toISOString();
      const rec = {
        id: crypto.randomUUID(),
        nummer: 'SO-' + now.slice(2, 4) + '-' + String(db.seq).padStart(4, '0'),
        status: 'neu', notizen: '', antrag: {},
        ...row, created_at: now, updated_at: now
      };
      db.anfragen.unshift(rec); save(db); return rec;
    },
    async listAnfragen({ status, typ, q } = {}) {
      const needle = (q || '').toLowerCase();
      return load().anfragen.filter((a) =>
        (!status || a.status === status) && (!typ || a.typ === typ) &&
        (!needle || [a.nummer, a.vorname, a.nachname, a.email, a.telefon].join(' ').toLowerCase().includes(needle))
      ).map(({ daten, antrag, notizen, ...rest }) => rest);
    },
    async getAnfrage(id) { return load().anfragen.find((a) => a.id === id) || null; },
    async updateAnfrage(id, patch) {
      const db = load(); const a = db.anfragen.find((x) => x.id === id);
      if (!a) return null;
      Object.assign(a, patch, { updated_at: new Date().toISOString() }); save(db); return a;
    },
    async deleteAnfrage(id) {
      const db = load();
      db.anfragen = db.anfragen.filter((a) => a.id !== id);
      db.ereignisse = db.ereignisse.filter((e) => e.anfrage_id !== id);
      save(db);
    },
    async addEreignis(row) {
      const db = load();
      db.ereignisse.unshift({ id: db.ereignisse.length + 1, zeit: new Date().toISOString(), ...row }); save(db);
    },
    async listEreignisse(anfrageId) { return load().ereignisse.filter((e) => e.anfrage_id === anfrageId); },
    async counts() { return tally(load().anfragen); }
  };
}

function tally(rows) {
  const out = { gesamt: rows.length, status: {}, typ: {} };
  STATUS.forEach((s) => { out.status[s] = 0; });
  TYPEN.forEach((t) => { out.typ[t] = 0; });
  rows.forEach((r) => {
    out.status[r.status] = (out.status[r.status] || 0) + 1;
    out.typ[r.typ] = (out.typ[r.typ] || 0) + 1;
  });
  return out;
}

function getStore() {
  if (process.env.SO_STORE_FILE) return fileStore(process.env.SO_STORE_FILE);
  if (sbConfig()) return supabaseStore;
  return null;
}

module.exports = { getStore, STATUS, TYPEN };
