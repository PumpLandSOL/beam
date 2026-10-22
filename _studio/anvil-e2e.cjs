// End-to-end on a local Robinhood-Chain-id anvil: deploy BeamReceiver with the live validator set, run real rounds
// from real exchange prices, relay a tunnel packet, read prices back, and check that tampered/short packets revert.
process.env.DATA_PATH = require('os').tmpdir() + '/beam-e2e-' + Date.now(); process.env.CHAIN_ID = '4663';
const URL = 'http://127.0.0.1:8546', KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const E = require('../server/engine.js'), V = require('../server/evm.js'), SRC = require('../server/sources.js'), C = require('../shared/beam-crypto.js'), fs = require('fs');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
(async () => {
  for (const k of SRC.SOURCES) await SRC.poll(k); E.round(); ok(Object.keys(E.LIVE.prices).length > 30, 'round priced ' + Object.keys(E.LIVE.prices).length + ' signals from ' + SRC.SOURCES.length + ' sources');
  const vs = E.S().validators, art = JSON.parse(fs.readFileSync(__dirname + '/../contracts/out/BeamReceiver.sol/BeamReceiver.json'));
  let h = await V.sendTx(KEY, { data: art.bytecode.object + V.encCtor(vs.map((v) => v.address), vs.map((v) => v.stake)), gas: 3000000n }, URL), r = await V.receipt(h, URL);
  const rc = r.contractAddress; ok(r.status === '0x1', 'deployed BeamReceiver at ' + rc);
  const t = E.createTunnel({ name: 'e2e', owner: '0xabc', signals: ['CS:BTC-USD', 'CS:ETH-USD', 'EQ:TSLA-USD', 'CM:XAU-USD'], interval: 60, deviationBps: 50, receiver: rc });
  let pk = null; E.onPacket = (p) => { if (p.tunnelId === t.id) pk = p; }; E.round(); ok(pk && pk.sigs.length === 9, 'tunnel packet signed by ' + (pk && pk.sigs.length) + ' validators');
  ok(C.verifyPacket(pk, E.vset()).quorum, 'packet verifies off-chain (quorum)');
  h = await V.sendTx(KEY, { to: rc, data: V.encRelay(pk) }, URL); r = await V.receipt(h, URL); ok(r.status === '0x1', 'relay accepted on-chain, gas ' + parseInt(r.gasUsed));
  const out = await V.call(rc, V.encGetPrice('CS:BTC-USD'), URL), price = BigInt.asIntN(256, BigInt('0x' + out.slice(2, 66)));
  ok(price.toString() === pk.prices[0], 'getPrice(CS:BTC-USD) = ' + Number(price) / 1e8);
  const bad = async (p, m) => { try { await V.sendTx(KEY, { to: rc, data: V.encRelay(p), gas: 500000n }, URL).then((x) => V.receipt(x, URL)).then((x) => { if (x.status === '0x1') throw 0; }); ok(true, m); } catch (e) { ok(e !== 0 && true, m + ' (' + String(e.message || e).slice(0, 40) + ')'); } };
  await bad({ ...pk, seq: pk.seq + 1, prices: [String(BigInt(pk.prices[0]) * 2n), ...pk.prices.slice(1)] }, 'tampered price rejected');
  await bad({ ...pk, seq: pk.seq + 1, sigs: pk.sigs.slice(0, 4) }, 'below 2/3 power rejected');
  await bad(pk, 'replayed packet rejected');
  console.log(pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); })().catch((e) => { console.log('ERR', e); process.exit(1); });
