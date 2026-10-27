// BEAM price sources. Every adapter hits a real, public, keyless endpoint and returns { SYMBOL: price } in USD.
// Bulk endpoints are polled on a shared schedule; validators each read their own subset of sources.
'use strict';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
async function get(url, ms = 8000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } }

// ---- signal catalogue: id, label, class, decimals shown ----
const CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC', 'DOT', 'UNI', 'AAVE', 'BCH', 'SUI', 'PEPE', 'SHIB', 'NEAR', 'XLM'];
const STOCKS = [['HOOD', 'Robinhood'], ['TSLA', 'Tesla'], ['NVDA', 'NVIDIA'], ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['AMZN', 'Amazon'], ['META', 'Meta'], ['GOOGL', 'Alphabet'], ['AMD', 'AMD'], ['COIN', 'Coinbase'], ['MSTR', 'Strategy'], ['PLTR', 'Palantir'], ['NFLX', 'Netflix'], ['SPY', 'S&P 500 ETF'], ['QQQ', 'Nasdaq 100 ETF']];
const MACRO = [['XAU', 'Gold', 'GC=F'], ['XAG', 'Silver', 'SI=F'], ['WTI', 'Crude oil', 'CL=F'], ['EUR', 'Euro', 'EURUSD=X'], ['GBP', 'British pound', 'GBPUSD=X'], ['JPY', 'Japanese yen', 'JPY=X', true]];
const NAMES = { BTC: 'Bitcoin', ETH: 'Ether', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', AVAX: 'Avalanche', LINK: 'Chainlink', LTC: 'Litecoin', DOT: 'Polkadot', UNI: 'Uniswap', AAVE: 'Aave', BCH: 'Bitcoin Cash', SUI: 'Sui', PEPE: 'Pepe', SHIB: 'Shiba Inu', NEAR: 'NEAR', XLM: 'Stellar' };
const SIGNALS = [...CRYPTO.map((s) => ({ id: 'CS:' + s + '-USD', sym: s, name: NAMES[s], cls: 'crypto' })),
  ...STOCKS.map(([s, n]) => ({ id: 'EQ:' + s + '-USD', sym: s, name: n, cls: 'equity', yahoo: s })),
  ...MACRO.map(([s, n, y, inv]) => ({ id: (['EUR', 'GBP', 'JPY'].includes(s) ? 'FX:' : 'CM:') + s + '-USD', sym: s, name: n, cls: ['EUR', 'GBP', 'JPY'].includes(s) ? 'fx' : 'commodity', yahoo: y, inv: !!inv }))];

// ---- crypto exchanges (bulk where possible) ----
const pick = (pairs, map) => { const o = {}; for (const s of pairs) { const v = map(s); if (v > 0 && isFinite(v)) o[s] = v; } return o; };
const EX = {
  coinbase: async (L = CRYPTO) => { const o = {}; await Promise.all(L.map(async (s) => { try { const j = await get('https://api.exchange.coinbase.com/products/' + s + '-USD/ticker', 6000); if (+j.price > 0) o[s] = +j.price; } catch {} })); return o; },
  kraken: async (L = CRYPTO) => { const K = { BTC: 'XBT', DOGE: 'XDG' }, j = await get('https://api.kraken.com/0/public/Ticker'), r = j.result || {}, by = {};
    for (const [k, v] of Object.entries(r)) by[k] = +v.c[0];
    return pick(L, (s) => { const b = K[s] || s; return by[b + 'USD'] || by['X' + b + 'ZUSD'] || by[b + 'ZUSD'] || by['X' + b + 'USD']; }); },
  okx: async (L = CRYPTO) => { const j = await get('https://www.okx.com/api/v5/market/tickers?instType=SPOT'), m = {}; for (const t of j.data || []) m[t.instId] = +t.last; return pick(L, (s) => m[s + '-USD'] || m[s + '-USDT'] || m[s + '-USDC']); },
  gemini: async (L = CRYPTO) => { const j = await get('https://api.gemini.com/v1/pricefeed'), m = {}; for (const t of j) m[t.pair] = +t.price; return pick(L, (s) => m[s + 'USD']); },
  bitfinex: async (L = CRYPTO) => { const j = await get('https://api-pub.bitfinex.com/v2/tickers?symbols=ALL'), m = {}; for (const t of j) if (typeof t[0] === 'string') m[t[0]] = +t[7]; return pick(L, (s) => m['t' + s + 'USD'] || m['t' + s + ':USD']); },
  binanceus: async (L = CRYPTO) => { const j = await get('https://api.binance.us/api/v3/ticker/price'), m = {}; for (const t of j) m[t.symbol] = +t.price; return pick(L, (s) => m[s + 'USD'] || m[s + 'USDT']); },
  cryptocom: async (L = CRYPTO) => { const j = await get('https://api.crypto.com/exchange/v1/public/get-tickers'), m = {}; for (const t of (j.result && j.result.data) || []) m[t.i] = +t.a; return pick(L, (s) => m[s + '_USD'] || m[s + '_USDT']); },
  bitstamp: async (L = CRYPTO) => { const j = await get('https://www.bitstamp.net/api/v2/ticker/'), m = {}; for (const t of j) m[t.pair] = +t.last; return pick(L, (s) => m[s + '/USD']); },
};
// ---- equities, FX, commodities: Yahoo Finance chart API (official prints incl. extended hours) ----
async function yahoo(host) { const o = {}; await Promise.all(SIGNALS.filter((s) => s.yahoo).map(async (s) => { try {
  const j = await get('https://' + host + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s.yahoo) + '?range=1d&interval=1m&includePrePost=true', 8000), r = j.chart.result[0];
  const cl = (r.indicators.quote[0].close || []).filter((x) => x != null); let p = cl.length ? cl[cl.length - 1] : r.meta.regularMarketPrice; if (s.inv && p) p = 1 / p; if (p > 0) o[s.sym] = p; } catch {} })); return o; }
