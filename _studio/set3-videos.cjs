// BEAM video set 3: listings (captured), how-it-works (animated), builders (code + real on-chain read)
// SITE=http://localhost:8232 node _studio/set3-videos.cjs [listings|how|build]
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const B = path.join(__dirname, '..', 'brand'), K = path.join(__dirname, 'kit', 'set3'), FPS = 30, SITE = process.env.SITE || 'http://localhost:8232';
const MARK = fs.readFileSync(path.join(__dirname, '..', 'client', 'favicon.svg'), 'utf8'), url = (f) => 'file:///' + f.split(path.sep).join('/');
const RCV = '0x113ec1c595efc6be4185ef69565250a9cb767e72';
const HEAD = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;background:#04040a;color:#f3f1ec;overflow:hidden;position:relative;font-family:'Inter Tight'}
.s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.serif{font-family:'Instrument Serif';font-weight:400}.it{font-style:italic}.k{font:500 22px 'JetBrains Mono';letter-spacing:.24em;text-transform:uppercase;color:#a9a7b3}
.spec{background:linear-gradient(90deg,#8b5cf6,#3b82f6 22%,#06b6d4 40%,#22c55e 58%,#eab308 76%,#f97316 88%,#ef4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.glow{position:absolute;inset:0;background:radial-gradient(1100px 600px at 70% 20%,rgba(139,92,246,.22),transparent 65%),radial-gradient(900px 500px at 10% 90%,rgba(6,182,212,.12),transparent 60%)}
.mk svg{width:150px;height:150px}.shot{position:absolute;left:240px;right:240px;top:170px;bottom:60px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background-size:cover;background-position:top center;box-shadow:0 40px 120px rgba(0,0,0,.6);opacity:0}
.cap{position:absolute;left:0;right:0;top:60px;text-align:center;opacity:0}.card{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);border-radius:14px}
.mono{font-family:'JetBrains Mono'}.dim{color:#a9a7b3}.up{color:#34d399}</style></head><body><div class="glow"></div>`;
const JS = `const $=(i)=>document.getElementById(i),cl=(x)=>Math.max(0,Math.min(1,x)),e=(x)=>1-Math.pow(1-cl(x),3),win=(t,a,b,f=.4)=>cl(Math.min((t-a)/f,(b-t)/f));`;
const END = (h, u) => `<div class="s" id="z"><div class="mk">${MARK}</div><div class="serif" style="font-size:130px;line-height:.92;margin-top:28px">${h}</div><div style="font:700 38px 'Inter Tight';letter-spacing:.12em;margin-top:40px">${u}</div></div>`;
async function render(c, name, html, dur) { const FR = path.join(__dirname, 'frames-' + name); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR);
  const f = path.join(K, name + '.html'); fs.writeFileSync(f, html);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await c.send('Page.navigate', { url: url(f) }); await sleep(3000); await c.ev('document.fonts.ready.then(()=>1)');
  const N = Math.round(dur * FPS); for (let i = 0; i < N; i++) { await c.ev('__seek(' + (i / FPS).toFixed(4) + ')'); await c.shot(path.join(FR, 'f_' + String(i).padStart(4, '0') + '.jpg'), 'jpeg'); }
  const out = path.join(B, name + '.mp4'); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FR, 'f_%04d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', out]);
  fs.rmSync(FR, { recursive: true, force: true }); console.log('OK', name + '.mp4'); }

async function listings(c) { // captures the real /listings page, runs a live check, then cuts to the comparison graphic
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.4, mobile: false }); await c.send('Page.navigate', { url: SITE + '/listings' }); await sleep(8000);
  const top = path.join(K, 'l-top.png'); await c.shot(top);
  await c.ev("window.scrollTo(0,520);document.getElementById('sy').value='GME';check();1"); await sleep(7000); const gme = path.join(K, 'l-gme.png'); await c.shot(gme);
  await c.ev("setT('crypto');document.getElementById('sy').value='TON';check();1"); await sleep(9000); const ton = path.join(K, 'l-ton.png'); await c.shot(ton);
  const shots = [[top, 'Permissionless feeds · live on beamprotocol.org/listings'], [gme, 'Type a ticker. BEAM checks it against live market data.'], [ton, 'Crypto needs 3 exchanges agreeing within 2%.'], [path.join(B, 'beam-g24-who-decides.png'), 'Other oracles decide which prices exist. On BEAM, holders do.']];
  const html = HEAD + `<div class="s" id="a"><div class="k">New · Permissionless feeds</div><div class="serif" style="font-size:160px;line-height:.9;margin-top:24px">List any asset.<br><span class="it spec">No one's approval.</span></div></div>
  ${shots.map(([f, t], i) => `<div class="cap" id="c${i}"><div class="k" style="color:#f3f1ec">${t}</div></div><div class="shot" id="p${i}" style="background-image:url('${url(f)}');${i === 3 ? 'background-size:contain;background-repeat:no-repeat;background-position:center;border:0;box-shadow:none' : ''}"></div>`).join('')}
  ${END('Any stock. Any ETF.<br><span class="it spec">Priced next round.</span>', 'BEAMPROTOCOL.ORG/LISTINGS')}
  <script>${JS}window.__seek=(t)=>{$('a').style.opacity=win(t,0,3);$('a').style.transform='scale('+(1.1-.1*e(t/1.2))+')';
  for(let i=0;i<4;i++){const a=3+i*3,b=a+3,o=win(t,a,b,.3);$('p'+i).style.opacity=o;$('c'+i).style.opacity=o;$('p'+i).style.transform='translateY('+(30-30*e((t-a)/.5))+'px) scale('+(1+.03*cl((t-a)/3))+')';}
  $('z').style.opacity=cl((t-15)/.5);$('z').style.transform='scale('+(1.08-.08*e((t-15)/.8))+')';};</script></body></html>`;
  await render(c, 'beam-listings-18s', html, 18); }

