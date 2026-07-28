/* ============================================================
   Dev board — pure logic, no DOM and no Firebase.

   The board is where the developer posts what changed. Everything here
   is the part worth testing on its own: what counts as unread, how a
   reaction toggles, how much of a post can safely be stored, and which
   posts a collapsed card shows.

   Runs as a browser global (dev-board.js calls these names bare) AND as
   a Node module for tests.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  for (const k in api) { if (Object.prototype.hasOwnProperty.call(api, k)) root[k] = api[k]; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // What a post may be tagged. The id is stored; the label is translated at
  // the render site, so renaming a label never orphans existing posts.
  const DEV_TAGS = ['feature', 'fix', 'event'];

  // Firestore refuses a document over 1 MiB, and it refuses it AFTER the user
  // has waited for the upload. An image lands in the post as a data URL, so
  // the guard belongs before the write, not in a catch — this is the same
  // trap that lost replies until reply-logic.js started measuring them.
  const DOC_LIMIT = 1024 * 1024;
  const DOC_HEADROOM = 64 * 1024;   // field names, ids, reaction map, future fields

  // Rough byte length of a string once UTF-8 encoded. A data URL is ASCII, so
  // for the part that actually matters this is exact.
  function byteLen(s) {
    if (!s) return 0;
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
  }

  function postBytes(post) {
    const p = post || {};
    return byteLen(p.title) + byteLen(p.body) + byteLen(p.image) + byteLen(p.link) + byteLen(p.tag);
  }

  // Can this post be stored at all? Returns why not, so the composer can say
  // something better than "failed".
  function postFits(post, limit) {
    const cap = (limit || DOC_LIMIT) - DOC_HEADROOM;
    const size = postBytes(post);
    return { ok: size <= cap, size: size, cap: cap };
  }

  /* ── Unread ──
     A post counts as unread when it is newer than the last one the reader
     acknowledged. Ties count as SEEN: two posts written in the same
     millisecond would otherwise keep the badge lit forever. */
  function unseenCount(posts, lastSeenTs) {
    const seen = lastSeenTs || 0;
    return (posts || []).filter(p => p && (p.ts || 0) > seen).length;
  }

  function newestTs(posts) {
    return (posts || []).reduce((m, p) => Math.max(m, (p && p.ts) || 0), 0);
  }

  /* ── Reactions ──
     Tapping the one you already gave takes it back; tapping a different one
     moves it. Which one is yours lives on the device, the way the bubble
     board does it — the counts in the document stay a plain tally. */
  function nextReaction(mine, tapped) {
    return mine === tapped ? null : tapped;
  }

  // The increments to apply for that move: -1 off the old, +1 onto the new.
  function reactionDelta(mine, next) {
    const d = {};
    if (mine && mine !== next) d[mine] = -1;
    if (next && next !== mine) d[next] = 1;
    return d;
  }

  // Never render a negative tally, however the counts drifted.
  function reactionCount(post, kind) {
    return Math.max(0, ((post || {}).reactions || {})[kind] || 0);
  }

  /* ── What a collapsed card shows ──
     Newest first, and always enough to see that something is new: if there
     are unread posts, show at least that many even when it exceeds the
     collapsed limit, or the badge would point at something invisible. */
  function visiblePosts(posts, expanded, limit, lastSeenTs) {
    const list = (posts || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (expanded) return list;
    const unseen = unseenCount(list, lastSeenTs);
    return list.slice(0, Math.max(limit || 2, unseen));
  }

  return { DEV_TAGS, DOC_LIMIT, byteLen, postBytes, postFits,
           unseenCount, newestTs, nextReaction, reactionDelta, reactionCount, visiblePosts };
});
