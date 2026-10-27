// BEAM: oracle network for Robinhood Chain. node server/index.js (PORT, default 8232)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const E = require('./engine.js'), SRC = require('./sources.js'), C = require('../shared/beam-crypto.js'), V = require('./evm.js'), G = require('./gate.js'), ST = require('./staking.js');
const PORT = +process.env.PORT || 8232, CLIENT = path.join(__dirname, '..', 'client'), ROOT = path.join(__dirname, '..');
const RELAYER = process.env.BEAM_RELAYER_KEY ? String(process.env.BEAM_RELAYER_KEY).replace(/^0x/, '') : '';
const EXPLORER = process.env.CHAIN_EXPLORER || 'https://explorer.mainnet.chain.robinhood.com';
const ROUTES = { '/': 'index.html', '/feeds': 'feeds.html', '/feed': 'feed.html', '/validators': 'validators.html', '/tunnels': 'tunnels.html', '/explorer': 'explorer.html', '/verify': 'verify.html', '/docs': 'docs.html', '/run': 'run.html', '/season': 'season.html', '/embed': 'embed.html', '/onchain': 'onchain.html', '/status': 'status.html', '/listings': 'listings.html', '/scripts': 'scripts.html', '/staking': 'staking.html' };
const FILES = { '/shared/keccak.js': 'shared/keccak.js', '/shared/beam-crypto.js': 'shared/beam-crypto.js', '/shared/beam-node-core.js': 'shared/beam-node-core.js', '/contracts/BeamReceiver.sol': 'contracts/src/BeamReceiver.sol', '/contracts/BeamStaking.sol': 'contracts/src/BeamStaking.sol', '/node/beam-node.js': 'node/beam-node.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.sol': 'text/plain; charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };

// ---------- relayer: pushes packets for the configured receiver to Robinhood Chain, one at a time ----------
const RQ = []; let relaying = false, relayStats = { sent: 0, failed: 0, last: null, error: null };
const RELAY_EVERY = +process.env.BEAM_RELAY_EVERY_MS || 1800000; let lastRelay = 0; // one on-chain update per window keeps gas small
E.onPacket = (p) => { if (RELAYER && E.RECEIVER !== '0x0000000000000000000000000000000000000000' && p.receiver === E.RECEIVER && Date.now() - lastRelay >= RELAY_EVERY) { lastRelay = Date.now(); p.status = 'queued'; RQ.push(p); pump(); } };
async function pump() { if (relaying || !RQ.length) return; relaying = true; const p = RQ.shift();
  try { if (RQ.length > 20) { p.status = 'skipped'; } else { const h = await V.sendTx(RELAYER, { to: p.receiver, data: V.encRelay(p) }); p.tx = h; relayStats.tx = h; p.status = 'relaying'; const r = await V.receipt(h); p.status = r && r.status === '0x1' ? 'relayed' : 'failed'; if (r) p.gas = parseInt(r.gasUsed); relayStats.sent++; relayStats.last = Date.now(); } }
  catch (e) { p.status = 'failed'; p.error = String(e.message).slice(0, 120); relayStats.failed++; relayStats.error = p.error; }
  E.markDirty(); relaying = false; pump(); }

// ---------- auto-deploy: with BEAM_RELAYER_KEY set and no receiver yet, the server deploys BeamReceiver itself (relayer = owner) ----------
let deployStats = { state: 'idle', tx: null, error: null };
async function autoDeploy() { if (!RELAYER || E.RECEIVER !== '0x0000000000000000000000000000000000000000') return;
  try { const me = C.addressOf(RELAYER), bal = BigInt(await V.rpc('eth_getBalance', [me, 'latest'])); if (bal === 0n) { deployStats = { state: 'waiting for ETH', tx: null, error: 'fund ' + me + ' with ETH on Robinhood Chain' }; console.log('[deploy] fund', me); return setTimeout(autoDeploy, 60000); }
    const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'out', 'BeamReceiver.sol', 'BeamReceiver.json'), 'utf8')), set = E.vset(), keys = Object.keys(set).sort();
    deployStats.state = 'deploying'; const h = await V.sendTx(RELAYER, { data: art.bytecode.object + V.encCtor(keys, keys.map((k) => set[k])) }); deployStats.tx = h; console.log('[deploy] tx', h);
    const r = await V.receipt(h, undefined, 180); if (!r || r.status !== '0x1') throw new Error('deploy reverted');
    E.setReceiver(r.contractAddress); synced = keys.map((k) => k + ':' + set[k]).join(','); deployStats = { state: 'deployed', tx: h, error: null, address: r.contractAddress }; console.log('[deploy] BeamReceiver at', r.contractAddress); }
  catch (e) { deployStats = { state: 'failed', tx: deployStats.tx, error: String(e.message).slice(0, 160) }; console.error('[deploy]', e.message); setTimeout(autoDeploy, 120000); } }
