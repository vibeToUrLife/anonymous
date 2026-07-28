/* node --test dev-board-logic.test.js — unit tests for the dev board's pure logic. */
const test = require('node:test');
const assert = require('node:assert');
const B = require('./dev-board-logic.js');

const post = (ts, extra) => Object.assign({ ts: ts, title: 't', body: 'b', tag: 'feature' }, extra || {});

/* ── unread ── */

test('unread counts only what arrived after the last one acknowledged', () => {
  const posts = [post(300), post(200), post(100)];
  assert.equal(B.unseenCount(posts, 0), 3);
  assert.equal(B.unseenCount(posts, 100), 2);
  assert.equal(B.unseenCount(posts, 300), 0);
  assert.equal(B.unseenCount([], 0), 0);
  assert.equal(B.unseenCount(null, 0), 0);
});

test('a post written at exactly the last-seen stamp counts as seen', () => {
  // Otherwise two posts sharing a millisecond would keep the badge lit forever.
  assert.equal(B.unseenCount([post(500)], 500), 0);
});

test('newestTs survives an empty board and missing stamps', () => {
  assert.equal(B.newestTs([post(10), post(90), post(50)]), 90);
  assert.equal(B.newestTs([]), 0);
  assert.equal(B.newestTs([{}, null]), 0);
});

/* ── reactions ── */

test('tapping the reaction you already gave takes it back', () => {
  assert.equal(B.nextReaction('heart', 'heart'), null);
  assert.equal(B.nextReaction('heart', 'party'), 'party');
  assert.equal(B.nextReaction(null, 'up'), 'up');
});

test('the delta moves exactly one vote, never two', () => {
  assert.deepEqual(B.reactionDelta(null, 'heart'), { heart: 1 });
  assert.deepEqual(B.reactionDelta('heart', null), { heart: -1 });
  assert.deepEqual(B.reactionDelta('heart', 'party'), { heart: -1, party: 1 });
  assert.deepEqual(B.reactionDelta('heart', 'heart'), {});   // a no-op writes nothing
  assert.deepEqual(B.reactionDelta(null, null), {});
});

test('a count never renders negative, however the tally drifted', () => {
  assert.equal(B.reactionCount({ reactions: { heart: 4 } }, 'heart'), 4);
  assert.equal(B.reactionCount({ reactions: { heart: -3 } }, 'heart'), 0);
  assert.equal(B.reactionCount({}, 'heart'), 0);
  assert.equal(B.reactionCount(null, 'heart'), 0);
});

/* ── the document limit ── */

test('a post with a big image is refused BEFORE the upload, not after', () => {
  const big = post(1, { image: 'x'.repeat(1024 * 1024) });
  const r = B.postFits(big);
  assert.equal(r.ok, false);
  assert.ok(r.size > r.cap, 'the check should report how far over it is');
});

test('a normal post with a compressed screenshot fits with room to spare', () => {
  // ~90KB is what compressImage produces for a 400px-wide JPEG screenshot.
  const ok = post(1, { title: 'Farm skins', body: 'x'.repeat(2000), image: 'd'.repeat(90 * 1024) });
  assert.equal(B.postFits(ok).ok, true);
});

test('the cap leaves headroom for the fields the post does not count', () => {
  // Right at the raw 1MiB line must still fail: ids, field names and the
  // reaction map are stored too, and they are not free.
  const edge = post(1, { image: 'x'.repeat(B.DOC_LIMIT - 100) });
  assert.equal(B.postFits(edge).ok, false);
});

test('byteLen measures UTF-8, not characters', () => {
  assert.equal(B.byteLen('abc'), 3);
  assert.equal(B.byteLen('农场'), 6);      // three bytes each
  assert.equal(B.byteLen(''), 0);
  assert.equal(B.byteLen(null), 0);
});

/* ── what the collapsed card shows ── */

test('collapsed shows the newest few, expanded shows everything', () => {
  const posts = [post(100), post(300), post(200), post(400)];
  assert.deepEqual(B.visiblePosts(posts, false, 2, 400).map(p => p.ts), [400, 300]);
  assert.deepEqual(B.visiblePosts(posts, true, 2, 400).map(p => p.ts), [400, 300, 200, 100]);
});

test('collapsed stretches so every unread post is actually reachable', () => {
  // The badge says 3 new; showing 2 would point at something invisible.
  const posts = [post(100), post(200), post(300), post(400)];
  assert.deepEqual(B.visiblePosts(posts, false, 2, 100).map(p => p.ts), [400, 300, 200]);
});

test('posts are always newest first, whatever order they arrived in', () => {
  assert.deepEqual(B.visiblePosts([post(1), post(9), post(5)], true, 2, 0).map(p => p.ts), [9, 5, 1]);
});
