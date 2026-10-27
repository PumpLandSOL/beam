// Staking end-to-end on a local anvil: the server deploys BeamStaking itself, wallets stake $BEAM behind validators,
// the server reads stake into voting power, a jailed validator gets slashed on-chain, and unbond/withdraw honour 7 days.
// node _studio/staking-e2e.cjs   (spawns anvil on :8547)
process.env.DATA_PATH = require('os').tmpdir() + '/beam-stk-' + Date.now(); process.env.CHAIN_RPC = 'http://127.0.0.1:8547'; process.env.BEAM_STAKE_AUTO = 'off';
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', K2 = '59c6995e998f97a5a0044966f0945389dc9e5e3d7e0b2b1b3d4e2b3b0c3c9d0a';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const anvil = spawn('anvil', ['--port', '8547', '--chain-id', '4663', '--silent'], { stdio: 'ignore', shell: true }); await wait(2500);
  const V = require('../server/evm.js'), C = require('../shared/beam-crypto.js'), E = require('../server/engine.js'), ST = require('../server/staking.js');
  const w = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0'), a32 = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0'), D = 10n ** 18n;
  try {
    const me = C.addressOf(KEY), other = C.addressOf(K2);
    await V.rpc('anvil_setBalance', [other, '0x' + (10n ** 20n).toString(16)]);
    const tt = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'TestToken.sol', 'TestToken.json'), 'utf8'));
    let r = await V.receipt(await V.sendTx(KEY, { data: tt.bytecode.object + w(10n ** 9n * D) })); const token = r.contractAddress; ok(r.status === '0x1', 'test $BEAM token deployed');
    await V.receipt(await V.sendTx(KEY, { to: token, data: '0x' + V.sel('transfer(address,uint256)') + a32(other) + w(5n * 10n ** 6n * D) }));
    ST.init(E, KEY, token); await ST.deploy(); const SA = ST.stats().address; ok(/^0x[0-9a-f]{40}$/.test(SA || ''), 'server deployed BeamStaking at ' + SA);
    const vals = E.S().validators, prism = vals[0].address.toLowerCase(), zen = vals[8].address.toLowerCase(), base = E.powerOf(vals[0]);
    const stake = async (k, node, n) => { await V.receipt(await V.sendTx(k, { to: token, data: '0x' + V.sel('approve(address,uint256)') + a32(SA) + w(n * D) })); return V.receipt(await V.sendTx(k, { to: SA, data: '0x' + V.sel('stake(address,uint256)') + a32(node) + w(n * D) })); };
    ok((await stake(KEY, prism, 2000000n)).status === '0x1', 'wallet A staked 2,000,000 $BEAM to Prism');
    ok((await stake(K2, prism, 1000000n)).status === '0x1', 'wallet B staked 1,000,000 $BEAM to Prism');
    ok((await stake(K2, zen, 3000000n)).status === '0x1', 'wallet B staked 3,000,000 $BEAM to Zenith');
    await ST.refresh(); ok(Math.round(E.STAKED[prism]) === 3000000, 'server reads Prism stake = ' + Math.round(E.STAKED[prism]));
    ok(E.powerOf(vals[0]) === base + 3000000 && E.vset()[prism] === base + 3000000, 'staked $BEAM is voting power: Prism ' + base + ' → ' + E.powerOf(vals[0]));
    ok(Object.keys(ST.IDX.stakers[prism] || {}).length === 2, 'indexer found 2 stakers on Prism from Staked events');
    E.round(); ok(E.LIVE.rounds.length === 0 || E.LIVE.rounds[0].total > 9900000, 'round total power includes stake');
    const h = await ST.slash(prism, 'test: jailed'); r = await V.receipt(h); ok(r && r.status === '0x1', 'jailed validator slashed on-chain (5%)');
    await ST.refresh(); ok(Math.round(E.STAKED[prism]) === 2850000, 'Prism pool after slash = ' + Math.round(E.STAKED[prism]));
    const by = async (node, who) => Number(BigInt(await V.call(SA, '0x' + V.sel('stakedBy(address,address)') + a32(node) + a32(who))) / 10n ** 12n) / 1e6;
    ok(Math.round(await by(prism, me)) === 1900000 && Math.round(await by(prism, other)) === 950000, 'slash is pro rata: A 1.9M, B 0.95M');
    const burn = BigInt(await V.call(token, '0x70a08231' + a32('0x000000000000000000000000000000000000dEaD'))) / D; ok(burn === 150000n, 'slashed 150,000 $BEAM burned to 0xdead');
    ok((await V.receipt(await V.sendTx(KEY, { to: SA, data: '0x' + V.sel('unbond(address,uint256)') + a32(prism) + w(1000000n * D) }))).status === '0x1', 'A unbonds 1,000,000');
    await ST.refresh(); ok(Math.round(E.STAKED[prism]) === 1850000, 'unbonding stops counting as power at once (' + Math.round(E.STAKED[prism]) + ')');
    let early = false; try { const rr = await V.receipt(await V.sendTx(KEY, { to: SA, data: '0x' + V.sel('withdraw()'), gas: 300000n })); early = rr.status === '0x1'; } catch { early = false; } ok(!early, 'withdraw before 7 days reverts');
    await V.rpc('evm_increaseTime', [7 * 86400 + 5]); await V.rpc('evm_mine', []);
    const bal0 = BigInt(await V.call(token, '0x70a08231' + a32(me))); r = await V.receipt(await V.sendTx(KEY, { to: SA, data: '0x' + V.sel('withdraw()') }));
    const got = (BigInt(await V.call(token, '0x70a08231' + a32(me))) - bal0) / D; ok(r.status === '0x1' && got === 1000000n, 'withdraw after 7 days returns ' + got + ' $BEAM');
    let bad = false; try { const rr = await V.receipt(await V.sendTx(K2, { to: SA, data: '0x' + V.sel('slash(address,uint256,string)') + a32(zen) + w(500) + w(96) + w(0), gas: 300000n })); bad = rr.status === '0x1'; } catch {} ok(!bad, 'only the network key can slash');
  } catch (e) { fail++; console.error('✗', e.message); }
  console.log(`\n${pass}/${pass + fail} passed`); anvil.kill(); spawn('taskkill', ['/F', '/IM', 'anvil.exe'], { shell: true, stdio: 'ignore' }); setTimeout(() => process.exit(fail ? 1 : 0), 500);
})();
