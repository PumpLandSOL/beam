// Deploy BeamReceiver to Robinhood Chain with the live validator set from the BEAM data file.
// BEAM_DEPLOYER_KEY=0x... [DATA_PATH=...] [CHAIN_RPC=...] node server/deploy.js
'use strict';
const fs = require('fs'), path = require('path'), V = require('./evm.js'), C = require('../shared/beam-crypto.js');
const KEY = String(process.env.BEAM_DEPLOYER_KEY || '').replace(/^0x/, ''); if (!/^[0-9a-f]{64}$/i.test(KEY)) { console.error('set BEAM_DEPLOYER_KEY'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(path.join(process.env.DATA_PATH || path.join(__dirname, '..', 'data'), 'beam.json'), 'utf8'));
const art = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'BeamReceiver.sol', 'BeamReceiver.json'), 'utf8'));
(async () => { const vs = data.validators; console.log('deployer', C.addressOf(KEY), 'validators', vs.length, 'rpc', V.RPC);
  const h = await V.sendTx(KEY, { data: art.bytecode.object + V.encCtor(vs.map((v) => v.address), vs.map((v) => v.stake)) }); console.log('tx', h);
  const r = await V.receipt(h, undefined, 180); console.log(r && r.status === '0x1' ? 'BeamReceiver deployed at ' + r.contractAddress + '\nset BEAM_RECEIVER=' + r.contractAddress : 'deploy failed', r && r.status); })().catch((e) => { console.error(e.message); process.exit(1); });
