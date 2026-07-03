/**
 * share-to-board.js — post a "space" bubble to the home bubble board so others
 * can VISIT a room/farm/aquarium or JOIN the multiplayer Pet World.
 *
 * A "space" bubble is a new board type (alongside text / image / poll). It
 * carries a small payload describing WHERE to go; the board renders it as a
 * clickable card. This file owns the single source of truth for the
 * destination link, so the poster and the board never disagree on the format.
 *
 * Included on:
 *   - index.html            → the board render needs linkFor()
 *   - games/room.html       → "Share to board" for room/farm/aquarium
 *   - games/world/world.html→ "Share to board" for Pet World
 *
 * Each page inits its own Firebase app, so the Firestore instance and the
 * current user are passed IN rather than assumed global.
 *
 * Firestore cost: one write per share. No new collection (reuses `answers`,
 * which any signed-in user may already write), so no rules change is needed.
 */
(function (global) {
  'use strict';

  // Destination for a shared space. Paths are relative to the SITE ROOT
  // (index.html) — that's where the board lives and where clicks originate.
  function linkFor(space) {
    if (!space) return '#';
    if (space.kind === 'world') {
      // Pet World "join together": everyone opening the same scene lands in the
      // same shard (shard 0 fills first), so the scene link is the join link.
      return 'games/world/world.html?scene=' + encodeURIComponent(space.scene || 'pool');
    }
    // room / farm / aquarium → the read-only visit deep-link on the room page.
    var url = 'games/room.html?visit=' + encodeURIComponent(space.uid || '');
    if (space.kind === 'farm' || space.kind === 'aquarium') url += '&view=' + space.kind;
    return url;
  }

  // Client-side cooldown so a double-tap doesn't post twins. Pure localStorage —
  // no Firestore read, so it costs nothing.
  var COOLDOWN_MS = 30000;
  function onCooldown(kind) {
    try {
      var k = 'share_board_last_' + kind;
      var last = +localStorage.getItem(k) || 0;
      if (Date.now() - last < COOLDOWN_MS) return true;
      localStorage.setItem(k, String(Date.now()));
    } catch (e) {}
    return false;
  }

  // Post the space bubble. Returns the add() promise; rejects with
  // { code:'cooldown' } if the same kind was just shared.
  function postSpace(db, user, space) {
    if (onCooldown(space.kind)) return Promise.reject({ code: 'cooldown' });
    var ownerName = space.ownerName || (user && user.displayName) || 'Someone';
    var payload = {
      ts: Date.now(),
      type: 'space',
      name: ownerName,               // sharing a space is inherently non-anonymous
      space: {
        kind: space.kind,            // 'room' | 'farm' | 'aquarium' | 'world'
        uid: space.uid || (user && user.uid) || null,
        scene: space.scene || null,  // world only
        ownerName: ownerName
      }
    };
    return db.collection('answers').add(payload);
  }

  global.ShareToBoard = { linkFor: linkFor, postSpace: postSpace };
})(window);
