// API end-to-end against a running BEAM (localhost:8232): wallet-signed tunnel request, packets, verification, pause.
const C = require('../shared/beam-crypto.js'), B = process.env.BEAM_URL || 'http://localhost:8232', crypto = require('crypto');
const j = async (p, b) => (await fetch(B + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {})).json();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const signP = (m, k) => C.sign('0x' + C.personal(m), k);
(async () => { const k = crypto.randomBytes(32).toString('hex'), a = C.addressOf(k), now = () => Math.floor(Date.now() / 1000);
  const st = await j('/api/status'); ok(st.round > 0 && st.validators === 9, 'network live: round ' + st.round);
  ok(Object.values(st.sources).filter((s) => s.ok).length >= 8, Object.values(st.sources).filter((s) => s.ok).length + '/10 sources healthy');
  const msg = ['BEAM tunnel request', 'name: e2e desk', 'signals: CS:BTC-USD,EQ:HOOD-USD,CM:XAU-USD', 'interval: 30', 'deviation: 10', 'receiver: ', 'owner: ' + a, 'issued: ' + now()].join('\n');
  let r = await j('/api/tunnels', { message: msg, signature: signP(msg, k) }); ok(r.tunnel && r.tunnel.owner.toLowerCase() === a, 'tunnel opened, owner = signer');
  const id = r.tunnel.id; ok((await j('/api/tunnels', { message: msg.replace('e2e desk', 'x'), signature: signP(msg, k) })).error, 'tampered request rejected');
  let pk = null; for (let i = 0; i < 10 && !pk; i++) { await new Promise((s) => setTimeout(s, 5000)); pk = (await j('/api/packets?tunnel=' + id)).packets.find((x) => x.status !== 'collecting'); }
  ok(pk && pk.ids.length === 3 && pk.sigs.length >= 9, 'first packet signed: ' + (pk && pk.sigs.length) + ' sigs');
  const v = C.verifyPacket(pk, pk.set || st.validatorSet); ok(v.quorum && v.power === v.total, 'packet verifies independently, ' + (v.power / v.total * 100) + '% stake');
  const bad = { ...pk, prices: [String(BigInt(pk.prices[0]) + 1n), ...pk.prices.slice(1)] }; ok(!C.verifyPacket(bad, pk.set || st.validatorSet).quorum, 'price changed by 1e-8 → invalid');
  const pm = 'BEAM tunnel pause #' + id + ' at ' + now(); ok((await j('/api/tunnels/toggle', { message: pm, signature: signP(pm, crypto.randomBytes(32).toString('hex')) })).error, 'stranger cannot pause');
  r = await j('/api/tunnels/toggle', { message: pm, signature: signP(pm, k) }); ok(r.tunnel && !r.tunnel.active, 'owner paused tunnel');
  const fd = await j('/api/feed/' + encodeURIComponent('CS:ETH-USD')); ok(fd.subs.length === 9 && fd.candles.length > 100, 'feed detail: 9 submissions, ' + fd.candles.length + ' candles');
  console.log(pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); })().catch((e) => { console.log('ERR', e); process.exit(1); });
