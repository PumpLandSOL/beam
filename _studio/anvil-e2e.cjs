// End-to-end on a local Robinhood-Chain-id anvil: deploy BeamReceiver with the live validator set, run real rounds
// from real exchange prices, add an open (permissionless) validator, sync it on-chain, have it co-sign a packet,
// relay that packet, read prices back, and check that tampered / under-signed / replayed packets revert.
process.env.DATA_PATH = require('os').tmpdir() + '/beam-e2e-' + Date.now(); process.env.CHAIN_ID = '4663'; process.env.BEAM_COLLECT_MS = '1500';
const URL = 'http://127.0.0.1:8546', KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const E = require('../server/engine.js'), V = require('../server/evm.js'), SRC = require('../server/sources.js'), C = require('../shared/beam-crypto.js'), fs = require('fs'), crypto = require('crypto');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (const k of SRC.SOURCES) await SRC.poll(k); E.round(); ok(Object.keys(E.LIVE.prices).length > 30, 'round priced ' + Object.keys(E.LIVE.prices).length + ' signals from ' + SRC.SOURCES.length + ' sources');
  // an open validator joins with a wallet signature + its own node key
  const nodeK = crypto.randomBytes(32).toString('hex'), ownK = crypto.randomBytes(32).toString('hex'), node = C.addressOf(nodeK).toLowerCase();
  const msg = ['BEAM validator join', 'node: ' + node, 'owner: ' + C.addressOf(ownK), 'name: anvil-open', 'kind: headless', 'issued: ' + Math.floor(Date.now() / 1000)].join('\n'), dg = '0x' + C.personal(msg);
  const j = E.joinOpen({ message: msg, ownerSig: C.sign(dg, ownK), nodeSig: C.sign(dg, nodeK) }, '127.0.0.1'); ok(j.ok, 'open validator joined permissionlessly');
  const set = E.vset(), keys = Object.keys(set).sort(); ok(keys.length === 10, 'active set = 9 genesis + 1 open');
  const art = JSON.parse(fs.readFileSync(__dirname + '/../contracts/out/BeamReceiver.sol/BeamReceiver.json'));
  let h = await V.sendTx(KEY, { data: art.bytecode.object + V.encCtor(keys, keys.map((k) => set[k])), gas: 4000000n }, URL), r = await V.receipt(h, URL);
  const rc = r.contractAddress; ok(r.status === '0x1', 'deployed BeamReceiver (10 validators) at ' + rc);
  const t = E.createTunnel({ name: 'e2e', owner: '0xabc', signals: ['CS:BTC-USD', 'CS:ETH-USD', 'EQ:TSLA-USD', 'CM:XAU-USD'], interval: 60, deviationBps: 50, receiver: rc });
  let pk = null; E.onPacket = (p) => { if (p.tunnelId === t.id) pk = p; }; E.round();
  const w = E.work(node), pend = w.packets.find((p) => p.tunnelId === t.id); ok(pend && C.packetDigest(pend) === pend.digest, 'open validator recomputed the packet digest itself');
  ok(E.signOpen({ node, tunnelId: pend.tunnelId, seq: pend.seq, sig: C.sign(pend.digest, nodeK) }).ok, 'open validator co-signed');
  await wait(2500); ok(pk && pk.sigs.length === 10 && pk.openSigners === 1, 'packet finalized with ' + (pk && pk.sigs.length) + ' signatures (1 open)');
  ok(C.verifyPacket(pk, pk.set).quorum, 'packet verifies off-chain against its validator set');
  h = await V.sendTx(KEY, { to: rc, data: V.encRelay(pk) }, URL); r = await V.receipt(h, URL); ok(r.status === '0x1', 'relay accepted on-chain, gas ' + parseInt(r.gasUsed));
  const out = await V.call(rc, V.encGetPrice('CS:BTC-USD'), URL), price = BigInt.asIntN(256, BigInt('0x' + out.slice(2, 66)));
  ok(price.toString() === pk.prices[0], 'getPrice(CS:BTC-USD) = ' + Number(price) / 1e8);
  // the contract's set grows with the open set: sync a second open validator on-chain
  const n2 = crypto.randomBytes(32).toString('hex'), s2 = { ...set, [C.addressOf(n2).toLowerCase()]: E.OPEN_POWER }, k2 = Object.keys(s2).sort();
  h = await V.sendTx(KEY, { to: rc, data: V.encSetValidators(k2, k2.map((k) => s2[k])) }, URL); r = await V.receipt(h, URL);
  const cnt = BigInt(await V.call(rc, '0x' + V.sel('validatorCount()'), URL)); ok(r.status === '0x1' && cnt === 11n, 'validator-set sync on-chain: ' + cnt + ' validators');
  const bad = async (p, m) => { const x = await V.sendTx(KEY, { to: rc, data: V.encRelay(p), gas: 900000n }, URL).then((hh) => V.receipt(hh, URL)).catch(() => ({ status: 'rejected' })); ok(x.status !== '0x1', m); };
  await bad({ ...pk, seq: pk.seq + 1, prices: [String(BigInt(pk.prices[0]) * 2n), ...pk.prices.slice(1)] }, 'tampered price rejected');
  await bad({ ...pk, seq: pk.seq + 1, sigs: pk.sigs.slice(0, 4) }, 'below 2/3 power rejected');
  await bad(pk, 'replayed packet rejected');
  console.log(pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); })().catch((e) => { console.log('ERR', e); process.exit(1); });
