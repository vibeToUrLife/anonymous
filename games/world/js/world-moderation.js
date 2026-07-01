/* ════════════════════════════════════════════════════════════════
   world-moderation.js — PURE chat-safety helpers (no DOM/Firebase).
   Unit-tested in world-moderation.test.js. The actual word list and the
   numeric limits live in world-config.js (NOT hardcoded here), so they can
   be tuned without touching logic.
   ════════════════════════════════════════════════════════════════ */

// Normalize for matching: lowercase and strip everything but letters/digits, so
// simple evasions ("b-a-d", "b a d") still match a banned token.
function wNormalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// True if the message contains any banned word (substring match on normalized text).
function isProfane(text, banned) {
  const n = wNormalize(text);
  if (!n) return false;
  return banned.some(w => {
    const nw = wNormalize(w);
    return nw && n.includes(nw);
  });
}

// Mask banned words with '*' for the RECEIVE path (defense in depth against
// messages sent by an older/rogue client). Case-insensitive substring match
// (mirrors isProfane); keep the banned list specific to avoid over-masking.
function maskProfanity(text, banned) {
  let out = String(text || '');
  for (const w of banned) {
    if (!w) continue;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'gi'), m => '*'.repeat(m.length));
  }
  return out;
}

// Full SEND-path check. Trims, collapses whitespace, enforces the length cap,
// rejects empty or profane messages. Returns { ok, text, reason }.
function moderateMessage(raw, opts) {
  const maxLen = opts.maxLen;
  const banned = opts.banned || [];
  let text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, text: '', reason: 'empty' };
  if (text.length > maxLen) text = text.slice(0, maxLen);
  if (isProfane(text, banned)) return { ok: false, text, reason: 'blocked' };
  return { ok: true, text, reason: 'ok' };
}

// Sliding-window rate limiter. `history` is an array of send timestamps (ms).
// Returns { allowed, history } with the pruned/updated history to store back.
function rateAllow(history, nowMs, windowMs, maxInWindow) {
  const pruned = (history || []).filter(ts => nowMs - ts < windowMs);
  if (pruned.length >= maxInWindow) return { allowed: false, history: pruned };
  pruned.push(nowMs);
  return { allowed: true, history: pruned };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { wNormalize, isProfane, maskProfanity, moderateMessage, rateAllow };
}
