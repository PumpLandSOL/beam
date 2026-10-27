// BEAM video set 5: VRF, Proof of Reserves, TWAP, alerts (animated)
// SITE=http://localhost:8232 node _studio/set5-video.cjs
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const B = path.join(__dirname, '..', 'brand'), K = path.join(__dirname, 'kit', 'set5'), FPS = 30, SITE = process.env.SITE || 'http://localhost:8232';
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

async function five(c) { // hook -> VRF -> reserves -> TWAP -> alerts -> end, 24 s
  const html = HEAD + `<style>.row{position:absolute;left:0;right:0;top:330px;display:flex;justify-content:center;gap:34px;opacity:0}.box{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:14px;padding:28px 34px;min-width:340px;text-align:center}.box .mono{font-size:18px;letter-spacing:.16em;color:#a9a7b3}.box .serif{font-size:66px;margin-top:8px}.ar{font:500 56px 'Inter Tight';color:#a78bfa;align-self:center}
  .ttl{position:absolute;left:0;right:0;top:110px;text-align:center;opacity:0}.ttl .serif{font-size:96px;line-height:1;margin-top:14px}.sub{position:absolute;left:0;right:0;top:700px;text-align:center;opacity:0;font:500 26px 'JetBrains Mono';color:#a9a7b3}
  .bars{display:flex;align-items:flex-end;gap:6px;height:220px}.bars i{width:14px;background:rgba(255,255,255,.18);border-radius:3px}</style>
  <div class="s" id="a"><div class="k">New on BEAM</div><div class="serif" style="font-size:150px;line-height:.92;margin-top:24px">One oracle.<br><span class="it spec">Four new layers.</span></div></div>

  <div class="ttl" id="t0"><div class="k">01 · BEAM VRF</div><div class="serif">Randomness <span class="it spec">you can verify.</span></div></div>
  <div class="row" id="r0"><div class="box"><div class="mono">SEED</div><div class="serif mono" style="font-size:44px;margin-top:22px">0x7f3a…c21e</div></div><div class="ar">→</div><div class="box"><div class="mono">VALIDATORS SIGN</div><div class="serif" id="v0">0 / 9</div></div><div class="ar">→</div><div class="box"><div class="mono">RANDOM</div><div class="serif mono" style="font-size:44px;margin-top:22px" id="v1">…</div></div></div>
  <div class="sub" id="s0">games · raffles · mints · fair draws on Robinhood Chain</div>

  <div class="ttl" id="t1"><div class="k">02 · Proof of Reserves</div><div class="serif">Backing, <span class="it spec">checked every round.</span></div></div>
  <div class="row" id="r1"><div class="box"><div class="mono">RESERVES</div><div class="serif" id="p0">0</div><div class="dim">read on-chain</div></div><div class="ar">÷</div><div class="box"><div class="mono">SUPPLY</div><div class="serif" id="p1">0</div><div class="dim">totalSupply()</div></div><div class="ar">=</div><div class="box" style="border-color:rgba(52,211,153,.6)"><div class="mono">RESERVE RATIO</div><div class="serif up" id="p2">0%</div><div class="dim">validator-signed</div></div></div>
  <div class="sub" id="s1">POR: feeds for any token or wallet on Robinhood Chain</div>

  <div class="ttl" id="t2"><div class="k">03 · TWAP + history</div><div class="serif">Prices <span class="it spec">that can't be spiked.</span></div></div>
  <div class="row" id="r2" style="align-items:center"><div class="bars" id="bars">${Array.from({ length: 40 }, () => '<i></i>').join('')}</div><div class="box" style="min-width:300px"><div class="mono">TSLA SPOT</div><div class="serif" id="w0">$0</div><div class="mono" style="margin-top:22px">TWAP 1H</div><div class="serif spec" id="w1">$0</div></div></div>
  <div class="sub" id="s2">getPriceNoOlderThan("TWAP:EQ:TSLA-USD:1h", 3600)</div>

  <div class="ttl" id="t3"><div class="k">04 · Alerts + webhooks</div><div class="serif">The oracle <span class="it spec">pings you.</span></div></div>
  <div class="row" id="r3"><div class="box"><div class="mono">TRIGGER</div><div class="serif" style="font-size:52px;margin-top:18px">BTC &gt; $120k</div></div><div class="ar">→</div><div class="box" style="min-width:560px;text-align:left;border-color:rgba(88,101,242,.8);background:rgba(88,101,242,.12)"><div class="mono" style="color:#c7cbff">DISCORD · WEBHOOK</div><div style="font:700 30px 'Inter Tight';margin-top:14px" id="al">…</div><div class="dim mono" style="font-size:18px;margin-top:10px">signed round attached</div></div></div>
  <div class="sub" id="s3">Discord or any HTTPS endpoint · fired from signed rounds</div>

  ${END('VRF. Reserves.<br><span class="it spec">TWAP. Alerts.</span>', 'BEAMPROTOCOL.ORG')}
  <script>${JS}const R=(a)=>{let x=a;return()=>(x=(x*16807)%2147483647)/2147483647},rnd=R(7),H=Array.from({length:40},()=>rnd());
  window.__seek=(t)=>{$('a').style.opacity=win(t,0,3);$('a').style.transform='scale('+(1.1-.1*e(t/1.2))+')';
  for(let i=0;i<4;i++){const a=3+i*4.5,o=win(t,a,a+4.5,.35);for(const k of ['t','r','s'])$(k+i).style.opacity=o;$('r'+i).style.transform='translateY('+(30-30*e((t-a-.15)/.5))+'px)';}
  const n=Math.min(9,Math.floor(cl((t-4)/1.6)*9.99));$('v0').textContent=n+' / 9';$('v1').textContent=n>=7?'0x'+'9c4e81d0'.slice(0,8)+'…':'…';$('v1').style.color=n>=7?'#34d399':'#a9a7b3';
  const p=e((t-8)/1.8);$('p0').textContent=(50.4*p).toFixed(1)+'M';$('p1').textContent=(48.0*p).toFixed(1)+'M';$('p2').textContent=(105*p).toFixed(0)+'%';
  const b=document.querySelectorAll('#bars i'),k=Math.floor(cl((t-12.3)/2.4)*40);b.forEach((x,j)=>{const spike=j===31;x.style.height=(j<k?(spike?210:70+H[j]*60):6)+'px';x.style.background=spike&&j<k?'#fb7185':j<k?'#8b5cf6':'rgba(255,255,255,.12)';});
  $('w0').textContent=k>31?'$468.20':'$'+(410+k*.9).toFixed(2);$('w0').style.color=k>31?'#fb7185':'#f3f1ec';$('w1').textContent='$'+(410+Math.min(k,40)*.55).toFixed(2);
  $('al').textContent=t>17.6?'🔔 BTC-USD crossed $120,000 · round #15,212':'…';
  $('z').style.opacity=cl((t-21)/.5);$('z').style.transform='scale('+(1.08-.08*e((t-21)/.8))+')';};</script></body></html>`;
  await render(c, 'beam-v5-24s', html, 24); }

(async () => { fs.mkdirSync(K, { recursive: true }); const c = await open('about:blank', 1920, 1080, 9300 + Math.floor(Math.random() * 90)); await five(c); c.close(); process.exit(0); })();
