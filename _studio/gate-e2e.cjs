// Token-gate E2E: wallets without $BEAM are refused as validators and tunnel owners. node _studio/gate-e2e.cjs (site on :8232)
'use strict';
const C = require('../shared/beam-crypto.js'), crypto = require('crypto');
const API = process.env.API || 'http://localhost:8232';
const post = async (p, b) => { const r = await fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return [r.status, await r.json()]; };
const key = () => crypto.randomBytes(32).toString('hex'), sign = (k, m) => C.sign('0x' + C.personal(m), k);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const g = await (await fetch(API + '/api/gate')).json();
  ok(g.token === '0x6459ce7fa9736349b32ef8bcd7844b64544d90a7' && g.validatorMin > 0 && g.tunnelMin > 0, 'gate config served: ' + JSON.stringify(g));
  const owner = key(), node = key(), oa = C.addressOf(owner), na = C.addressOf(node);
  const w = await (await fetch(API + '/api/gate?wallet=' + oa)).json(); ok(w.held === 0 && w.mult === 1, 'fresh wallet reads 0 $BEAM on-chain');
  const msg = ['BEAM validator join', 'node: ' + na, 'owner: ' + oa, 'name: gate-test', 'kind: headless', 'issued: ' + Math.floor(Date.now() / 1000)].join('\n');
  const [s1, j] = await post('/api/node/join', { message: msg, ownerSig: sign(owner, msg), nodeSig: sign(node, msg) });
  ok(s1 === 403 && /1,000,000 \$BEAM/.test(j.error), 'validator join refused without $BEAM: ' + j.error);
  const tm = ['BEAM tunnel request', 'name: gate-test', 'signals: CS:BTC-USD', 'interval: 60', 'deviation: 50', 'receiver: ', 'owner: ' + oa, 'issued: ' + Math.floor(Date.now() / 1000)].join('\n');
  const [s2, t] = await post('/api/tunnels', { message: tm, signature: sign(owner, tm) });
  ok(s2 === 400 && /250,000 \$BEAM/.test(t.error), 'tunnel refused without $BEAM: ' + t.error);
  console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
