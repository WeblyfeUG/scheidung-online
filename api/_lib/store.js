/* ============================================================
   Datenzugriff (Anfragen, Ereignisse, Links, Mandate, Fragebogen,
   Dokumente, E-Mails, Termine, Vorlagen, Einstellungen, Dateien).
   Produktion: Supabase (PostgREST + Storage) mit dem service_role-
   Key — beides nur aus Umgebungsvariablen (SUPABASE_URL,
   SUPABASE_SERVICE_KEY), nie im Frontend.
   Lokal/Test: JSON-Datei, wenn SO_STORE_FILE gesetzt ist (Dateien
   daneben im Ordner "<datei>.files/").
   Beide Stores liefern dieselben Strukturen.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATUS = ['neu', 'in_pruefung', 'mandat_angeboten', 'unterschrieben', 'fragebogen_vollstaendig',
  'antrag_vorbereitung', 'eingereicht', 'termin', 'abgeschlossen', 'erstgespraech', 'abgesagt', 'widerrufen'];
const TYPEN = ['antrag', 'kostenrahmen', 'nachricht', 'checkliste_pdf'];
const LISTE_LIMIT = 200;
const BUCKET = () => process.env.SUPABASE_STORAGE_BUCKET || 'so-dokumente';

/* Tabellen mit laufender ID (bigserial) bzw. Primärschlüssel */
const TABELLEN = {
  so_ereignisse: { key: 'id', serial: true },
  so_links: { key: 'id', serial: true },
  so_mandate: { key: 'id', serial: true, unique: 'anfrage_id' },
  so_fragebogen: { key: 'id', serial: true, unique: 'anfrage_id' },
  so_dokumente: { key: 'id', serial: true },
  so_mails: { key: 'id', serial: true },
  so_termine: { key: 'id', serial: true },
  so_vorlagen: { key: 'id' },
  so_einstellungen: { key: 'key' },
  so_loeschungen: { key: 'id', serial: true }
};

