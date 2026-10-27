// BEAM TWAP: time-weighted average prices over 5m, 1h and 24h for every feed, computed each round from the
// agreed round history (10 s points) and the minute candles behind it. Each value goes live as TWAP:<feed>:<window>
// and is signed into packets like any price, so a contract reads it with getPriceNoOlderThan("TWAP:EQ:TSLA-USD:1h", 3600).
'use strict';
const WIN = { '5m': 300, '1h': 3600, '24h': 86400 }, RANGES = { '5m': 300, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
const idOf = (feed, w) => { const id = 'TWAP:' + feed + ':' + w; return Buffer.byteLength(id) <= 32 ? id : null; };
const parse = (id) => { const m = /^TWAP:(.+):(5m|1h|24h)$/.exec(String(id || '')); return m ? { feed: m[1], w: m[2], span: WIN[m[2]] } : null; };
// price path for a feed over [from, to]: minute candle closes up to where round history begins, then every round
function points(S, id, from, to) { const h = S.hist[id] || [], cs = S.candles[id] || [], h0 = h.length ? h[0][0] : Infinity, out = [];
  let i = cs.length; while (i > 0 && cs[i - 1][0] >= from - 3600) i--; for (; i < cs.length; i++) { const t = cs[i][0] + 59; if (t >= h0 || t > to) break; out.push([t, cs[i][4]]); }
  let k = h.length; while (k > 0 && h[k - 1][0] >= from - 600) k--; for (; k < h.length && h[k][0] <= to; k++) out.push(h[k]); return out; }
// step-function TWAP: each value holds until the next one; needs a value at or before the window start (or 90% coverage)
function compute(S, id, span, to) { const from = to - span, pts = points(S, id, from, to); if (!pts.length) return null;
  let start = pts.findIndex((p) => p[0] > from); if (start === -1) start = pts.length; const head = start > 0 ? pts[start - 1] : null;
  if (!head && pts[0][0] > from + span * 0.1) return null;
  let acc = 0, dur = 0, t = head ? from : pts[0][0], v = head ? head[1] : pts[0][1];
  for (let i = start; i < pts.length; i++) { const dt = pts[i][0] - t; if (dt > 0) { acc += v * dt; dur += dt; } t = pts[i][0]; v = pts[i][1]; }
  if (to > t) { acc += v * (to - t); dur += to - t; } return dur > 0 ? acc / dur : v; }
// history for the API and charts: downsampled price path, plus the rolling TWAP when the id is a TWAP feed
function history(S, id, range, now) { const tw = parse(id), base = tw ? tw.feed : id, span = RANGES[range] || 86400; let pts = points(S, base, now - span, now).filter((p) => p[0] >= now - span);
  const step = Math.max(1, Math.ceil(pts.length / 400)); pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  if (tw) pts = pts.map(([t]) => [t, compute(S, base, tw.span, t)]).filter((p) => p[1] != null).map(([t, v]) => [t, +v.toPrecision(10)]);
  return { id, feed: base, range, from: now - span, to: now, points: pts, twap: Object.fromEntries(Object.entries(WIN).map(([w, s]) => [w, compute(S, base, s, now)])) }; }
module.exports = { WIN, RANGES, idOf, parse, points, compute, history };