setTimeout(autoDeploy, 12000);
// ---------- validator-set sync: keeps BeamReceiver's on-chain set equal to the active set (genesis + open validators) ----------
let synced = '', syncStats = { last: null, tx: null, error: null, size: 0 };
async function syncSet() { if (!RELAYER || E.RECEIVER === '0x0000000000000000000000000000000000000000') return; const set = E.vset(), keys = Object.keys(set).sort(), sig = keys.map((k) => k + ':' + set[k]).join(',');
  if (sig === synced) return; try { const h = await V.sendTx(RELAYER, { to: E.RECEIVER, data: V.encSetValidators(keys, keys.map((k) => set[k])) }); const r = await V.receipt(h);
    if (r && r.status === '0x1') { synced = sig; syncStats = { last: Date.now(), tx: h, error: null, size: keys.length }; } else syncStats.error = 'reverted (is the relayer the receiver owner?)'; } catch (e) { syncStats.error = String(e.message).slice(0, 120); } }
async function regate() { if (G.OFF) return; const st = S();
  for (const o of Object.values(st.open || {})) { try { const h = await G.balance(o.owner); o.held = h; o.gated = h < G.VALIDATOR_MIN && !((o.staked || 0) >= G.VALIDATOR_MIN); o.base = Math.round(E.OPEN_POWER * G.mult(h)); o.power = o.stake = o.base + Math.round(o.staked || 0); } catch {} }
  for (const t of Object.values(st.tunnels)) { if (!t.active) continue; try { if (await G.balance(t.owner) < G.TUNNEL_MIN) { t.active = false; t.gated = true; } } catch {} }
  E.markDirty(); }
