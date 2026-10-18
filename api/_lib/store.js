/* ============================================================
   Datenzugriff für Anfragen, Ereignisse, Übersicht, Löschnachweis
   und Login-Fehlversuche.
   Produktion: Supabase (PostgREST) mit dem service_role-Key —
   beides nur aus Umgebungsvariablen (SUPABASE_URL,
   SUPABASE_SERVICE_KEY), nie im Frontend.
   Lokal/Test: JSON-Datei, wenn SO_STORE_FILE gesetzt ist.
   Beide Stores liefern dieselben Strukturen.
   ============================================================ */
const fs = require('fs');
const crypto = require('crypto');

const STATUS = ['neu', 'in_bearbeitung', 'rueckfrage', 'mandat', 'erledigt', 'abgelehnt'];
const TYPEN = ['antrag', 'kostenrahmen', 'nachricht', 'checkliste_pdf'];
const LISTE_LIMIT = 200;

/* ---------- Zeit (Europe/Berlin) ---------- */
const TZ = 'Europe/Berlin';
function tagBerlin(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function wochentagBerlin(d) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d));
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

/* ---------- Übersicht: gemeinsamer Aggregator für beide Stores ---------- */
const KURZ = (r) => ({
  id: r.id, nummer: r.nummer, typ: r.typ, status: r.status, vorname: r.vorname || '', nachname: r.nachname || '',
  email: r.email || '', telefon: r.telefon || '', created_at: r.created_at, updated_at: r.updated_at,
  wiedervorlage: r.wiedervorlage || null
});

