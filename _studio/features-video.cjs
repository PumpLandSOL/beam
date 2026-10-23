// BEAM features hype video: captures live pages, then a captioned montage → brand/beam-features-26s.mp4
// SITE=https://beamprotocol.org node _studio/features-video.cjs
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const B = path.join(__dirname, '..', 'brand'), K = path.join(__dirname, 'kit', 'feat'), FR = path.join(__dirname, 'frames-feat'), FPS = 30, SITE = process.env.SITE || 'https://beamprotocol.org';
const MARK = fs.readFileSync(path.join(__dirname, '..', 'client', 'favicon.svg'), 'utf8'), url = (f) => 'file:///' + f.split(path.sep).join('/');
const PAGES = [['onchain', '/onchain', 'Live on Robinhood Chain', 'Every price read straight from the BeamReceiver contract'],
  ['feeds', '/feeds', '39 oracle feeds', 'Crypto, US stocks, FX and gold, every 10 seconds'],
  ['validators', '/validators', 'Validators agree', 'Stake-weighted median, signed every round'],
  ['run', '/run', 'Run a validator from a tab', 'Hold $BEAM, open a browser tab, press start'],
  ['explorer', '/explorer', 'Every round in the open', 'Each validator signature, public'],
  ['verify', '/verify', 'Verify any packet', 'Your browser recovers every signature itself'],
  ['tunnels', '/tunnels', 'Tunnels for builders', 'Your feeds, your heartbeat, delivered on-chain'],
  ['embed', '/embed', 'BEAM Stream', 'Live oracle prices on any website, one line'],
  ['season', '/season', 'Oracle Season 1', 'Validators and builders earn points']];
const SEG = 2.2, T0 = 2.6, END = T0 + PAGES.length * SEG, DUR = END + 3.4;
(async () => { fs.mkdirSync(K, { recursive: true }); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR);
  const c = await open('about:blank', 1920, 1080, 9300 + Math.floor(Math.random() * 90));
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.4, mobile: false });
  for (const [k, p] of PAGES) { await c.send('Page.navigate', { url: SITE + p }); await sleep(k === 'onchain' || k === 'embed' ? 14000 : 9000); await c.shot(path.join(K, k + '.png')); console.log('captured', p); }
  const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;background:#04040a;color:#f3f1ec;overflow:hidden;position:relative;font-family:'Inter Tight'}
.s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
.serif{font-family:'Instrument Serif';font-weight:400}.it{font-style:italic}.k{font:500 22px 'JetBrains Mono';letter-spacing:.24em;text-transform:uppercase;color:#a9a7b3}
.spec{background:linear-gradient(90deg,#8b5cf6,#3b82f6 22%,#06b6d4 40%,#22c55e 58%,#eab308 76%,#f97316 88%,#ef4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.glow{position:absolute;inset:0;background:radial-gradient(1100px 600px at 70% 20%,rgba(139,92,246,.22),transparent 65%),radial-gradient(900px 500px at 10% 90%,rgba(6,182,212,.12),transparent 60%)}
.mk svg{width:150px;height:150px}.p{position:absolute;left:300px;right:300px;top:230px;height:${Math.round((1920 - 600) * 900 / 1440)}px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background-size:cover;background-position:top center;box-shadow:0 40px 120px rgba(0,0,0,.6);opacity:0}
.cap{position:absolute;left:0;right:0;top:56px;text-align:center;opacity:0}.cap .n{font:500 18px 'JetBrains Mono';letter-spacing:.24em;color:#a78bfa}.cap .h{font:400 84px/1 'Instrument Serif';margin-top:10px}.cap .d{font-size:26px;color:#a9a7b3;margin-top:10px}
.bar{position:absolute;left:0;bottom:0;height:5px;background:linear-gradient(90deg,#8b5cf6,#3b82f6,#06b6d4,#22c55e,#eab308,#f97316,#ef4444)}</style></head><body><div class="glow"></div>
<div class="s" id="a"><div class="mk">${MARK}</div><div class="k" style="margin-top:30px">Robinhood Chain's oracle</div><div class="serif" style="font-size:160px;line-height:.9;margin-top:22px">BEAM is <span class="it spec">live.</span></div></div>
${PAGES.map(([k, , h, d], i) => `<div class="cap" id="c${i}"><div class="n">${String(i + 1).padStart(2, '0')} / ${String(PAGES.length).padStart(2, '0')}</div><div class="h">${h}</div><div class="d">${d}</div></div><div class="p" id="p${i}" style="background-image:url('${url(path.join(K, k + '.png'))}')"></div>`).join('')}
<div class="s" id="e"><div class="mk">${MARK}</div><div class="serif" style="font-size:132px;line-height:.92;margin-top:28px">The permissionless<br><span class="it spec">oracle.</span></div><div class="k" style="margin-top:34px">Live on Robinhood Chain · no whitelist · verify everything</div><div style="font:700 40px 'Inter Tight';letter-spacing:.12em;margin-top:34px">BEAMPROTOCOL.ORG</div></div><div class="bar" id="br"></div>
<script>const $=(i)=>document.getElementById(i),cl=(x)=>Math.max(0,Math.min(1,x)),e=(x)=>1-Math.pow(1-cl(x),3),win=(t,a,b,f=.3)=>cl(Math.min((t-a)/f,(b-t)/f));
window.__seek=(t)=>{ $('a').style.opacity=win(t,0,${T0},.4);$('a').style.transform='scale('+(1.1-.1*e(t/1.2))+')';
 for(let i=0;i<${PAGES.length};i++){const a=${T0}+i*${SEG},b=a+${SEG};const o=win(t,a,b,.22);$('p'+i).style.opacity=o;$('c'+i).style.opacity=o;
  $('p'+i).style.transform='translateY('+(40-40*e((t-a)/.5))+'px) scale('+(1.0+.03*cl((t-a)/${SEG}))+')';$('c'+i).style.transform='translateY('+(16-16*e((t-a)/.4))+'px)';}
 $('e').style.opacity=cl((t-${END})/.4);$('e').style.transform='scale('+(1.08-.08*e((t-${END})/.8))+')';$('br').style.width=(100*cl(t/${DUR}))+'%';};</script></body></html>`;
  const f = path.join(K, 'features-video.html'); fs.writeFileSync(f, html);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await c.send('Page.navigate', { url: url(f) }); await sleep(3000); await c.ev('document.fonts.ready.then(()=>1)');
  const N = Math.round(DUR * FPS); for (let i = 0; i < N; i++) { await c.ev('__seek(' + (i / FPS).toFixed(4) + ')'); await c.shot(path.join(FR, 'f_' + String(i).padStart(4, '0') + '.jpg'), 'jpeg'); if (i % 150 === 0) console.log('frame', i); }
  c.close(); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FR, 'f_%04d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', path.join(B, 'beam-features-26s.mp4')]);
  fs.rmSync(FR, { recursive: true, force: true }); console.log('OK beam-features-26s.mp4', DUR.toFixed(1) + 's'); process.exit(0); })();