setInterval(regate, +process.env.BEAM_GATE_MS || 300000); setTimeout(regate, 15000);
setInterval(syncSet, +process.env.BEAM_SYNC_MS || 600000); setTimeout(syncSet, 20000);
// ---------- views ----------
const S = () => E.S();
const SIG = new Proxy({}, { get: (_, id) => SRC.SIGNALS.find((s) => s.id === id) }); // listings join at runtime
function chg24(id) { const cs = S().candles[id] || [], now = Math.floor(Date.now() / 1000); const old = cs.find((c) => c[0] >= now - 86400); const cur = E.LIVE.prices[id]; return old && cur ? (cur.price - old[1]) / old[1] * 100 : null; }
function spark(id) { const now = Math.floor(Date.now() / 1000), h = (S().candles[id] || []).filter((c) => c[0] >= now - 21600).map((c) => [c[0], c[4]]); const step = Math.max(1, Math.floor(h.length / 60)); return h.filter((_, i) => i % step === 0).map((x) => x[1]); }
function feeds() { return SRC.SIGNALS.map((s) => { const p = E.LIVE.prices[s.id]; return { unit: s.unit || null, listedBy: s.listedBy || null, listedAt: s.listedAt || null, id: s.id, sym: s.sym, name: s.name, cls: s.cls, price: p ? p.price : null, ts: p ? p.ts : null, round: p ? p.round : null, n: p ? p.n : 0, power: p ? p.power : 0, spread: p ? p.spread : null, chg: chg24(s.id), spark: spark(s.id) }; }); }
function validators() { const tot = S().validators.reduce((t, v) => t + v.stake, 0); return S().validators.map((v, i) => ({ rank: i + 1, name: v.name, address: v.address, stake: v.stake, power: v.stake / tot, sources: v.sources, rounds: v.rounds, missed: v.missed, uptime: v.rounds / Math.max(1, v.rounds + v.missed), dev: v.devN ? v.devSum / v.devN : null, since: v.since, live: !!E.LIVE.subs[v.address] })); }
function status() { const st = S(); return { name: 'BEAM', chainId: E.CHAIN_ID, round: st.round, head: st.head, roundMs: E.ROUND_MS, genesis: st.genesis, validators: st.validators.length, signals: Object.keys(E.LIVE.prices).length, signalsTotal: SRC.SIGNALS.length,
  sources: Object.fromEntries(Object.entries(SRC.STATE).map(([k, v]) => [k, { ok: v.ok, ts: v.ts, latency: v.latency, n: Object.keys(v.prices).length, err: v.err }])), receiver: E.RECEIVER, relayer: RELAYER ? C.addressOf(RELAYER) : null, relayStats, syncStats, deployStats, explorer: EXPLORER,
  streamClients: STREAM.size, tunnels: Object.keys(st.tunnels).length, packets: Object.values(st.tunnels).reduce((t, x) => t + (x.packets || 0), 0), totalStake: st.validators.reduce((t, v) => t + v.stake, 0), validatorSet: E.vset(), open: { active: E.activeOpen().length, registered: Object.keys(st.open || {}).length, power: E.OPEN_POWER }, activeValidators: Object.keys(E.vset()).length, lastPacket: (() => { const p = st.packets.find((x) => x.status === 'signed' || x.status === 'relayed'); return p ? { tunnelId: p.tunnelId, seq: p.seq, signers: p.signers || p.sigs.length, openSigners: p.openSigners || 0, power: p.power, total: p.total } : null; })() }; }
