// BEAM open validator: the same code runs in a browser tab and in the headless node.
// It reads exchanges directly, signs a price submission every round, and co-signs packets it independently agrees with.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const C = isNode ? require('./beam-crypto.js') : root.BeamCrypto;
  const CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC', 'DOT', 'UNI', 'AAVE', 'BCH', 'SUI', 'PEPE', 'SHIB', 'NEAR', 'XLM'];
  const get = async (u) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 7000); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } };
  const pick = (map) => { const o = {}; for (const s of CRYPTO) { const v = map(s); if (v > 0 && isFinite(v)) o[s] = v; } return o; };
  // every exchange here answers browser requests directly (CORS), so a browser validator needs no server in between
  const EX = {
    coinbase: async () => { const o = {}; await Promise.all(CRYPTO.map(async (s) => { try { const j = await get('https://api.exchange.coinbase.com/products/' + s + '-USD/ticker'); if (+j.price > 0) o[s] = +j.price; } catch {} })); return o; },
    kraken: async () => { const K = { BTC: 'XBT', DOGE: 'XDG' }, r = (await get('https://api.kraken.com/0/public/Ticker')).result || {}, by = {}; for (const [k, v] of Object.entries(r)) by[k] = +v.c[0];
      return pick((s) => { const b = K[s] || s; return by[b + 'USD'] || by['X' + b + 'ZUSD'] || by[b + 'ZUSD'] || by['X' + b + 'USD']; }); },
    okx: async () => { const m = {}; for (const t of (await get('https://www.okx.com/api/v5/market/tickers?instType=SPOT')).data || []) m[t.instId] = +t.last; return pick((s) => m[s + '-USD'] || m[s + '-USDT'] || m[s + '-USDC']); },
    gemini: async () => { const m = {}; for (const t of await get('https://api.gemini.com/v1/pricefeed')) m[t.pair] = +t.price; return pick((s) => m[s + 'USD']); },
    binanceus: async () => { const m = {}; for (const t of await get('https://api.binance.us/api/v3/ticker/price')) m[t.symbol] = +t.price; return pick((s) => m[s + 'USD'] || m[s + 'USDT']); },
    cryptocom: async () => { const j = await get('https://api.crypto.com/exchange/v1/public/get-tickers'), m = {}; for (const t of (j.result && j.result.data) || []) m[t.i] = +t.a; return pick((s) => m[s + '_USD'] || m[s + '_USDT']); },
    bitstamp: async () => { const m = {}; for (const t of await get('https://www.bitstamp.net/api/v2/ticker/')) m[t.pair] = +t.last; return pick((s) => m[s + '/USD']); },
  };
  const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  // a validator's own view: the median across the exchanges it reads
  async function observe(sources, extra) { const got = await Promise.all(sources.map((k) => EX[k]().catch(() => ({})))), out = {}, used = {};
    for (const s of CRYPTO) { const v = got.map((g) => g[s]).filter(Boolean); if (v.length) { out['CS:' + s + '-USD'] = median(v); used['CS:' + s + '-USD'] = v.length; } }
    if (extra) Object.assign(out, await extra().catch(() => ({}))); return { prices: out, used, sources: sources.filter((k, i) => Object.keys(got[i]).length) }; }

  function Node(o) { // o: { api, priv, sources, extra, log, agreeBps }
    const st = { api: o.api.replace(/\/$/, ''), priv: o.priv, addr: C.addressOf(o.priv).toLowerCase(), sources: o.sources || Object.keys(EX), last: null, lastN: 0, view: {}, stats: { submitted: 0, cosigned: 0, refused: 0, errors: 0 }, running: false, me: null };
    const log = o.log || (() => {}), agree = o.agreeBps || 100;
    const post = async (p, b) => (await fetch(st.api + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    async function join(name, kind, ownerSign) { const msg = ['BEAM validator join', 'node: ' + st.addr, 'owner: ' + (await ownerSign.address()).toLowerCase(), 'name: ' + name, 'kind: ' + kind, 'issued: ' + Math.floor(Date.now() / 1000)].join('\n');
      const ownerSig = await ownerSign.sign(msg), nodeSig = C.sign('0x' + C.personal(msg), st.priv); return post('/api/node/join', { message: msg, ownerSig, nodeSig }); }
    async function refresh() { const v = await observe(st.sources, o.extra); st.view = v.prices; st.live = v.sources; st.viewAt = Date.now(); return v; }
    async function tick() { const w = await (await fetch(st.api + '/api/node/work?node=' + st.addr)).json(); st.me = w.me;
      if (w.next !== st.lastN && w.me && !w.me.jailed) { if (Date.now() - (st.viewAt || 0) > 4000) await refresh();
        const px = Object.keys(st.view).sort().map((k) => [k, Math.round(st.view[k] * 1e8).toString()]);
        if (px.length) { const body = JSON.stringify({ n: w.next, node: st.addr, px: px.map(([k, v]) => [k, +v]) }), sig = C.sign('0x' + C.personal(body), st.priv), r = await post('/api/node/submit', { node: st.addr, n: w.next, px, sig });
          if (r.ok) { st.stats.submitted++; st.lastN = w.next; log('round', '#' + w.next + ' · signed ' + r.feeds + ' prices'); } else if (r.error !== 'wrong round') { st.stats.errors++; log('error', r.error); } } }
      for (const p of w.packets || []) { if (p.signed || !w.me) continue; let checked = 0, bad = null;
        p.ids.forEach((id, i) => { const mine = st.view[id]; if (mine == null) return; checked++; const d = Math.abs(Number(p.prices[i]) / 1e8 - mine) / mine * 1e4; if (d > agree) bad = id + ' off by ' + d.toFixed(0) + ' bps'; });
        if (!checked || bad) { if (bad) { st.stats.refused++; log('refuse', 'T' + p.tunnelId + ' #' + p.seq + ' · ' + bad); } continue; }
        if (C.packetDigest(p) !== p.digest) { log('refuse', 'digest mismatch'); continue; } // recompute the hash ourselves before signing anything
        const r = await post('/api/node/sign', { node: st.addr, tunnelId: p.tunnelId, seq: p.seq, sig: C.sign(p.digest, st.priv) }); if (r.ok) { st.stats.cosigned++; log('sign', 'T' + p.tunnelId + ' #' + p.seq + ' · checked ' + checked + '/' + p.ids.length + ' prices'); } } }
    async function loop() { while (st.running) { try { await tick(); } catch (e) { st.stats.errors++; log('error', String(e.message || e)); } await new Promise((r) => setTimeout(r, 1500)); } }
    return { st, join, refresh, start() { if (!st.running) { st.running = true; loop(); } }, stop() { st.running = false; } };
  }
  const api = { Node, observe, EXCHANGES: Object.keys(EX), CRYPTO };
  if (isNode) module.exports = api; else root.BeamNode = api;
})(typeof window !== 'undefined' ? window : globalThis);