async function how(c) { // animated pipeline, 20 s
  const ex = ['Coinbase', 'Kraken', 'OKX', 'Gemini', 'Bitfinex', 'Binance.US', 'Crypto.com', 'Bitstamp'];
  const html = HEAD + `<style>.node{position:absolute;padding:14px 20px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);font-size:22px;opacity:0;text-align:center}
  .lab{position:absolute;font:500 18px 'JetBrains Mono';letter-spacing:.2em;color:#a9a7b3;text-transform:uppercase;opacity:0}.dot{position:absolute;width:12px;height:12px;border-radius:50%;background:#a78bfa;box-shadow:0 0 14px #8b5cf6;opacity:0}</style>
  <div class="s" id="a"><div class="k">How BEAM works</div><div class="serif" style="font-size:150px;line-height:.9;margin-top:24px">From exchange<br><span class="it spec">to on-chain.</span></div></div>
  <div class="lab" id="l1" style="left:90px;top:120px">1 · Sources</div>${ex.map((x, i) => `<div class="node" id="e${i}" style="left:90px;top:${170 + i * 96}px;width:250px">${x}</div>`).join('')}<div class="node" id="e8" style="left:90px;top:938px;width:250px;font-size:18px">+ US market data</div>
  <div class="lab" id="l2" style="left:520px;top:120px">2 · Validators</div>${Array.from({ length: 9 }, (_, i) => `<div class="node" id="v${i}" style="left:${520 + (i % 3) * 120}px;top:${330 + Math.floor(i / 3) * 120}px;width:100px;height:100px;display:grid;place-items:center;border-radius:50%;font:500 16px 'JetBrains Mono'">V${i + 1}</div>`).join('')}
  <div class="lab" id="l3" style="left:1010px;top:120px">3 · Agree</div><div class="node" id="m" style="left:1000px;top:420px;width:300px;font-size:20px"><div class="mono dim" style="font-size:14px">stake-weighted median</div><div class="serif" style="font-size:56px;margin-top:4px">$81,742</div><div class="mono up" style="font-size:14px">every 10 seconds</div></div>
  <div class="lab" id="l4" style="left:1420px;top:120px">4 · Deliver</div><div class="node" id="r" style="left:1400px;top:330px;width:440px;border-color:rgba(139,92,246,.7);background:rgba(139,92,246,.12)"><div class="mono dim" style="font-size:14px">signed packet → Robinhood Chain</div><div class="serif" style="font-size:46px;margin-top:6px"><span class="it spec">BeamReceiver</span></div><div class="mono" style="font-size:13px;color:#c4b5fd;margin-top:6px">${RCV.slice(0, 22)}…</div><div class="mono up" style="font-size:14px;margin-top:6px">✓ checks every signature, needs 2/3 stake</div></div>
  <div class="node" id="ap" style="left:1400px;top:620px;width:440px"><div class="mono dim" style="font-size:14px">read by any contract</div><div style="font-size:26px;margin-top:6px">Lending · Perps · Vaults · Stablecoins</div></div>
  ${Array.from({ length: 14 }, (_, i) => `<div class="dot" id="d${i}"></div>`).join('')}
  ${END('Verified by the chain.<br><span class="it spec">Not by us.</span>', 'BEAMPROTOCOL.ORG')}
  <script>${JS}const P=[[340,230],[580,380],[1150,470],[1620,420],[1620,700]];
  window.__seek=(t)=>{$('a').style.opacity=win(t,0,3);
   const on=(id,a)=>{const x=$(id);x.style.opacity=cl((t-a)/.4)*cl((17-t)/.4);x.style.transform='translateY('+(16-16*e((t-a)/.5))+'px)';};
   on('l1',3);for(let i=0;i<9;i++)on('e'+i,3.1+i*.12);on('l2',5);for(let i=0;i<9;i++)on('v'+i,5.1+i*.1);on('l3',7.6);on('m',7.8);on('l4',10);on('r',10.2);on('ap',12.6);
   for(let i=0;i<14;i++){const ph=((t-4.4)*.55+i/14)%1,seg=Math.min(3,Math.floor(ph*4)),f=ph*4-seg,a=P[seg],b=P[seg+1],vis=t>4.4&&t<17&&(seg<1||t>6.5)&&(seg<2||t>8.6)&&(seg<3||t>11);
    const d=$('d'+i);d.style.opacity=vis?.9:0;d.style.left=(a[0]+(b[0]-a[0])*f+(i%3)*14)+'px';d.style.top=(a[1]+(b[1]-a[1])*f+(i%4)*12)+'px';}
   $('z').style.opacity=cl((t-17)/.5);$('z').style.transform='scale('+(1.08-.08*e((t-17)/.8))+')';};</script></body></html>`;
  await render(c, 'beam-how-20s', html, 20); }

