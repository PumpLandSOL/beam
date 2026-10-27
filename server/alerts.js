// BEAM alerts & webhooks: a feed crosses a level or moves by a percentage, and BEAM POSTs the signed round data to a
// Discord webhook (as an embed) or any HTTPS endpoint. URLs must be public HTTPS hosts (checked again before every
// delivery), each alert has a cooldown, and an alert that fails 5 deliveries in a row switches itself off.
'use strict';
const crypto = require('crypto'), SCR = require('./scripts.js');
const UA = 'BEAM-alerts/1 (+https://beamprotocol.org/alerts)', CAP = +process.env.BEAM_ALERT_CAP || 1000, MAX_FAILS = 5, PER_IP_HOUR = 10, PER_URL = 20;
let S, D; const ip60 = {}, busy = new Set();
// deps: { price(id) -> { price, ts, round }, round() -> latest round record, attest(id, value, ts) -> signed report, isFeed(id), chainId }
function init(state, deps) { S = state; D = deps; S.alerts = S.alerts || { seq: 0, list: [], sent: 0 }; }
const discordOk = (u) => /^(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)$/i.test(u.hostname) && /^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(u.pathname);
async function checkDest(type, raw) { const bad = await SCR.checkUrl(raw); if (bad) return bad.replace('sources', 'webhooks'); if (type === 'discord' && !discordOk(new URL(raw))) return 'that is not a Discord webhook URL (https://discord.com/api/webhooks/…)'; return null; }
const label = (a) => a.kind === 'above' ? 'above ' + a.value : a.kind === 'below' ? 'below ' + a.value : 'moves ' + a.value + '%';
async function create(b, ip) { const feed = String(b.feed || '').trim(); if (!D.isFeed(feed)) return { error: 'unknown feed' };
  const kind = ['above', 'below', 'move'].includes(b.kind) ? b.kind : null; if (!kind) return { error: 'kind must be above, below or move' };
  const value = +b.value; if (!(isFinite(value) && value > 0)) return { error: 'give a positive level' }; if (kind === 'move' && !(value >= 0.1 && value <= 100)) return { error: 'a move alert is 0.1% to 100%' };
  const type = b.type === 'discord' ? 'discord' : 'webhook', url = String(b.url || '').trim().slice(0, 500), cooldown = Math.round(+b.cooldown || 300); if (!(cooldown >= 60 && cooldown <= 86400)) return { error: 'cooldown must be 60 s to 24 h' };
  const bad = await checkDest(type, url); if (bad) return { error: bad };
  const live = S.alerts.list.filter((a) => a.active); if (live.length >= CAP) return { error: 'alert slots are full for now' }; if (live.filter((a) => a.url === url).length >= PER_URL) return { error: 'up to ' + PER_URL + ' alerts per webhook' };
  const k = String(ip || ''), now = Date.now(); ip60[k] = (ip60[k] || []).filter((t) => now - t < 3600000); if (ip60[k].length >= PER_IP_HOUR) return { error: 'up to ' + PER_IP_HOUR + ' new alerts per hour' }; ip60[k].push(now);
  const p = D.price(feed), a = { id: ++S.alerts.seq, token: crypto.randomBytes(16).toString('hex'), name: String(b.name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 40) || feed + ' ' + label({ kind, value }),
    feed, kind, value, type, url, cooldown, created: now, active: true, fired: 0, fails: 0, lastFired: null, lastError: null, ref: p ? p.price : null, armed: true };
  if (p && kind !== 'move') a.armed = !(kind === 'above' ? p.price > value : p.price < value); // fire on the crossing, not on creation
  S.alerts.list.push(a); return { alert: own(a) }; }
