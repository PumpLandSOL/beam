/* BEAM oracle widget: live oracle prices on any website.
   <script src="https://beamprotocol.org/widget.js" data-feeds="CS:BTC-USD,EQ:TSLA-USD" data-layout="ticker" data-theme="dark"></script> */
(function () {
  'use strict';
  const me = document.currentScript; if (!me) return;
  const ORIGIN = new URL(me.src).origin, ds = me.dataset;
  const ids = (ds.feeds || 'CS:BTC-USD,CS:ETH-USD,CS:SOL-USD,EQ:HOOD-USD,EQ:TSLA-USD,EQ:NVDA-USD').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const layout = ds.layout === 'card' ? 'card' : 'ticker', light = ds.theme === 'light';
  const host = document.createElement('div'); host.className = 'beam-oracle-widget'; me.parentNode.insertBefore(host, me);
  const root = host.attachShadow({ mode: 'open' });
  const C = light ? { bg: '#ffffff', ink: '#0d0d12', dim: '#6b6a75', rule: 'rgba(0,0,0,.09)' } : { bg: '#07070d', ink: '#f3f1ec', dim: '#8a8896', rule: 'rgba(255,255,255,.09)' };
  root.innerHTML = `<style>:host{all:initial;display:block}*{box-sizing:border-box;margin:0;padding:0}
.w{font:500 13px/1.3 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:${C.bg};color:${C.ink};border:1px solid ${C.rule};border-radius:10px;overflow:hidden}
.bar{height:3px;background:linear-gradient(90deg,#8b5cf6,#3b82f6,#06b6d4,#22c55e,#eab308,#f97316,#ef4444)}
.row{display:flex;gap:22px;padding:10px 14px;overflow-x:auto;scrollbar-width:none;align-items:center}.row::-webkit-scrollbar{display:none}
.it{white-space:nowrap;display:flex;gap:7px;align-items:baseline}.s{font-weight:700}.p{font-variant-numeric:tabular-nums}.c{font-size:11.5px;font-variant-numeric:tabular-nums}
.up{color:#16a34a}.dn{color:#e11d48}${light ? '' : '.up{color:#34d399}.dn{color:#fb7185}'}
.grid{display:grid;grid-template-columns:1fr auto auto;gap:9px 16px;padding:14px 16px;align-items:baseline}
.ft{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 14px;border-top:1px solid ${C.rule};font:500 10.5px ui-monospace,Menlo,monospace;letter-spacing:.08em;color:${C.dim};text-transform:uppercase}
.ft a{color:inherit;text-decoration:none}.ft a:hover{color:${C.ink}}.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-right:6px;vertical-align:middle}.flash{animation:f .8s}@keyframes f{0%{opacity:.35}100%{opacity:1}}</style>
<div class="w"><div class="bar"></div><div id="b" class="${layout === 'card' ? 'grid' : 'row'}"></div><div class="ft"><span><span class="dot"></span><span id="r">connecting</span></span><a href="${ORIGIN}/?ref=widget" target="_blank" rel="noopener">Powered by BEAM oracle ↗</a></div></div>`;
  const $ = (id) => root.getElementById(id), META = {};
  const fp = (v) => { const a = Math.abs(v), d = a >= 1000 ? 2 : a >= 1 ? 2 : a >= .01 ? 4 : 6; return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  function render(f) { const b = $('b'); b.innerHTML = ids.filter((id) => f.prices[id]).map((id) => { const p = f.prices[id], m = META[id] || { sym: id.split(':')[1].replace('-USD', '') }, ch = p.chg;
      const cs = ch == null ? '' : `<span class="c ${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>`, pr = `<span class="p flash">$${fp(p.price)}</span>`;
      return layout === 'card' ? `<span class="s">${m.sym}</span>${pr}${cs || '<span></span>'}` : `<span class="it"><span class="s">${m.sym}</span>${pr}${cs}</span>`; }).join('');
    $('r').textContent = 'live · round #' + f.round.toLocaleString('en-US') + ' · ' + f.signers + ' signers'; }
  fetch(ORIGIN + '/api/feeds').then((r) => r.json()).then((d) => { for (const x of d.feeds) META[x.id] = x; }).catch(() => {});
  function go() { const es = new EventSource(ORIGIN + '/api/stream?feeds=' + encodeURIComponent(ids.join(',')));
    es.addEventListener('round', (e) => { try { render(JSON.parse(e.data)); } catch {} }); es.onerror = () => { $('r').textContent = 'reconnecting'; }; }
  go();
})();