async function build(c) { // code typing + a real read from BeamReceiver
  const V = require('../server/evm.js'), rd = async (id) => { const x = await V.call(RCV, V.encGetPrice(id, 7200)); return [Number(BigInt('0x' + x.slice(2, 66))) / 1e8, Number(BigInt('0x' + x.slice(66, 130)))]; };
  const [btc, ts] = await rd('CS:BTC-USD'), [tsla] = await rd('EQ:TSLA-USD'), fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const code = `interface IBeam {\n  function getPriceNoOlderThan(bytes32 id, uint256 maxAge)\n    external view returns (int256 price, uint64 ts);\n}\n\nIBeam beam = IBeam(${RCV});\n\n(int256 tsla, ) = beam.getPriceNoOlderThan("EQ:TSLA-USD", 3600);`;
  const html = HEAD + `<style>pre{font:500 28px/1.6 'JetBrains Mono';white-space:pre;text-align:left}.kw{color:#a78bfa}.st{color:#86efac}.cur{display:inline-block;width:14px;height:30px;background:#f3f1ec;vertical-align:-5px}</style>
  <div class="s" id="a"><div class="k">For builders on Robinhood Chain</div><div class="serif" style="font-size:160px;line-height:.9;margin-top:24px">Two lines.<br><span class="it spec">Any price.</span></div></div>
  <div class="card" id="cb" style="position:absolute;left:160px;right:160px;top:150px;padding:44px 52px;opacity:0"><div class="mono dim" style="font-size:16px;letter-spacing:.18em;margin-bottom:20px">YOUR CONTRACT.SOL</div><pre id="cd"></pre></div>
  <div class="card" id="rs" style="position:absolute;left:160px;right:160px;top:700px;padding:30px 52px;opacity:0;border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.06)"><div class="mono up" style="font-size:18px">✓ live read from BeamReceiver on Robinhood Chain · ${new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
   <div style="display:flex;gap:80px;margin-top:14px"><div><span class="mono dim" style="font-size:18px">EQ:TSLA-USD</span><div class="serif" style="font-size:80px">$${fmt(tsla)}</div></div><div><span class="mono dim" style="font-size:18px">CS:BTC-USD</span><div class="serif" style="font-size:80px">$${fmt(btc)}</div></div></div></div>
  ${END('Stale prices revert.<br><span class="it spec">Fresh ones flow.</span>', 'BEAMPROTOCOL.ORG/DOCS')}
  <script>${JS}const CODE=${JSON.stringify(code).replace(/</g, '\\u003c')};const esc=(s)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const hl=(s)=>esc(s).replace(/("[^"]*")/g,'<span class="st">$1</span>').replace(/\\b(interface|function|external|view|returns|int256|uint256|uint64|bytes32)\\b/g,'<span class="kw">$1</span>');
  window.__seek=(t)=>{$('a').style.opacity=win(t,0,3);$('cb').style.opacity=win(t,3,15.5,.4);$('rs').style.opacity=win(t,10.4,15.5,.4);$('rs').style.transform='translateY('+(20-20*e((t-10.4)/.6))+'px)';
   const n=Math.round(CODE.length*cl((t-3.4)/6.4));$('cd').innerHTML=hl(CODE.slice(0,n))+'<span class="cur" style="opacity:'+(Math.floor(t*2.5)%2&&t<10.2?1:0)+'"></span>';
   $('z').style.opacity=cl((t-15.5)/.5);$('z').style.transform='scale('+(1.08-.08*e((t-15.5)/.8))+')';};</script></body></html>`;
  await render(c, 'beam-build-19s', html, 19); }

(async () => { fs.mkdirSync(K, { recursive: true }); const only = process.argv[2]; const c = await open('about:blank', 1920, 1080, 9300 + Math.floor(Math.random() * 90));
  if (!only || only === 'listings') await listings(c); if (!only || only === 'how') await how(c); if (!only || only === 'build') await build(c); c.close(); process.exit(0); })();