EX.yahoo1 = () => yahoo('query1');
// ---------- permissionless listings: check a new symbol against live sources before it joins the catalogue ----------
const CRYPTO_EX = ['coinbase', 'kraken', 'okx', 'gemini', 'bitfinex', 'binanceus', 'cryptocom', 'bitstamp'];
async function probe(sym, cls) { sym = String(sym || '').toUpperCase().trim();
  if (cls === 'crypto') { if (!/^[A-Z0-9]{2,10}$/.test(sym)) return { ok: false, error: 'crypto symbols are 2 to 10 letters or digits' };
    const got = {}; await Promise.all(CRYPTO_EX.map(async (k) => { try { const p = (await EX[k]([sym]))[sym]; if (p > 0) got[k] = p; } catch {} }));
    const v = Object.values(got); if (v.length < 3) return { ok: false, error: sym + ' trades on ' + v.length + ' of our exchanges; listings need at least 3', sources: got };
    const m = v.sort((a, b) => a - b)[v.length >> 1], agree = Object.entries(got).filter(([, p]) => Math.abs(p - m) / m < 0.02);
    if (agree.length < 3) return { ok: false, error: 'exchanges disagree on ' + sym + ' by more than 2%', sources: got };
    return { ok: true, sym, cls, id: 'CS:' + sym + '-USD', name: sym, price: m, sources: Object.fromEntries(agree) }; }
  if (!/^[A-Z][A-Z.\-]{0,6}$/.test(sym)) return { ok: false, error: 'stock and ETF tickers are 1 to 7 letters' };
  try { const j = await get('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=1m&includePrePost=true', 8000), r = j.chart.result[0], meta = r.meta;
    if (!['EQUITY', 'ETF'].includes(meta.instrumentType)) return { ok: false, error: sym + ' is not a listed US stock or ETF' };
    if (meta.currency !== 'USD') return { ok: false, error: sym + ' does not trade in USD' };
    const cl = (r.indicators.quote[0].close || []).filter((x) => x != null), p = cl.length ? cl[cl.length - 1] : meta.regularMarketPrice; if (!(p > 0)) return { ok: false, error: 'no live price for ' + sym };
    return { ok: true, sym, cls: 'equity', id: 'EQ:' + sym + '-USD', name: String(meta.longName || meta.shortName || sym).slice(0, 40), price: p, exchange: meta.fullExchangeName, sources: { yahoo: p } }; }
  catch { return { ok: false, error: 'could not find ' + sym }; } }
function addSignal(l) { if (SIGNALS.some((x) => x.id === l.id)) return false;
  if (l.cls === 'script') { SIGNALS.push({ id: l.id, sym: l.sym, name: l.name, cls: 'script', unit: l.unit, listedBy: l.listedBy, listedAt: l.listedAt }); return true; }
  if (l.cls === 'crypto') { CRYPTO.push(l.sym); SIGNALS.push({ id: l.id, sym: l.sym, name: l.name, cls: 'crypto', listedBy: l.owner, listedAt: l.ts }); }
  else SIGNALS.push({ id: l.id, sym: l.sym, name: l.name, cls: 'equity', yahoo: l.sym, listedBy: l.owner, listedAt: l.ts });
  return true; } EX.yahoo2 = () => yahoo('query2');

const STATE = {}; for (const k of Object.keys(EX)) STATE[k] = { prices: {}, ts: 0, ok: false, err: null, latency: 0 };
async function poll(k) { const t = Date.now(); try { const p = await EX[k](); if (Object.keys(p).length) { STATE[k] = { prices: p, ts: Date.now(), ok: true, err: null, latency: Date.now() - t }; } else throw new Error('empty'); }
  catch (e) { Object.assign(STATE[k], { ok: false, err: String(e.message || e).slice(0, 80) }); } }
function start() { const every = { coinbase: 15000, yahoo1: 20000, yahoo2: 20000 }; for (const k of Object.keys(EX)) { const go = () => poll(k).finally(() => setTimeout(go, every[k] || 8000)); setTimeout(go, Math.random() * 2000); } }
const FRESH = 120000;
function read(k, sym) { const s = STATE[k]; return s && Date.now() - s.ts < FRESH ? s.prices[sym] : undefined; }
module.exports = { probe, addSignal, CRYPTO, SIGNALS, SOURCES: Object.keys(EX), STATE, start, read, poll };
