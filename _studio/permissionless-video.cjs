// BEAM vs Chainlink / permissionless video: deterministic frames → brand/beam-permissionless-18s.mp4
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const B = path.join(__dirname, '..', 'brand'), K = path.join(__dirname, 'kit'), FR = path.join(__dirname, 'frames-perm'), DUR = 18, FPS = 30;
const MARK = fs.readFileSync(path.join(__dirname, '..', 'client', 'favicon.svg'), 'utf8'), img = (n) => 'file:///' + path.join(B, n).split(path.sep).join('/');
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;background:#04040a;color:#f3f1ec;overflow:hidden;position:relative;font-family:'Inter Tight'}
.s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.serif{font-family:'Instrument Serif';font-weight:400}.it{font-style:italic}.k{font:500 22px 'JetBrains Mono';letter-spacing:.24em;text-transform:uppercase;color:#a9a7b3}
.spec{background:linear-gradient(90deg,#8b5cf6,#3b82f6 22%,#06b6d4 40%,#22c55e 58%,#eab308 76%,#f97316 88%,#ef4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.glow{position:absolute;inset:0;background:radial-gradient(1100px 600px at 70% 20%,rgba(139,92,246,.22),transparent 65%),radial-gradient(900px 500px at 10% 90%,rgba(6,182,212,.12),transparent 60%)}
.mk svg{width:150px;height:150px}.cols{display:flex;gap:60px;margin-top:56px}.col{width:700px;padding:44px 48px;border-radius:16px;text-align:left;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03)}
.col h3{font:500 20px 'JetBrains Mono';letter-spacing:.2em;text-transform:uppercase;margin-bottom:26px}.st{display:flex;gap:18px;align-items:center;font-size:36px;margin-top:20px;opacity:0}.st i{font-style:normal;width:44px;text-align:center}
.no{color:#fb7185}.yes{color:#34d399}.strike{position:relative}.strike:after{content:'';position:absolute;left:-6px;right:-6px;top:52%;height:4px;background:#fb7185;transform-origin:left;transform:scaleX(var(--s,0))}
.shot{position:absolute;left:150px;right:150px;top:110px;bottom:110px;background-size:contain;background-repeat:no-repeat;background-position:center;opacity:0}</style></head><body><div class="glow"></div>
<div class="s" id="a"><div class="k">Who decides who runs an oracle?</div><div class="serif" style="font-size:170px;line-height:.9;margin-top:26px">Not <span class="it spec">anyone.</span></div></div>
<div class="s" id="b"><div class="cols">
 <div class="col"><h3 style="color:#a9a7b3">Chainlink price feeds</h3><div class="st" id="c1"><i class="no">✕</i><span>Apply to be a node operator</span></div><div class="st" id="c2"><i class="no">✕</i><span>Get reviewed</span></div><div class="st" id="c3"><i class="no">✕</i><span>Get approved, or don't</span></div><div class="st" id="c4" style="color:#a9a7b3"><i></i><span>Up to 31 signers per feed</span></div></div>
 <div class="col" style="border-color:rgba(139,92,246,.6);background:rgba(139,92,246,.08)"><h3 class="spec">BEAM</h3><div class="st" id="d1"><i class="yes">✓</i><span>Hold $BEAM</span></div><div class="st" id="d2"><i class="yes">✓</i><span>Open a browser tab</span></div><div class="st" id="d3"><i class="yes">✓</i><span>Press start. You're signing.</span></div><div class="st" id="d4" style="color:#a9a7b3"><i></i><span>No whitelist. No approval.</span></div></div></div></div>
<div class="s" id="c"><div class="k">Permissionless</div><div class="serif" style="font-size:150px;line-height:.92;margin-top:24px">No whitelist.<br>No gatekeeper.<br><span class="it spec">No one's permission.</span></div></div>
<div class="shot" id="d" style="background-image:url('${img('beam-g13-vs-oracles.png')}')"></div>
<div class="shot" id="e" style="background-image:url('${img('beam-g03-run.png')}')"></div>
<div class="s" id="f"><div class="mk">${MARK}</div><div class="serif" style="font-size:140px;line-height:.92;margin-top:30px">The permissionless<br><span class="it spec">oracle.</span></div><div class="k" style="margin-top:34px">Built for Robinhood Chain</div><div style="font:700 40px 'Inter Tight';letter-spacing:.12em;margin-top:40px">BEAMPROTOCOL.ORG/RUN</div></div>
<script>const $=(i)=>document.getElementById(i),cl=(x)=>Math.max(0,Math.min(1,x)),e=(x)=>1-Math.pow(1-cl(x),3),win=(t,a,b,f=.45)=>cl(Math.min((t-a)/f,(b-t)/f));
window.__seek=(t)=>{
 $('a').style.opacity=win(t,0,2.8);$('a').style.transform='scale('+(1.1-.1*e(t/1.2))+')';
 $('b').style.opacity=win(t,2.8,8.2);['c1','c2','c3','c4'].forEach((id,k)=>{const x=e((t-3.2-k*.45)/.5);$(id).style.opacity=x;$(id).style.transform='translateX('+(-30+30*x)+'px)';});
 ['d1','d2','d3','d4'].forEach((id,k)=>{const x=e((t-5.0-k*.45)/.5);$(id).style.opacity=x;$(id).style.transform='translateX('+(30-30*x)+'px)';});
 $('c').style.opacity=win(t,8.2,11);$('c').style.transform='translateY('+(30-30*e((t-8.2)/.7))+'px)';
 $('d').style.opacity=win(t,11,13.8,.35);$('d').style.transform='scale('+(1.05-.05*cl((t-11)/2.8))+')';
 $('e').style.opacity=win(t,13.8,16,.35);$('e').style.transform='scale('+(1.05-.05*cl((t-13.8)/2.2))+')';
 $('f').style.opacity=cl((t-16)/.5);$('f').style.transform='scale('+(1.08-.08*e((t-16)/.8))+')';};</script></body></html>`;
(async () => { fs.mkdirSync(K, { recursive: true }); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR);
  const f = path.join(K, 'permissionless-video.html'); fs.writeFileSync(f, html);
  const c = await open('about:blank', 1920, 1080, 9300 + Math.floor(Math.random() * 90)); await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await c.send('Page.navigate', { url: 'file:///' + f.split(path.sep).join('/') }); await sleep(3000); await c.ev('document.fonts.ready.then(()=>1)');
  for (let i = 0; i < DUR * FPS; i++) { await c.ev('__seek(' + (i / FPS).toFixed(4) + ')'); await c.shot(path.join(FR, 'f_' + String(i).padStart(4, '0') + '.jpg'), 'jpeg'); if (i % 150 === 0) console.log('frame', i); }
  c.close(); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FR, 'f_%04d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', path.join(B, 'beam-permissionless-18s.mp4')]);
  fs.rmSync(FR, { recursive: true, force: true }); console.log('OK beam-permissionless-18s.mp4'); process.exit(0); })();