const own = (a) => ({ ...a, url: a.url.replace(/(\/api\/webhooks\/\d+\/)[\w-]+/, '$1…'), host: new URL(a.url).hostname });
function find(b) { const a = S.alerts.list.find((x) => x.id === +b.id); const t = Buffer.from(String(b.token || '')); return a && t.length === 32 && crypto.timingSafeEqual(t, Buffer.from(a.token)) ? a : null; }
function payload(a, p, test) { const r = D.round(), fixed = Math.round(p.price * 1e8), at = D.attest(a.feed, p.price, p.ts);
  const body = { type: test ? 'beam.alert.test' : 'beam.alert', alert: { id: a.id, name: a.name, feed: a.feed, condition: a.kind, level: a.value }, feed: a.feed, price: p.price, fixed: String(fixed), ts: p.ts,
    round: r ? { n: r.n, ts: r.ts, hash: r.hash, prev: r.prev, signers: r.subs ? r.subs.length : r.validators, power: r.power, total: r.total } : null, attestation: at, link: 'https://beamprotocol.org/feed?id=' + encodeURIComponent(a.feed) };
  if (a.type !== 'discord') return body;
  const up = a.kind === 'above' || (a.kind === 'move' && a.ref != null && p.price >= a.ref);
  return { username: 'BEAM', embeds: [{ title: (test ? 'Test · ' : '') + a.feed + ' ' + label(a), url: body.link, color: up ? 0x22c55e : 0xe5484d, description: '**' + p.price.toLocaleString('en-US', { maximumFractionDigits: 8 }) + '** · agreed by ' + (body.round ? body.round.signers : '?') + ' validators',
    fields: [{ name: 'Round', value: body.round ? '#' + body.round.n : '—', inline: true }, { name: 'Signatures', value: String(at.signers), inline: true }, { name: 'Report hash', value: '`' + at.hash.slice(0, 18) + '…`', inline: true }],
    footer: { text: 'BEAM oracle · Robinhood Chain · ' + (body.round ? body.round.hash.slice(0, 14) + '…' : '') }, timestamp: new Date(p.ts * 1000).toISOString() }] }; }
async function deliver(a, p, test) { if (busy.has(a.id)) return { error: 'a delivery for this alert is in flight' }; busy.add(a.id);
  try { const bad = await checkDest(a.type, a.url); if (bad) throw new Error(bad);
    const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
    let r; try { r = await fetch(a.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify(payload(a, p, test)), signal: c.signal, redirect: 'error' }); } finally { clearTimeout(t); }
    if (!r.ok) throw new Error('HTTP ' + r.status); a.fails = 0; a.lastError = null; if (!test) a.fired++; a.lastFired = Date.now(); a.lastStatus = r.status; S.alerts.sent++; return { ok: true, status: r.status }; }
  catch (e) { a.fails++; a.lastError = String(e.name === 'AbortError' ? 'timed out' : e.message || e).slice(0, 120); if (a.fails >= MAX_FAILS) { a.active = false; a.disabled = 'switched off after ' + MAX_FAILS + ' failed deliveries'; } return { error: a.lastError, fails: a.fails, active: a.active }; }
  finally { busy.delete(a.id); } }
// every round: edge-triggered levels, % moves against the last reference, cooldown per alert
function check() { const now = Date.now(); let n = 0;
  for (const a of S.alerts.list) { if (!a.active) continue; const p = D.price(a.feed); if (!p) continue; let hit = false;
    if (a.kind === 'move') { if (a.ref == null) { a.ref = p.price; continue; } hit = Math.abs(p.price - a.ref) / Math.abs(a.ref) * 100 >= a.value; }
    else { const cond = a.kind === 'above' ? p.price > a.value : p.price < a.value; hit = cond && a.armed; if (!cond) a.armed = true; }
    if (!hit || now - (a.lastFired || 0) < a.cooldown * 1000) continue; if (a.kind === 'move') a.ref = p.price; else a.armed = false; n++; deliver(a, p, false); }
  return n; }
async function test(b) { const a = find(b); if (!a) return { error: 'unknown alert or wrong token' }; if (Date.now() - (a.lastTest || 0) < 3000) return { error: 'one test every 3 seconds' }; a.lastTest = Date.now();
  const p = D.price(a.feed); if (!p) return { error: 'no live value for ' + a.feed + ' yet' }; const r = await deliver(a, p, true); return { ...r, alert: own(a) }; }
function remove(b) { const a = find(b); if (!a) return { error: 'unknown alert or wrong token' }; S.alerts.list = S.alerts.list.filter((x) => x !== a); return { ok: true }; }
function toggle(b) { const a = find(b); if (!a) return { error: 'unknown alert or wrong token' }; a.active = !a.active; if (a.active) { a.fails = 0; a.disabled = null; } return { alert: own(a) }; }
function mine(items) { return (items || []).slice(0, 50).map((b) => find(b)).filter(Boolean).map(own); }
const stats = () => ({ alerts: S.alerts.list.length, active: S.alerts.list.filter((a) => a.active).length, delivered: S.alerts.sent, cap: CAP });
module.exports = { init, create, check, test, remove, toggle, mine, stats, payload, checkDest };
