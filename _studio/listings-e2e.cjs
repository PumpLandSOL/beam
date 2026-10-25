// Permissionless listings E2E: sign a listing, confirm validators price it next rounds. API=http://localhost:8294 node _studio/listings-e2e.cjs
// Run the server with BEAM_GATE=off to exercise the full path with a fresh wallet; with the gate on, expect the holding refusal instead.
'use strict';
const C = require('../shared/beam-crypto.js'), crypto = require('crypto');
const API = process.env.API || 'http://localhost:8232', GATED = process.env.GATED === '1';
const post = async (p, b) => { const r = await fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return [r.status, await r.json()]; };
const get = async (p) => (await fetch(API + p)).json(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const key = crypto.randomBytes(32).toString('hex'), addr = C.addressOf(key);
const list = (sym, cls) => { const m = ['BEAM feed listing', 'symbol: ' + sym, 'class: ' + cls, 'owner: ' + addr, 'issued: ' + Math.floor(Date.now() / 1000)].join('\n'); return post('/api/listings', { message: m, signature: C.sign('0x' + C.personal(m), key) }); };
(async () => {
  if (GATED) { const [s, r] = await list('GME', 'equity'); ok(s === 400 && /500,000 \$BEAM/.test(r.error), 'listing refused without $BEAM: ' + r.error); return done(); }
  const before = (await get('/api/feeds')).feeds.length;
  const [s1, a] = await list('GME', 'equity'); ok(s1 === 200 && a.listing.id === 'EQ:GME-USD', 'listed GME: ' + JSON.stringify(a.listing || a).slice(0, 120));
  const [s2, b] = await list('TON', 'crypto'); ok(s2 === 200 && b.listing.id === 'CS:TON-USD', 'listed TON: ' + JSON.stringify(b.listing || b).slice(0, 120));
  const [s3, c] = await list('GME', 'equity'); ok(s3 === 400 && /already/.test(c.error), 'duplicate refused: ' + c.error);
  const [s4, d] = await list('ZZZZQ', 'equity'); ok(s4 === 400, 'unknown ticker refused: ' + d.error);
  const [s5, e] = await list('BTC', 'crypto'); ok(s5 === 400 && /already/.test(e.error), 'existing feed refused: ' + e.error);
  const fd = (await get('/api/feeds')).feeds; ok(fd.length === before + 2, 'catalogue grew ' + before + ' → ' + fd.length);
  let gme, ton; for (let i = 0; i < 9 && !(gme && ton); i++) { await sleep(10000); const f = (await get('/api/feeds')).feeds; gme = f.find((x) => x.id === 'EQ:GME-USD' && x.price); ton = f.find((x) => x.id === 'CS:TON-USD' && x.price); }
  ok(!!gme, 'validators price GME: ' + (gme ? '$' + gme.price + ' from ' + gme.n + ' validators' : 'none'));
  ok(!!ton, 'validators price TON: ' + (ton ? '$' + ton.price + ' from ' + ton.n + ' validators' : 'none'));
  const se = await get('/api/season?wallet=' + addr); ok(se.me && se.me.list === 100, 'lister earned 2 × 50 Season points: ' + (se.me && se.me.list));
  done(); })();
function done() { console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0); }
