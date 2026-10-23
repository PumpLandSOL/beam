// BEAM Oracle Season 1 video: captures /season from a running site, then deterministic frames via window.__seek(t) → brand/beam-season-16s.mp4
// SITE=http://localhost:8232 node _studio/season-video.cjs
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const B = path.join(__dirname, '..', 'brand'), FR = path.join(__dirname, 'frames-season'), DUR = 16, FPS = 30, SITE = process.env.SITE || 'http://localhost:8232';
const MARK = fs.readFileSync(path.join(__dirname, '..', 'client', 'favicon.svg'), 'utf8'), SHOT = path.join(__dirname, 'kit', 'season-page.png');
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;background:#04040a;color:#f3f1ec;overflow:hidden;position:relative;font-family:'Inter Tight'}
.s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.serif{font-family:'Instrument Serif';font-weight:400}.it{font-style:italic}.k{font:500 22px 'JetBrains Mono';letter-spacing:.24em;text-transform:uppercase;color:#a9a7b3}
.spec{background:linear-gradient(90deg,#8b5cf6,#3b82f6 22%,#06b6d4 40%,#22c55e 58%,#eab308 76%,#f97316 88%,#ef4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.glow{position:absolute;inset:0;background:radial-gradient(1100px 600px at 70% 20%,rgba(139,92,246,.22),transparent 65%),radial-gradient(900px 500px at 10% 90%,rgba(6,182,212,.12),transparent 60%)}
.mk svg{width:150px;height:150px}.cards{display:flex;gap:36px;margin-top:60px}.c{width:440px;padding:40px 36px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.03);text-align:left;opacity:0}
.c .t{font:500 18px 'JetBrains Mono';letter-spacing:.18em;text-transform:uppercase}.c b{display:block;font:400 110px/1 'Instrument Serif';margin:18px 0 12px}.c p{font-size:24px;color:#a9a7b3;line-height:1.4}
.meter{width:1100px;height:26px;border-radius:13px;background:rgba(255,255,255,.08);margin-top:70px;overflow:hidden}.meter i{display:block;height:100%;width:25%;background:linear-gradient(90deg,#8b5cf6,#06b6d4,#22c55e,#eab308,#f97316)}
.shot{position:absolute;left:160px;right:160px;top:150px;bottom:60px;background:url('file:///${SHOT.split(path.sep).join('/')}') top center/cover;border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 40px 120px rgba(0,0,0,.6);opacity:0}
.cap{position:absolute;left:0;right:0;top:56px;text-align:center;opacity:0}</style></head><body><div class="glow"></div>
<div class="s" id="a"><div class="mk">${MARK}</div><div class="k" style="margin-top:34px">Oracle Season 1 · live now</div><div class="serif" style="font-size:170px;line-height:.9;margin-top:22px">Build the <span class="it spec">oracle.</span></div></div>
<div class="s" id="b"><div class="k">Every action earns points</div><div class="cards">
 <div class="c" id="b1"><div class="t" style="color:#06b6d4">Validate</div><b>10 pts</b><p>every round your validator signs</p></div>
 <div class="c" id="b2"><div class="t" style="color:#22c55e">Co-sign</div><b>5 pts</b><p>every oracle packet you verify</p></div>
 <div class="c" id="b3"><div class="t" style="color:#f97316">Deliver</div><b>2 pts</b><p>every packet your tunnels deliver</p></div></div></div>
<div class="s" id="c"><div class="k">Hold more $BEAM. Earn more.</div><div class="serif" style="font-size:240px;line-height:1;margin-top:20px"><span id="mx" class="spec">1.0x</span></div><div class="meter"><i id="mb"></i></div><div style="font:500 30px 'JetBrains Mono';margin-top:26px;color:#a9a7b3"><span id="hb">1,000,000</span> $BEAM held</div></div>
<div class="cap" id="dc"><div class="k" style="color:#f3f1ec">Live leaderboard · beamprotocol.org/season</div></div><div class="shot" id="d"></div>
<div class="s" id="e"><div class="mk">${MARK}</div><div class="serif" style="font-size:150px;line-height:.92;margin-top:30px">Season 1 <span class="it spec">is live.</span></div><div class="k" style="margin-top:34px">Run a validator · open a tunnel · climb the board</div><div style="font:700 40px 'Inter Tight';letter-spacing:.12em;margin-top:40px">BEAMPROTOCOL.ORG/SEASON</div></div>
<script>const $=(i)=>document.getElementById(i),cl=(x)=>Math.max(0,Math.min(1,x)),e=(x)=>1-Math.pow(1-cl(x),3),win=(t,a,b,f=.45)=>cl(Math.min((t-a)/f,(b-t)/f));
window.__seek=(t)=>{
 $('a').style.opacity=win(t,0,2.8);$('a').style.transform='scale('+(1.1-.1*e(t/1.2))+')';
 $('b').style.opacity=win(t,2.8,6.6);[1,2,3].forEach((k)=>{const x=e((t-3.0-k*.35)/.6);$('b'+k).style.opacity=x;$('b'+k).style.transform='translateY('+(60-60*x)+'px)';});
 $('c').style.opacity=win(t,6.6,10);const m=1+3*e((t-7.1)/2.2);$('mx').textContent=m.toFixed(1)+'x';$('mb').style.width=(25*m)+'%';$('hb').textContent=Math.round(m*1e6).toLocaleString('en-US');
 $('d').style.opacity=win(t,10,13.4,.35);$('dc').style.opacity=win(t,10.2,13.3,.35);$('d').style.transform='translateY('+(-120*cl((t-10)/3.4))+'px) scale('+(1.04-.04*cl((t-10)/3.4))+')';$('d').style.backgroundPosition='center '+(cl((t-10.4)/3)*35)+'%';
 $('e').style.opacity=cl((t-13.4)/.5);$('e').style.transform='scale('+(1.08-.08*e((t-13.4)/.8))+')';};</script></body></html>`;
(async () => { fs.mkdirSync(path.join(__dirname, 'kit'), { recursive: true }); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR);
  const c = await open('about:blank', 1920, 1080, 9300 + Math.floor(Math.random() * 90));
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1500, deviceScaleFactor: 1.5, mobile: false }); await c.send('Page.navigate', { url: SITE + '/season' }); await sleep(7000);
  await c.shot(SHOT); console.log('captured /season');
  const f = path.join(__dirname, 'kit', 'season-video.html'); fs.writeFileSync(f, html);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await c.send('Page.navigate', { url: 'file:///' + f.split(path.sep).join('/') }); await sleep(3000); await c.ev('document.fonts.ready.then(()=>1)');
  for (let i = 0; i < DUR * FPS; i++) { await c.ev('__seek(' + (i / FPS).toFixed(4) + ')'); await c.shot(path.join(FR, 'f_' + String(i).padStart(4, '0') + '.jpg'), 'jpeg'); if (i % 150 === 0) console.log('frame', i); }
  c.close(); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FR, 'f_%04d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', path.join(B, 'beam-season-16s.mp4')]);
  fs.rmSync(FR, { recursive: true, force: true }); console.log('OK beam-season-16s.mp4'); process.exit(0); })();
