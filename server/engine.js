// BEAM engine: a validator set that prices every signal each round, a stake-weighted median, and tunnels that
// package prices into packets signed by the validators for the BeamReceiver contract on Robinhood Chain.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const C = require('../shared/beam-crypto.js'), SRC = require('./sources.js');
const DATA = process.env.DATA_PATH || path.join(__dirname, '..', 'data'), FILE = path.join(DATA, 'beam.json');
const ROUND_MS = +process.env.BEAM_ROUND_MS || 10000, CHAIN_ID = +(process.env.CHAIN_ID || 4663), SCALE = 1e8;
const RECEIVER = (process.env.BEAM_RECEIVER || '0x0000000000000000000000000000000000000000').toLowerCase();
const VNAMES = [['Prism', 1800000], ['Photon', 1500000], ['Lumen', 1350000], ['Aurora', 1200000], ['Flare', 1050000], ['Corona', 900000], ['Halo', 800000], ['Spectra', 700000], ['Zenith', 600000]];
const CRYPTO_SRC = ['coinbase', 'kraken', 'okx', 'gemini', 'bitfinex', 'binanceus', 'cryptocom', 'bitstamp'];

let S; // persisted state
function fresh() {
  return { genesis: Date.now(), round: 0, head: '0x' + '00'.repeat(32), tunnelSeq: 0, tunnels: {}, packets: [], hist: {}, candles: {},
    validators: VNAMES.map(([name, stake], i) => { const priv = crypto.randomBytes(32).toString('hex');
      const src = [0, 1, 2, 3].map((k) => CRYPTO_SRC[(i * 3 + k * 2) % CRYPTO_SRC.length]); return { name, stake, priv, address: C.addressOf(priv), sources: [...new Set(src)].concat(i % 2 ? 'yahoo2' : 'yahoo1'), since: Date.now(), rounds: 0, missed: 0, devSum: 0, devN: 0 }; }) };
}
try { fs.mkdirSync(DATA, { recursive: true }); } catch {}
try { S = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { S = fresh(); }
let dirty = true; const save = () => { if (!dirty) return; try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(S)); fs.renameSync(FILE + '.tmp', FILE); dirty = false; } catch (e) { console.error('save failed', e.message); } };
setInterval(save, 15000);

const LIVE = { rounds: [], prices: {}, subs: {} }; // in-memory: recent rounds, latest aggregate, latest per-validator submissions
const vset = () => Object.fromEntries(S.validators.map((v) => [v.address.toLowerCase(), v.stake]));
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function wmedian(pairs) { const s = [...pairs].sort((a, b) => a[0] - b[0]), tot = s.reduce((t, p) => t + p[1], 0); let acc = 0; for (const [v, w] of s) { acc += w; if (acc * 2 >= tot) return v; } return s[s.length - 1][0]; }

// ---------- one round ----------
function validatorSubmit(v) { const out = {};
  for (const sg of SRC.SIGNALS) { const vals = []; if (sg.cls === 'crypto') { for (const s of v.sources) if (CRYPTO_SRC.includes(s)) { const p = SRC.read(s, sg.sym); if (p) vals.push(p); } }
    else { const s = v.sources.find((x) => x.startsWith('yahoo')), p = SRC.read(s, sg.sym) || SRC.read(s === 'yahoo1' ? 'yahoo2' : 'yahoo1', sg.sym); if (p) vals.push(p); }
    if (vals.length) out[sg.id] = median(vals); }
  return out; }
function round() {
  const n = S.round + 1, ts = Math.floor(Date.now() / 1000), subs = [];
  for (const v of S.validators) { const px = validatorSubmit(v); if (!Object.keys(px).length) { v.missed++; continue; }
    const body = JSON.stringify({ n, ts, px: Object.keys(px).sort().map((k) => [k, Math.round(px[k] * SCALE)]) }), dg = C.personal(body);
    subs.push({ v, px, sig: C.sign('0x' + dg, v.priv), digest: dg }); v.rounds++; }
  const total = S.validators.reduce((t, v) => t + v.stake, 0), prices = {};
  for (const sg of SRC.SIGNALS) { const pairs = subs.filter((s) => s.px[sg.id] != null).map((s) => [s.px[sg.id], s.v.stake]), pw = pairs.reduce((t, p) => t + p[1], 0);
    if (pw * 2 <= total) continue; const m = wmedian(pairs); prices[sg.id] = { price: m, power: pw, n: pairs.length, spread: pairs.length > 1 ? (Math.max(...pairs.map((p) => p[0])) - Math.min(...pairs.map((p) => p[0]))) / m * 1e4 : 0 };
    for (const s of subs) if (s.px[sg.id] != null) { s.v.devSum += Math.abs(s.px[sg.id] - m) / m * 1e4; s.v.devN++; } }
  if (!Object.keys(prices).length) return;
  const rec = { n, ts, prev: S.head, signals: Object.keys(prices).length, validators: subs.length, power: subs.reduce((t, s) => t + s.v.stake, 0), total };
  rec.hash = '0x' + C.keccak(JSON.stringify([rec.n, rec.ts, rec.prev, Object.keys(prices).sort().map((k) => [k, Math.round(prices[k].price * SCALE)]), subs.map((s) => s.sig)]));
  S.round = n; S.head = rec.hash; LIVE.rounds.unshift({ ...rec, subs: subs.map((s) => ({ name: s.v.name, address: s.v.address, sig: s.sig, digest: s.digest })) }); LIVE.rounds.length = Math.min(LIVE.rounds.length, 300);
  for (const [id, p] of Object.entries(prices)) { const prev = LIVE.prices[id]; LIVE.prices[id] = { ...p, ts, round: n, chg: null };
    const h = (S.hist[id] = S.hist[id] || []); h.push([ts, +p.price.toPrecision(10)]); if (h.length > 2200) h.splice(0, h.length - 2200);
    const minute = ts - (ts % 60), cs = (S.candles[id] = S.candles[id] || []), last = cs[cs.length - 1];
    if (last && last[0] === minute) { last[2] = Math.max(last[2], p.price); last[3] = Math.min(last[3], p.price); last[4] = p.price; } else { cs.push([minute, p.price, p.price, p.price, p.price]); if (cs.length > 10080) cs.splice(0, cs.length - 10080); } }
  LIVE.subs = Object.fromEntries(subs.map((s) => [s.v.address, s.px]));
  dirty = true; tunnels(ts);
}
// ---------- tunnels & packets ----------
function makePacket(t, ts) { const ids = t.signals.filter((id) => LIVE.prices[id]); if (!ids.length) return null;
  const p = { tunnelId: t.id, seq: t.seq + 1, ts, chainId: CHAIN_ID, receiver: t.receiver, ids, prices: ids.map((id) => Math.round(LIVE.prices[id].price * SCALE).toString()) };
  const dg = C.packetDigest(p); p.sigs = S.validators.map((v) => ({ a: v.address.toLowerCase(), s: C.sign(dg, v.priv) })).sort((x, y) => (x.a < y.a ? -1 : 1)).map((x) => x.s);
  p.hash = C.packetHash(p); p.round = S.round; p.status = 'signed'; return p; }