const pubTunnel = (t) => ({ ...t, last: undefined });
// ---------- tunnel creation: the owner signs a plain-text request with their EVM wallet ----------
function parseReq(msg) { const o = {}; for (const line of String(msg).split('\n').slice(1)) { const i = line.indexOf(':'); if (i > 0) o[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } return o; }
async function createTunnel(b) { const msg = String(b.message || ''); if (!msg.startsWith('BEAM tunnel request')) return { error: 'bad request message' };
  let owner; try { owner = C.recover('0x' + C.personal(msg), b.signature); } catch { return { error: 'bad signature' }; }
  const o = parseReq(msg), issued = +o.issued; if (!issued || Math.abs(Date.now() / 1000 - issued) > 900) return { error: 'request expired; sign a fresh one' };
  if (o.owner && o.owner.toLowerCase() !== owner.toLowerCase()) return { error: 'signature does not match the owner' };
  const signals = String(o.signals || '').split(',').map((s) => s.trim()).filter((s) => SIG[s]); if (!signals.length || signals.length > 40) return { error: 'pick between 1 and 40 signals' };
  const interval = Math.round(+o.interval), dev = Math.round(+o.deviation); if (!(interval >= 30 && interval <= 86400)) return { error: 'interval must be 30 s to 24 h' }; if (!(dev >= 10 && dev <= 5000)) return { error: 'deviation must be 10 to 5000 bps' };
  let receiver = (o.receiver || '').toLowerCase(); if (receiver && !/^0x[0-9a-f]{40}$/.test(receiver)) return { error: 'receiver must be an address' };
  const g = await G.check(owner, G.TUNNEL_MIN); if (!g.ok) return { error: 'Tunnels require you to ' + g.error, gate: g };
  if (Object.values(S().tunnels).filter((t) => t.owner.toLowerCase() === owner.toLowerCase() && t.active).length >= 5) return { error: 'up to 5 active tunnels per wallet' };
  return { tunnel: pubTunnel(E.createTunnel({ name: o.name, owner, signals, interval, deviationBps: dev, receiver: receiver || undefined })) }; }
async function toggleTunnel(b) { const msg = String(b.message || ''); let owner; try { owner = C.recover('0x' + C.personal(msg), b.signature); } catch { return { error: 'bad signature' }; }
  const m = /^BEAM tunnel (pause|resume) #(\d+) at (\d+)$/.exec(msg); if (!m || Math.abs(Date.now() / 1000 - +m[3]) > 900) return { error: 'bad or expired request' };
  const t = S().tunnels[m[2]]; if (!t) return { error: 'unknown tunnel' }; if (t.owner.toLowerCase() !== owner.toLowerCase()) return { error: 'only the owner can do that' }; if (m[1] === 'resume') { const g = await G.check(owner, G.TUNNEL_MIN); if (!g.ok) return { error: 'Tunnels require you to ' + g.error, gate: g }; t.gated = false; } t.active = m[1] === 'resume'; E.markDirty(); return { tunnel: pubTunnel(t) }; }

// ---------- BEAM Stream: every finalized round pushed over server-sent events ----------
const STREAM = new Set(); let lastStreamed = 0;
function frame(ids) { const r = E.LIVE.rounds[0]; const px = {}; for (const [id, p] of Object.entries(E.LIVE.prices)) if (!ids || ids.has(id)) px[id] = { price: p.price, ts: p.ts, n: p.n, chg: chg24(id) };
  return { round: S().round, head: S().head, ts: Date.now(), signers: r ? r.subs.length : 0, prices: px }; }
setInterval(() => { if (S().round === lastStreamed) return; lastStreamed = S().round; for (const c of STREAM) { try { c.res.write('event: round\ndata: ' + JSON.stringify(frame(c.ids)) + '\n\n'); } catch {} } }, 500);
setInterval(() => { for (const c of STREAM) { try { c.res.write(': ping\n\n'); } catch {} } }, 25000);
// ---------- permissionless listings: any wallet holding LIST_MIN $BEAM can add a feed the sources confirm ----------
const LIST_MIN = +process.env.BEAM_LIST_MIN || 500000, LIST_CAP = +process.env.BEAM_LIST_CAP || 100, list24 = {};
async function createListing(b) { const msg = String(b.message || ''); if (!msg.startsWith('BEAM feed listing')) return { error: 'bad listing message' };
  let owner; try { owner = C.recover('0x' + C.personal(msg), b.signature).toLowerCase(); } catch { return { error: 'bad signature' }; }
  const o = parseReq(msg); if (Math.abs(Date.now() / 1000 - +o.issued) > 900) return { error: 'request expired; sign a fresh one' }; if ((o.owner || '').toLowerCase() !== owner) return { error: 'signature does not match the owner' };
  if ((S().listings || []).length >= LIST_CAP) return { error: 'listing slots are full for now' };
  const day = (list24[owner] || []).filter((t) => Date.now() - t < 86400000); if (day.length >= 3) return { error: 'up to 3 listings per wallet per day' };
  const g = await G.check(owner, LIST_MIN); if (!g.ok) return { error: 'Listing a feed requires you to ' + g.error, gate: g };
  const pr = await SRC.probe(o.symbol, o.class === 'crypto' ? 'crypto' : 'equity'); if (!pr.ok) return { error: pr.error, probe: pr };
  if (SIG[pr.id]) return { error: pr.id + ' is already a BEAM feed' };
  const l = { id: pr.id, sym: pr.sym, cls: pr.cls, name: pr.name, owner, ts: Date.now(), price: pr.price }; E.addListing(l); list24[owner] = day.concat(Date.now()); return { listing: l }; }
// ---------- oracle scripts: $BEAM holders turn any public JSON API into an oracle feed ----------
const SCRIPT_MIN = +process.env.BEAM_SCRIPT_MIN || 500000, SCRIPT_CAP = +process.env.BEAM_SCRIPT_CAP || 100, script24 = {}, req60 = {};
function scriptReq(b) { const o = parseReq(b.message); o.sources = []; for (let i = 1; i <= 3; i++) if (o['source' + i]) o.sources.push({ url: o['source' + i], path: o['path' + i], mul: o['mul' + i] }); return o; }
async function publishScript(b) { const msg = String(b.message || ''); if (!msg.startsWith('BEAM oracle script')) return { error: 'bad script message' };
  if (b.dry) { const r = await E.SCR.validate(scriptReq(b)); return r.error ? r : { ok: true, script: r.script, tests: r.tests }; }
  let owner; try { owner = C.recover('0x' + C.personal(msg), b.signature).toLowerCase(); } catch { return { error: 'bad signature' }; }
  const o = scriptReq(b); if (Math.abs(Date.now() / 1000 - +o.issued) > 900) return { error: 'request expired; sign a fresh one' }; if ((o.owner || '').toLowerCase() !== owner) return { error: 'signature does not match the owner' };
  if (E.SCR.all().filter((x) => x.owner !== 'beam').length >= SCRIPT_CAP) return { error: 'script slots are full for now' };
  const day = (script24[owner] || []).filter((t) => Date.now() - t < 86400000); if (day.length >= 3) return { error: 'up to 3 scripts per wallet per day' };
  const g = await G.check(owner, SCRIPT_MIN); if (!g.ok) return { error: 'Publishing a script requires you to ' + g.error, gate: g };
  const r = await E.SCR.validate(o); if (r.error) return r; const sc = E.addScript(r.script, owner); script24[owner] = day.concat(Date.now()); return { script: E.SCR.pub(sc), tests: r.tests }; }
const pubScript = (sc) => E.SCR.pub(sc, E.LIVE.prices[sc.id] ? { value: E.LIVE.prices[sc.id].price, ts: E.LIVE.prices[sc.id].ts, n: E.LIVE.prices[sc.id].n, round: E.LIVE.prices[sc.id].round } : null);
function staking(wallet) { const st = S(), stk = ST.IDX.stakers, all = [...st.validators.map((v) => ({ name: v.name, address: v.address.toLowerCase(), genesis: true, base: v.stake, rounds: v.rounds, missed: v.missed, dev: v.devN ? v.devSum / v.devN : null, jails: 0, active: true })),
    ...Object.values(st.open || {}).map((o) => ({ name: o.name, address: o.address, genesis: false, base: o.base || E.OPEN_POWER, rounds: o.rounds, missed: o.missed, dev: o.devN ? o.devSum / o.devN : null, jails: o.jails || 0, active: E.isActive(o), jailed: o.jailedUntil > Date.now() ? o.jailedUntil : null, owner: o.owner }))];
  const rows = all.map((v) => { const s = stk[v.address] || {}, staked = E.STAKED[v.address] || 0; return { ...v, staked, power: v.base + staked, stakers: Object.values(s).filter((x) => x > 1e-9).length, uptime: v.rounds / Math.max(1, v.rounds + v.missed), mine: wallet ? s[String(wallet).toLowerCase()] || 0 : undefined, slashes: (st.staking.slashes || []).filter((x) => x.node === v.address && x.ok).length }; }).sort((a, b) => b.power - a.power);
  rows.forEach((r, i) => { r.rank = i + 1; }); return { contract: ST.stats(), token: G.TOKEN, totalStaked: rows.reduce((t, r) => t + r.staked, 0), stakers: new Set(Object.values(stk).flatMap((s) => Object.keys(s).filter((k) => s[k] > 1e-9))).size, validators: rows, events: ST.IDX.events.slice(0, 40), slashes: (st.staking.slashes || []).slice(0, 20) }; }
// ---------- http ----------
const readBody = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { no(e); } }); });
http.createServer(async (req, res) => { const u = new URL(req.url, 'http://x'), p = u.pathname;
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj)); };
  try {
    if (p === '/api/status') return send(200, status());
    if (p === '/api/scripts' && req.method === 'POST') { const r = await publishScript(await readBody(req)); return send(r.error ? 400 : 200, r); }
    if (p === '/api/scripts') return send(200, { min: SCRIPT_MIN, cap: SCRIPT_CAP, scripts: E.SCR.all().map(pubScript) });
    if (p === '/api/scripts/request') { const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), now = Date.now(); req60[ip] = (req60[ip] || []).filter((t) => now - t < 60000); if (req60[ip].length >= 6) return send(429, { error: 'up to 6 on-demand requests per minute' }); req60[ip].push(now);
      const r = await E.SCR.request(u.searchParams.get('id'), E.CHAIN_ID, E.powerOf); return send(r.error ? 400 : 200, r); }
    if (p === '/api/staking') return send(200, staking(u.searchParams.get('wallet')));
    if (p === '/api/listings' && req.method === 'POST') { const r = await createListing(await readBody(req)); return send(r.error ? 400 : 200, r); }
    if (p === '/api/listings') return send(200, { min: LIST_MIN, cap: LIST_CAP, listings: [...(S().listings || [])].reverse().map((l) => ({ ...l, live: E.LIVE.prices[l.id] ? E.LIVE.prices[l.id].price : null })) });
    if (p === '/api/listings/probe') return send(200, await SRC.probe(u.searchParams.get('symbol'), u.searchParams.get('class') === 'crypto' ? 'crypto' : 'equity'));
    if (p === '/api/season') return send(200, E.season(u.searchParams.get('wallet')));
    if (p === '/api/gate') { const out = { token: G.TOKEN, validatorMin: G.VALIDATOR_MIN, tunnelMin: G.TUNNEL_MIN, maxMult: G.MAX_MULT, off: G.OFF }; const w = u.searchParams.get('wallet'); if (w && /^0x[0-9a-fA-F]{40}$/.test(w)) { try { out.held = await G.balance(w); out.mult = G.mult(out.held); } catch { out.held = null; } } return send(200, out); }
    if (p === '/api/feeds') return send(200, { feeds: feeds(), round: S().round });
    if (p.startsWith('/api/feed/')) { const id = decodeURIComponent(p.slice(10)), s = SIG[id]; if (!s) return send(404, { error: 'unknown signal' }); const range = u.searchParams.get('range') || '1d', now = Math.floor(Date.now() / 1000), span = { '1h': 3600, '6h': 21600, '1d': 86400, '7d': 604800 }[range] || 86400;
      let cs = (S().candles[id] || []).filter((c) => c[0] >= now - span); if (span >= 604800) { const g = {}; for (const c of cs) { const k = c[0] - (c[0] % 1800); if (!g[k]) g[k] = [k, c[1], c[2], c[3], c[4]]; else { g[k][2] = Math.max(g[k][2], c[2]); g[k][3] = Math.min(g[k][3], c[3]); g[k][4] = c[4]; } } cs = Object.values(g); }
      return send(200, { ...feeds().find((f) => f.id === id), candles: cs, subs: S().validators.map((v) => ({ name: v.name, address: v.address, stake: v.stake, price: (E.LIVE.subs[v.address] || {})[id] ?? null, sources: v.sources })), sources: Object.fromEntries(SRC.SOURCES.map((k) => [k, SRC.read(k, s.sym) ?? null])) }); }
    if (p === '/api/nodes') { const all = Object.values(S().open || {}).map(E.pubOpen).sort((a, b) => (b.active - a.active) || (b.rounds - a.rounds)); return send(200, { nodes: all, active: all.filter((x) => x.active).length, genesis: S().validators.length }); }
    if (p === '/api/node/work') return send(200, E.work(u.searchParams.get('node'))), true;
    if (p === '/api/node/join' && req.method === 'POST') { const b = await readBody(req), ow = (/\nowner:\s*(0x[0-9a-fA-F]{40})/.exec(String(b.message || '')) || [])[1]; if (!ow) return send(400, { error: 'bad join message' });
      const g = await G.check(ow, G.VALIDATOR_MIN); if (!g.ok) return send(403, { error: 'Validators must ' + g.error, gate: g }); b.held = g.held; const r = E.joinOpen(b, String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()); return send(r.error ? 400 : 200, r); }
    if (p === '/api/node/submit' && req.method === 'POST') { const r = E.submitOpen(await readBody(req)); return send(r.error ? 400 : 200, r); }
    if (p === '/api/node/sign' && req.method === 'POST') { const r = E.signOpen(await readBody(req)); return send(r.error ? 400 : 200, r); }
    if (p === '/api/validators') return send(200, { validators: validators(), round: S().round });
    if (p === '/api/rounds') return send(200, { rounds: E.LIVE.rounds.slice(0, Math.min(100, +u.searchParams.get('limit') || 30)).map(({ subs, ...r }) => ({ ...r, subs: subs.length })) });
    if (p.startsWith('/api/round/')) { const r = E.LIVE.rounds.find((x) => x.n === +p.slice(11)); return r ? send(200, r) : send(404, { error: 'round not in the recent window' }); }
    if (p === '/api/tunnels' && req.method === 'POST') { const r = await createTunnel(await readBody(req)); return send(r.error ? 400 : 200, r); }
    if (p === '/api/tunnels/toggle' && req.method === 'POST') { const r = await toggleTunnel(await readBody(req)); return send(r.error ? 400 : 200, r); }
    if (p === '/api/tunnels') { const own = (u.searchParams.get('owner') || '').toLowerCase(); return send(200, { tunnels: Object.values(S().tunnels).filter((t) => !own || t.owner.toLowerCase() === own).sort((a, b) => a.id - b.id).map(pubTunnel) }); }
    if (p.startsWith('/api/tunnel/')) { const t = S().tunnels[p.slice(12)]; if (!t) return send(404, { error: 'unknown tunnel' }); return send(200, { tunnel: pubTunnel(t), packets: S().packets.filter((x) => x.tunnelId === t.id).slice(0, 50) }); }
    if (p === '/api/packets') { const tid = +u.searchParams.get('tunnel') || 0; return send(200, { packets: S().packets.filter((x) => !tid || x.tunnelId === tid).slice(0, Math.min(100, +u.searchParams.get('limit') || 25)) }); }
    if (p.startsWith('/api/packet/')) { const [tid, seq] = p.slice(12).split('/').map(Number), pk = S().packets.find((x) => x.tunnelId === tid && x.seq === seq); return pk ? send(200, pk) : send(404, { error: 'packet not in the recent window' }); }
    if (p === '/api/stream') { if (STREAM.size >= 2000) return send(503, { error: 'stream full, retry shortly' });
      const ids = u.searchParams.get('feeds') ? new Set(u.searchParams.get('feeds').split(',').map((x) => x.trim()).filter((x) => SIG[x])) : null;
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'access-control-allow-origin': '*', 'x-accel-buffering': 'no' });
      const c = { res, ids }; STREAM.add(c); res.write('retry: 3000\nevent: round\ndata: ' + JSON.stringify(frame(ids)) + '\n\n'); req.on('close', () => STREAM.delete(c)); return; }
    if (p.startsWith('/api/')) return send(404, { error: 'unknown endpoint' });
    let f = ROUTES[p] ? path.join(CLIENT, ROUTES[p]) : FILES[p] ? path.join(ROOT, FILES[p]) : path.join(CLIENT, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!f.startsWith(CLIENT) && !FILES[p]) return send(403, { error: 'forbidden' });
    fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(buf); });
  } catch (e) { send(500, { error: String(e.message || e) }); }
}).listen(PORT, () => { console.log('BEAM on :' + PORT + (RELAYER ? ' · relayer ' + C.addressOf(RELAYER) : '') + ' · receiver ' + E.RECEIVER); E.start(); });
ST.init(E, RELAYER, G.TOKEN);
process.on('SIGTERM', () => { E.save(); process.exit(0); });
