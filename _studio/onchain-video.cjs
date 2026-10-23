// BEAM on-chain video: captures the live /onchain page, then deterministic frames → brand/beam-onchain-15s.mp4
// SITE=https://beamprotocol.org node _studio/onchain-video.cjs
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const B = path.join(__dirname, '..', 'brand'), K = path.join(__dirname, 'kit'), FR = path.join(__dirname, 'frames-onchain'), DUR = 15, FPS = 30, SITE = process.env.SITE || 'https://beamprotocol.org';
const MARK = fs.readFileSync(path.join(__dirname, '..', 'client', 'favicon.svg'), 'utf8'), SHOT = path.join(K, 'onchain-page.png'), url = (f) => 'file:///' + f.split(path.sep).join('/');
const RCV = '0x113ec1c595efc6be4185ef69565250a9cb767e72';
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;background:#04040a;color:#f3f1ec;overflow:hidden;position:relative;font-family:'Inter Tight'}
.s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.serif{font-family:'Instrument Serif';font-weight:400}.it{font-style:italic}.k{font:500 22px 'JetBrains Mono';letter-spacing:.24em;text-transform:uppercase;color:#a9a7b3}
.spec{background:linear-gradient(90deg,#8b5cf6,#3b82f6 22%,#06b6d4 40%,#22c55e 58%,#eab308 76%,#f97316 88%,#ef4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.glow{position:absolute;inset:0;background:radial-gradient(1100px 600px at 70% 20%,rgba(139,92,246,.22),transparent 65%),radial-gradient(900px 500px at 10% 90%,rgba(6,182,212,.12),transparent 60%)}
.mk svg{width:150px;height:150px}.win{position:absolute;left:210px;right:210px;top:130px;bottom:50px;border:1px solid rgba(255,255,255,.14);border-radius:16px;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.6);opacity:0}
.win img{width:100%;display:block}.cap{position:absolute;left:0;right:0;top:50px;text-align:center;opacity:0}</style></head><body><div class="glow"></div>
<div class="s" id="a"><div class="k">Live on Robinhood Chain</div><div class="serif" style="font-size:170px;line-height:.9;margin-top:24px">Don't trust us.<br><span class="it spec">Read the chain.</span></div></div>
<div class="cap" id="ac"><div class="k" style="color:#f3f1ec" id="ct">Your browser reads BeamReceiver directly · no BEAM server in between</div></div><div class="win" id="w"><img id="im" src="${url(SHOT)}"></div>
<div class="s" id="e"><div class="mk">${MARK}</div><div class="serif" style="font-size:130px;line-height:.92;margin-top:28px">Fully running.<br><span class="it spec">Fully on-chain.</span></div><div style="font:500 30px 'JetBrains Mono';margin-top:40px;color:#c4b5fd">${RCV}</div><div style="font:700 36px 'Inter Tight';letter-spacing:.12em;margin-top:28px">BEAMPROTOCOL.ORG/ONCHAIN</div></div>
<script>const $=(i)=>document.getElementById(i),cl=(x)=>Math.max(0,Math.min(1,x)),e=(x)=>1-Math.pow(1-cl(x),3),win=(t,a,b,f=.45)=>cl(Math.min((t-a)/f,(b-t)/f));
window.__seek=(t)=>{
 $('a').style.opacity=win(t,0,2.8);$('a').style.transform='scale('+(1.1-.1*e(t/1.2))+')';
 $('w').style.opacity=win(t,2.8,11.8,.4);$('ac').style.opacity=win(t,3,11.7,.4);
 const im=$('im'),maxY=Math.max(0,im.offsetHeight-$('w').offsetHeight);im.style.transform='translateY('+(-maxY*e((t-4)/7))+'px)';
 $('ct').textContent=t<7.4?'Your browser reads BeamReceiver directly · no BEAM server in between':'Every feed on-chain · every update verified by the contract';
 $('e').style.opacity=cl((t-11.8)/.5);$('e').style.transform='scale('+(1.08-.08*e((t-11.8)/.8))+')';};</script></body></html>`;
(async () => { fs.mkdirSync(K, { recursive: true }); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR);
  const c = await open('about:blank', 1920, 1080, 9300 + Math.floor(Math.random() * 90));
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1900, deviceScaleFactor: 1.5, mobile: false }); await c.send('Page.navigate', { url: SITE + '/onchain' }); await sleep(16000); await c.shot(SHOT); console.log('captured /onchain');
  const f = path.join(K, 'onchain-video.html'); fs.writeFileSync(f, html);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await c.send('Page.navigate', { url: url(f) }); await sleep(3000); await c.ev('document.fonts.ready.then(()=>1)');
  for (let i = 0; i < DUR * FPS; i++) { await c.ev('__seek(' + (i / FPS).toFixed(4) + ')'); await c.shot(path.join(FR, 'f_' + String(i).padStart(4, '0') + '.jpg'), 'jpeg'); if (i % 150 === 0) console.log('frame', i); }
  c.close(); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FR, 'f_%04d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', path.join(B, 'beam-onchain-15s.mp4')]);
  fs.rmSync(FR, { recursive: true, force: true }); console.log('OK beam-onchain-15s.mp4'); process.exit(0); })();
