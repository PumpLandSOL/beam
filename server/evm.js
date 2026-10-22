// BEAM EVM side: JSON-RPC, ABI encoding for BeamReceiver, RLP + EIP-1559 signing. Dependency-free.
'use strict';
const C = require('../shared/beam-crypto.js');
const RPC = process.env.CHAIN_RPC || 'https://rpc.mainnet.chain.robinhood.com';
let rid = 0;
async function rpc(method, params, url = RPC) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message || JSON.stringify(j.error)); return j.result; }
// ---------- ABI ----------
const w = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0');
const addr = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const sel = (sig) => C.keccak(sig).slice(0, 8);
function dynBytes(h) { h = String(h).replace(/^0x/, ''); const n = h.length / 2; return w(n) + h.padEnd(Math.ceil(n / 32) * 64, '0'); }
function encRelay(p) { const ids = p.ids.map(C.idBytes32), px = p.prices.map(w), sigs = p.sigs;
  const aIds = w(ids.length) + ids.join(''), aPx = w(px.length) + px.join('');
  const items = sigs.map(dynBytes); let off = 32 * items.length, heads = ''; for (const it of items) { heads += w(off); off += it.length / 2; }
  const aSig = w(sigs.length) + heads + items.join('');
  const o1 = 32 * 6, o2 = o1 + aIds.length / 2, o3 = o2 + aPx.length / 2;
  return '0x' + sel('relay(uint64,uint64,uint64,bytes32[],int256[],bytes[])') + w(p.tunnelId) + w(p.seq) + w(p.ts) + w(o1) + w(o2) + w(o3) + aIds + aPx + aSig; }
function encCtor(vals, powers) { const a = w(vals.length) + vals.map(addr).join(''), b = w(powers.length) + powers.map(w).join(''); return w(64) + w(64 + a.length / 2) + a + b; }
// ---------- RLP ----------
const bytesOf = (h) => { h = String(h).replace(/^0x/, ''); if (h.length % 2) h = '0' + h; return h; };
const intHex = (n) => { n = BigInt(n); return n === 0n ? '' : bytesOf(n.toString(16)); };
function rlp(x) { if (Array.isArray(x)) { const body = x.map(rlp).join(''); return lenPre(body.length / 2, 0xc0) + body; }
  const h = bytesOf(x); if (h.length === 2 && parseInt(h, 16) < 0x80) return h; return lenPre(h.length / 2, 0x80) + h; }
function lenPre(n, base) { if (n < 56) return (base + n).toString(16).padStart(2, '0'); const l = bytesOf(n.toString(16)); return (base + 55 + l.length / 2).toString(16) + l; }
async function sendTx(priv, { to, data, value = 0n, gas }, url = RPC) {
  const from = C.addressOf(priv), [chainId, nonce, fees, tip] = await Promise.all([rpc('eth_chainId', [], url), rpc('eth_getTransactionCount', [from, 'pending'], url), rpc('eth_getBlockByNumber', ['latest', false], url), rpc('eth_maxPriorityFeePerGas', [], url).catch(() => '0x0')]);
  const base = BigInt(fees.baseFeePerGas || '0x0'), prio = BigInt(tip), maxFee = base * 2n + prio;
  if (!gas) gas = BigInt(await rpc('eth_estimateGas', [{ from, to: to || undefined, data, value: '0x' + BigInt(value).toString(16) }], url)) * 12n / 10n;
  const f = [intHex(chainId), intHex(nonce), intHex(prio), intHex(maxFee), intHex(gas), to ? bytesOf(to) : '', intHex(value), bytesOf(data), []];
  const h = C.keccak(C.unhex('02' + rlp(f))), sg = C.sign('0x' + h, priv).slice(2), v = (parseInt(sg.slice(128), 16) - 27) & 1;
  const raw = '0x02' + rlp([...f, intHex(v), intHex('0x' + sg.slice(0, 64)), intHex('0x' + sg.slice(64, 128))]);
  return rpc('eth_sendRawTransaction', [raw], url); }
async function receipt(hash, url = RPC, tries = 60) { for (let i = 0; i < tries; i++) { const r = await rpc('eth_getTransactionReceipt', [hash], url); if (r) return r; await new Promise((s) => setTimeout(s, 1000)); } return null; }
async function call(to, data, url = RPC) { return rpc('eth_call', [{ to, data }, 'latest'], url); }
const encGetPrice = (id) => '0x' + sel('getPrice(bytes32)') + C.idBytes32(id);
module.exports = { rpc, sendTx, receipt, call, encRelay, encCtor, encGetPrice, sel, RPC };
