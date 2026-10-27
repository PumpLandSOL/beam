// v5 end-to-end against a running BEAM (gate off): VRF (request → fulfilled next round → verified, plus on-chain
// BeamVRF.verify on a local chain-id-4663 anvil), Proof of Reserves (seed feeds live, value = direct RPC read, register
// one), TWAP + history (5m/1h/24h, signed in Beam Core packets, usable in tunnels), alerts & webhooks (SSRF guards,
// test-fire to a real HTTPS endpoint, crossing fires, Discord embed, signed attestation, auto-off after 5 failures).
// API=http://localhost:8240 node _studio/v5-e2e.cjs
process.env.DATA_PATH = require('os').tmpdir() + '/beam-v5-' + Date.now();
const C = require('../shared/beam-crypto.js'), crypto = require('crypto'), fs = require('fs'), cp = require('child_process'), path = require('path'), API = process.env.API || 'http://localhost:8232';
const V = require('../server/evm.js'), POR = require('../server/por.js'), AL = require('../server/alerts.js');
const j = async (p, b) => (await fetch(API + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {})).json();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? 'PASS' : 'FAIL', m); }, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HOOK = 'https://httpbin.org/post', HOOK500 = 'https://httpbin.org/status/500';
(async () => {
  const st = await j('/api/status'), vs = new Set((await j('/api/validators')).validators.map((v) => v.address.toLowerCase()));
  // ---------- VRF ----------
  ok((await j('/api/vrf', { seed: '' })).error, 'VRF: empty seed rejected');
  const rq = await j('/api/vrf', { seed: 'e2e-' + Date.now() }); ok(rq.id && rq.status === 'pending' && /^0x[0-9a-f]{64}$/.test(rq.seed), 'VRF: request #' + rq.id + ' accepted, pending');
  let vr = null; for (let i = 0; i < 15 && !(vr && vr.status === 'fulfilled'); i++) { await wait(2000); vr = await j('/api/vrf/' + rq.id); }
  ok(vr.status === 'fulfilled' && vr.round > rq.after, 'VRF: fulfilled in round #' + vr.round + ' (requested after #' + rq.after + ')');
  const vv = C.verifyVrf(vr, vr.set); ok(vv.quorum && vv.match && vv.signers.every((s) => vs.has(s.signer)), 'VRF: ' + vv.signers.length + ' signatures recover to validators, ' + (vv.power / vv.total * 100).toFixed(1) + '% power, randomness recomputes');
  ok(vv.alpha === vr.alpha && vr.seed === '0x' + C.keccak(rq.input), 'VRF: alpha and seed recompute independently');
  ok(!C.verifyVrf({ ...vr, seed: '0x' + '11'.repeat(32) }, vr.set).quorum, 'VRF: changed seed → signatures no longer valid');
  ok(!C.verifyVrf({ ...vr, sigs: vr.sigs.slice(0, 4), randomness: C.vrfRandomness(vr.sigs.slice(0, 4)) }, vr.set).quorum, 'VRF: 4 of 9 signatures → no quorum');
  // on-chain: BeamReceiver with the same set + BeamVRF on a chain-id-4663 anvil
  const anvilBin = path.join(require('os').homedir(), '.foundry', 'bin', process.platform === 'win32' ? 'anvil.exe' : 'anvil'), out = path.join(__dirname, '..', 'contracts', 'out');
  if (fs.existsSync(anvilBin) && fs.existsSync(path.join(out, 'BeamVRF.sol', 'BeamVRF.json'))) { const an = cp.spawn(anvilBin, ['--port', '8547', '--chain-id', '4663', '--silent'], { stdio: 'ignore' }), U = 'http://127.0.0.1:8547', KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    try { await wait(2500); const keys = Object.keys(vr.set).sort(), ra = JSON.parse(fs.readFileSync(path.join(out, 'BeamReceiver.sol', 'BeamReceiver.json'))), va = JSON.parse(fs.readFileSync(path.join(out, 'BeamVRF.sol', 'BeamVRF.json')));
      let r = await V.receipt(await V.sendTx(KEY, { data: ra.bytecode.object + V.encCtor(keys, keys.map((k) => vr.set[k])), gas: 4000000n }, U), U); const rc = r.contractAddress;
      r = await V.receipt(await V.sendTx(KEY, { data: va.bytecode.object + rc.slice(2).padStart(64, '0'), gas: 3000000n }, U), U); const vc = r.contractAddress;
      const w = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0'), dyn = (h) => { h = h.replace(/^0x/, ''); return w(h.length / 2) + h.padEnd(Math.ceil(h.length / 64) * 64, '0'); };
      const enc = (x) => { const items = x.sigs.map(dyn); let off = 32 * items.length, heads = ''; for (const it of items) { heads += w(off); off += it.length / 2; } return '0x' + V.sel('verify(uint64,bytes32,bytes32,bytes[])') + w(x.id) + x.seed.slice(2) + x.roundHash.slice(2) + w(128) + w(items.length) + heads + items.join(''); };
      const got = await V.call(vc, enc(vr), U); ok(got === vr.randomness, 'VRF on-chain: BeamVRF.verify returns the same randomness ' + got.slice(0, 14) + '…');
      const rev = await V.call(vc, enc({ ...vr, sigs: vr.sigs.slice(0, 4) }), U).then(() => false).catch(() => true); ok(rev, 'VRF on-chain: under-signed request reverts');
    } catch (e) { ok(false, 'VRF on-chain: ' + e.message); } finally { an.kill(); } } else console.log('SKIP on-chain VRF check (no anvil or contracts/out)');
  // ---------- Proof of Reserves ----------
  let pr = null; for (let i = 0; i < 10; i++) { pr = await j('/api/reserves'); if (pr.feeds.every((f) => f.live)) break; await wait(5000); }
  const sup = pr.feeds.find((f) => f.id === 'POR:BEAM-SUPPLY'), ratio = pr.feeds.find((f) => f.id === 'POR:BEAM-BURN-RATIO');
  ok(sup && sup.live && sup.live.n >= 5, 'POR: POR:BEAM-SUPPLY live = ' + (sup && sup.live && sup.live.value) + ' (' + (sup && sup.live && sup.live.n) + ' validators)');
  const direct = await POR.read(sup); ok(Math.abs(direct - sup.live.value) < 1e-6 * direct, 'POR: matches a direct totalSupply() read from Robinhood Chain (' + direct + ')');
  ok(ratio && ratio.live && ratio.live.value >= 0 && ratio.live.value <= 1, 'POR: reserve ratio feed live = ' + (ratio && ratio.live && ratio.live.value));
  const k = crypto.randomBytes(32).toString('hex'), owner = C.addressOf(k).toLowerCase(), slug = 'E2E-ETH-' + Date.now().toString(36).toUpperCase();
  const pm = (o) => ['BEAM reserve feed', 'slug: ' + slug, 'name: e2e ETH reserve', 'kind: ' + o.kind, 'token: ' + (o.token || ''), 'wallets: ' + (o.wallets || ''), 'supply: ', 'unit: ETH', 'every: 60', 'owner: ' + owner, 'issued: ' + Math.floor(Date.now() / 1000)].join('\n');
  ok(/wallet/.test((await j('/api/reserves', { message: pm({ kind: 'balance', wallets: 'nope' }), dry: true })).error || ''), 'POR: bad wallet list rejected');
  const good = pm({ kind: 'balance', wallets: '0x000000000000000000000000000000000000dEaD' }); let r = await j('/api/reserves', { message: good, signature: C.sign('0x' + C.personal(good), k) });
  ok(r.feed && r.feed.owner === owner && r.feed.id === 'POR:' + slug, 'POR: registered ' + (r.feed ? r.feed.id : r.error) + ', owner = signer');
  let live = null; for (let i = 0; i < 12 && !live; i++) { await wait(5000); live = ((await j('/api/reserves')).feeds.find((f) => f.id === 'POR:' + slug) || {}).live; } ok(live && live.n >= 5, 'POR: new feed priced by ' + (live && live.n) + ' validators = ' + (live && live.value) + ' ETH');
  ok((await j('/api/tunnel/1')).tunnel.signals.includes('POR:' + slug), 'POR: Beam Core carries the new feed');
  // ---------- TWAP & history ----------
  const tw = (await j('/api/twap')).feeds.find((f) => f.id === 'CS:BTC-USD'); ok(tw['5m'] && tw['1h'] && tw['24h'], 'TWAP: CS:BTC-USD 5m ' + (tw['5m'] && tw['5m'].value) + ' · 1h ' + (tw['1h'] && tw['1h'].value) + ' · 24h ' + (tw['24h'] && tw['24h'].value));
  const h1 = await j('/api/history?id=CS:BTC-USD&range=1h'), lo = Math.min(...h1.points.map((p) => p[1])), hi = Math.max(...h1.points.map((p) => p[1]));
  ok(h1.points.length > 10 && h1.twap['1h'] >= lo * 0.999 && h1.twap['1h'] <= hi * 1.001, 'TWAP: 1h value sits inside the 1h price range (' + h1.points.length + ' points)');
  const ht = await j('/api/history?id=' + encodeURIComponent('TWAP:CS:ETH-USD:1h') + '&range=6h'); ok(ht.points.length > 10 && ht.feed === 'CS:ETH-USD', 'TWAP: rolling-TWAP history for TWAP:CS:ETH-USD:1h, ' + ht.points.length + ' points');
  ok((await fetch(API + '/api/history?id=NOPE')).status === 404, 'TWAP: unknown feed → 404');
  let pk = null; for (let i = 0; i < 16 && !pk; i++) { pk = (await j('/api/packets?tunnel=1&limit=5')).packets.find((p) => p.ids.includes('TWAP:CS:BTC-USD:1h') && p.status !== 'collecting'); if (!pk) await wait(5000); }
  ok(pk && C.verifyPacket(pk, pk.set || st.validatorSet).quorum, 'TWAP: TWAP:CS:BTC-USD:1h inside signed Beam Core packet #' + (pk && pk.seq) + ', verifies');
  const tm = ['BEAM tunnel request', 'name: twap desk', 'signals: TWAP:EQ:TSLA-USD:1h,TWAP:CS:BTC-USD:5m', 'interval: 30', 'deviation: 10', 'receiver: ', 'owner: ' + owner, 'issued: ' + Math.floor(Date.now() / 1000)].join('\n');
  r = await j('/api/tunnels', { message: tm, signature: C.sign('0x' + C.personal(tm), k) }); ok(r.tunnel && r.tunnel.signals.length === 2, 'TWAP: a tunnel can carry TWAP feeds (#' + (r.tunnel && r.tunnel.id) + ')');
  // ---------- alerts & webhooks ----------
  const mk = (o) => j('/api/alerts', { feed: 'CS:BTC-USD', kind: 'above', value: 1, type: 'webhook', url: HOOK, cooldown: 60, ...o });
  for (const [u, m] of [['http://example.com/hook', 'plain http'], ['https://127.0.0.1/x', 'IP literal'], ['https://localhost/x', 'localhost'], ['https://metadata.google.internal/x', 'internal host'], ['https://example.com:8443/x', 'non-default port']]) ok((await mk({ url: u })).error, 'alerts: ' + m + ' webhook refused');
  ok(/Discord/.test((await mk({ type: 'discord' })).error || ''), 'alerts: a Discord alert needs a discord.com webhook URL');
  ok((await mk({ feed: 'NOPE' })).error && (await mk({ kind: 'move', value: 500 })).error, 'alerts: bad feed / bad % refused');
  const a1 = (await mk({})).alert; ok(a1 && a1.token && a1.host === 'httpbin.org', 'alerts: webhook alert #' + (a1 && a1.id) + ' created');
  let t = await j('/api/alerts/test', { id: a1.id, token: a1.token }); ok(t.ok && t.status === 200, 'alerts: test-fire delivered to ' + HOOK + ' (HTTP ' + t.status + ')');
  ok((await j('/api/alerts/test', { id: a1.id, token: 'x'.repeat(32) })).error, 'alerts: wrong token cannot fire or manage');
  const a2 = (await mk({ url: HOOK500 })).alert; let last = null; for (let i = 0; i < 5; i++) { last = await j('/api/alerts/test', { id: a2.id, token: a2.token }); await wait(3200); }
  ok(last.alert && !last.alert.active && /5 failed/.test(last.alert.disabled || ''), 'alerts: switched off after 5 failed deliveries');
  const ta = (await j('/api/alerts/toggle', { id: a2.id, token: a2.token })).alert; ok(ta.active && ta.fails === 0, 'alerts: owner can resume it');
  ok((await j('/api/alerts/delete', { id: a2.id, token: a2.token })).ok && !(await j('/api/alerts/mine', { items: [a2] })).alerts.length, 'alerts: owner deleted it');
  // engine logic with real deliveries: a crossing fires once, the cooldown holds, and the payload carries a signed report
  const E = require('../server/engine.js'), S = { }, px = { v: 90 }, sent = [];
  AL.init(S, { chainId: 4663, isFeed: () => true, price: () => ({ price: px.v, ts: Math.floor(Date.now() / 1000), round: 1 }), round: () => ({ n: 7, ts: 1, hash: '0x' + 'ab'.repeat(32), prev: '0x' + '00'.repeat(32), subs: [1, 2, 3], power: 3, total: 3 }), attest: E.attest });
  const la = (await AL.create({ feed: 'CS:BTC-USD', kind: 'above', value: 100, type: 'webhook', url: HOOK, cooldown: 60 }, 'e2e')).alert; ok(la && S.alerts.list[0].armed, 'alerts: level alert armed below the level');
  ok(AL.check() === 0, 'alerts: no fire while below'); px.v = 110; ok(AL.check() === 1, 'alerts: fires when the price crosses above'); await wait(6000);
  ok(S.alerts.list[0].fired === 1 && S.alerts.list[0].lastStatus === 200, 'alerts: crossing delivered to the webhook (HTTP ' + S.alerts.list[0].lastStatus + ')'); ok(AL.check() === 0, 'alerts: no repeat while still above');
  const body = AL.payload(S.alerts.list[0], { price: 110, ts: 1790000000 }, false), dg = '0x' + C.ethSigned(body.attestation.hash);
  ok(body.attestation.signatures.length === 9 && body.attestation.signatures.every((s) => C.recover(dg, s.sig).toLowerCase() === s.address.toLowerCase()), 'alerts: payload attestation carries 9 validator signatures that recover');
  const dc = AL.payload({ ...S.alerts.list[0], type: 'discord' }, { price: 110, ts: 1790000000 }, false); ok(dc.embeds && dc.embeds[0].title.includes('CS:BTC-USD') && dc.embeds[0].fields.length === 3, 'alerts: Discord payload is an embed');
  console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', e); process.exit(1); });
