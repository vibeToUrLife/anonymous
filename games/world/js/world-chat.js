/* ════════════════════════════════════════════════════════════════
   world-chat.js — chat UI + moderation. Send path runs the tested
   moderateMessage() (length cap + profanity block) and rateAllow() (spam
   guard); receive path masks profanity (defense in depth) and hides blocked
   users. Recent messages show as speech bubbles above pets (via getBubble,
   read by world-actors) and in a small log.
   ════════════════════════════════════════════════════════════════ */
const WorldChat = (function () {
  let inputEl = null, logEl = null, hintEl = null, onSend = function () {};
  let myUid = null;
  let rateHistory = [];
  const bubbles = {}; // uid → { text, until }
  let blocked = new Set();
  try { blocked = new Set(JSON.parse(localStorage.getItem('world_blocked') || '[]')); } catch (e) {}

  function persist() { try { localStorage.setItem('world_blocked', JSON.stringify([...blocked])); } catch (e) {} }
  function isBlocked(uid) { return blocked.has(uid); }
  function block(uid) { blocked.add(uid); delete bubbles[uid]; persist(); }
  function unblock(uid) { blocked.delete(uid); persist(); }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  // Hide-timer lives ON the element — world-core's flashHint() shares it, and
  // separate timers would let a stale one cut a fresh toast short.
  function flash(msg) {
    if (!hintEl || !msg) return;
    hintEl.textContent = msg; hintEl.classList.add('show');
    clearTimeout(hintEl._hideT); hintEl._hideT = setTimeout(() => hintEl.classList.remove('show'), 2200);
  }

  function setBubble(uid, text) {
    bubbles[uid] = { text: maskProfanity(text, WORLD_CHAT.banned), until: Date.now() + WORLD_CHAT.bubbleMs };
  }
  function getBubble(uid) {
    const b = bubbles[uid];
    if (!b) return null;
    if (Date.now() > b.until) { delete bubbles[uid]; return null; }
    return b.text;
  }

  function trySend() {
    if (!inputEl) return;
    const mod = moderateMessage(inputEl.value, { maxLen: WORLD_CHAT.maxLen, banned: WORLD_CHAT.banned });
    if (!mod.ok) {
      if (mod.reason === 'blocked') flash("Let's keep it kind 🌸");
      return;
    }
    const rl = rateAllow(rateHistory, Date.now(), WORLD_CHAT.rateWindowMs, WORLD_CHAT.rateMax);
    rateHistory = rl.history;
    if (!rl.allowed) { flash('Slow down a little 🐢'); return; }
    inputEl.value = '';
    onSend(mod.text);
    if (myUid) setBubble(myUid, mod.text); // optimistic local bubble
  }

  // net delivered the (last-N) chat list.
  function receive(list) {
    const now = Date.now();
    const visible = list.filter(m => m && !isBlocked(m.uid));
    if (logEl) {
      logEl.innerHTML = visible.slice(-8).map(m =>
        '<div class="world-chatline"><b>' + esc(m.name || 'Pet') + ':</b> ' +
        esc(maskProfanity(m.text || '', WORLD_CHAT.banned)) + '</div>').join('');
      logEl.scrollTop = logEl.scrollHeight;
    }
    // Bubble only genuinely-recent messages (not the backlog loaded on join).
    visible.forEach(m => { if (now - (m.ts || 0) < WORLD_CHAT.bubbleMs) setBubble(m.uid, m.text); });
  }

  function init(opts) {
    inputEl = opts.inputEl; logEl = opts.logEl; hintEl = opts.hintEl;
    onSend = opts.onSend || onSend; myUid = opts.myUid;
    if (inputEl) inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); trySend(); } });
    if (opts.sendBtn) opts.sendBtn.addEventListener('click', e => { e.preventDefault(); trySend(); });
  }

  return { init, receive, getBubble, isBlocked, block, unblock, setBubble };
})();
