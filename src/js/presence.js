/**
 * presence.js — Live presence & typing indicator for the bubble board.
 *
 * Each logged-in viewer keeps a tiny heartbeat doc at board_presence/{uid}
 * ({lastSeen, typing}). Everyone subscribes to that collection and we derive,
 * client-side, how many people are currently online and whether anyone else is
 * typing a message. Nothing personal is stored — presence is anonymous.
 *
 * Firestore optimisation:
 *  - Heartbeats only every BoardLive.HEARTBEAT_MS and ONLY while the tab is
 *    visible (hidden tabs stop writing), so idle/background tabs cost nothing.
 *  - "typing" is written only on transitions (start/stop), never per keystroke.
 *  - Stale viewers are filtered out by TTL in pure logic, so we never need a
 *    server-side cleanup job.
 *
 * Depends on globals from app.js (db, auth, firebase) and board-live-logic.js
 * (BoardLive). Loaded after both.
 */
(function () {
  'use strict';

  if (typeof db === 'undefined' || typeof auth === 'undefined' || typeof firebase === 'undefined') return;
  const L = (typeof BoardLive !== 'undefined') ? BoardLive : null;
  if (!L) return;

  const presenceCol = db.collection('board_presence');

  // ── UI refs (live under the page subtitle in index.html) ──
  const countEl      = document.getElementById('liveOnlineCount');
  const presenceWrap = document.getElementById('livePresence');
  const typingEl     = document.getElementById('liveTyping');
  const input        = document.getElementById('answerInput');
  const peakEl       = document.getElementById('peakVal');

  // 今日峰值在线 — GLOBAL & shared: the highest concurrent online count seen
  // TODAY across EVERYONE, kept in one doc (app_state/presence_peak) that all
  // clients read, so every viewer shows the same number. (It used to be a
  // private per-device localStorage value — that's why people saw different
  // peaks.) There's no backend here, so the max is computed against the
  // authoritative server value inside a transaction: a new high raises the doc
  // to max(current, online), which can't clobber another client's higher value.
  //
  // The day is a MONOTONIC integer: the UTC+8 (board home tz, no DST) epoch-day
  // index. Using a fixed offset (not each viewer's local tz) means every client
  // derives the same day from the same instant, so different timezones never
  // disagree. Using an integer that only ever INCREASES means the shared doc can
  // advance to a newer day but never be reverted to an older one — so even a
  // client whose clock is a few minutes fast can only reset the peak slightly
  // early, never ping-pong the boundary with on-time clients. (A perfectly
  // skew-proof boundary would need a server timestamp, which a client-only app
  // can't get cheaply; this makes the residual benign instead of oscillating.)
  const peakRef = db.doc('app_state/presence_peak');
  const PEAK_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;   // board home timezone (UTC+8)
  function _peakDay() { return Math.floor((Date.now() + PEAK_TZ_OFFSET_MS) / 86400000); }

  // These reflect ONLY the server-confirmed doc (written solely by watchPeak).
  // bumpPeak decides whether to write from THESE, never from an optimistic value,
  // so a failed transaction can't pin a phantom high that suppresses later writes.
  let _peakVal = 0;         // server-confirmed peak for today (0 if doc is a different day)
  let _peakDay0 = -1;       // the epoch-day the shared doc is currently for (-1 = unknown)
  let _peakLoaded = false;  // don't write until we've read the doc (no clobber)
  let _peakInflight = -1;   // online value of an unresolved write (dedupe); reset when it settles
  let _peakUnsub = null;

  // Peak is "highest online today" and the viewer is themselves online, so it's
  // ≥ 1; a stale/absent doc yields _peakVal 0, so floor the display at 1 to avoid
  // a "0" flash before the first bump lands.
  function _renderPeak() { if (peakEl) peakEl.textContent = Math.max(1, _peakVal); }

  function watchPeak() {
    if (_peakUnsub) return;
    _peakUnsub = peakRef.onSnapshot(function (doc) {
      const d = doc.exists ? doc.data() : null;
      _peakDay0 = (d && typeof d.day === 'number') ? d.day : -1;
      _peakVal = (d && d.day === _peakDay() && typeof d.val === 'number') ? d.val : 0;
      _peakLoaded = true;
      _renderPeak();
    }, function () {});
  }

  function bumpPeak(online) {
    if (!_peakLoaded) return;                              // wait until we know the shared value
    const today = _peakDay();
    if (today < _peakDay0) return;                         // doc is a newer day (a faster clock) → leave it
    if (today === _peakDay0 && online <= _peakVal) return; // same day, server already ≥ us
    if (online <= _peakInflight) return;                   // a ≥ write is already on the way
    _peakInflight = online;
    // Authoritative & monotonic: read the server's current value; on the SAME day
    // only ever raise it (max), on a NEWER day reset to the current count, and
    // NEVER revert a newer day. The display updates when our own write echoes
    // back through watchPeak — no optimistic guess.
    db.runTransaction(function (tx) {
      return tx.get(peakRef).then(function (snap) {
        const d = snap.exists ? snap.data() : null;
        const dday = (d && typeof d.day === 'number') ? d.day : -1;
        const dval = (d && typeof d.val === 'number') ? d.val : 0;
        if (today < dday) return;                          // don't revert to an older day
        const next = (today === dday) ? Math.max(dval, online) : online;
        if (today === dday && next === dval) return;       // someone already ≥ us → leave it
        tx.set(peakRef, { day: today, val: next, ts: Date.now() });
      });
    }).then(function () { _peakInflight = -1; })
      .catch(function () { _peakInflight = -1; });         // failed → allow a later retry
  }

  let myUid = null;
  let heartbeatTimer = null;
  let typing = false;
  let typingIdleTimer = null;
  let unsub = null;

  /* ── Heartbeat ───────────────────────────────────────────── */
  function writeHeartbeat() {
    if (!myUid) return;
    presenceCol.doc(myUid)
      .set({ lastSeen: Date.now(), typing: typing }, { merge: true })
      .catch(() => {});
  }

  function startHeartbeat() {
    writeHeartbeat();                       // announce immediately
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (document.hidden) return;          // skip hidden tabs → fewer writes
      writeHeartbeat();
    }, L.HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  /* ── Typing (only writes on transitions) ─────────────────── */
  function setTyping(next) {
    if (next === typing) return;
    typing = next;
    writeHeartbeat();
  }

  function onInput() {
    setTyping(true);
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    typingIdleTimer = setTimeout(() => setTyping(false), L.TYPING_IDLE_MS);
  }

  function bindTyping() {
    if (!input || input._presenceBound) return;
    input._presenceBound = true;
    input.addEventListener('input', onInput);
    input.addEventListener('blur', () => setTyping(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) setTyping(false); // sent → stop
    });
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.addEventListener('click', () => setTyping(false));
  }

  /* ── Render from the live collection ─────────────────────── */
  function renderPresence(docs) {
    const now = Date.now();
    const online = Math.max(1, L.countOnline(docs, now)); // I'm always ≥ 1
    if (countEl) countEl.textContent = online;
    bumpPeak(online);
    if (presenceWrap) presenceWrap.title = online + ' viewing the board right now';
    if (typingEl) typingEl.hidden = !L.someoneElseTyping(docs, now, myUid);
  }

  function subscribe() {
    if (unsub) unsub();
    unsub = presenceCol.onSnapshot((snap) => {
      const docs = [];
      snap.forEach(d => docs.push(Object.assign({ uid: d.id }, d.data())));
      renderPresence(docs);
    }, () => {});
  }

  /* ── Lifecycle ───────────────────────────────────────────── */
  function goOnline(uid) {
    myUid = uid;
    bindTyping();
    startHeartbeat();
    subscribe();
    watchPeak();
  }

  function goOffline() {
    stopHeartbeat();
    if (unsub) { unsub(); unsub = null; }
    if (_peakUnsub) { _peakUnsub(); _peakUnsub = null; }
    _peakLoaded = false;
    if (myUid) presenceCol.doc(myUid).set({ lastSeen: 0, typing: false }, { merge: true }).catch(() => {});
    myUid = null;
  }

  auth.onAuthStateChanged((user) => {
    if (user) goOnline(user.uid);
    else goOffline();
  });

  // Best-effort offline mark when leaving the page.
  window.addEventListener('beforeunload', () => {
    if (myUid) presenceCol.doc(myUid).set({ lastSeen: 0, typing: false }, { merge: true }).catch(() => {});
  });

  // Re-announce promptly when the user comes back to the tab.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && myUid) writeHeartbeat();
  });
})();
