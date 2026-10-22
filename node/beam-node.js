#!/usr/bin/env node
// BEAM headless validator. Runs 24/7 on any machine with Node 20+, no dependencies.
//   OWNER_KEY=0x<your wallet key, signs the one-time join>  node node/beam-node.js --name mynode [--api https://beam...] [--stocks]
// The node key is created on first run and kept in ./beam-node.key. --stocks adds US equities, FX and metals via market data.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const C = require('../shared/beam-crypto.js'), { Node } = require('../shared/beam-node-core.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };
const API = arg('api', process.env.BEAM_API || 'http://localhost:8232'), NAME = String(arg('name', 'node-' + require('os').hostname())).slice(0, 24);
const KEYF = path.resolve(arg('keyfile', 'beam-node.key'));
let priv = fs.existsSync(KEYF) ? fs.readFileSync(KEYF, 'utf8').trim() : (() => { const k = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(KEYF, k, { mode: 0o600 }); return k; })();
const owner = String(process.env.OWNER_KEY || '').replace(/^0x/, '') || priv; // without a wallet key the node key owns itself
let extra = null; if (arg('stocks')) { const SRC = require('../server/sources.js'); extra = async () => { await SRC.poll(Math.random() < .5 ? 'yahoo1' : 'yahoo2'); const o = {}; for (const s of SRC.SIGNALS) if (s.yahoo) { const p = SRC.read('yahoo1', s.sym) || SRC.read('yahoo2', s.sym); if (p) o[s.id] = p; } return o; }; }
const ts = () => new Date().toISOString().slice(11, 19);
const node = Node({ api: API, priv, extra, log: (k, m) => console.log(ts(), k.padEnd(6), m) });
(async () => { console.log('BEAM validator', node.st.addr, '→', API);
  const j = await node.join(NAME, 'headless', { address: async () => C.addressOf(owner), sign: async (m) => C.sign('0x' + C.personal(m), owner) });
  if (j.error) { console.error('join failed:', j.error); process.exit(1); } console.log('joined as', j.validator.name, '· voting power', j.validator.power.toLocaleString());
  await node.refresh(); console.log('observing', Object.keys(node.st.view).length, 'feeds from', node.st.live.join(', ')); node.start();
  setInterval(() => { const s = node.st.stats, m = node.st.me; console.log(ts(), 'stats ', `submitted ${s.submitted} · co-signed ${s.cosigned} · refused ${s.refused}` + (m ? ` · uptime ${(m.uptime * 100).toFixed(1)}% · strikes ${m.strikes}` : '')); }, 60000); })();
