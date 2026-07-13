/**
 * stay-ranking.js — 摸鱼榜 (formerly 停留榜; longest-slacking players) for the board.
 *
 * Two jobs, board-only:
 *   1. Live-show the signed-in user's OWN total 摸鱼时长 in the live bar
 *      (#myStayTime), kept in sync with rooms/{uid}.totalStaySec.
 *   2. A 🏆-style popup, opened by the 🐟 摸鱼榜 button, ranking players by
 *      total active time across the whole site — board + games + room + farm +
 *      aquarium + Pet World (rooms.totalStaySec). The raw seconds are written
 *      site-wide by stay-time.js. (Field/ID names keep the historical "stay"
 *      spelling so existing data and DOM hooks are untouched — only the DISPLAY
 *      name changed to 摸鱼榜.)
 *
 * Mirrors coin-ranking.js and reuses the .cc-* leaderboard styles already in
 * interactive.css. Depends on globals: db / auth (from app.js) and BoardLive
 * (for formatDuration).
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  if (typeof db === 'undefined' || typeof auth === 'undefined') return;

  var fmt = (typeof BoardLive !== 'undefined' && BoardLive.formatDuration)
    ? BoardLive.formatDuration
    : function (s) { return Math.floor((s || 0) / 60) + '分钟'; };

  var RANK_LIMIT = 15;
  var overlay = null, listEl = null, built = false;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* ── Live personal 摸鱼 clock in the live bar (retro scoreboard, HH:MM:SS,
     ticks up every second while you're active). It mirrors stay-time.js's
     "visible AND interacted within 5 min" rule so it stays in step with the
     real accrued total, and re-syncs to each Firestore snapshot — but only ever
     forward, so a slacking counter never visibly jumps backward. ── */
  var valEl  = document.getElementById('myStayTimeVal');
  var wrapEl = document.getElementById('myStayTime');
  var unsubMe = null;
  var shownSec = -1;                 // -1 = no data yet
  var lastAct = Date.now();
  var clockTimer = null;
  // Extra scoreboard segments: 摸鱼榜 rank (#N) + today's board messages.
  var rankVal  = document.getElementById('myRankVal');
  var rankSeg  = document.getElementById('myRankSeg');
  var todayVal = document.getElementById('todayVal');
  var stayLbl  = document.getElementById('myStayLbl');   // 摸鱼 label → slacker title
  var scoreEl  = document.getElementById('liveScore');   // whole LED panel (for overtake flash)
  var myTotalSec = -1;               // authoritative total from the last snapshot
  var lastRankAt = 0;                // throttle rank recomputes
  var lastRank = null;               // previous rank → overtake alerts

  function hms(s) {
    s = Math.max(0, Math.floor(s));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), c = s % 60;
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(h) + ':' + p(m) + ':' + p(c);
  }
  ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true });
  });
  function counting() { return !document.hidden && (Date.now() - lastAct) < 300000; }
  // Slacker title by total hours: 新手→学徒→达人→大师→宗师→仙人.
  function slackTitle(sec) {
    var h = sec / 3600;
    if (h < 1) return '新手'; if (h < 5) return '学徒'; if (h < 20) return '达人';
    if (h < 60) return '大师'; if (h < 150) return '宗师'; return '仙人';
  }
  function paint() {
    if (shownSec < 0) return;
    if (valEl) valEl.textContent = hms(shownSec);
    if (stayLbl) stayLbl.textContent = slackTitle(shownSec);   // the 摸鱼 label shows your title
  }
  // Brief glow on the whole scoreboard (rank overtake).
  function flashScore() {
    if (!scoreEl) return;
    scoreEl.classList.remove('flash');
    void scoreEl.offsetWidth;                 // reflow so the animation can retrigger
    scoreEl.classList.add('flash');
    setTimeout(function () { scoreEl.classList.remove('flash'); }, 950);
  }
  function startClock() {
    if (clockTimer) return;
    clockTimer = setInterval(function () {
      if (shownSec >= 0 && counting()) { shownSec++; paint(); }
    }, 1000);
  }
  function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }

  // ── 摸鱼榜 rank (#N): count players ahead of me via a cheap count() aggregation. ──
  function refreshRank() {
    if (!rankVal || myTotalSec < 0 || !(auth.currentUser && auth.currentUser.uid)) return;
    try {
      var q = db.collection('rooms').where('totalStaySec', '>', myTotalSec);
      if (typeof q.count !== 'function') return;          // SDK without aggregation → stay hidden
      q.count().get().then(function (snap) {
        var newRank = ((snap.data && snap.data().count) || 0) + 1;
        rankVal.textContent = '#' + newRank;
        if (rankSeg) rankSeg.hidden = false;
        if (lastRank !== null && newRank !== lastRank) {     // overtake / reclaim
          flashScore();
          if (typeof showToast === 'function') {
            if (newRank > lastRank) showToast('🐟 有人摸鱼反超你了！摸鱼榜 #' + lastRank + ' → #' + newRank, '');
            else showToast('🎉 你反超啦！摸鱼榜 #' + lastRank + ' → #' + newRank, 'success');
          }
        }
        lastRank = newRank;
      }).catch(function () {});
    } catch (e) {}
  }

  // ── 今日泡泡: count of board messages posted since local midnight. ──
  function _startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function refreshToday() {
    if (!todayVal) return;
    try {
      var q = db.collection('answers').where('ts', '>=', _startOfToday());
      if (typeof q.count !== 'function') { todayVal.textContent = '—'; return; }
      q.count().get().then(function (snap) {
        todayVal.textContent = String((snap.data && snap.data().count) || 0);
      }).catch(function () { todayVal.textContent = '—'; });
    } catch (e) { todayVal.textContent = '—'; }
  }

  function watchMine(uid) {
    if (unsubMe) { unsubMe(); unsubMe = null; }
    if (!uid || !valEl) return;
    unsubMe = db.collection('rooms').doc(uid).onSnapshot(function (doc) {
      var sec = (doc.exists && doc.data().totalStaySec) || 0;
      shownSec = Math.max(shownSec, sec);   // authoritative, but never tick backward
      paint();
      if (wrapEl) wrapEl.hidden = false;
      startClock();
      myTotalSec = sec;                                   // refresh my rank (throttled)
      if (Date.now() - lastRankAt > 90000) { lastRankAt = Date.now(); refreshRank(); }
    }, function () {});
  }

  auth.onAuthStateChanged(function (u) {
    if (u) watchMine(u.uid);
    else {
      if (unsubMe) { unsubMe(); unsubMe = null; }
      stopClock(); shownSec = -1; myTotalSec = -1; lastRankAt = 0; lastRank = null;
      if (wrapEl) wrapEl.hidden = true;
      if (rankSeg) rankSeg.hidden = true;
      if (rankVal) rankVal.textContent = '#—';
    }
  });

  // 今日泡泡 is board-wide: load once now, then refresh a few times an hour while visible.
  refreshToday();
  setInterval(function () { if (!document.hidden) refreshToday(); }, 150000);

  /* ── 停留榜 popup ──────────────────────────────────────────── */
  function build() {
    if (built) return;
    built = true;
    overlay = document.createElement('div');
    overlay.className = 'cc-overlay';
    overlay.innerHTML =
      '<div class="cc-card cc-boost" style="max-width:360px">'
      + '<button class="cc-close" title="关闭">✕</button>'
      + '<div class="cc-title">🐟 摸鱼榜</div>'
      + '<div class="cc-hint">按在本站摸鱼的总时长排名 · 摸得越久越靠前 🐟👑</div>'
      + '<div class="cc-lb" id="stayRankList">加载中…</div>'
      + '</div>';
    document.body.appendChild(overlay);
    listEl = overlay.querySelector('#stayRankList');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) hide(); });
    overlay.querySelector('.cc-close').addEventListener('click', hide);
  }

  function hide() { if (overlay) overlay.classList.remove('show'); }

  async function load() {
    listEl.innerHTML = '<div class="cc-hint">加载中…</div>';
    try {
      var snap = await db.collection('rooms').orderBy('totalStaySec', 'desc').limit(RANK_LIMIT).get();
      var me = auth.currentUser && auth.currentUser.uid;
      var rows = []; var rank = 0;
      snap.forEach(function (doc) {
        var x = doc.data(); var sec = x.totalStaySec || 0;
        if (sec <= 0) return;
        rank++;
        rows.push({ rank: rank, name: x.displayName || 'Anonymous', sec: sec, me: doc.id === me });
      });
      if (!rows.length) {
        listEl.innerHTML = '<div class="cc-hint">还没有人开始摸鱼，快去摸一会儿吧！🐟</div>';
        return;
      }
      var medal = ['🥇', '🥈', '🥉'];
      listEl.innerHTML = rows.map(function (r) {
        return '<div class="cc-lb-row' + (r.me ? ' me' : '') + '">'
          + '<span class="cc-lb-rank">' + (medal[r.rank - 1] || r.rank) + '</span>'
          + '<span class="cc-lb-name">' + esc(r.name) + (r.me ? ' (你)' : '') + '</span>'
          + '<span class="cc-lb-spent">⏱️ ' + fmt(r.sec) + '</span></div>';
      }).join('');
    } catch (e) {
      listEl.innerHTML = '<div class="cc-hint">排行榜加载失败</div>';
    }
  }

  function open() { build(); overlay.classList.add('show'); load(); }
  window.openStayRanking = open;

  // The ⏱️ 停留榜 button sits earlier in the page, so it exists when this runs.
  var btn = document.getElementById('stayRankBtn');
  if (btn) btn.addEventListener('click', open);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
})();
