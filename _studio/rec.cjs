// Real-time screen recorder for BEAM videos: Chrome screencast frames + timestamps → smooth 30 fps mp4.
// node _studio/rec.cjs demo|run|tunnel   (site must be running on :8232)
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp.cjs');
const W = 1600, H = 900, SITE = 'http://localhost:8232', OUT = path.join(__dirname, '..', 'brand');
const MARK = fs.readFileSync(path.join(__dirname, '..', 'client', 'favicon.svg'), 'utf8').replace(/"/g, "'");
const OVERLAY = `(() => { if (document.getElementById('rv')) return 1; const s = document.createElement('style'); s.textContent = ".hdr{display:none!important}.hero{margin-top:0!important}#rv{position:fixed;inset:0;z-index:9999;pointer-events:none;font-family:'Inter Tight',sans-serif}#rvc{position:absolute;left:50%;top:26px;transform:translateX(-50%);background:rgba(4,4,10,.86);border:1px solid rgba(255,255,255,.14);color:#f3f1ec;padding:14px 28px;border-radius:999px;font:500 26px 'Inter Tight';opacity:0;transition:opacity .35s;white-space:nowrap;backdrop-filter:blur(8px)}#rvc b{background:linear-gradient(90deg,#8b5cf6,#06b6d4,#22c55e,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent}#rvf{position:absolute;inset:0;background:#04040a;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#f3f1ec;opacity:0;transition:opacity .5s}#rvf .t{font-family:'Instrument Serif',serif;font-size:112px;line-height:.92}#rvf .t i{background:linear-gradient(90deg,#8b5cf6,#3b82f6,#06b6d4,#22c55e,#eab308,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent}#rvf .k{font:500 18px 'JetBrains Mono';letter-spacing:.24em;text-transform:uppercase;color:#a9a7b3;margin-top:30px}#rvf svg{width:110px;height:110px;margin-bottom:26px}"; document.head.append(s);
  const d = document.createElement('div'); d.id = 'rv'; d.innerHTML = '<div id="rvc"></div><div id="rvf"></div>'; document.body.append(d);
  window.__cap = (t) => { const c = document.getElementById('rvc'); if (!t) { c.style.opacity = 0; return; } c.innerHTML = t; c.style.opacity = 1; };
  window.__full = (h) => { const f = document.getElementById('rvf'); if (!h) { f.style.opacity = 0; return; } f.innerHTML = h; f.style.opacity = 1; }; return 1; })()`;
const full = (title, kick) => `"${MARK}<div class='t'>${title}</div><div class='k'>${kick}</div>"`;
const WALLET = `(async () => { if (!window.BeamCrypto) for (const src of ['/shared/keccak.js', '/shared/beam-crypto.js']) await new Promise((ok) => { const s = document.createElement('script'); s.src = src; s.onload = ok; document.head.append(s); }); const k = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join(''), a = BeamCrypto.addressOf(k);
  window.ethereum = { request: async ({ method, params }) => method === 'eth_requestAccounts' ? [a] : method === 'personal_sign' ? BeamCrypto.sign('0x' + BeamCrypto.personal(params[0]), k) : null }; return a; })()`;

async function session(name, script) {
  const c = await open('about:blank', W, H, 9200 + Math.floor(Math.random() * 90)); await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const FR = path.join(__dirname, 'rec-' + name); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR); const frames = []; let on = false;
  const ws = c; // reuse send; listen to screencast events through a raw hook
  const go = async (url) => { await c.send('Page.navigate', { url: SITE + url }); await sleep(2600); await c.ev(OVERLAY); await c.send('Page.stopScreencast').catch(() => {}); await c.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1 }); };
  // screencast: Chrome pushes a frame every time it paints; ack each one
  let i = 0, stop = false; c.on('Page.screencastFrame', (p) => { c.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); if (!on) return; const f = path.join(FR, 'f' + String(i++).padStart(5, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(p.data, 'base64')); frames.push([f, Date.now()]); });
  await c.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1 }); const loop = Promise.resolve();
  const api = { view: (w, h) => c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1.25, mobile: false }), go, ev: (x) => c.ev(x), cap: (t) => c.ev('__cap(' + JSON.stringify(t || '') + ')'), full: (h) => c.ev('__full(' + (h || "''") + ')'), sleep, rec: (v) => { on = v; }, wallet: () => c.ev(WALLET), scroll: async (y, ms = 1200) => c.ev(`(async()=>{const s=scrollY,t0=performance.now();await new Promise(r=>{const f=()=>{const p=Math.min(1,(performance.now()-t0)/${ms}),e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;scrollTo(0,s+(${y}-s)*e);p<1?requestAnimationFrame(f):r()};f()});return 1})()`) };
  await script(api); await c.send('Page.stopScreencast').catch(() => {}); c.close();
  // durations from real timestamps → concat list → constant 30 fps
  const list = frames.map(([f, t], i) => `file '${f.split(path.sep).join('/')}'\nduration ${(((frames[i + 1] ? frames[i + 1][1] : t + 33) - t) / 1000).toFixed(3)}`).join('\n') + `\nfile '${frames[frames.length - 1][0].split(path.sep).join('/')}'`;
  const L = path.join(FR, 'list.txt'); fs.writeFileSync(L, list); const out = path.join(OUT, 'beam-' + name + '.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', L, '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-movflags', '+faststart', out]);
  const dur = (frames[frames.length - 1][1] - frames[0][1]) / 1000; fs.rmSync(FR, { recursive: true, force: true }); console.log('OK', path.basename(out), frames.length + ' frames', dur.toFixed(1) + 's', (frames.length / dur).toFixed(1) + ' fps captured');
}
const S = {
  // 1) the live oracle, end to end on the landing page
  demo: async (r) => { await r.go('/'); await r.full(full('The oracle,<br><i>live.</i>', 'BEAM · Robinhood Chain')); r.rec(true); await r.sleep(2200); await r.full(); await r.sleep(600);
    await r.cap('8 exchanges stream into the <b>oracle</b>'); await r.sleep(4200); await r.cap('9 validators agree every 10 seconds'); await r.sleep(4000);
    await r.cap(); await r.ev("document.querySelectorAll('.scene')[0].scrollIntoView();consensus();1"); await r.sleep(300); await r.cap('Each dot is a validator’s signed price'); await r.sleep(3600); await r.cap('The stake-weighted median <b>is the price</b>'); await r.sleep(3200);
    await r.cap(); await r.ev("document.querySelectorAll('.scene')[1].scrollIntoView();sigScene.on=1;sigScene();1"); await r.sleep(300); await r.cap('Your browser recovers every signature'); await r.sleep(5200); await r.cap('Quorum. <b>Valid packet.</b>'); await r.sleep(2200);
    await r.cap(); await r.ev("document.getElementById('dec').scrollIntoView();1"); await r.sleep(300); await r.cap('Anyone can run a validator'); await r.sleep(3200);
    await r.full(full('Robinhood Chain’s<br><i>oracle.</i>', 'beamprotocol.org · @BeamProtocolRH')); await r.sleep(2600); r.rec(false); },
  // 2) run a validator from a browser tab, for real
  run: async (r) => { await r.view(1280, 720); await r.go('/run'); await r.ev('scrollTo(0,250);1'); await r.wallet(); await r.full(full('Run the oracle<br><i>from a browser tab.</i>', 'no server · no install · no permission')); r.rec(true); await r.sleep(2400); await r.full(); await r.sleep(500);
    await r.cap('Step 1 · a validator key is created in your browser'); await r.sleep(2600);
    await r.ev("document.getElementById('nm').value='';1"); for (const ch of 'my-first-validator') { await r.ev("document.getElementById('nm').value+=" + JSON.stringify(ch) + ";1"); await r.sleep(45); }
    await r.cap('Step 2 · bind a wallet with one signature, no gas'); await r.sleep(900); await r.ev('joinNow();1'); await r.sleep(2400);
    await r.cap('Step 3 · start validating'); await r.sleep(700); await r.ev('go();1'); await r.sleep(2000);
    await r.cap('Your tab reads 7 exchanges directly'); await r.sleep(5000); await r.cap('…signs its own prices every round'); await r.sleep(6000);
    await r.cap('…and <b>co-signs</b> packets it checks itself'); await r.sleep(9000);
    await r.full(full('You are the<br><i>oracle.</i>', 'beamprotocol.org/run')); await r.sleep(2600); r.rec(false); },
  // 3) open a tunnel, then verify its packet in the browser
  tunnel: async (r) => { await r.go('/tunnels'); await r.wallet(); await r.full(full('Prices,<br><i>delivered.</i>', 'BEAM oracle tunnels')); r.rec(true); await r.sleep(2200); await r.full(); await r.sleep(500);
    await r.cap('Pick the feeds your app needs'); await r.ev("document.getElementById('nm').value='My lending market';SEL=new Set(['CS:BTC-USD','CS:ETH-USD']);chips();1"); await r.sleep(900);
    for (const id of ['EQ:HOOD-USD', 'EQ:TSLA-USD', 'EQ:NVDA-USD', 'CM:XAU-USD']) { await r.ev("SEL.add('" + id + "');chips();1"); await r.sleep(450); }
    await r.cap('Set a heartbeat and a price-move trigger'); await r.ev("document.getElementById('iv').value='30';document.getElementById('dv').value='10';1"); await r.sleep(2200);
    await r.cap('Sign once. No transaction.'); await r.ev('create();1'); await r.sleep(4200); await r.cap('Packets start flowing, signed by the validators'); await r.sleep(9000);
    await r.cap(); const pk = await r.ev("fetch('/api/packets?limit=3').then(r=>r.json()).then(d=>{const p=d.packets.find(x=>x.status!=='collecting');return p?p.tunnelId+'/'+p.seq:''})");
    await r.go('/verify' + (pk ? '?t=' + pk.split('/')[0] + '&s=' + pk.split('/')[1] : '')); await r.cap('Then anyone can <b>verify</b> it, in the browser'); await r.sleep(4500); await r.cap('Every signature recovered. Quorum.'); await r.sleep(3000);
    await r.full(full('Plug into<br><i>the oracle.</i>', 'beamprotocol.org/tunnels')); await r.sleep(2600); r.rec(false); },
};
(async () => { const n = process.argv[2]; await session(n, S[n]); process.exit(0); })().catch((e) => { console.error(e); process.exit(1); });
