// Browser validator E2E: a headless browser opens /run with a test wallet, joins, validates, and co-signs real packets.
const { open, sleep } = require('./cdp.cjs');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
(async () => { const c = await open('about:blank', 1440, 900, 9600 + Math.floor(Math.random() * 90)); await c.send('Page.navigate', { url: 'http://localhost:8232/run' }); await sleep(3000);
  await c.ev(`(() => { const k = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join(''), a = BeamCrypto.addressOf(k);
    window.ethereum = { request: async ({ method, params }) => method === 'eth_requestAccounts' ? [a] : method === 'personal_sign' ? BeamCrypto.sign('0x' + BeamCrypto.personal(params[0]), k) : null }; return 1; })()`);
  await c.ev("document.getElementById('nm').value='browser-e2e';joinNow();1"); await sleep(2500);
  const jm = await c.ev("document.getElementById('jm').textContent"); ok(/Joined as browser-e2e/.test(jm), 'joined from the browser: ' + jm);
  await c.ev('go();1'); await sleep(40000);
  const s = await c.ev("JSON.stringify({ stats: NODE.st.stats, me: NODE.st.me, live: NODE.st.live })"), j = JSON.parse(s);
  ok(j.live.length >= 6, 'browser read ' + j.live.length + ' exchanges directly: ' + j.live.join(', '));
  ok(j.stats.submitted >= 3, 'browser signed ' + j.stats.submitted + ' rounds');
  ok(j.stats.cosigned >= 1, 'browser co-signed ' + j.stats.cosigned + ' packets');
  ok(j.me && j.me.active && j.me.strikes === 0, 'active, ' + (j.me && j.me.strikes) + ' strikes, uptime ' + (j.me && (j.me.uptime * 100).toFixed(0)) + '%');
  await c.shot(process.env.TEMP + '/kp/run.png');
  const st = await (await fetch('http://localhost:8232/api/status')).json(); ok(st.lastPacket && st.lastPacket.openSigners >= 1, 'last packet: ' + st.lastPacket.signers + ' signers, ' + st.lastPacket.openSigners + ' open');
  c.close(); console.log(pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); })().catch((e) => { console.log('ERR', e); process.exit(1); });
