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

  /* ── Live personal "停留" pill in the live bar ─────────────── */
  var valEl  = document.getElementById('myStayTimeVal');
  var wrapEl = document.getElementById('myStayTime');
  var unsubMe = null;

  function watchMine(uid) {
    if (unsubMe) { unsubMe(); unsubMe = null; }
    if (!uid || !valEl) return;
    unsubMe = db.collection('rooms').doc(uid).onSnapshot(function (doc) {
      var sec = (doc.exists && doc.data().totalStaySec) || 0;
      valEl.textContent = fmt(sec);
      if (wrapEl) wrapEl.hidden = false;
    }, function () {});
  }

  auth.onAuthStateChanged(function (u) {
    if (u) watchMine(u.uid);
    else { if (unsubMe) { unsubMe(); unsubMe = null; } if (wrapEl) wrapEl.hidden = true; }
  });

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
