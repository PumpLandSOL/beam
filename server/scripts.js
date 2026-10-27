// BEAM Oracle Scripts: any public JSON API becomes an oracle feed. A script names 1-3 HTTPS sources and a path
// to a number in each response. Every genesis validator fetches the sources assigned to it on its own schedule,
// the round takes the stake-weighted median like any price, and the result rides the stream, tunnels and
// BeamReceiver on Robinhood Chain as an OS: feed. On-demand runs return a report signed by every validator.
'use strict';
const dns = require('dns').promises, net = require('net'), C = require('../shared/beam-crypto.js');
const UA = 'BEAM-oracle/1 (+https://beamprotocol.org/scripts)', MAX_BYTES = 256 * 1024, SCALE = 1e8;
const SEEDS = [
  { slug: 'NYC-TEMP-C', name: 'New York temperature', unit: '°C', every: 300, desc: 'Current air temperature in New York City.', sources: [{ url: 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current=temperature_2m', path: 'current.temperature_2m' }] },
  { slug: 'BTC-DOMINANCE', name: 'Bitcoin dominance', unit: '%', every: 300, desc: 'Bitcoin share of total crypto market cap.', sources: [{ url: 'https://api.coinpaprika.com/v1/global', path: 'bitcoin_dominance_percentage' }, { url: 'https://api.coingecko.com/api/v3/global', path: 'data.market_cap_percentage.btc' }] },
  { slug: 'FEAR-GREED', name: 'Crypto Fear & Greed', unit: 'index', every: 600, desc: 'The crypto Fear & Greed index, 0 to 100.', sources: [{ url: 'https://api.alternative.me/fng/', path: 'data.0.value' }] },
  { slug: 'QUAKES-1H', name: 'Earthquakes, last hour', unit: 'count', every: 300, desc: 'Earthquakes recorded worldwide by USGS in the past hour.', sources: [{ url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', path: 'metadata.count' }] },
];

// ---------- safety: public HTTPS hosts only ----------
function privateIp(ip) { if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const x = ip.toLowerCase(); return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:'); }
async function checkUrl(raw) { let u; try { u = new URL(String(raw || '').trim()); } catch { return 'not a valid URL'; }
  if (u.protocol !== 'https:') return 'sources must use https'; if (u.username || u.password) return 'no credentials in URLs'; if (u.port && u.port !== '443') return 'sources must use the default https port';
  if (/(^|\.)(localhost|local|internal|onion)$/i.test(u.hostname) || net.isIP(u.hostname)) return 'use a public hostname';
  try { const ips = await dns.lookup(u.hostname, { all: true }); if (!ips.length || ips.some((a) => privateIp(a.address))) return 'that host is not public'; } catch { return 'could not resolve ' + u.hostname; }
  return null; }
function dig(j, path) { let v = j; for (const k of String(path || '').split('.').filter(Boolean)) { if (v == null) return undefined; v = Array.isArray(v) && /^\d+$/.test(k) ? v[+k] : v[k]; } return v; }
async function fetchValue(src, ms = 8000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms), t0 = Date.now();
  try { const r = await fetch(src.url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: c.signal, redirect: 'error' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const len = +r.headers.get('content-length') || 0; if (len > MAX_BYTES) throw new Error('response too large');
    const txt = await r.text(); if (txt.length > MAX_BYTES) throw new Error('response too large');
    const v = Number(dig(JSON.parse(txt), src.path)); if (!isFinite(v)) throw new Error('path "' + src.path + '" is not a number');
    const out = v * (src.mul || 1); if (Math.abs(out) > 1e12) throw new Error('value out of range'); return { value: out, ms: Date.now() - t0 }; }
  finally { clearTimeout(t); } }

// ---------- registry ----------
let S, VALS, addSignal; const LAST = {}; // LAST[id] = { [validatorAddress]: { value, ts, err } }
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const slugOk = (s) => /^[A-Z0-9][A-Z0-9-]{1,25}$/.test(s);
function register(sc) { addSignal({ id: sc.id, sym: sc.slug, name: sc.name, cls: 'script', unit: sc.unit, listedBy: sc.owner === 'beam' ? null : sc.owner, listedAt: sc.created }); LAST[sc.id] = LAST[sc.id] || {}; }
function init(state, validators, add) { S = state; VALS = validators; addSignal = add; S.scripts = S.scripts || [];
  for (const sd of SEEDS) if (!S.scripts.some((x) => x.slug === sd.slug)) S.scripts.push({ ...sd, id: 'OS:' + sd.slug, owner: 'beam', created: Date.now(), runs: 0, fails: 0, agg: 'median' });
  for (const sc of S.scripts) register(sc); }
// validator i fetches the sources at positions i, i+n... so each source is read independently by several validators
const assigned = (sc, i) => sc.sources.filter((_, k) => sc.sources.length === 1 || k % sc.sources.length === i % sc.sources.length || (k + 1) % sc.sources.length === i % sc.sources.length);
async function runValidator(sc, v, i) { const vals = []; let err = null;
  for (const src of assigned(sc, i)) { try { vals.push((await fetchValue(src)).value); } catch (e) { err = String(e.message || e).slice(0, 80); } }
  const rec = vals.length ? { value: median(vals), ts: Date.now(), err: null } : { value: null, ts: Date.now(), err };
  LAST[sc.id][v.address.toLowerCase()] = rec; return rec; }
async function run(sc) { const recs = await Promise.all(VALS().map((v, i) => new Promise((ok) => setTimeout(() => ok(runValidator(sc, v, i)), i * 150))));
  const good = recs.filter((r) => r.value != null); sc.runs++; sc.lastRun = Date.now(); if (!good.length) { sc.fails++; sc.error = recs[0] && recs[0].err; } else sc.error = null; return recs; }
// read by the round: this validator's latest fetched value, if fresh
function valueFor(addr, id) { const sc = S.scripts.find((x) => x.id === id), r = LAST[id] && LAST[id][addr.toLowerCase()]; if (!sc || !r || r.value == null) return undefined; return Date.now() - r.ts < Math.max(180000, sc.every * 3000) ? r.value : undefined; }
function loop() { const now = Date.now(); for (const sc of S.scripts) if (!sc.paused && !sc.busy && now - (sc.lastRun || 0) >= sc.every * 1000) { sc.busy = true; run(sc).catch(() => {}).finally(() => { sc.busy = false; }); } }
function start() { setTimeout(loop, 3000); setInterval(loop, 5000); }

// ---------- publish & on-demand requests ----------
async function validate(o) { const slug = String(o.slug || '').toUpperCase().trim(); if (!slugOk(slug)) return { error: 'name the feed with 2-26 letters, digits or dashes (e.g. NYC-TEMP-C)' };
  if (S.scripts.some((x) => x.slug === slug)) return { error: 'OS:' + slug + ' already exists' };
  const sources = (o.sources || []).slice(0, 3).map((s) => ({ url: String(s.url || '').trim().slice(0, 400), path: String(s.path || '').trim().slice(0, 120), mul: s.mul ? +s.mul : undefined })).filter((s) => s.url);
  if (!sources.length) return { error: 'add at least one source' }; const every = Math.round(+o.every || 300); if (!(every >= 60 && every <= 86400)) return { error: 'refresh must be 60 s to 24 h' };
  const tests = [];
  for (const s of sources) { if (s.mul !== undefined && !(isFinite(s.mul) && s.mul !== 0)) return { error: 'multiplier must be a non-zero number' }; if (!s.path) return { error: 'every source needs a JSON path' };
    const bad = await checkUrl(s.url); if (bad) return { error: s.url.slice(0, 60) + ': ' + bad };
    try { tests.push({ url: s.url, ...(await fetchValue(s)) }); } catch (e) { return { error: s.url.slice(0, 60) + ': ' + String(e.message || e).slice(0, 80) }; } }
  if (tests.length > 1) { const m = median(tests.map((t) => t.value)); if (m !== 0 && tests.some((t) => Math.abs(t.value - m) / Math.abs(m) > 0.05)) return { error: 'sources disagree by more than 5%', tests }; }
  return { ok: true, script: { slug, id: 'OS:' + slug, name: String(o.name || slug).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 40) || slug, desc: String(o.desc || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 140), unit: String(o.unit || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 12), every, sources, agg: 'median' }, tests }; }
function add(sc, owner) { const full = { ...sc, owner, created: Date.now(), runs: 0, fails: 0 }; S.scripts.push(full); register(full); return full; }
// report digest a contract or anyone can check: keccak(encodePacked("BEAMos", chainId, id, ts, value)), EIP-191 signed
function reportHash(chainId, id, ts, value) { const b32 = (n) => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, '0');
  return '0x' + C.keccak(C.unhex(C.hex(new TextEncoder().encode('BEAMos')) + b32(chainId) + C.idBytes32(id) + BigInt(ts).toString(16).padStart(16, '0') + b32(value))); }
async function request(id, chainId, power) { const sc = S.scripts.find((x) => x.id === id); if (!sc) return { error: 'unknown script' };
  const recs = await run(sc), vs = VALS(), pairs = vs.map((v, i) => [recs[i].value, power(v)]).filter((p) => p[0] != null), tot = vs.reduce((t, v) => t + power(v), 0), pw = pairs.reduce((t, p) => t + p[1], 0);
  if (pw * 2 <= tot) return { error: 'not enough validators reached the sources', reports: recs.map((r, i) => ({ validator: vs[i].name, value: r.value, err: r.err })) };
  const s = [...pairs].sort((a, b) => a[0] - b[0]); let acc = 0, val = s[s.length - 1][0]; for (const [v, w] of s) { acc += w; if (acc * 2 >= pw) { val = v; break; } }
  const ts = Math.floor(Date.now() / 1000), fixed = Math.round(val * SCALE), hash = reportHash(chainId, id, ts, fixed), dg = '0x' + C.ethSigned(hash);
  const sigs = vs.map((v, i) => recs[i].value == null ? null : { validator: v.name, address: v.address, value: recs[i].value, sig: C.sign(dg, v.priv) }).filter(Boolean);
  sc.requests = (sc.requests || 0) + 1; return { id, name: sc.name, unit: sc.unit, value: val, fixed: String(fixed), ts, chainId, hash, digest: dg, power: pw, total: tot, signers: sigs.length, reports: sigs }; }
const pub = (sc, live) => ({ id: sc.id, slug: sc.slug, name: sc.name, desc: sc.desc, unit: sc.unit, every: sc.every, owner: sc.owner, created: sc.created, runs: sc.runs, fails: sc.fails, requests: sc.requests || 0, error: sc.error || null, lastRun: sc.lastRun || null,
  sources: sc.sources.map((s) => ({ url: s.url, host: (() => { try { return new URL(s.url).hostname; } catch { return ''; } })(), path: s.path, mul: s.mul || null })), live: live || null,
  validators: Object.entries(LAST[sc.id] || {}).map(([a, r]) => ({ address: a, value: r.value, ts: r.ts, err: r.err })) });
module.exports = { init, start, valueFor, validate, add, request, pub, reportHash, checkUrl, dig, SEEDS, all: () => S.scripts };
