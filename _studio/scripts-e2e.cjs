// Oracle Scripts end-to-end against a running BEAM (gate off): publish a wallet-signed script, watch validators price it,
// find it inside a signed Beam Core packet, and check an on-demand report's signatures recover to the validator set.
// API=http://localhost:8233 node _studio/scripts-e2e.cjs
const C = require('../shared/beam-crypto.js'), crypto = require('crypto'), SCR = require('../server/scripts.js'), API = process.env.API || 'http://localhost:8232';
const j = async (p, b) => (await fetch(API + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {})).json();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? 'PASS' : 'FAIL', m); }, wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const k = crypto.randomBytes(32).toString('hex'), owner = C.addressOf(k).toLowerCase(), slug = 'E2E-' + Date.now().toString(36).toUpperCase();
  const msg = (o, extra = []) => ['BEAM oracle script', 'slug: ' + slug, 'name: E2E London temp', 'unit: °C', 'every: 60', 'source1: ' + o, 'path1: current.temperature_2m', ...extra, 'owner: ' + owner, 'issued: ' + Math.floor(Date.now() / 1000)].join('\n');
  const URL1 = 'https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.13&current=temperature_2m';
  let r = await j('/api/scripts', { message: msg('http://169.254.169.254/latest'), signature: C.sign('0x' + C.personal(msg('http://169.254.169.254/latest')), k) }); ok(/https/.test(r.error || ''), 'plain-http / metadata URL rejected: ' + r.error);
  r = await j('/api/scripts', { message: msg('https://127.0.0.1/x'), signature: C.sign('0x' + C.personal(msg('https://127.0.0.1/x')), k) }); ok(/public/.test(r.error || ''), 'private host rejected: ' + r.error);
  const m = msg(URL1); r = await j('/api/scripts', { message: m, signature: C.sign('0x' + C.personal(m), k) }); ok(r.script && r.script.owner === owner, 'script published, owner = signer: ' + (r.script ? r.script.id : r.error));
  const id = 'OS:' + slug; let live = null; for (let i = 0; i < 12 && !live; i++) { await wait(5000); live = ((await j('/api/scripts')).scripts.find((s) => s.id === id) || {}).live; }
  ok(live && live.n >= 5, 'validators priced ' + id + ' = ' + (live && live.value) + ' (' + (live && live.n) + ' signers)');
  const f = (await j('/api/feeds')).feeds.find((x) => x.id === id); ok(f && f.cls === 'script', 'appears in /api/feeds as an oracle-script feed');
  let pk = null; for (let i = 0; i < 16 && !pk; i++) { const ps = (await j('/api/packets?tunnel=1&limit=5')).packets; pk = ps.find((p) => p.ids.includes(id) && p.status !== 'collecting'); if (!pk) await wait(5000); }
  ok(pk && pk.status !== 'no-quorum', 'carried in Beam Core packet #' + (pk && pk.seq) + ' (' + (pk && pk.status) + ')');
  const q = await j('/api/scripts/request?id=' + encodeURIComponent(id)), vs = new Set((await j('/api/validators')).validators.map((v) => v.address.toLowerCase()));
  const hash = SCR.reportHash(q.chainId, id, q.ts, BigInt(q.fixed)), dg = '0x' + C.ethSigned(hash);
  ok(hash === q.hash && q.reports.every((x) => vs.has(C.recover(dg, x.sig).toLowerCase())), 'on-demand report: ' + q.reports.length + ' signatures recover to validators');
  const s = await j('/api/season?wallet=' + owner); ok(s.me && s.me.script === 50, 'publisher earned 50 Season points');
  console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
