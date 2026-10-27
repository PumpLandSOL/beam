// BEAM Proof of Reserves: POR: feeds where validators read balances straight from Robinhood Chain and sign them.
// A feed is a supply (ERC-20 totalSupply), a balance (native ETH or ERC-20 balanceOf summed over up to 5 wallets),
// or a ratio (that balance over a token's supply). Every genesis validator makes its own RPC reads on schedule,
// the round takes the stake-weighted median, and the value rides the stream, tunnels and BeamReceiver.
'use strict';
const V = require('./evm.js');
const TOKEN = String(process.env.BEAM_TOKEN || '0x6459ce7fa9736349b32ef8bcd7844b64544d90a7').toLowerCase(), DEAD = '0x000000000000000000000000000000000000dead';
const SEEDS = [
  { slug: 'BEAM-SUPPLY', name: '$BEAM total supply', kind: 'supply', token: TOKEN, wallets: [], unit: 'BEAM', every: 120, desc: 'totalSupply() of the $BEAM token on Robinhood Chain.' },
  { slug: 'BEAM-BURNED', name: '$BEAM burned', kind: 'balance', token: TOKEN, wallets: [DEAD], unit: 'BEAM', every: 120, desc: '$BEAM held by the 0x…dEaD burn address.' },
  { slug: 'BEAM-BURN-RATIO', name: '$BEAM burned / supply', kind: 'ratio', token: TOKEN, wallets: [DEAD], supply: TOKEN, unit: 'ratio', every: 120, desc: 'Share of $BEAM supply sitting at the burn address.' },
];
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(String(a || ''));
const DEC = {}; async function dec(t) { if (DEC[t] == null) DEC[t] = parseInt(await V.call(t, '0x313ce567'), 16); if (!(DEC[t] >= 0 && DEC[t] <= 36)) throw new Error('token has no decimals()'); return DEC[t]; }
const num = (raw, d) => { const D = 10n ** BigInt(d); return Number(raw / D) + Number(raw % D) / Number(D); };
async function balanceOf(token, w) { if (!token) return num(BigInt(await V.rpc('eth_getBalance', [w, 'latest'])), 18); return num(BigInt(await V.call(token, '0x70a08231' + w.slice(2).padStart(64, '0'))), await dec(token)); }
async function supplyOf(token) { return num(BigInt(await V.call(token, '0x18160ddd')), await dec(token)); }
async function read(f) { if (f.kind === 'supply') return supplyOf(f.token); let r = 0; for (const w of f.wallets) r += await balanceOf(f.token, w);
  if (f.kind === 'ratio') { const s = await supplyOf(f.supply); if (!(s > 0)) throw new Error('supply is zero'); return r / s; } return r; }

let S, VALS, addSignal; const LAST = {};
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function register(f) { addSignal({ id: f.id, sym: f.slug, name: f.name, cls: 'por', unit: f.unit, listedBy: f.owner === 'beam' ? null : f.owner, listedAt: f.created }); LAST[f.id] = LAST[f.id] || {}; }
function init(state, validators, add) { S = state; VALS = validators; addSignal = add; S.por = S.por || [];
  for (const sd of SEEDS) if (!S.por.some((x) => x.slug === sd.slug)) S.por.push({ ...sd, id: 'POR:' + sd.slug, owner: 'beam', created: Date.now(), runs: 0, fails: 0 });
  for (const f of S.por) register(f); }
// each validator reads for itself, staggered; a failed read leaves that validator out of the round
async function run(f) { const recs = await Promise.all(VALS().map((v, i) => new Promise((ok) => setTimeout(async () => { let rec;
    try { rec = { value: await read(f), ts: Date.now(), err: null }; } catch (e) { rec = { value: null, ts: Date.now(), err: String(e.message || e).slice(0, 80) }; } LAST[f.id][v.address.toLowerCase()] = rec; ok(rec); }, i * 250))));
  f.runs++; f.lastRun = Date.now(); const good = recs.filter((r) => r.value != null); if (!good.length) { f.fails++; f.error = recs[0] && recs[0].err; } else f.error = null; return recs; }
function valueFor(addr, id) { const f = S.por.find((x) => x.id === id), r = LAST[id] && LAST[id][addr.toLowerCase()]; if (!f || !r || r.value == null) return undefined; return Date.now() - r.ts < Math.max(180000, f.every * 3000) ? r.value : undefined; }
function loop() { const now = Date.now(); for (const f of S.por) if (!f.busy && now - (f.lastRun || 0) >= f.every * 1000) { f.busy = true; run(f).catch(() => {}).finally(() => { f.busy = false; }); } }
function start() { setTimeout(loop, 4000); setInterval(loop, 5000); }
const clean = (x, n) => String(x || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);
async function validate(o) { const slug = String(o.slug || '').toUpperCase().trim(); if (!/^[A-Z0-9][A-Z0-9-]{1,27}$/.test(slug)) return { error: 'name the feed with 2-28 letters, digits or dashes (e.g. USDX-RESERVES)' };
  if (S.por.some((x) => x.slug === slug)) return { error: 'POR:' + slug + ' already exists' };
  const kind = ['supply', 'balance', 'ratio'].includes(o.kind) ? o.kind : null; if (!kind) return { error: 'kind must be supply, balance or ratio' };
  const token = String(o.token || '').trim().toLowerCase(); if (token && !isAddr(token)) return { error: 'token must be an address (leave empty for native ETH)' }; if (kind === 'supply' && !token) return { error: 'a supply feed needs a token address' };
  const wallets = [...new Set(String(o.wallets || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))]; if (kind !== 'supply' && (!wallets.length || wallets.length > 5 || !wallets.every(isAddr))) return { error: 'list 1 to 5 wallet addresses' };
  const supply = String(o.supply || token).trim().toLowerCase(); if (kind === 'ratio' && !isAddr(supply)) return { error: 'a ratio feed needs the supply token address' };
  const every = Math.round(+o.every || 120); if (!(every >= 60 && every <= 86400)) return { error: 'refresh must be 60 s to 24 h' };
  const f = { slug, id: 'POR:' + slug, name: clean(o.name, 40) || slug, desc: clean(o.desc, 140), unit: clean(o.unit, 12) || (kind === 'ratio' ? 'ratio' : token ? 'tokens' : 'ETH'), kind, token: token || null, wallets: kind === 'supply' ? [] : wallets, supply: kind === 'ratio' ? supply : undefined, every };
  let value; try { value = await read(f); } catch (e) { return { error: 'could not read it from Robinhood Chain: ' + String(e.message || e).slice(0, 80) }; }
  if (!isFinite(value) || Math.abs(value) > 1e15) return { error: 'value out of range' }; return { ok: true, feed: f, value }; }
function add(f, owner) { const full = { ...f, owner, created: Date.now(), runs: 0, fails: 0 }; S.por.push(full); register(full); return full; }
const pub = (f, live) => ({ id: f.id, slug: f.slug, name: f.name, desc: f.desc, unit: f.unit, kind: f.kind, token: f.token, wallets: f.wallets, supply: f.supply || null, every: f.every, owner: f.owner, created: f.created, runs: f.runs, fails: f.fails, error: f.error || null, lastRun: f.lastRun || null, live: live || null,
  validators: Object.entries(LAST[f.id] || {}).map(([a, r]) => ({ address: a, value: r.value, ts: r.ts, err: r.err })) });
module.exports = { init, start, valueFor, validate, add, pub, read, SEEDS, all: () => S.por };
