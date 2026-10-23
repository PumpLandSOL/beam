// BEAM Stream video: captures a third-party page running widget.js and /embed, then deterministic frames → brand/beam-stream-16s.mp4
// SITE=http://localhost:8232 node _studio/stream-video.cjs
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const B = path.join(__dirname, '..', 'brand'), K = path.join(__dirname, 'kit'), FR = path.join(__dirname, 'frames-stream'), DUR = 16, FPS = 30, SITE = process.env.SITE || 'http://localhost:8232';
const MARK = fs.readFileSync(path.join(__dirname, '..', 'client', 'favicon.svg'), 'utf8'), url = (f) => 'file:///' + f.split(path.sep).join('/');
const TP = path.join(K, 'stream-thirdparty.html'), TPS = path.join(K, 'stream-thirdparty.png'), EMS = path.join(K, 'stream-embed.png');
const CODE = '<script src="https://beamprotocol.org/widget.js"></script>';
fs.mkdirSync(K, { recursive: true });
fs.writeFileSync(TP, `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;700&display=swap" rel="stylesheet"></head><body style="margin:0;background:#f4f1ea;font-family:'Inter Tight';color:#16151a">
<div style="display:flex;justify-content:space-between;align-items:center;padding:26px 60px;border-bottom:1px solid #ddd8cc"><b style="font-size:24px;letter-spacing:.04em">your.app</b><span style="color:#77736a">Markets · Lend · Earn</span></div>
<div style="padding:30px 60px 0"><script src="${SITE}/widget.js" data-feeds="CS:BTC-USD,CS:ETH-USD,EQ:HOOD-USD,EQ:TSLA-USD,EQ:NVDA-USD,EQ:SPY-USD,CM:XAU-USD" data-theme="light"></script></div>
<div style="display:flex;gap:40px;padding:50px 60px"><div style="flex:1"><div style="font-size:64px;font-weight:700;line-height:1.02">Trade tokenized stocks<br>on Robinhood Chain.</div><div style="font-size:22px;color:#77736a;margin-top:22px;max-width:560px">Live prices from the BEAM oracle, right on the page.</div></div>
<div style="width:400px"><script src="${SITE}/widget.js" data-feeds="EQ:TSLA-USD,EQ:AAPL-USD,EQ:MSFT-USD,EQ:AMZN-USD" data-layout="card"></script></div></div></body></html>`);
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;background:#04040a;color:#f3f1ec;overflow:hidden;position:relative;font-family:'Inter Tight'}
.s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.serif{font-family:'Instrument Serif';font-weight:400}.it{font-style:italic}.k{font:500 22px 'JetBrains Mono';letter-spacing:.24em;text-transform:uppercase;color:#a9a7b3}
.spec{background:linear-gradient(90deg,#8b5cf6,#3b82f6 22%,#06b6d4 40%,#22c55e 58%,#eab308 76%,#f97316 88%,#ef4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.glow{position:absolute;inset:0;background:radial-gradient(1100px 600px at 70% 20%,rgba(139,92,246,.22),transparent 65%),radial-gradient(900px 500px at 10% 90%,rgba(6,182,212,.12),transparent 60%)}
.mk svg{width:150px;height:150px}.code{font:500 38px 'JetBrains Mono';padding:40px 56px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.03);margin-top:50px;min-width:1500px;text-align:left;white-space:pre}
.code .tg{color:#a78bfa}.code .at{color:#86efac}.cur{display:inline-block;width:20px;height:40px;background:#f3f1ec;vertical-align:middle;margin-left:4px}
.shot{position:absolute;left:150px;right:150px;top:150px;bottom:70px;background-position:top center;background-size:cover;border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 40px 120px rgba(0,0,0,.6);opacity:0}
.cap{position:absolute;left:0;right:0;top:62px;text-align:center;opacity:0}</style></head><body><div class="glow"></div>
<div class="s" id="a"><div class="mk">${MARK}</div><div class="k" style="margin-top:34px">New · BEAM Stream</div><div class="serif" style="font-size:150px;line-height:.92;margin-top:22px">The oracle,<br><span class="it spec">on every website.</span></div></div>
<div class="s" id="b"><div class="k">One line of code</div><div class="code" id="cd"></div></div>
<div class="cap" id="cc"><div class="k" style="color:#f3f1ec">Live oracle prices on any site · updated every 10 s</div></div><div class="shot" id="c" style="background-image:url('${url(TPS)}')"></div>
<div class="cap" id="dc"><div class="k" style="color:#f3f1ec">Pick feeds · pick a style · copy · paste</div></div><div class="shot" id="d" style="background-image:url('${url(EMS)}')"></div>
<div class="s" id="e"><div class="mk">${MARK}</div><div class="serif" style="font-size:140px;line-height:.92;margin-top:30px">Crypto. Stocks. FX.<br><span class="it spec">One line.</span></div><div style="font:700 40px 'Inter Tight';letter-spacing:.12em;margin-top:44px">BEAMPROTOCOL.ORG/EMBED</div></div>
<script>const $=(i)=>document.getElementById(i),cl=(x)=>Math.max(0,Math.min(1,x)),e=(x)=>1-Math.pow(1-cl(x),3),win=(t,a,b,f=.45)=>cl(Math.min((t-a)/f,(b-t)/f));
const CODE=${JSON.stringify(CODE).replace(/</g, '\\u003c')},esc=(s)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
function hl(s){return esc(s).replace(/(&lt;\\/?script)/g,'<span class="tg">$1</span>').replace(/("https[^"]*"?)/,'<span class="at">$1</span>');}
window.__seek=(t)=>{
 $('a').style.opacity=win(t,0,2.8);$('a').style.transform='scale('+(1.1-.1*e(t/1.2))+')';
 $('b').style.opacity=win(t,2.8,6.2);const n=Math.round(CODE.length*cl((t-3.2)/1.8));$('cd').innerHTML=hl(CODE.slice(0,n))+'<span class="cur" style="opacity:'+(Math.floor(t*2.5)%2?1:0)+'"></span>';
 $('c').style.opacity=win(t,6.2,9.8,.35);$('cc').style.opacity=win(t,6.4,9.7,.35);$('c').style.transform='scale('+(1.05-.05*cl((t-6.2)/3.6))+')';
 $('d').style.opacity=win(t,9.8,13.2,.35);$('dc').style.opacity=win(t,10,13.1,.35);$('d').style.transform='translateY('+(-60*cl((t-9.8)/3.4))+'px)';
 $('e').style.opacity=cl((t-13.2)/.5);$('e').style.transform='scale('+(1.08-.08*e((t-13.2)/.8))+')';};</script></body></html>`;
(async () => { fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR);
  const c = await open('about:blank', 1920, 1080, 9300 + Math.floor(Math.random() * 90));
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1620, height: 860, deviceScaleFactor: 1.5, mobile: false }); await c.send('Page.navigate', { url: url(TP) }); await sleep(14000); await c.shot(TPS);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1.5, mobile: false }); await c.send('Page.navigate', { url: SITE + '/embed' }); await sleep(14000); await c.shot(EMS); console.log('captured pages');
  const f = path.join(K, 'stream-video.html'); fs.writeFileSync(f, html);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await c.send('Page.navigate', { url: url(f) }); await sleep(3000); await c.ev('document.fonts.ready.then(()=>1)');
  for (let i = 0; i < DUR * FPS; i++) { await c.ev('__seek(' + (i / FPS).toFixed(4) + ')'); await c.shot(path.join(FR, 'f_' + String(i).padStart(4, '0') + '.jpg'), 'jpeg'); if (i % 150 === 0) console.log('frame', i); }
  c.close(); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FR, 'f_%04d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', path.join(B, 'beam-stream-16s.mp4')]);
  fs.rmSync(FR, { recursive: true, force: true }); console.log('OK beam-stream-16s.mp4'); process.exit(0); })();
