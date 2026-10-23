// BEAM token gate: running a validator and opening tunnels require holding $BEAM on Robinhood Chain.
'use strict';
const V = require('./evm.js');
const TOKEN = String(process.env.BEAM_TOKEN || '0x6459ce7fa9736349b32ef8bcd7844b64544d90a7').toLowerCase();
const VALIDATOR_MIN = +process.env.BEAM_VALIDATOR_MIN || 1000000, TUNNEL_MIN = +process.env.BEAM_TUNNEL_MIN || 250000, MAX_MULT = 4;
const OFF = process.env.BEAM_GATE === 'off';
let decimals = null; const cache = {};
async function dec() { if (decimals == null) decimals = parseInt(await V.call(TOKEN, '0x313ce567'), 16); return decimals; }
// whole-token balance, cached 60 s per wallet
async function balance(owner) { const a = String(owner).toLowerCase(), c = cache[a]; if (c && Date.now() - c.t < 60000) return c.v;
  const raw = BigInt(await V.call(TOKEN, '0x70a08231' + a.replace(/^0x/, '').padStart(64, '0'))), d = BigInt(10) ** BigInt(await dec());
  const v = Number(raw / d) + Number(raw % d) / Number(d); cache[a] = { t: Date.now(), v }; return v; }
async function check(owner, min) { if (OFF) return { ok: true, held: null, min };
  let held; try { held = await balance(owner); } catch { return { ok: false, error: 'could not read your $BEAM balance on Robinhood Chain, try again in a moment' }; }
  return held >= min ? { ok: true, held, min } : { ok: false, held, min, error: `hold at least ${min.toLocaleString('en-US')} $BEAM (this wallet holds ${Math.floor(held).toLocaleString('en-US')})` }; }
// validator power multiplier: 1x at the minimum, up to 4x at 4x the minimum
const mult = (held) => (held == null ? 1 : Math.max(1, Math.min(MAX_MULT, held / VALIDATOR_MIN)));
module.exports = { TOKEN, VALIDATOR_MIN, TUNNEL_MIN, MAX_MULT, OFF, balance, check, mult };