function uebersichtAusZeilen({ offene, letzte30, letzte5, zaehler, now, speicher }) {
  now = now ? new Date(now) : new Date();
  const heuteTag = tagBerlin(now);
  const vor48h = now.getTime() - 48 * 3600e3;
  const vor7d = now.getTime() - 7 * 864e5;
  const fristKosten = fristWerktage(now, 2).getTime();

  /* Eingänge */
  const proTag = {};
  let heute = 0, tage7 = 0;
  const nachTyp = {};
  TYPEN.forEach((t) => { nachTyp[t] = 0; });
  (letzte30 || []).forEach((r) => {
    const d = new Date(r.created_at);
    const tag = tagBerlin(d);
    proTag[tag] = (proTag[tag] || 0) + 1;
    if (tag === heuteTag) heute++;
    if (d.getTime() >= vor7d) tage7++;
    if (nachTyp[r.typ] !== undefined) nachTyp[r.typ]++;
  });
  const jeTag = [];
  for (let i = 29; i >= 0; i--) {
    const tag = tagBerlin(new Date(now.getTime() - i * 864e5));
    if (jeTag.length && jeTag[jeTag.length - 1].tag === tag) continue; // Zeitumstellung
    jeTag.push({ tag, n: proTag[tag] || 0 });
  }
  while (jeTag.length < 30) jeTag.unshift({ tag: '', n: 0 });

  /* Handlungsbedarf */
  const hb = [];
  (offene || []).forEach((r) => {
    const row = KURZ(r);
    const created = new Date(r.created_at).getTime();
    const updated = new Date(r.updated_at || r.created_at).getTime();
    let grund = null, ueberfaellig = false, faellig_heute = false;
    if (row.wiedervorlage && r.status !== 'erledigt' && r.status !== 'abgelehnt') {
      grund = 'wiedervorlage';
      faellig_heute = row.wiedervorlage === heuteTag;
      ueberfaellig = row.wiedervorlage < heuteTag;
    } else if (r.status === 'neu') {
      if (r.typ === 'checkliste_pdf') { grund = 'checkliste'; }
      else if (r.typ === 'kostenrahmen') { grund = 'neu'; ueberfaellig = created < fristKosten; }
      else { grund = 'neu'; ueberfaellig = created < vor48h; }
    } else if (r.status === 'rueckfrage') {
      grund = 'rueckfrage';
      ueberfaellig = updated < vor7d;
    }
    if (!grund) return;
    hb.push({ ...row, grund, ueberfaellig, faellig_heute });
  });
  hb.sort((a, b) => {
    const pa = a.ueberfaellig || a.faellig_heute ? 0 : 1;
    const pb = b.ueberfaellig || b.faellig_heute ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  return {
    speicher,
    zaehler,
    eingaenge: { heute, tage7, tage30: (letzte30 || []).length, nach_typ_30: nachTyp, je_tag_30: jeTag },
    handlungsbedarf: hb.slice(0, 50),
    handlungsbedarf_gesamt: hb.length,
    ueberfaellig: hb.filter((h) => h.ueberfaellig).length,
    heute_faellig: hb.filter((h) => h.faellig_heute).length,
    letzte: (letzte5 || []).slice(0, 5).map(KURZ)
  };
}

/* Zähler: gesamt/status nur für den gewählten Typ, typ immer global. */
function tallyGruppen(gruppen, typ) {
  const out = { gesamt: 0, status: {}, typ: {} };
  STATUS.forEach((s) => { out.status[s] = 0; });
  TYPEN.forEach((t) => { out.typ[t] = 0; });
  gruppen.forEach((g) => {
    const n = Number(g.n) || 0;
    if (out.typ[g.typ] !== undefined) out.typ[g.typ] += n;
    if (!typ || g.typ === typ) {
      out.gesamt += n;
      out.status[g.status] = (out.status[g.status] || 0) + n;
    }
  });
  return out;
}
function tallyZeilen(rows, typ) {
  const map = new Map();
  rows.forEach((r) => {
    const k = r.status + '|' + r.typ;
    map.set(k, (map.get(k) || 0) + 1);
  });
  return tallyGruppen([...map].map(([k, n]) => ({ status: k.split('|')[0], typ: k.split('|')[1], n })), typ);
}

/* ---------- Supabase ---------- */
function sbConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function sbRaw(path, { method = 'GET', body, prefer } = {}) {
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
  return { data: text ? JSON.parse(text) : null, headers: res.headers };
}
async function sb(path, opts) { return (await sbRaw(path, opts)).data; }

/* Trefferzahl aus "Content-Range: 0-24/3573" */
function trefferAus(headers, fallback) {
  const m = /\/(\d+|\*)$/.exec(headers.get('content-range') || '');
  return m && m[1] !== '*' ? Number(m[1]) : fallback;
}

const SEL_LISTE = 'id,nummer,typ,status,vorname,nachname,email,telefon,quelle,wiedervorlage,created_at,updated_at';
const SEL_KURZ = 'id,nummer,typ,status,vorname,nachname,email,telefon,wiedervorlage,created_at,updated_at';

/* Suchwörter: PostgREST-Sonderzeichen raus, höchstens fünf Wörter */
function suchwoerter(q) {
  return String(q || '').replace(/[%*,()"'\\]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 5);
}

const supabaseStore = {
  kind: 'supabase',
  async insertAnfrage(row) {
    const rows = await sb('so_anfragen', { method: 'POST', body: row, prefer: 'return=representation' });
    return rows[0];
  },
  async listAnfragen({ status, typ, q, limit = LISTE_LIMIT, offset = 0 } = {}) {
    const params = new URLSearchParams();
    params.set('select', SEL_LISTE);
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (status) params.set('status', 'eq.' + status);
    if (typ) params.set('typ', 'eq.' + typ);
    const words = suchwoerter(q);
    if (words.length) {
      params.set('and', '(' + words.map((w) =>
        `or(nummer.ilike.*${w}*,vorname.ilike.*${w}*,nachname.ilike.*${w}*,email.ilike.*${w}*,telefon.ilike.*${w}*)`
      ).join(',') + ')');
    }
    const { data, headers } = await sbRaw('so_anfragen?' + params.toString(), { prefer: 'count=exact' });
    return { rows: data, treffer: trefferAus(headers, offset + data.length) };
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
  async counts({ typ } = {}) {
    try {
      const gruppen = await sb('so_anfragen_zaehler?select=status,typ,n');
      return tallyGruppen(gruppen, typ);
    } catch (e) {
      console.warn('[store] Zähler-View nicht verfügbar, Fallback auf Zeilen:', e.message);
      const rows = await sb('so_anfragen?select=status,typ&limit=1000');
      return tallyZeilen(rows, typ);
    }
  },
  async uebersicht() {
    const now = new Date();
    const seit30 = new Date(now.getTime() - 30 * 864e5).toISOString();
    const [offene, letzte30, letzte5, zaehler] = await Promise.all([
      sb(`so_anfragen?select=${SEL_KURZ}&or=(status.in.(neu,rueckfrage),wiedervorlage.not.is.null)&order=created_at.asc&limit=500`),
      sb(`so_anfragen?select=${SEL_KURZ}&created_at=gte.${encodeURIComponent(seit30)}&order=created_at.desc&limit=1000`),
      sb(`so_anfragen?select=${SEL_KURZ}&order=created_at.desc&limit=5`),
      this.counts()
    ]);
    return uebersichtAusZeilen({ offene, letzte30, letzte5, zaehler, now, speicher: 'supabase' });
  },
  async addLoeschung(row) {
    await sb('so_loeschungen', { method: 'POST', body: row, prefer: 'return=minimal' });
  },
  async zaehleLoginFehler(ip, benutzer) {
    await sb('so_login_versuche', { method: 'POST', body: { ip: String(ip).slice(0, 100), benutzer: String(benutzer || '').slice(0, 80) }, prefer: 'return=minimal' });
  },
  async loginFehler10min(ip) {
    const seit = new Date(Date.now() - 10 * 60e3).toISOString();
    const { data, headers } = await sbRaw(
      'so_login_versuche?ip=eq.' + encodeURIComponent(ip) + '&zeit=gte.' + encodeURIComponent(seit) + '&select=id&limit=50',
      { prefer: 'count=exact' }
    );
    return trefferAus(headers, data.length);
  }
};

/* ---------- JSON-Datei (nur lokal) ---------- */
function fileStore(file) {
  const load = () => {
    try {
      const db = JSON.parse(fs.readFileSync(file, 'utf8'));
      db.anfragen = db.anfragen || []; db.ereignisse = db.ereignisse || []; db.loeschungen = db.loeschungen || [];
      db.seq = db.seq || 0;
      return db;
    } catch (e) { return { seq: 0, anfragen: [], ereignisse: [], loeschungen: [] }; }
  };
  const save = (db) => fs.writeFileSync(file, JSON.stringify(db, null, 1));
  const ohneInhalt = ({ daten, antrag, notizen, ...rest }) => rest;
  const passt = (a, { status, typ, words }) =>
    (!status || a.status === status) && (!typ || a.typ === typ) &&
    (!words.length || words.every((w) => [a.nummer, a.vorname, a.nachname, a.email, a.telefon].join(' ').toLowerCase().includes(w)));
  return {
    kind: 'datei',
    async insertAnfrage(row) {
      const db = load();
      db.seq += 1;
      const now = new Date().toISOString();
      const rec = {
        id: crypto.randomUUID(),
        nummer: 'SO-' + now.slice(2, 4) + '-' + String(db.seq).padStart(4, '0'),
        status: 'neu', notizen: '', antrag: {}, wiedervorlage: null,
        ...row, created_at: now, updated_at: now
      };
      db.anfragen.unshift(rec); save(db); return rec;
    },
    async listAnfragen({ status, typ, q, limit = LISTE_LIMIT, offset = 0 } = {}) {
      const words = suchwoerter(q).map((w) => w.toLowerCase());
      const gefiltert = load().anfragen
        .filter((a) => passt(a, { status, typ, words }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { rows: gefiltert.slice(offset, offset + limit).map(ohneInhalt), treffer: gefiltert.length };
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
    async listEreignisse(anfrageId) {
      return load().ereignisse.filter((e) => e.anfrage_id === anfrageId).sort((a, b) => new Date(b.zeit) - new Date(a.zeit));
    },
    async counts({ typ } = {}) { return tallyZeilen(load().anfragen, typ); },
    async uebersicht() {
      const now = new Date();
      const rows = load().anfragen.map(ohneInhalt).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const seit30 = now.getTime() - 30 * 864e5;
      return uebersichtAusZeilen({
        offene: rows.filter((r) => r.status === 'neu' || r.status === 'rueckfrage' || r.wiedervorlage),
        letzte30: rows.filter((r) => new Date(r.created_at).getTime() >= seit30),
        letzte5: rows.slice(0, 5),
        zaehler: tallyZeilen(rows),
        now, speicher: 'datei'
      });
    },
    async addLoeschung(row) {
      const db = load();
      db.loeschungen.unshift({ id: db.loeschungen.length + 1, zeit: new Date().toISOString(), ...row }); save(db);
    },
    async zaehleLoginFehler() { /* lokal: In-Memory-Sperre in login.js */ },
    async loginFehler10min() { return 0; }
  };
}

function getStore() {
  if (process.env.SO_STORE_FILE) return fileStore(process.env.SO_STORE_FILE);
  if (sbConfig()) return supabaseStore;
  return null;
}

module.exports = { getStore, STATUS, TYPEN, LISTE_LIMIT, uebersichtAusZeilen, fristWerktage, tagBerlin, suchwoerter };
