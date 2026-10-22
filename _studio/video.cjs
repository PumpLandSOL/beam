// BEAM hype video: deterministic frames via window.__seek(t), 30 fps, 1920x1080 → brand/beam-hype-21s.mp4
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const B = path.join(__dirname, '..', 'brand'), FR = path.join(__dirname, 'frames-hype'), DUR = 21, FPS = 30;
const img = (n) => 'file:///' + path.join(B, n).split(path.sep).join('/');
const MARK = fs.readFileSync(path.join(__dirname, '..', 'client', 'favicon.svg'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;background:#04040a;color:#f3f1ec;overflow:hidden;position:relative;font-family:'Inter Tight'}
.s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.serif{font-family:'Instrument Serif';font-weight:400}.it{font-style:italic}.k{font:500 22px 'JetBrains Mono';letter-spacing:.24em;text-transform:uppercase;color:#a9a7b3}
.spec{background:linear-gradient(90deg,#8b5cf6,#3b82f6 22%,#06b6d4 40%,#22c55e 58%,#eab308 76%,#f97316 88%,#ef4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.shot{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0}
.glow{position:absolute;inset:0;background:radial-gradient(1100px 600px at 70% 20%,rgba(139,92,246,.22),transparent 65%)}
.mk svg{width:180px;height:180px}.cap{position:absolute;left:0;right:0;top:40px;text-align:center;opacity:0}.cap .t{display:inline-block;background:rgba(4,4,10,.82);border:1px solid rgba(255,255,255,.12);padding:18px 34px;border-radius:999px;font:500 40px 'Inter Tight'}
</style></head><body><div class="glow"></div>
<div class="s" id="a"><div class="mk">${MARK}</div><div style="font:700 120px 'Inter Tight';letter-spacing:.16em;margin-top:28px">BEAM</div></div>
<div class="s" id="b"><div class="k">Robinhood Chain is putting stocks on-chain</div><div class="serif" style="font-size:150px;line-height:.92;margin-top:26px">Every market<br>needs a <span class="it spec">price.</span></div></div>
<div class="shot" id="c" style="background-image:url('${img('beam-keyart.png')}')"></div><div class="cap" id="cc"><span class="t">Eight exchanges in. One signed price out.</span></div>
<div class="shot" id="d" style="background-image:url('${img('beam-g04-feeds.png')}')"></div>
<div class="shot" id="e" style="background-image:url('${img('beam-g02-vs-chainlink.png')}')"></div>
<div class="shot" id="f" style="background-image:url('${img('beam-g03-run.png')}')"></div>
<div class="s" id="g"><div class="mk">${MARK}</div><div class="serif" style="font-size:150px;line-height:.9;margin-top:30px">Robinhood Chain's<br><span class="it spec">oracle.</span></div><div class="k" style="margin-top:40px">beamprotocol.org · @BeamProtocolRH</div></div>
<script>const $=(i)=>document.getElementById(i),cl=(x)=>Math.max(0,Math.min(1,x)),e=(x)=>1-Math.pow(1-cl(x),3);
const win=(t,a,b,f=.45)=>cl(Math.min((t-a)/f,(b-t)/f));
window.__seek=(t)=>{
 $('a').style.opacity=win(t,0,2.6);$('a').style.transform='scale('+(1.12-.12*e(t/1.2))+')';
 $('b').style.opacity=win(t,2.6,5.8);$('b').style.transform='translateY('+(40-40*e((t-2.6)/.7))+'px)';
 $('c').style.opacity=win(t,5.8,9.6,.35);$('c').style.transform='scale('+(1.18-.14*cl((t-5.8)/3.8))+')';$('cc').style.opacity=win(t,6.4,9.4,.3);
 $('d').style.opacity=win(t,9.6,12.6,.3);$('d').style.transform='scale('+(1.06-.06*cl((t-9.6)/3))+')';
 $('e').style.opacity=win(t,12.6,15.8,.3);$('e').style.transform='scale('+(1.08-.08*cl((t-12.6)/3.2))+')';
 $('f').style.opacity=win(t,15.8,18.4,.3);$('f').style.transform='scale('+(1.06-.06*cl((t-15.8)/2.6))+')';
 $('g').style.opacity=cl((t-18.4)/.5);$('g').style.transform='scale('+(1.08-.08*e((t-18.4)/.8))+')';};</script></body></html>`;
(async () => { const f = path.join(__dirname, 'kit', 'hype.html'); fs.writeFileSync(f, html); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR);
  const c = await open('about:blank', 1920, 1080, 9300 + Math.floor(Math.random() * 90)); await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await c.send('Page.navigate', { url: 'file:///' + f.split(path.sep).join('/') }); await sleep(3000); await c.ev('document.fonts.ready.then(()=>1)');
  for (let i = 0; i < DUR * FPS; i++) { await c.ev('__seek(' + (i / FPS).toFixed(4) + ')'); await c.shot(path.join(FR, 'f_' + String(i).padStart(4, '0') + '.jpg'), 'jpeg'); if (i % 150 === 0) console.log('frame', i); }
  c.close(); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FR, 'f_%04d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', path.join(B, 'beam-hype-21s.mp4')]);
  fs.rmSync(FR, { recursive: true, force: true }); console.log('OK beam-hype-21s.mp4'); process.exit(0); })();
