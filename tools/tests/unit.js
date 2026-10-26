/* KI-Einordnung (simulierte API) und Erinnerungslauf (zurückdatierte Fälle) ohne Server. Aufruf: node tools/tests/unit.js */
const os = require('os');
process.env.SO_STORE_FILE = os.tmpdir() + '/so-unit.json'; process.env.MAIL_PROVIDER = 'log'; process.env.SO_MAIL_DIR = os.tmpdir() + '/so-unit-mails';
require('fs').rmSync(process.env.SO_STORE_FILE, { force: true }); require('fs').rmSync(process.env.SO_MAIL_DIR, { recursive: true, force: true });
const R = require('path').join(__dirname, '..', '..', 'api') + '/';
const { getStore } = require(R + '_lib/store'); const ki = require(R + '_lib/ki'); const cron = require(R + 'cron/erinnerungen');
const ablauf = require(R + '_lib/ablauf');
let f = 0; const ok = (b, t) => { console.log((b ? '  ✓ ' : '  ✗ ') + t); if (!b) f++; };
(async () => {
  const store = getStore();
  const a = await store.insertAnfrage({ typ: 'antrag', vorname: 'Maria', nachname: 'Muster', email: 'maria@example.de', telefon: '0511 123', daten: { nachricht: 'Ruf mich an: 0171 1234567 oder maria@example.de', ehepartner: { name: 'Max Muster', anschrift: 'Weg 1, 30159 Hannover' }, situation: { trennung_beginn: '2025-01-01' } } });
  // KI: Pseudonymisierung
  const e = ki.eingabe(a, true);
  const s = JSON.stringify(e);
  ok(!/Maria|Muster|maria@|0171|Weg 1/.test(s), 'KI-Eingabe pseudonymisiert: ' + s.slice(0, 160));
  // KI: simulierte API
  process.env.ANTHROPIC_API_KEY = 'test';
  let gesendet = null;
  global.fetch = async (url, opt) => { gesendet = JSON.parse(opt.body); return { ok: true, json: async () => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ ampel: 'gruen', zusammenfassung: 'Einvernehmlich, Trennungsjahr erreicht.', begruendung: 'Alle Kriterien erfüllt.', punkte: ['Trennung seit 01/2025'], vorschlag: 'mandat' }) }] }) }; };
  let r = await ki.einordnen(store, a);
  ok(r.ki && r.ki.ampel === 'gruen' && (await store.getAnfrage(a.id)).ki.ampel === 'gruen', 'KI: Ergebnis gespeichert');
  ok(gesendet.output_config.format.type === 'json_schema' && gesendet.model === 'claude-opus-5-5', 'KI: Request mit JSON-Schema und Modell');
  global.fetch = async () => ({ ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ampel":"lila"}' }] }) });
  r = await ki.einordnen(store, a);
  ok(r.fehler === 'ki_invalid', 'KI: ungültige Antwort verworfen');
  global.fetch = async () => ({ ok: true, json: async () => ({ stop_reason: 'refusal', content: [] }) });
  ok((await ki.einordnen(store, a)).fehler === 'ki_refusal', 'KI: refusal behandelt');
  // Cron: Mandat vor 4 Tagen angeboten → 1. Erinnerung; nochmal → keine; nach 8 Tagen → 2.; später → keine Reaktion
  await ablauf.setStatus(store, a, 'mandat_angeboten', 'test');
  const db = () => JSON.parse(require('fs').readFileSync(process.env.SO_STORE_FILE));
  const zurueck = (tage) => { const d = db(); d.tabellen.so_ereignisse.forEach((x) => { if (x.art === 'status') x.zeit = new Date(Date.now() - tage * 864e5).toISOString(); }); (d.tabellen.so_mails || []).forEach((m) => { m.created_at = new Date(Date.now() - (tage - 1) * 864e5).toISOString(); }); require('fs').writeFileSync(process.env.SO_STORE_FILE, JSON.stringify(d)); };
  const req = { headers: { host: 'localhost' } };
  zurueck(2); ok((await cron.lauf(store, req)).erinnert === 0, 'Cron: nach 2 Tagen keine Erinnerung');
  zurueck(4); ok((await cron.lauf(store, req)).erinnert === 1, 'Cron: nach 4 Tagen 1. Erinnerung');
  ok((await cron.lauf(store, req)).erinnert === 0, 'Cron: gleicher Tag – keine doppelte Erinnerung');
  zurueck(8); ok((await cron.lauf(store, req)).erinnert === 1, 'Cron: nach 8 Tagen 2. Erinnerung');
  zurueck(11); const x = await cron.lauf(store, req); ok(x.erinnert === 0 && x.keine_reaktion === 1, 'Cron: danach Notiz „keine Reaktion“');
  ok((await cron.lauf(store, req)).keine_reaktion === 0, 'Cron: Notiz nur einmal');
  const m = require('fs').readdirSync(process.env.SO_MAIL_DIR).map((n) => JSON.parse(require('fs').readFileSync(process.env.SO_MAIL_DIR + '/' + n)));
  ok(m.filter((y) => /Es fehlt noch etwas/.test(y.betreff)).length === 2 && /Unterschrift/.test(m[0].text) && /\/m\//.test(m[0].text), 'Cron: A1.4 mit Fehlliste und Link');
  console.log(f ? f + ' FEHLER' : 'UNIT OK');
})();
