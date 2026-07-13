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

  // 今日峰值在线 — highest online count seen today (this device; resets at local midnight).
  function _peakDay() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  let _peak = (function () { try { return JSON.parse(localStorage.getItem('board_peak')) || {}; } catch (e) { return {}; } })();
  if (_peak.day !== _peakDay()) _peak = { day: _peakDay(), val: 0 };
  if (peakEl && _peak.val) peakEl.textContent = _peak.val;
  function bumpPeak(online) {
    const t = _peakDay();
    if (_peak.day !== t) _peak = { day: t, val: 0 };
    if (online > _peak.val) {
      _peak.val = online;
      try { localStorage.setItem('board_peak', JSON.stringify(_peak)); } catch (e) {}
    }
    if (peakEl) peakEl.textContent = _peak.val || online;
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
  }

  function goOffline() {
    stopHeartbeat();
    if (unsub) { unsub(); unsub = null; }
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