function tunnels(ts) { for (const t of Object.values(S.tunnels)) { if (!t.active) continue;
    const due = ts - (t.lastTs || 0) >= t.interval, moved = t.last && t.signals.some((id) => LIVE.prices[id] && t.last[id] && Math.abs(LIVE.prices[id].price - t.last[id]) / t.last[id] * 1e4 >= t.deviationBps);
    if (!due && !(moved && ts - (t.lastTs || 0) >= 10)) continue; const p = makePacket(t, ts); if (!p) continue;
    p.trigger = due ? 'interval' : 'deviation'; t.seq = p.seq; t.lastTs = ts; t.last = Object.fromEntries(p.ids.map((id, i) => [id, +p.prices[i] / SCALE])); t.packets = (t.packets || 0) + 1;
    S.packets.unshift(p); if (S.packets.length > 1500) S.packets.length = 1500; if (module.exports.onPacket) module.exports.onPacket(p); } }
function createTunnel(o) { const id = ++S.tunnelSeq; const t = { id, name: String(o.name || 'Tunnel ' + id).replace(/[<>]/g, '').slice(0, 40), owner: o.owner, signals: o.signals, interval: o.interval, deviationBps: o.deviationBps,
  receiver: (o.receiver || RECEIVER).toLowerCase(), chainId: CHAIN_ID, created: Math.floor(Date.now() / 1000), active: true, seq: 0, lastTs: 0, packets: 0 }; S.tunnels[id] = t; dirty = true; return t; }
if (!S.tunnels[1]) { S.tunnelSeq = Math.max(S.tunnelSeq, 0); const t = createTunnel({ name: 'Beam Core', owner: 'beam', signals: SRC.SIGNALS.map((s) => s.id), interval: 60, deviationBps: 50 }); S.tunnels[1] = t; }
for (const t of Object.values(S.tunnels)) if (t.owner === 'beam' && RECEIVER !== '0x0000000000000000000000000000000000000000') t.receiver = RECEIVER;

// one-time history backfill so charts and 24h change are real from the first minute (Coinbase 5m candles, Yahoo 5m bars)
async function backfill() { const now = Math.floor(Date.now() / 1000), UA = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };
  await Promise.all(SRC.SIGNALS.map(async (sg) => { if ((S.candles[sg.id] || []).length > 200) return; let rows = [];
    try { if (sg.cls === 'crypto') { for (const end of [now, now - 300 * 300]) { const j = await (await fetch('https://api.exchange.coinbase.com/products/' + sg.sym + '-USD/candles?granularity=300&end=' + new Date(end * 1000).toISOString() + '&start=' + new Date((end - 300 * 299) * 1000).toISOString(), { headers: UA })).json(); if (Array.isArray(j)) rows.push(...j.map((c) => [c[0], c[3], c[2], c[1], c[4]])); } }
      else { const j = await (await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sg.yahoo) + '?range=5d&interval=5m&includePrePost=true', { headers: UA })).json(), r = j.chart.result[0], q = r.indicators.quote[0];
        rows = r.timestamp.map((t, i) => [t, q.open[i], q.high[i], q.low[i], q.close[i]]).filter((x) => x[4] != null); if (sg.inv) rows = rows.map(([t, o, h, l, c]) => [t, 1 / o, 1 / l, 1 / h, 1 / c]); } } catch { return; }
    rows = rows.filter((x) => x.every((v) => v != null && isFinite(v))).sort((a, b) => a[0] - b[0]); const seen = new Set(); rows = rows.filter((x) => !seen.has(x[0]) && seen.add(x[0]));
    if (rows.length) { const have = S.candles[sg.id] || [], first = have.length ? have[0][0] : Infinity; S.candles[sg.id] = rows.filter((x) => x[0] < first).concat(have); dirty = true; } })); }
function start() { backfill().catch(() => {}); SRC.start(); setTimeout(function tick() { try { round(); } catch (e) { console.error('round', e); } setTimeout(tick, ROUND_MS); }, 6000); }
module.exports = { S: () => S, LIVE, start, round, createTunnel, vset, SCALE, CHAIN_ID, RECEIVER, ROUND_MS, save, onPacket: null, markDirty: () => { dirty = true; } };
