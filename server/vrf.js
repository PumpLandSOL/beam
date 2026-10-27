// BEAM VRF: verifiable randomness. A request names a seed; the first round after it lands fixes the round hash,
// every validator signs alpha = keccak256("BEAMvrf", chainId, requestId, seed, roundHash) with its deterministic
// secp256k1 key, and the random value is keccak256 of the signatures ordered by signer address. Nobody knows the
// value before the round closes, and anyone can recompute it from the signatures (BeamVRF.sol does it on-chain).
'use strict';
const C = require('../shared/beam-crypto.js');
const MAX_PENDING = 200, PER_ROUND = 25, KEEP = 1000;
let S, VALS, VSET, CHAIN;
function init(state, validators, vset, chainId) { S = state; VALS = validators; VSET = vset; CHAIN = chainId; S.vrf = S.vrf || { seq: 0, reqs: [] }; }
const seedOf = (x) => { const s = String(x ?? '').trim().slice(0, 256); return /^0x[0-9a-fA-F]{64}$/.test(s) ? s.toLowerCase() : '0x' + C.keccak(s); };
function request(seed, by) { const pend = S.vrf.reqs.filter((r) => r.status === 'pending').length; if (pend >= MAX_PENDING) return { error: 'the randomness queue is full, retry next round' };
  const raw = String(seed ?? '').trim(); if (!raw) return { error: 'give a seed (any text, or a 0x… 32-byte value)' };
  const r = { id: ++S.vrf.seq, chainId: CHAIN, input: raw.slice(0, 120), seed: seedOf(raw), requester: by && /^0x[0-9a-fA-F]{40}$/.test(by) ? by.toLowerCase() : null, created: Date.now(), after: S.round, status: 'pending' };
  S.vrf.reqs.unshift(r); if (S.vrf.reqs.length > KEEP) S.vrf.reqs = S.vrf.reqs.filter((x, i) => i < KEEP || x.status === 'pending'); return r; }
// called by the engine once a round is final: answers requests made before it
function fulfil(rec) { const set = VSET(), total = Object.values(set).reduce((a, b) => a + b, 0); let done = 0;
  for (const r of [...S.vrf.reqs].reverse()) { if (r.status !== 'pending' || r.after >= rec.n) continue; if (done++ >= PER_ROUND) break;
    const alpha = C.vrfAlpha(CHAIN, r.id, r.seed, rec.hash), dg = '0x' + C.ethSigned(alpha);
    const signed = VALS().filter((v) => set[v.address.toLowerCase()]).map((v) => [v.address.toLowerCase(), C.sign(dg, v.priv)]).sort((x, y) => (x[0] < y[0] ? -1 : 1)), power = signed.reduce((t, [a]) => t + set[a], 0);
    if (power * 3 <= total * 2) { r.tries = (r.tries || 0) + 1; continue; }
    Object.assign(r, { status: 'fulfilled', round: rec.n, roundHash: rec.hash, ts: rec.ts, alpha, digest: dg, sigs: signed.map((x) => x[1]), signers: signed.map((x) => x[0]), set: { ...set }, power, total, randomness: C.vrfRandomness(signed.map((x) => x[1])), fulfilled: Date.now() }); }
  return done; }
const pub = (r) => ({ ...r, set: undefined, number: r.randomness ? BigInt(r.randomness).toString() : null });
const get = (id) => S.vrf.reqs.find((r) => r.id === +id) || null;
module.exports = { init, request, fulfil, pub, get, seedOf, all: () => S.vrf.reqs, stats: () => ({ requests: S.vrf.seq, fulfilled: S.vrf.reqs.filter((r) => r.status === 'fulfilled').length, pending: S.vrf.reqs.filter((r) => r.status === 'pending').length }) };
