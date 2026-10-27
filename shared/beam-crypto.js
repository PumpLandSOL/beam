// BEAM crypto: secp256k1 ECDSA (Ethereum-style, recoverable) + the packet digest the BeamReceiver contract checks.
// Dependency-free, runs in Node and the browser. Requires keccak256 (shared/keccak.js) loaded first in the browser.
(function (root) {
  'use strict';
  const keccak = typeof module !== 'undefined' && module.exports ? require('./keccak.js') : root.keccak256;
  const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn, N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
  const mod = (a, m) => ((a % m) + m) % m;
  function inv(a, m) { let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n]; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return mod(s0, m); }
  function pw(b, e, m) { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
  // Jacobian coordinates for speed
  function jdbl([X, Y, Z]) { if (!Y) return [0n, 1n, 0n]; const A = X * X % P, B = Y * Y % P, C = B * B % P, D = mod(2n * (mod((X + B) * (X + B) - A - C, P)), P), E = 3n * A % P, F = E * E % P;
    const X3 = mod(F - 2n * D, P); return [X3, mod(E * (D - X3) - 8n * C, P), 2n * Y * Z % P]; }
  function jadd(p, q) { if (!p[2]) return q; if (!q[2]) return p; const [X1, Y1, Z1] = p, [X2, Y2, Z2] = q, Z1Z1 = Z1 * Z1 % P, Z2Z2 = Z2 * Z2 % P, U1 = X1 * Z2Z2 % P, U2 = X2 * Z1Z1 % P, S1 = Y1 * Z2 * Z2Z2 % P, S2 = Y2 * Z1 * Z1Z1 % P;
    if (U1 === U2) return S1 === S2 ? jdbl(p) : [0n, 1n, 0n]; const H = mod(U2 - U1, P), R = mod(S2 - S1, P), H2 = H * H % P, H3 = H * H2 % P, V = U1 * H2 % P;
    const X3 = mod(R * R - H3 - 2n * V, P); return [X3, mod(R * (V - X3) - S1 * H3, P), H * Z1 % P * Z2 % P]; }
  function mul(Pt, k) { let R = [0n, 1n, 0n], A = [Pt[0], Pt[1], 1n]; k = mod(k, N); while (k > 0n) { if (k & 1n) R = jadd(R, A); A = jdbl(A); k >>= 1n; } return R; }
  function aff([X, Y, Z]) { if (!Z) return null; const zi = inv(Z, P), z2 = zi * zi % P; return [X * z2 % P, Y * z2 % P * zi % P]; }
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => { h = String(h).replace(/^0x/, ''); const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
  const b32 = (x) => x.toString(16).padStart(64, '0');
  const big = (h) => BigInt('0x' + String(h).replace(/^0x/, ''));
  function pubToAddress(Q) { return '0x' + keccak(unhex(b32(Q[0]) + b32(Q[1]))).slice(24); }
  function addressOf(privHex) { return pubToAddress(aff(mul(G, big(privHex)))); }
  // deterministic nonce: keccak(priv ‖ digest ‖ counter), never reused across messages
  function sign(digestHex, privHex) { const d = big(privHex), e = big(digestHex);
    for (let c = 0; c < 100; c++) { const k = mod(big(keccak(unhex(b32(d) + b32(e) + c.toString(16).padStart(2, '0')))), N); if (!k) continue;
      const R = aff(mul(G, k)), r = mod(R[0], N); if (!r) continue; let s = mod(inv(k, N) * (e + r * d), N); if (!s) continue; let v = Number(R[1] & 1n); if (R[0] >= N) v |= 2;
      if (s > N / 2n) { s = N - s; v ^= 1; } return '0x' + b32(r) + b32(s) + (27 + v).toString(16); } throw new Error('sign failed'); }
  function recover(digestHex, sigHex) { const s0 = String(sigHex).replace(/^0x/, ''); if (s0.length !== 130) throw new Error('bad signature length');
    const r = big(s0.slice(0, 64)), s = big(s0.slice(64, 128)); let v = parseInt(s0.slice(128), 16); if (v >= 27) v -= 27; if (v !== 0 && v !== 1) throw new Error('bad v');
    if (r <= 0n || r >= N || s <= 0n || s >= N) throw new Error('bad r/s'); const y2 = mod(r * r * r + 7n, P); let y = pw(y2, (P + 1n) / 4n, P); if (y * y % P !== y2) throw new Error('not on curve'); if (Number(y & 1n) !== v) y = P - y;
    const e = big(digestHex), ri = inv(r, N), Q = aff(jadd(mul([r, y], mod(s * ri, N)), mul(G, mod(-e * ri, N)))); if (!Q) throw new Error('bad point'); return pubToAddress(Q); }
  const ethSigned = (hashHex) => keccak(unhex(hex(new TextEncoder().encode('\x19Ethereum Signed Message:\n32')) + String(hashHex).replace(/^0x/, '')));
  const personal = (msg) => { const m = new TextEncoder().encode(msg); return keccak(unhex(hex(new TextEncoder().encode('\x19Ethereum Signed Message:\n' + m.length)) + hex(m))); };
  // signal id → bytes32 (utf8, right-padded)
  const idBytes32 = (id) => { const b = new TextEncoder().encode(id); if (b.length > 32) throw new Error('id too long'); return hex(b).padEnd(64, '0'); };
  const i256 = (x) => b32(BigInt.asUintN(256, BigInt(x)));
  const u64 = (x) => BigInt(x).toString(16).padStart(16, '0');
  // packet digest = keccak256(abi.encodePacked("BEAMv1", chainId, receiver, tunnelId, seq, ts, bytes32[] ids, int256[] prices))
  function packetHash(p) { const enc = hex(new TextEncoder().encode('BEAMv1')) + b32(BigInt(p.chainId)) + String(p.receiver).replace(/^0x/, '').toLowerCase().padStart(40, '0') + u64(p.tunnelId) + u64(p.seq) + u64(p.ts) + p.ids.map(idBytes32).join('') + p.prices.map(i256).join('');
    return '0x' + keccak(unhex(enc)); }
  const packetDigest = (p) => '0x' + ethSigned(packetHash(p));
  // verify a packet against a validator set { address: power }: returns signer list + power and whether > 2/3
  function verifyPacket(p, validators) { const dg = packetDigest(p), total = Object.values(validators).reduce((a, b) => a + b, 0); let power = 0; const seen = new Set(), signers = [];
    for (const sg of p.sigs || []) { let a = null; try { a = recover(dg, sg); } catch {} const pw0 = a && validators[a.toLowerCase()]; signers.push({ sig: sg, signer: a, power: pw0 || 0, valid: !!pw0 && !seen.has(a) }); if (pw0 && !seen.has(a)) { seen.add(a); power += pw0; } }
    return { digest: dg, hash: packetHash(p), power, total, quorum: power * 3 > total * 2, signers }; }
  // BEAM VRF: alpha = keccak256(abi.encodePacked(bytes7("BEAMvrf"), uint256 chainId, uint64 requestId, bytes32 seed, bytes32 roundHash)),
  // each validator signs the EIP-191 digest of alpha; randomness = keccak256(sig1 ‖ sig2 ‖ …) with signatures ordered by signer address
  const vrfAlpha = (chainId, id, seed, roundHash) => '0x' + keccak(unhex(hex(new TextEncoder().encode('BEAMvrf')) + b32(BigInt(chainId)) + u64(id) + String(seed).replace(/^0x/, '').padStart(64, '0') + String(roundHash).replace(/^0x/, '').padStart(64, '0')));
  const vrfRandomness = (sigs) => '0x' + keccak(unhex(sigs.map((x) => String(x).replace(/^0x/, '')).join('')));
  function verifyVrf(r, validators) { const alpha = vrfAlpha(r.chainId, r.id, r.seed, r.roundHash), dg = '0x' + ethSigned(alpha), total = Object.values(validators).reduce((a, b) => a + b, 0); let power = 0, prev = '', ordered = true; const signers = [];
    for (const sg of r.sigs || []) { let a = null; try { a = recover(dg, sg).toLowerCase(); } catch {} const pw0 = a && validators[a]; if (a && a <= prev) ordered = false; if (a) prev = a; signers.push({ sig: sg, signer: a, power: pw0 || 0, valid: !!pw0 && ordered }); if (pw0 && ordered) power += pw0; }
    const randomness = vrfRandomness(r.sigs || []); return { alpha, digest: dg, power, total, ordered, quorum: ordered && power * 3 > total * 2, signers, randomness, match: randomness === String(r.randomness).toLowerCase() }; }
  const api = { vrfAlpha, vrfRandomness, verifyVrf, keccak, sign, recover, addressOf, ethSigned, personal, packetHash, packetDigest, verifyPacket, idBytes32, hex, unhex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BeamCrypto = api;
})(typeof window !== 'undefined' ? window : globalThis);