/* ---------- Zeit (Europe/Berlin) ---------- */
const TZ = 'Europe/Berlin';
function tagBerlin(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function wochentagBerlin(d) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d));
}
function stundeBerlin(d) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d)) % 24;
}
/* Zeitpunkt, der n Werktage (Mo–Fr) vor now liegt — Zusage „innerhalb von zwei Werktagen“. */
function fristWerktage(now, n) {
  let t = new Date(now);
  let left = n;
  while (left > 0) {
    t = new Date(t.getTime() - 864e5);
    const wd = wochentagBerlin(t);
    if (wd >= 1 && wd <= 5) left--;
  }
  return t;
}
/* Kalenderdatum (JJJJ-MM-TT) + n Tage */
function plusTage(tag, n) {
  const [y, m, d] = tag.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/* Zähler: gesamt/status nur für den gewählten Typ, typ immer global. */
function tallyZeilen(rows, typ) {
  const out = { gesamt: 0, status: {}, typ: {} };
  STATUS.forEach((s) => { out.status[s] = 0; });
  TYPEN.forEach((t) => { out.typ[t] = 0; });
  rows.forEach((r) => {
    if (out.typ[r.typ] !== undefined) out.typ[r.typ]++;
    if (!typ || r.typ === typ) {
      out.gesamt++;
      out.status[r.status] = (out.status[r.status] || 0) + 1;
    }
  });
  return out;
}

/* Suchwörter: PostgREST-Sonderzeichen raus, höchstens fünf Wörter */
function suchwoerter(q) {
  return String(q || '').replace(/[%*,()"'\\]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 5);
}

/* Bedingung { spalte: wert | {in:[]} | {gte} | {lte} | {lt} | {is:null} | {not:wert} } für beide Stores */
function passtWhere(row, where) {
  return Object.keys(where || {}).every((k) => {
    const c = where[k];
    const v = row[k];
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      if ('in' in c) return c.in.includes(v);
      if ('is' in c) return c.is === null ? v == null : v === c.is;
      if ('not' in c) return v !== c.not;
      if ('gte' in c) return v != null && v >= c.gte;
      if ('lte' in c) return v != null && v <= c.lte;
      if ('lt' in c) return v != null && v < c.lt;
      return false;
    }
    return v === c;
  });
}
function whereParams(params, where) {
  Object.keys(where || {}).forEach((k) => {
    const c = where[k];
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      if ('in' in c) params.append(k, 'in.(' + c.in.map((x) => '"' + String(x).replace(/"/g, '') + '"').join(',') + ')');
      else if ('is' in c) params.append(k, 'is.' + (c.is === null ? 'null' : String(c.is)));
      else if ('not' in c) params.append(k, 'neq.' + c.not);
      else if ('gte' in c) params.append(k, 'gte.' + c.gte);
      else if ('lte' in c) params.append(k, 'lte.' + c.lte);
      else if ('lt' in c) params.append(k, 'lt.' + c.lt);
    } else if (typeof c === 'boolean') {
      params.append(k, 'is.' + c);
    } else {
      params.append(k, 'eq.' + c);
    }
  });
}

/* ---------- Supabase ---------- */
function sbConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function sbRaw(p, { method = 'GET', body, prefer } = {}) {
  const cfg = sbConfig();
  const headers = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(cfg.url + '/rest/v1/' + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error('supabase ' + res.status + ': ' + text.slice(0, 300));
  return { data: text ? JSON.parse(text) : null, headers: res.headers };
}
async function sb(p, opts) { return (await sbRaw(p, opts)).data; }

/* Trefferzahl aus "Content-Range: 0-24/3573" */
function trefferAus(headers, fallback) {
  const m = /\/(\d+|\*)$/.exec(headers.get('content-range') || '');
  return m && m[1] !== '*' ? Number(m[1]) : fallback;
}

const SEL_LISTE = 'id,nummer,typ,status,vorname,nachname,email,telefon,quelle,wiedervorlage,created_at,updated_at,az_kanzlei,ki,spam,spam_grund,unterschrieben_am';

const supabaseStore = {
  kind: 'supabase',
  async insertAnfrage(row) {
    const rows = await sb('so_anfragen', { method: 'POST', body: row, prefer: 'return=representation' });
    return rows[0];
  },
  async listAnfragen({ status, statusIn, typ, q, spam = false, limit = LISTE_LIMIT, offset = 0 } = {}) {
    const params = new URLSearchParams();
    params.set('select', SEL_LISTE);
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (status) params.set('status', 'eq.' + status);
    else if (statusIn && statusIn.length) params.set('status', 'in.(' + statusIn.join(',') + ')');
    if (typ) params.set('typ', 'eq.' + typ);
    params.set('spam', 'is.' + (spam ? 'true' : 'false'));
    const words = suchwoerter(q);
    if (words.length) {
      params.set('and', '(' + words.map((w) =>
        `or(nummer.ilike.*${w}*,vorname.ilike.*${w}*,nachname.ilike.*${w}*,email.ilike.*${w}*,telefon.ilike.*${w}*,az_kanzlei.ilike.*${w}*,az_gericht.ilike.*${w}*)`
      ).join(',') + ')');
    }
    const { data, headers } = await sbRaw('so_anfragen?' + params.toString(), { prefer: 'count=exact' });
    return { rows: data, treffer: trefferAus(headers, offset + data.length) };
  },
  async statusZeilen() {
    return sb('so_anfragen?select=id,status,typ,spam&limit=10000');
  },
  async getAnfrage(id) {
    const rows = await sb('so_anfragen?id=eq.' + encodeURIComponent(id) + '&limit=1');
    return rows[0] || null;
  },
  async updateAnfrage(id, patch) {
    const rows = await sb('so_anfragen?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch, prefer: 'return=representation' });
    return rows[0] || null;
  },
  async deleteAnfrage(id) {
    await sb('so_anfragen?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  },
  async addEreignis(row) {
    await sb('so_ereignisse', { method: 'POST', body: row, prefer: 'return=minimal' });
  },
  async listEreignisse(anfrageId) {
    return sb('so_ereignisse?anfrage_id=eq.' + encodeURIComponent(anfrageId) + '&order=zeit.desc&limit=300');
  },
  async counts({ typ } = {}) {
    return tallyZeilen((await this.statusZeilen()).filter((r) => !r.spam), typ);
  },
  async addLoeschung(row) {
    await sb('so_loeschungen', { method: 'POST', body: row, prefer: 'return=minimal' });
  },
  /* Zählt den Versuch und liefert atomar die Anzahl der letzten 10 Minuten (Postgres-Funktion mit Sperre je IP). */
  async loginVersuch(ip, benutzer) {
    const n = await sb('rpc/so_login_fehlversuch', { method: 'POST', body: { p_ip: String(ip).slice(0, 100), p_benutzer: String(benutzer || '').slice(0, 80) } });
    return Number(n) || 0;
  },
  async loginErfolg(ip) {
    await sb('rpc/so_login_erfolg', { method: 'POST', body: { p_ip: String(ip).slice(0, 100) } });
  },

  /* ---- generische Tabellen ---- */
  async rows(table, { where, order, limit = 500, select = '*' } = {}) {
    const params = new URLSearchParams();
    params.set('select', select);
    whereParams(params, where);
    if (order) params.set('order', order);
    params.set('limit', String(limit));
    return sb(table + '?' + params.toString());
  },
  async insert(table, row) {
    const rows = await sb(table, { method: 'POST', body: row, prefer: 'return=representation' });
    return rows[0];
  },
  async upsert(table, row, onConflict) {
    const rows = await sb(table + '?on_conflict=' + encodeURIComponent(onConflict), { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' });
    return rows[0];
  },
  async update(table, where, patch) {
    const params = new URLSearchParams();
    whereParams(params, where);
    return sb(table + '?' + params.toString(), { method: 'PATCH', body: patch, prefer: 'return=representation' });
  },
  async remove(table, where) {
    const params = new URLSearchParams();
    whereParams(params, where);
    await sb(table + '?' + params.toString(), { method: 'DELETE' });
  },

  /* ---- Dateien (Storage, privater Bucket) ---- */
  async putFile(p, buffer, mime) {
    const cfg = sbConfig();
    const res = await fetch(cfg.url + '/storage/v1/object/' + BUCKET() + '/' + p.split('/').map(encodeURIComponent).join('/'), {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': mime || 'application/octet-stream', 'x-upsert': 'true' },
      body: buffer
    });
    if (!res.ok) throw new Error('storage ' + res.status + ': ' + (await res.text()).slice(0, 200));
  },
  async readFile(p) {
    const cfg = sbConfig();
    const res = await fetch(cfg.url + '/storage/v1/object/' + BUCKET() + '/' + p.split('/').map(encodeURIComponent).join('/'), {
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key }
    });
    if (!res.ok) throw new Error('storage ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  },
  async removeFiles(paths) {
    if (!paths.length) return;
    const cfg = sbConfig();
    const res = await fetch(cfg.url + '/storage/v1/object/' + BUCKET(), {
      method: 'DELETE',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths })
    });
    if (!res.ok) throw new Error('storage ' + res.status);
  }
};

/* ---------- JSON-Datei (nur lokal) ---------- */
function fileStore(file) {
  const filesDir = file + '.files';
  const load = () => {
    let db;
    try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { db = {}; }
    db.anfragen = db.anfragen || []; db.seq = db.seq || 0; db.tabellen = db.tabellen || {}; db.ids = db.ids || {};
    // Altbestand (ereignisse/loeschungen auf oberster Ebene) übernehmen
    if (db.ereignisse) { db.tabellen.so_ereignisse = (db.tabellen.so_ereignisse || []).concat(db.ereignisse); delete db.ereignisse; }
    if (db.loeschungen) { db.tabellen.so_loeschungen = (db.tabellen.so_loeschungen || []).concat(db.loeschungen); delete db.loeschungen; }
    return db;
  };
  const save = (db) => fs.writeFileSync(file, JSON.stringify(db, null, 1));
  const tab = (db, t) => (db.tabellen[t] = db.tabellen[t] || []);
  const ohneInhalt = ({ daten, antrag, notizen, ...rest }) => rest;
  const sortiere = (rows, order) => {
    if (!order) return rows;
    const [col, dir] = order.split('.');
    return rows.slice().sort((a, b) => {
      const x = a[col], y = b[col];
      if (x === y) return 0;
      const r = x == null ? -1 : y == null ? 1 : x < y ? -1 : 1;
      return dir === 'desc' ? -r : r;
    });
  };
  const neueZeile = (db, table, row) => {
    const meta = TABELLEN[table] || { key: 'id', serial: true };
    const now = new Date().toISOString();
    const rec = Object.assign({}, row);
    if (meta.serial && rec.id == null) { db.ids[table] = (db.ids[table] || 0) + 1; rec.id = db.ids[table]; }
    if (table === 'so_ereignisse' && !rec.zeit) rec.zeit = now;
    else if (table === 'so_loeschungen' && !rec.zeit) rec.zeit = now;
    else if (!rec.created_at && table !== 'so_vorlagen' && table !== 'so_einstellungen') rec.created_at = now;
    return rec;
  };
  return {
    kind: 'datei',
    async insertAnfrage(row) {
      const db = load();
      db.seq += 1;
      const now = new Date().toISOString();
      const rec = {
        id: crypto.randomUUID(),
        nummer: 'SO-' + now.slice(2, 4) + '-' + String(db.seq).padStart(4, '0'),
        status: 'neu', notizen: '', antrag: {}, wiedervorlage: null, az_kanzlei: '', az_gericht: '', gericht: '',
        ki: null, spam: false, spam_grund: '', unterschrieben_am: null, widerruf_bis: null, fragebogen_vollstaendig_am: null,
        eingereicht_am: null, abgeschlossen_am: null, kosten: {},
        ...row, created_at: now, updated_at: now
      };
      db.anfragen.unshift(rec); save(db); return rec;
    },
    async listAnfragen({ status, statusIn, typ, q, spam = false, limit = LISTE_LIMIT, offset = 0 } = {}) {
      const words = suchwoerter(q).map((w) => w.toLowerCase());
      const gefiltert = load().anfragen
        .filter((a) => (!status || a.status === status) && (status || !statusIn || !statusIn.length || statusIn.includes(a.status)) &&
          (!typ || a.typ === typ) && !!a.spam === !!spam &&
          (!words.length || words.every((w) => [a.nummer, a.vorname, a.nachname, a.email, a.telefon, a.az_kanzlei, a.az_gericht].join(' ').toLowerCase().includes(w))))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { rows: gefiltert.slice(offset, offset + limit).map(ohneInhalt), treffer: gefiltert.length };
    },
    async statusZeilen() { return load().anfragen.map((a) => ({ id: a.id, status: a.status, typ: a.typ, spam: !!a.spam })); },
    async getAnfrage(id) { return load().anfragen.find((a) => a.id === id) || null; },
    async updateAnfrage(id, patch) {
      const db = load(); const a = db.anfragen.find((x) => x.id === id);
      if (!a) return null;
      Object.assign(a, patch, { updated_at: new Date().toISOString() }); save(db); return a;
    },
    async deleteAnfrage(id) {
      const db = load();
      db.anfragen = db.anfragen.filter((a) => a.id !== id);
      Object.keys(db.tabellen).forEach((t) => { if (t !== 'so_loeschungen') db.tabellen[t] = db.tabellen[t].filter((r) => r.anfrage_id !== id); });
      save(db);
    },
    async addEreignis(row) { await this.insert('so_ereignisse', row); },
    async listEreignisse(anfrageId) {
      return sortiere(tab(load(), 'so_ereignisse').filter((e) => e.anfrage_id === anfrageId), 'zeit.desc');
    },
    async counts({ typ } = {}) { return tallyZeilen(load().anfragen.filter((a) => !a.spam), typ); },
    async addLoeschung(row) { await this.insert('so_loeschungen', row); },
    async loginVersuch() { return 0; /* lokal: In-Memory-Sperre im Login */ },
    async loginErfolg() {},

    async rows(table, { where, order, limit = 500 } = {}) {
      const src = table === 'so_anfragen' ? load().anfragen : tab(load(), table);
      return sortiere(src.filter((r) => passtWhere(r, where)), order).slice(0, limit);
    },
    async insert(table, row) {
      const db = load();
      const rec = neueZeile(db, table, row);
      const meta = TABELLEN[table] || {};
      if (meta.unique && tab(db, table).some((r) => r[meta.unique] === rec[meta.unique])) throw new Error('duplicate ' + meta.unique);
      if (!meta.serial && tab(db, table).some((r) => r[meta.key] === rec[meta.key])) throw new Error('duplicate ' + meta.key);
      tab(db, table).push(rec); save(db); return rec;
    },
    async upsert(table, row, onConflict) {
      const db = load();
      const t = tab(db, table);
      const vorhanden = t.find((r) => r[onConflict] === row[onConflict]);
      if (vorhanden) { Object.assign(vorhanden, row); save(db); return vorhanden; }
      const rec = neueZeile(db, table, row);
      t.push(rec); save(db); return rec;
    },
    async update(table, where, patch) {
      const db = load();
      const t = tab(db, table);
      const hits = t.filter((r) => passtWhere(r, where));
      hits.forEach((r) => Object.assign(r, patch));
      save(db); return hits;
    },
    async remove(table, where) {
      const db = load();
      db.tabellen[table] = tab(db, table).filter((r) => !passtWhere(r, where));
      save(db);
    },
    async putFile(p, buffer) {
      const ziel = path.join(filesDir, p);
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, buffer);
    },
    async readFile(p) { return fs.readFileSync(path.join(filesDir, p)); },
    async removeFiles(paths) {
      paths.forEach((p) => { try { fs.unlinkSync(path.join(filesDir, p)); } catch (e) { /* schon weg */ } });
    }
  };
}

function getStore() {
  if (process.env.SO_STORE_FILE) return fileStore(process.env.SO_STORE_FILE);
  if (sbConfig()) return supabaseStore;
  return null;
}

module.exports = { getStore, STATUS, TYPEN, LISTE_LIMIT, fristWerktage, tagBerlin, wochentagBerlin, stundeBerlin, plusTage, suchwoerter, tallyZeilen };
