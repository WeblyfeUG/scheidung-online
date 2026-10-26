/* ============================================================
   Lokaler Nachbau von Vercel für Tests (nicht deployt):
   - statische Dateien mit cleanUrls, Rewrites und Header aus vercel.json
   - api/**.js als Functions, auch dynamische Segmente ([route].js)
   - req.query, req.body (JSON geparst, sonst Roh-Stream), res.status/json/send
   Module werden je Request neu geladen.
   Aufruf: SO_STORE_FILE=… HQ_USERS=… HQ_SECRET=… node tools/devserver.js [port]
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8742);
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

/* "/m/:token" → RegExp mit Gruppen */
function muster(src) {
  const namen = [];
  const re = src.replace(/[.+?^${}()|[\]\\]/g, (c) => (c === '(' || c === ')' ? c : '\\' + c))
    .replace(/:(\w+)/g, (m, n) => { namen.push(n); return '([^/]+)'; });
  return { re: new RegExp('^' + re + '$'), namen };
}

function apiDatei(p) {
  const teile = p.replace(/^\/+/, '').split('/');
  const direkt = path.join(ROOT, ...teile) + '.js';
  if (fs.existsSync(direkt)) return { datei: direkt, query: {} };
  const dir = path.join(ROOT, ...teile.slice(0, -1));
  if (!fs.existsSync(dir)) return null;
  const dyn = fs.readdirSync(dir).find((f) => /^\[\w+\]\.js$/.test(f));
  if (!dyn) return null;
  return { datei: path.join(dir, dyn), query: { [dyn.slice(1, -4)]: teile[teile.length - 1] } };
}

function neuLaden(datei) {
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(ROOT) && !k.includes('node_modules')) delete require.cache[k]; });
  return require(datei);
}

function headerFuer(pfad, res) {
  (config.headers || []).forEach((h) => {
    const src = h.source.replace(/\(\.\*\)/g, '__ALLES__');
    const re = new RegExp('^' + src.replace(/\./g, '\\.').replace(/:(\w+)/g, '[^/]+').replace(/__ALLES__/g, '.*') + '$');
    if (re.test(pfad)) h.headers.forEach((x) => res.setHeader(x.key, x.value));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pfad = decodeURIComponent(url.pathname);

  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };

  if (pfad.startsWith('/api/')) {
    const ziel = apiDatei(pfad);
    if (!ziel) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
    req.query = Object.assign(Object.fromEntries(url.searchParams), ziel.query);
    headerFuer(pfad, res);
    const typ = String(req.headers['content-type'] || '');
    if (typ.startsWith('application/json') && req.method !== 'GET') {
      const teile = [];
      for await (const c of req) teile.push(c);
      const roh = Buffer.concat(teile).toString('utf8');
      try { req.body = roh ? JSON.parse(roh) : {}; } catch (e) { req.body = roh; }
    }
    try {
      const fn = neuLaden(ziel.datei);
      await fn(req, res);
      if (!res.writableEnded) res.end();
    } catch (e) {
      console.error('[devserver]', e);
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'devserver_exception' });
      else res.end();
    }
    return;
  }

  for (const r of config.rewrites || []) {
    const m = muster(r.source);
    const hit = m.re.exec(pfad);
    if (hit) { headerFuer(pfad, res); pfad = r.destination; break; }
  }
  headerFuer(pfad, res);
  let datei = path.join(ROOT, pfad);
  if (!datei.startsWith(ROOT)) { res.statusCode = 403; res.end(); return; }
  if (fs.existsSync(datei) && fs.statSync(datei).isDirectory()) datei = path.join(datei, 'index.html');
  if (!fs.existsSync(datei) && fs.existsSync(datei + '.html')) datei += '.html';
  if (!fs.existsSync(datei)) { res.statusCode = 404; res.end('not found'); return; }
  res.setHeader('Content-Type', MIME[path.extname(datei)] || 'application/octet-stream');
  fs.createReadStream(datei).pipe(res);
});

server.listen(PORT, () => console.log('devserver http://localhost:' + PORT));
