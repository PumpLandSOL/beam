// BEAM shared client: header, footer, formatting, wallet (EVM, Robinhood Chain)
const BEAM = { ca: '', x: '', gh: '', domain: 'beam', chain: { id: 4663, hex: '0x1237', name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://explorer.mainnet.chain.robinhood.com' } };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const api = async (p, b) => { const r = await fetch(p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {}); return r.json(); };
const LOGO = `<svg viewBox="0 0 40 40" fill="none"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset=".35" stop-color="#06b6d4"/><stop offset=".65" stop-color="#22c55e"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><path d="M2 21h13" stroke="#f3f1ec" stroke-width="2.4" stroke-linecap="round"/><path d="M20 6 31 30H9z" stroke="#f3f1ec" stroke-width="2.4" stroke-linejoin="round" fill="#04040a"/><path d="M24 19l14-7M25 21l13-2M25 23l13 3M24 25l14 7" stroke="url(#lg)" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const NAV = [['/feeds', 'Feeds'], ['/tunnels', 'Tunnels'], ['/validators', 'Validators'], ['/explorer', 'Explorer'], ['/verify', 'Verify'], ['/docs', 'Docs']];
function chrome(active) {
  const h = document.createElement('header'); h.className = 'hdr';
  h.innerHTML = `<div class="wrap"><a class="logo" href="/">${LOGO}BEAM</a><nav class="nav" id="nv">${NAV.map(([u, l]) => `<a href="${u}" class="${active === u ? 'on' : ''}">${l}</a>`).join('')}</nav><div class="sp"></div>
  <div class="soc">${BEAM.x ? `<a href="${BEAM.x}" target="_blank" rel="noopener" aria-label="X"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.9-6.4L6.3 22H3.2l7.3-8.3L1 2h6.4l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z"/></svg></a>` : ''}${BEAM.gh ? `<a href="${BEAM.gh}" target="_blank" rel="noopener" aria-label="GitHub"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg></a>` : ''}</div>
  <a class="btn pri cta" href="/tunnels">Open a tunnel</a><button class="btn sm burger" onclick="$('nv').classList.toggle('open')">Menu</button></div>`;
  document.body.prepend(h);
  const f = document.createElement('footer'); f.className = 'ftr';
  f.innerHTML = `<div class="bar"></div><div class="wrap"><div><a class="logo" href="/">${LOGO}BEAM</a><p style="margin-top:12px;max-width:360px">The oracle network for Robinhood Chain. Prices from many exchanges, agreed by many validators, delivered on-chain with proof.</p>${BEAM.ca ? `<p class="mono" style="margin-top:12px;font-size:12px">$BEAM · ${BEAM.ca}</p>` : ''}</div>
  <div style="display:flex;gap:46px;flex-wrap:wrap"><div style="display:grid;gap:8px"><b style="color:var(--ink)">Network</b><a href="/feeds">Price feeds</a><a href="/validators">Validators</a><a href="/explorer">Explorer</a></div><div style="display:grid;gap:8px"><b style="color:var(--ink)">Build</b><a href="/tunnels">Tunnels</a><a href="/verify">Verify a packet</a><a href="/docs">Docs</a><a href="/contracts/BeamReceiver.sol">BeamReceiver.sol</a></div></div></div>`;
  document.body.append(f);
  const t = document.createElement('div'); t.className = 'toast'; t.id = 'toast'; document.body.append(t);
}
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }
function fp(v) { if (v == null) return '—'; const a = Math.abs(v), d = a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 9; return v.toLocaleString('en-US', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }); }
const fpct = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const ago = (ts) => { const s = Math.max(0, Math.floor(Date.now() / 1000 - ts)); return s < 60 ? s + 's ago' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
const CLS = { crypto: 'Crypto', equity: 'US equity', fx: 'FX', commodity: 'Commodity' };
function sparkSvg(pts, w = 120, h = 34, col) { if (!pts || pts.length < 2) return ''; const mn = Math.min(...pts), mx = Math.max(...pts), r = mx - mn || 1;
  const d = pts.map((p, i) => (i ? 'L' : 'M') + (i / (pts.length - 1) * w).toFixed(1) + ' ' + (h - 3 - (p - mn) / r * (h - 6)).toFixed(1)).join(''); const c = col || (pts[pts.length - 1] >= pts[0] ? '#0f9d58' : '#e5484d');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/></svg>`; }
// ---- wallet ----
let ACCOUNT = null;
async function connect() { const eth = window.ethereum; if (!eth) { toast('No EVM wallet found. Install MetaMask or Rabby.'); return null; }
  const [a] = await eth.request({ method: 'eth_requestAccounts' }); ACCOUNT = a;
  try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BEAM.chain.hex }] }); } catch (e) { if (e.code === 4902) try { await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: BEAM.chain.hex, chainName: BEAM.chain.name, rpcUrls: [BEAM.chain.rpc], blockExplorerUrls: [BEAM.chain.explorer], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }] }); } catch {} }
  document.dispatchEvent(new CustomEvent('account', { detail: a })); return a; }
async function signMsg(msg) { const a = ACCOUNT || await connect(); if (!a) return null; return window.ethereum.request({ method: 'personal_sign', params: [msg, a] }); }
