// BEAM staking: reads BeamStaking on Robinhood Chain. Staked $BEAM is voting power (1 token = 1 unit) for the validator it
// backs; jailed open validators are slashed on-chain; stakers and slashes are indexed from the contract's events.
'use strict';
const fs = require('fs'), path = require('path'), V = require('./evm.js'), C = require('../shared/beam-crypto.js');
const DEC = 10n ** 18n, SLASH_BPS = +process.env.BEAM_SLASH_BPS || 500, Z = '0x0000000000000000000000000000000000000000';
const w = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0'), a32 = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const tok = (hex) => { const b = BigInt(hex); return Number(b / DEC) + Number(b % DEC) / 1e18; };
const T = { staked: '0x' + C.keccak('Staked(address,address,uint256,uint256)'), unbond: '0x' + C.keccak('UnbondStarted(address,address,uint256,uint64)'), slashed: '0x' + C.keccak('Slashed(address,uint256,uint256,string)') };
let E, S, KEY, TOKEN, stats = { state: 'idle', error: null, tx: null, synced: null }; const IDX = { from: 0, stakers: {}, events: [] }; // stakers[node][wallet] = net staked

function init(engine, key, token) { E = engine; S = E.S(); KEY = key; TOKEN = token; S.staking = S.staking || { address: (process.env.BEAM_STAKING || '').toLowerCase() || null, block: 0, slashes: [] };
  E.onJail = (o) => slash(o.address, 'jailed: ' + (o.jails || 1) + ' jail(s), price deviation > 1.5% in 5 of 200 rounds').catch(() => {});
  if (process.env.BEAM_STAKE_AUTO === 'off') return; setTimeout(deploy, 25000); setTimeout(refresh, 8000); setInterval(refresh, +process.env.BEAM_STAKE_MS || 60000); }
const addr = () => S.staking.address;
async function deploy() { if (!KEY || addr()) return; try {
    const me = C.addressOf(KEY), bal = BigInt(await V.rpc('eth_getBalance', [me, 'latest'])); if (bal === 0n) { stats = { ...stats, state: 'waiting for ETH', error: 'fund ' + me }; return setTimeout(deploy, 60000); }
    const art = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'BeamStaking.sol', 'BeamStaking.json'), 'utf8'));
    stats.state = 'deploying'; const h = await V.sendTx(KEY, { data: art.bytecode.object + a32(TOKEN) }); stats.tx = h; const r = await V.receipt(h, undefined, 180);
    if (!r || r.status !== '0x1') throw new Error('deploy reverted');
    S.staking.address = r.contractAddress.toLowerCase(); S.staking.block = parseInt(r.blockNumber); IDX.from = S.staking.block; E.markDirty(); E.save(); stats = { ...stats, state: 'deployed', error: null }; console.log('[staking] BeamStaking at', S.staking.address); refresh(); }
  catch (e) { stats = { ...stats, state: 'failed', error: String(e.message).slice(0, 160) }; console.error('[staking]', e.message); setTimeout(deploy, 120000); } }
const stakeOf = async (node) => tok(await V.call(addr(), '0x' + V.sel('stakeOf(address)') + a32(node)));
async function nodes() { const n = parseInt(await V.call(addr(), '0x' + V.sel('nodeCount()')), 16), out = [];
  for (let i = 0; i < n; i++) out.push('0x' + (await V.call(addr(), '0x' + V.sel('nodes(uint256)') + w(i))).slice(-40)); return out; }
async function pool(node) { const r = (await V.call(addr(), '0x' + V.sel('pools(address)') + a32(node))).slice(2); return { slashed: tok('0x' + r.slice(128, 192)), slashes: parseInt(r.slice(192, 256), 16) }; }
async function logs() { if (!IDX.from) IDX.from = S.staking.block || 0; const head = parseInt(await V.rpc('eth_blockNumber', []));
  for (let from = IDX.from; from <= head; from += 50000) { const to = Math.min(head, from + 49999);
    const L = await V.rpc('eth_getLogs', [{ address: addr(), fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), topics: [[T.staked, T.unbond, T.slashed]] }]);
    for (const l of L) { const node = '0x' + l.topics[1].slice(-40), d = l.data.slice(2);
      if (l.topics[0] === T.staked || l.topics[0] === T.unbond) { const who = '0x' + l.topics[2].slice(-40), amt = tok('0x' + d.slice(0, 64)), s = (IDX.stakers[node] = IDX.stakers[node] || {});
        s[who] = (s[who] || 0) + (l.topics[0] === T.staked ? amt : -amt); IDX.events.unshift({ kind: l.topics[0] === T.staked ? 'stake' : 'unbond', node, wallet: who, amount: amt, tx: l.transactionHash, block: parseInt(l.blockNumber) }); }
      else IDX.events.unshift({ kind: 'slash', node, bps: parseInt(d.slice(0, 64), 16), amount: tok('0x' + d.slice(64, 128)), tx: l.transactionHash, block: parseInt(l.blockNumber) }); }
    IDX.from = to + 1; } IDX.events.length = Math.min(IDX.events.length, 300); }
async function refresh() { if (!addr()) return; try { const list = new Set([...(await nodes()), ...Object.keys(E.vset())].map((x) => x.toLowerCase()));
    for (const n of list) E.STAKED[n] = await stakeOf(n);
    for (const o of Object.values(S.open || {})) { const st = E.STAKED[o.address] || 0; o.staked = st; o.base = Math.round(E.OPEN_POWER * (o.held == null ? 1 : Math.max(1, Math.min(4, o.held / (+process.env.BEAM_VALIDATOR_MIN || 1000000))))); o.power = o.stake = Math.round(o.base) + Math.round(st); }
    await logs(); stats.synced = Date.now(); stats.error = null; E.markDirty(); } catch (e) { stats.error = String(e.message).slice(0, 160); } }
async function slash(node, reason) { if (!KEY || !addr() || !(E.STAKED[node] > 0)) return null;
  const data = '0x' + V.sel('slash(address,uint256,string)') + a32(node) + w(SLASH_BPS) + w(96) + w(Buffer.byteLength(reason)) + Buffer.from(reason).toString('hex').padEnd(Math.ceil(Buffer.byteLength(reason) / 32) * 64, '0');
  const h = await V.sendTx(KEY, { to: addr(), data }), r = await V.receipt(h); S.staking.slashes.unshift({ node, bps: SLASH_BPS, reason, tx: h, ok: !!(r && r.status === '0x1'), ts: Date.now() }); S.staking.slashes.length = Math.min(S.staking.slashes.length, 100); E.markDirty(); refresh(); return h; }
module.exports = { init, deploy, refresh, slash, stats: () => ({ ...stats, address: addr(), slashBps: SLASH_BPS, unbondDays: 7 }), IDX, SLASH_BPS };
