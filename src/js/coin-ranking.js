/**
 * coin-ranking.js — 富豪榜 (richest players) for the bubble board.
 * A standalone popup, opened by the 🏆 button, ranking players by their
 * CURRENT coin balance (rooms.coins). This is separate from 金币乐园's 土豪榜,
 * which ranks by lifetime coins spent (coinsSpent).
 *
 * Depends on globals: db / auth (firebase-config + compat SDK).
 * Reuses the .cc-* leaderboard styles already in interactive.css.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  if (typeof db === 'undefined' || typeof auth === 'undefined') return;

  const RANK_LIMIT = 15;
  let overlay = null, listEl = null, built = false;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function build() {
    if (built) return;
    built = true;
    overlay = document.createElement('div');
    overlay.className = 'cc-overlay';
    overlay.innerHTML =
      '<div class="cc-card cc-boost" style="max-width:360px">'
      + '<button class="cc-close" title="关闭">✕</button>'
      + '<div class="cc-title">🏆 富豪榜</div>'
      + '<div class="cc-hint">按当前金币余额排名 · 金币越多越靠前 👑</div>'
      + '<div class="cc-lb" id="crkList">加载中…</div>'
      + '</div>';
    document.body.appendChild(overlay);
    listEl = overlay.querySelector('#crkList');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) hide(); });
    overlay.querySelector('.cc-close').addEventListener('click', hide);
  }

  function hide() { if (overlay) overlay.classList.remove('show'); }

  async function load() {
    listEl.innerHTML = '<div class="cc-hint">加载中…</div>';
    try {
      const snap = await db.collection('rooms').orderBy('coins', 'desc').limit(RANK_LIMIT).get();
      const me = auth.currentUser && auth.currentUser.uid;
      const rows = []; let rank = 0;
      snap.forEach(function (doc) {
        const x = doc.data(); const coins = x.coins || 0;
        if (coins <= 0) return;
        rank++;
        rows.push({ rank: rank, name: x.displayName || 'Anonymous', coins: coins, me: doc.id === me });
      });
      if (!rows.length) {
        listEl.innerHTML = '<div class="cc-hint">还没有人有金币，快去赚第一桶金！</div>';
        return;
      }
      const medal = ['🥇', '🥈', '🥉'];
      listEl.innerHTML = rows.map(function (r) {
        return '<div class="cc-lb-row' + (r.me ? ' me' : '') + '">'
          + '<span class="cc-lb-rank">' + (medal[r.rank - 1] || r.rank) + '</span>'
          + '<span class="cc-lb-name">' + esc(r.name) + (r.me ? ' (你)' : '') + '</span>'
          + '<span class="cc-lb-spent">🪙 ' + r.coins.toLocaleString() + '</span></div>';
      }).join('');
    } catch (e) {
      listEl.innerHTML = '<div class="cc-hint">排行榜加载失败</div>';
    }
  }

  function open() { build(); overlay.classList.add('show'); load(); }
  window.openCoinRanking = open;

  // The 🏆 button sits earlier in the page, so it exists when this script runs.
  const btn = document.getElementById('coinRankBtn');
  if (btn) btn.addEventListener('click', open);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
})();
