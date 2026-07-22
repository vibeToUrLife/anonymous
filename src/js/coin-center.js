/**
 * coin-center.js — "金币乐园" coin sinks for the bubble board:
 *   • 商店  — buy & equip bubble cosmetics (name colour / frame / badge / title)
 *   • 扭蛋  — Lucky Draw gacha for random cosmetics
 *   • 老虎机 — slot machine (house edge drains coins over time)
 * Plus window.openBoost(answerId) — pay coins to pin a bubble to the top.
 *
 * Every coin change goes through a Firestore transaction on the user's rooms doc
 * so balances can't go negative or be double-spent. Equipped cosmetics are also
 * mirrored to localStorage ('board_cos') so app.js can stamp them onto a post
 * with no extra read. Catalog/odds/paytable live in coin-spend-logic.js.
 *
 * Depends on globals: CoinSpend (logic), db/auth/firebase + showToast (app.js).
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const C = (typeof CoinSpend !== 'undefined') ? CoinSpend : null;
  if (!C) return;
  const hasFB = (typeof db !== 'undefined' && typeof auth !== 'undefined' && typeof firebase !== 'undefined');
  const FieldValue = hasFB ? firebase.firestore.FieldValue : null;

  // Developer UIDs (must match WN_DEV_UIDS in index.html / isDeveloper() in firestore.rules).
  // These users get the exclusive "开发者" signature title when no other title is equipped.
  const DEV_UIDS = ['eUs3isAgsaRT9VLKEFI4HEFbCnk1'];
  function isDev() { return hasFB && auth.currentUser && DEV_UIDS.indexOf(auth.currentUser.uid) !== -1; }

  // Dev test mode: every coin sink is FREE for developers — no balance requirement,
  // no deduction, no coinsSpent tally — so a dev can buy/equip/test anything at 0 coins.
  function affordOK(cur, cost)   { return isDev() || cur >= cost; }
  function chargedCoins(cur, cost) { return isDev() ? cur : cur - cost; }
  function spentTally(prev, cost)  { return (prev || 0) + (isDev() ? 0 : cost); }

  // ── State ──
  let coins = 0;
  let owned = [];
  let equip = { color: null, frame: null, badge: null, title: null, anim: null };
  let overlay = null, body = null, coinsEl = null, built = false, curTab = 'shop';
  let curBet = C.SLOT_BETS[0];
  let spinning = false;
  let slotLast = ['❓', '❓', '❓'];   // last symbol shown on each reel (for seamless re-spins)
  let fortuneToday = null;   // today's drawn fortune (locked once drawn)

  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || ''); }
  function roomRef() { return db.collection('rooms').doc(auth.currentUser.uid); }
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // Inline SVG coin. The ' + CIC + ' emoji (U+1FA99, added 2020) has no glyph on older
  // devices/fonts and renders as a "tofu" box, so we draw the coin instead — it
  // shows everywhere and matches the room's coin badge. Sizes to 1em via CSS.
  var CIC = '<svg class="cc-coin-ic" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#f7c97e" stroke="#c9952a" stroke-width="6"/><circle cx="50" cy="50" r="34" fill="none" stroke="#c9952a" stroke-width="3" opacity=".4"/><text x="50" y="58" text-anchor="middle" font-size="40" font-weight="bold" fill="#8a5e1f" font-family="sans-serif">$</text></svg>';

  // Coin history (tap the wallet to view). Shares rooms/{uid}.coinHistory with
  // the room / farm / aquarium log, so the whole account reads as one timeline.
  // Each row: { t: epoch-ms, d: signed delta, r: reason, b: resulting balance }.
  // Folded into the same transaction as the coin write so it stays atomic; dev
  // (zero-delta) actions are skipped. Capped so the Firestore doc stays small.
  function histAppend(d, delta, reason, newBal) {
    var h = Array.isArray(d.coinHistory) ? d.coinHistory.slice() : [];
    delta = Math.round(delta || 0);
    if (delta !== 0) {
      h.push({ t: Date.now(), d: delta, r: reason, b: Math.floor(newBal || 0) });
      if (h.length > 100) h = h.slice(h.length - 100);
    }
    return h;
  }
  function histTime(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    try { var dt = new Date(ts); return (dt.getMonth() + 1) + '月' + dt.getDate() + '日'; } catch (e) { return ''; }
  }
  // Tap-the-wallet coin-history popup (mirrors the confirm/pool popups).
  async function openCoinHist() {
    var pop = document.createElement('div');
    pop.className = 'cc-overlay show';
    pop.innerHTML = '<div class="cc-card cc-hist-card">'
      + '<button class="cc-close" title="关闭">✕</button>'
      + '<div class="cc-title">' + CIC + ' 金币记录</div>'
      + '<div class="cc-hist-list" id="ccHistList"><div class="cc-hint">加载中…</div></div>'
      + '</div>';
    document.body.appendChild(pop);
    function destroy() { pop.remove(); }
    pop.addEventListener('click', function (e) { if (e.target === pop) destroy(); });
    pop.querySelector('.cc-close').addEventListener('click', destroy);
    var listEl = pop.querySelector('#ccHistList');
    var hist = [];
    try {
      var doc = await roomRef().get();
      hist = (doc.exists && Array.isArray(doc.data().coinHistory)) ? doc.data().coinHistory : [];
    } catch (e) { listEl.innerHTML = '<div class="cc-hint">加载失败，请重试</div>'; return; }
    if (!hist.length) {
      listEl.innerHTML = '<div class="cc-hist-empty">还没有金币记录～<br>消费或赚取金币后会显示在这里</div>';
      return;
    }
    // Paginate: the whole (≤100) history came back in the single room-doc read
    // above, so we render it PAGE rows at a time and only build the next page's
    // DOM when "下一页" is tapped — keeps the list light and matches the ask.
    var entries = hist.slice().reverse();   // newest first
    var PAGE = 20, shown = 0;
    listEl.innerHTML = '';
    function rowHTML(e) {
      var dd = Math.round(e.d || 0);
      var cls = dd > 0 ? 'pos' : (dd < 0 ? 'neg' : 'zero');
      var dtxt = dd > 0 ? ('+' + dd.toLocaleString()) : (dd < 0 ? ('−' + Math.abs(dd).toLocaleString()) : '—');
      return '<div class="cc-hist-row">'
        + '<div class="cc-hist-mid"><div class="cc-hist-reason">' + esc(e.r || '金币') + '</div>'
        + '<div class="cc-hist-time">' + esc(histTime(e.t)) + '</div></div>'
        + '<div class="cc-hist-delta ' + cls + '">' + dtxt + '</div>'
        + '<div class="cc-hist-bal">' + Math.floor(e.b || 0).toLocaleString() + '</div></div>';
    }
    var moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'cc-hist-more';
    function renderMore() {
      var end = Math.min(shown + PAGE, entries.length), frag = '';
      for (; shown < end; shown++) frag += rowHTML(entries[shown]);
      listEl.insertAdjacentHTML('beforeend', frag);
      var remaining = entries.length - shown;
      if (remaining > 0) moreBtn.textContent = '下一页（还剩 ' + remaining + ' 条）';
      else moreBtn.remove();
    }
    moreBtn.addEventListener('click', renderMore);
    pop.querySelector('.cc-hist-card').appendChild(moreBtn);   // pinned below the scroll area
    renderMore();   // first page
  }

  /* ── Equipped-cosmetics mirror for app.js (zero extra reads on post) ── */
  function saveEquipLocal() {
    try { localStorage.setItem('board_cos', JSON.stringify(C.resolveEquip(equip))); } catch (e) {}
  }
  window.getEquippedCos = function () {
    let o;
    try { o = JSON.parse(localStorage.getItem('board_cos')) || {}; } catch (e) { o = {}; }
    if (o.ty && o.t && hasFB && auth.currentUser) {            // bake "N年/N个月" into a bought title at post time
      const created = Date.parse(auth.currentUser.metadata?.creationTime);
      if (created) o.t = C.titlePrefix(created, Date.now()) + ' ' + o.t;
    }
    delete o.ty;
    // Developer signature title — shown only to devs, and only when no other title is equipped.
    if (!o.t && isDev()) { o.t = '开发者'; o.tr = 'DEV'; }
    return Object.keys(o).length ? o : null;
  };

  // Dev-only console helper: set/empty your own coin balance, e.g. devCoins(0) to empty.
  window.devCoins = function (n) {
    if (!isDev()) { console.warn('devCoins: not a developer account'); return; }
    n = Math.max(0, n | 0);
    roomRef().set({ coins: n }, { merge: true })
      .then(function () { coins = n; updateCoins(); console.log('coins set to', n); })
      .catch(function (e) { console.error('devCoins failed', e); });
  };

  async function loadRoom() {
    if (!hasFB || !auth.currentUser) return;
    try {
      const doc = await roomRef().get();
      const d = doc.exists ? doc.data() : {};
      coins = d.coins || 0;
      owned = Array.isArray(d.boardCosOwned) ? d.boardCosOwned : [];
      equip = Object.assign({ color: null, frame: null, badge: null, title: null, anim: null }, d.boardCosEquip || {});
      const today = todayKey();
      fortuneToday = (d.fortuneDay === today && d.fortuneResult) ? d.fortuneResult : null;
      saveEquipLocal();
    } catch (e) {}
  }

  /* ── Firestore transactions ───────────────────────────────── */
  async function buyTx(id) {
    const it = C.getCosmetic(id); if (!it) return { ok: false, reason: 'not_found' };
    try {
      return await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; const own = Array.isArray(d.boardCosOwned) ? d.boardCosOwned.slice() : [];
        if (own.indexOf(id) !== -1) return { ok: false, reason: 'owned' };
        if (!affordOK(cur, it.price)) return { ok: false, reason: 'insufficient' };
        own.push(id);
        const nc = chargedCoins(cur, it.price);
        tx.set(ref, { coins: nc, boardCosOwned: own, coinsSpent: spentTally(d.coinsSpent, it.price), coinHistory: histAppend(d, nc - cur, '商店：' + (it.name || '装扮'), nc) }, { merge: true });
        return { ok: true, coins: nc, owned: own };
      });
    } catch (e) { return { ok: false, reason: 'error' }; }
  }

  async function gachaTx(n) {
    const cost = C.gachaCost(n);
    const rolled = []; for (let i = 0; i < n; i++) rolled.push(C.gachaRoll(Math.random));
    try {
      return await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (!affordOK(cur, cost)) return { ok: false, reason: 'insufficient' };
        const own = Array.isArray(d.boardCosOwned) ? d.boardCosOwned.slice() : [];
        let refund = 0; const results = [];
        rolled.forEach(function (it) {
          const dup = own.indexOf(it.id) !== -1;
          if (dup) refund += C.GACHA.dupRefund; else own.push(it.id);
          results.push({ id: it.id, dup: dup });
        });
        const newCoins = isDev() ? cur : cur - cost + refund;
        tx.set(ref, { coins: newCoins, boardCosOwned: own, coinsSpent: spentTally(d.coinsSpent, cost), coinHistory: histAppend(d, newCoins - cur, refund > 0 ? '扭蛋抽奖（返还 ' + refund + '）' : '扭蛋抽奖', newCoins) }, { merge: true });
        return { ok: true, results: results, coins: newCoins, owned: own, refund: refund };
      });
    } catch (e) { return { ok: false, reason: 'error' }; }
  }

  async function slotTx(bet) {
    const symbols = C.slotSpin(Math.random);
    const payout = C.slotPayout(symbols, bet);
    try {
      const res = await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (!affordOK(cur, bet)) return { ok: false, reason: 'insufficient' };
        const newCoins = isDev() ? cur : cur - bet + payout;
        tx.set(ref, { coins: newCoins, coinsSpent: spentTally(d.coinsSpent, bet), coinHistory: histAppend(d, newCoins - cur, payout > bet ? '老虎机中奖' : '老虎机', newCoins) }, { merge: true });
        return { ok: true, coins: newCoins };
      });
      if (!res.ok) return res;
      return { ok: true, symbols: symbols, payout: payout, coins: res.coins };
    } catch (e) { return { ok: false, reason: 'error' }; }
  }

  async function boostTx(answerId, hours, price) {
    try {
      const res = await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (!affordOK(cur, price)) return { ok: false, reason: 'insufficient' };
        const nc = chargedCoins(cur, price);
        tx.set(ref, { coins: nc, coinsSpent: spentTally(d.coinsSpent, price), coinHistory: histAppend(d, nc - cur, '置顶冲榜', nc) }, { merge: true });
        return { ok: true, coins: nc };
      });
      if (!res.ok) return res;
      const until = Date.now() + hours * 3600000;
      try { await db.collection('answers').doc(answerId).set({ boostUntil: until }, { merge: true }); }
      catch (e) { roomRef().set({ coins: res.coins + (isDev() ? 0 : price) }, { merge: true }).catch(function () {}); return { ok: false, reason: 'error' }; }
      coins = res.coins;
      return { ok: true, coins: res.coins };
    } catch (e) { return { ok: false, reason: 'error' }; }
  }

  async function equipCos(id) {
    const it = C.getCosmetic(id); if (!it) return;
    equip[it.type] = (equip[it.type] === id) ? null : id;   // toggle on/off
    saveEquipLocal();
    if (hasFB && auth.currentUser) roomRef().set({ boardCosEquip: equip }, { merge: true }).catch(function () {});
  }

  /* ── 土豪榜 (big-spender leaderboard) ── */
  function renderBoard() {
    body.innerHTML =
      '<div class="cc-hint">按累计消费金币排名 · 烧得越多越靠前 💸</div>'
      + '<div class="cc-note cc-board-note">📌 本榜单仅统计「本页面（金币乐园）」的消费，房间 / 地铁等其他页面的消费不计入</div>'
      + '<div class="cc-lb" id="ccLb">加载中…</div>'
      + '<div class="cc-sec">🔥 烧钱冲榜</div>'
      + '<div class="cc-burn-btns">'
      + C.BURN_OPTIONS.map(function (b) { return '<button class="cc-btn buy" data-act="burn" data-b="' + b + '">烧 ' + (b / 1000) + 'k</button>'; }).join('')
      + '</div>';
    loadBoard();
  }
  async function loadBoard() {
    const lb = document.getElementById('ccLb'); if (!lb) return;
    try {
      const snap = await db.collection('rooms').orderBy('coinsSpent', 'desc').limit(15).get();
      const me = auth.currentUser && auth.currentUser.uid;
      const rows = []; let rank = 0;
      snap.forEach(function (d) {
        const x = d.data(); const spent = x.coinsSpent || 0;
        if (spent <= 0) return;
        rank++;
        rows.push({ rank: rank, name: x.displayName || '匿名', spent: spent, me: d.id === me });
      });
      if (!rows.length) { lb.innerHTML = '<div class="cc-hint">还没有人消费，快来当第一个土豪！</div>'; return; }
      const medal = ['🥇', '🥈', '🥉'];
      lb.innerHTML = rows.map(function (r) {
        return '<div class="cc-lb-row' + (r.me ? ' me' : '') + '">'
          + '<span class="cc-lb-rank">' + (medal[r.rank - 1] || r.rank) + '</span>'
          + '<span class="cc-lb-name">' + esc(r.name) + (r.me ? ' (你)' : '') + '</span>'
          + '<span class="cc-lb-spent">' + CIC + ' ' + r.spent.toLocaleString() + '</span></div>';
      }).join('');
    } catch (e) { lb.innerHTML = '<div class="cc-hint">排行榜加载失败</div>'; }
  }
  async function burnTx(amount) {
    try {
      return await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (!affordOK(cur, amount)) return { ok: false, reason: 'insufficient' };
        const nc = chargedCoins(cur, amount);
        tx.set(ref, { coins: nc, coinsSpent: spentTally(d.coinsSpent, amount), coinHistory: histAppend(d, nc - cur, '烧钱冲榜', nc) }, { merge: true });
        return { ok: true, coins: nc };
      });
    } catch (e) { return { ok: false, reason: 'error' }; }
  }
  // Burning coins is irreversible, so always confirm first.
  function onBurn(amount) {
    const pop = document.createElement('div');
    pop.className = 'cc-overlay show';
    pop.innerHTML =
      '<div class="cc-card cc-boost cc-confirm">'
      + '<button class="cc-close" title="关闭">✕</button>'
      + '<div class="cc-title">🔥 烧钱冲榜</div>'
      + '<div class="cc-confirm-msg">确定要烧掉 <b>' + CIC + ' ' + amount.toLocaleString() + '</b> 金币来冲榜吗？'
      + '<br><span class="cc-warn">⚠️ 金币将永久消耗，不会退还！</span></div>'
      + '<div class="cc-confirm-btns">'
      + '<button class="cc-btn own" data-cancel>取消</button>'
      + '<button class="cc-btn buy" data-confirm>确定烧掉</button>'
      + '</div></div>';
    document.body.appendChild(pop);
    function destroy() { pop.remove(); }
    pop.addEventListener('click', function (e) { if (e.target === pop) destroy(); });
    pop.querySelector('.cc-close').addEventListener('click', destroy);
    pop.querySelector('[data-cancel]').addEventListener('click', destroy);
    pop.querySelector('[data-confirm]').addEventListener('click', async function (e) {
      e.target.disabled = true;
      const res = await burnTx(amount);
      if (!res.ok) { toast(res.reason === 'insufficient' ? '金币不足' : '出错了', 'error'); e.target.disabled = false; return; }
      coins = res.coins; updateCoins(); loadBoard();
      toast('🔥 烧掉 ' + amount.toLocaleString() + ' 金币，冲榜！', 'success');
      destroy();
    });
  }

  /* ── 全屏特效 (super reaction, broadcast to everyone) ── */
  function renderSuper() {
    body.innerHTML =
      '<div class="cc-hint">放一个全屏特效，所有在线的人都能看到！🎆</div>'
      + '<div class="cc-super-btns">'
      + C.SUPER_EFFECTS.map(function (e) { return '<button class="cc-btn buy cc-super-btn" data-act="super" data-id="' + e.id + '">' + e.emoji + ' ' + e.name + ' ' + CIC + '' + e.price + '</button>'; }).join('')
      + '</div>';
  }
  async function superTx(id) {
    const e = C.getSuper(id); if (!e) return { ok: false, reason: 'not_found' };
    try {
      return await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (!affordOK(cur, e.price)) return { ok: false, reason: 'insufficient' };
        const nc = chargedCoins(cur, e.price);
        tx.set(ref, { coins: nc, coinsSpent: spentTally(d.coinsSpent, e.price), coinHistory: histAppend(d, nc - cur, '特效：' + (e.name || ''), nc) }, { merge: true });
        return { ok: true, coins: nc };
      });
    } catch (err) { return { ok: false, reason: 'error' }; }
  }
  async function onSuper(id) {
    const res = await superTx(id);
    if (!res.ok) { toast(res.reason === 'insufficient' ? '金币不足' : '出错了', 'error'); return; }
    coins = res.coins; updateCoins();
    close();   // return to the board so the full-screen effect is actually visible
    if (typeof window.fireSuperReaction === 'function') window.fireSuperReaction(id);
    toast('🎆 特效已发射！', 'success');
  }

  /* ── 每日求签 (fortune draw — once per day, result locked for the day) ── */
  function fortuneCardHtml(draw, reveal) {
    const rare = draw.tier === '上上签' || draw.tier === '上签';
    return '<div class="cc-fortune-card' + (reveal ? ' reveal' : '') + (rare ? ' rare' : '') + '">'
      + '<div class="cc-fortune-tier">' + draw.tier + '</div>'
      + '<div class="cc-fortune-line">' + esc(draw.line) + '</div>'
      + (draw.bonus > 0 ? '<div class="cc-fortune-bonus">' + CIC + ' 返还 ' + draw.bonus + '</div>' : '')
      + '</div>';
  }
  function renderFortune() {
    if (fortuneToday) {
      // Already drawn today — always show today's locked result.
      body.innerHTML = '<div class="cc-fortune"><div class="cc-fortune-icon">🎋</div>'
        + '<div class="cc-hint">今天已经求过签啦，明天再来～</div>'
        + '<div class="cc-fortune-result">' + fortuneCardHtml(fortuneToday, false) + '</div></div>';
    } else {
      body.innerHTML = '<div class="cc-fortune"><div class="cc-fortune-icon">🎋</div>'
        + '<div class="cc-hint">每天可求一签 ' + CIC + '' + C.FORTUNE_COST + ' · 抽中稀有签返还金币</div>'
        + '<button class="cc-btn buy" data-act="fortune">🎋 求一签</button>'
        + '<div class="cc-fortune-result" id="ccFortune"></div></div>';
    }
  }
  async function fortuneTx() {
    const today = todayKey();
    const rolled = C.drawFortune(Math.random);
    try {
      return await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        // Already drawn today → return the stored result, no charge.
        if (d.fortuneDay === today && d.fortuneResult) {
          return { ok: true, coins: d.coins || 0, draw: d.fortuneResult, already: true };
        }
        const cur = d.coins || 0; if (!affordOK(cur, C.FORTUNE_COST)) return { ok: false, reason: 'insufficient' };
        const newCoins = isDev() ? cur : cur - C.FORTUNE_COST + rolled.bonus;
        tx.set(ref, { coins: newCoins, coinsSpent: spentTally(d.coinsSpent, C.FORTUNE_COST), fortuneDay: today, fortuneResult: rolled, coinHistory: histAppend(d, newCoins - cur, rolled.bonus > 0 ? '每日求签（返还 ' + rolled.bonus + '）' : '每日求签', newCoins) }, { merge: true });
        return { ok: true, coins: newCoins, draw: rolled, already: false };
      });
    } catch (e) { return { ok: false, reason: 'error' }; }
  }
  async function onFortune() {
    const el = document.getElementById('ccFortune'); if (!el) return;
    const btn = body.querySelector('[data-act="fortune"]');
    if (btn && btn.disabled) return;       // already drawing
    if (btn) btn.disabled = true;
    // Suspense: shake the 签筒 while the draw resolves (min ~1.5s).
    el.innerHTML = '<div class="cc-fortune-draw"><div class="cc-fortune-shake">🎋</div>'
      + '<div class="cc-fortune-shaking">求签中<span class="cc-dots"><i></i><i></i><i></i></span></div></div>';
    const results = await Promise.all([fortuneTx(), new Promise(function (r) { setTimeout(r, 1500); })]);
    const res = results[0];
    if (!res.ok) { if (btn) btn.disabled = false; el.innerHTML = ''; toast(res.reason === 'insufficient' ? '金币不足' : '出错了', 'error'); return; }
    coins = res.coins; updateCoins();
    fortuneToday = res.draw;                              // lock today's result
    el.innerHTML = fortuneCardHtml(res.draw, true);
    if (btn) btn.style.display = 'none';                  // used up for today
    const hintEl = body.querySelector('.cc-fortune .cc-hint');
    if (hintEl) hintEl.textContent = '今天已经求过签啦，明天再来～';
    const rare = res.draw.tier === '上上签' || res.draw.tier === '上签';
    if (res.already) toast('今天已经求过签啦～', '');
    else if (rare && typeof showToast === 'function') showToast('🎉 抽中 ' + res.draw.tier + '！', 'success');
  }

  /* ── Bubble Awards 🏆 (called from each bubble's 打赏 button) ── */
  async function awardTx(answerId, awardId) {
    const a = C.getAward(awardId); if (!a) return { ok: false, reason: 'not_found' };
    try {
      const res = await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (!affordOK(cur, a.price)) return { ok: false, reason: 'insufficient' };
        const nc = chargedCoins(cur, a.price);
        tx.set(ref, { coins: nc, coinsSpent: spentTally(d.coinsSpent, a.price) }, { merge: true });
        return { ok: true, coins: nc };
      });
      if (!res.ok) return res;
      try {
        const giver = localStorage.getItem('flappy_name') || (auth.currentUser && auth.currentUser.displayName) || '匿名';
        const patch = { awards: {}, awardGivers: FieldValue.arrayUnion({ n: String(giver).slice(0, 20), a: awardId }) };
        patch.awards[awardId] = FieldValue.increment(1);
        await db.collection('answers').doc(answerId).set(patch, { merge: true });
      } catch (e) {
        // Refund if stamping the award failed (no-op for devs — nothing was charged).
        if (!isDev()) roomRef().set({ coins: res.coins + a.price, coinsSpent: FieldValue.increment(-a.price) }, { merge: true }).catch(function () {});
        return { ok: false, reason: 'error' };
      }
      coins = res.coins;
      return { ok: true, coins: res.coins };
    } catch (e) { return { ok: false, reason: 'error' }; }
  }
  function buildAwardPopup(answerId) {
    const pop = document.createElement('div');
    pop.className = 'cc-overlay show';
    pop.innerHTML =
      '<div class="cc-card cc-award-pop"><button class="cc-close" title="关闭">✕</button>'
      + '<div class="cc-title">🏆 打赏这条留言</div>'
      + '<div class="cc-hint">为喜欢的留言点亮一枚奖章，让大家看到你的支持 ✨</div>'
      + '<div class="cc-award-grid">'
      + C.AWARDS.map(function (a) {
          return '<button class="cc-award-card" data-aid="' + a.id + '">'
            + '<span class="cc-award-emoji">' + a.emoji + '</span>'
            + '<span class="cc-award-name">' + a.name + '</span>'
            + '<span class="cc-award-price">' + CIC + ' ' + a.price + '</span></button>';
        }).join('')
      + '</div>'
      + '<div class="cc-award-note">💡 打赏仅用于支持这条留言，会显示你的名字；金币不会退还，也不会获得任何回报哦～</div>'
      + '</div>';
    document.body.appendChild(pop);
    function destroy() { pop.remove(); }
    pop.addEventListener('click', function (e) { if (e.target === pop) destroy(); });
    pop.querySelector('.cc-close').addEventListener('click', destroy);
    pop.querySelectorAll('[data-aid]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        const res = await awardTx(answerId, b.getAttribute('data-aid'));
        if (res.ok) { toast('🏆 打赏成功！', 'success'); destroy(); }
        else { toast(res.reason === 'insufficient' ? '金币不足' : '出错了', 'error'); b.disabled = false; }
      });
    });
  }
  window.openAward = function (answerId) {
    if (!hasFB || !auth.currentUser) { toast('请先登录', 'error'); return; }
    if (!answerId) return;
    buildAwardPopup(answerId);
  };

  /* ── Rendering ────────────────────────────────────────────── */
  function updateCoins() {
    if (!coinsEl) return;
    coinsEl.textContent = (typeof coins === 'number' ? coins : 0).toLocaleString('en-US');
    const w = coinsEl.closest('.cc-wallet');           // flash the wallet when the balance changes
    if (w) { w.classList.remove('cc-wallet-flash'); void w.offsetWidth; w.classList.add('cc-wallet-flash'); }
  }

  // Current user's "N年 / N个月" prefix from account-creation time (empty if unknown).
  function myTitlePrefix() {
    if (!hasFB || !auth.currentUser) return '';
    const created = Date.parse(auth.currentUser.metadata?.creationTime);
    return created ? C.titlePrefix(created, Date.now()) + ' ' : '';
  }

  function previewHtml(it) {
    if (it.type === 'color') return it.val === 'rainbow' ? '<span class="cos-name-rainbow">名字</span>' : '<span style="color:' + it.val + '">名字</span>';
    if (it.type === 'frame') return '<span class="cos-frame-' + it.val + ' cc-frame-prev">气泡</span>';
    if (it.type === 'badge') return '<span style="font-size:24px">' + it.val + '</span>';
    if (it.type === 'title') return '<span class="cos-title cos-title-' + it.rarity + '">' + esc(myTitlePrefix() + it.val) + '</span>';
    // Entrance animation — a mini bubble that plays the effect; tap to replay.
    if (it.type === 'anim') return '<span class="cc-anim-prev cos-anim-' + it.val + '" data-act="animprev" data-val="' + it.val + '" title="点一下预览">泡</span>';
    return '';
  }

  function renderShop() {
    const bal = (typeof coins === 'number') ? coins : 0;
    const free = isDev();
    let html = '<div class="cc-hint">购买装扮，装备后会显示在你的留言上 ✨</div>';
    C.COS_TYPES.forEach(function (type) {
      const list = C.byType(type);
      const ownedN = list.filter(function (it) { return owned.indexOf(it.id) !== -1; }).length;
      html += '<div class="cc-sec"><span class="cc-sec-t">' + C.COS_TYPE_NAMES[type] + '</span>'
        + '<span class="cc-sec-rule"></span><span class="cc-sec-n">' + ownedN + '/' + list.length + '</span></div>'
        + '<div class="cc-grid">';
      list.forEach(function (it) {
        const own = owned.indexOf(it.id) !== -1;
        const eq = equip[type] === it.id;
        const cant = !own && !free && bal < it.price;   // can't afford → dim + grey the price
        html += '<div class="cc-item rarity-' + it.rarity + (cant ? ' cant' : '') + '" data-r="' + it.rarity + '">'
          + '<span class="cc-rib" data-r="' + it.rarity + '">' + it.rarity + '</span>'
          + (own ? '<span class="cc-own">已拥有</span>' : '')
          + '<div class="cc-prev">' + previewHtml(it) + '</div>'
          + '<div class="cc-name">' + esc(it.name) + '</div>'
          + (own
              ? '<button class="cc-btn ' + (eq ? 'eq' : 'own') + '" data-act="equip" data-id="' + it.id + '">' + (eq ? '已装备 ✓' : '装备') + '</button>'
              : '<button class="cc-btn buy" data-act="buy" data-id="' + it.id + '">' + CIC + ' ' + it.price.toLocaleString('en-US') + '</button>')
          + '</div>';
      });
      html += '</div>';
    });
    body.innerHTML = html;
  }

  function rarityTag(rarity) { return '<span class="cc-rar r-' + rarity + '">' + C.RARITY_NAMES[rarity] + '</span>'; }

  function renderGacha() {
    const o = C.GACHA;
    body.innerHTML =
      '<div class="cc-gacha">'
      + '<div class="cc-machine">🎁</div>'
      + '<div class="cc-odds">传说 2% · 史诗 8% · 稀有 30% · 普通 60%</div>'
      + '<button class="cc-btn own cc-pool-btn" data-act="pool">🎲 查看奖池 / 概率</button>'
      + '<div class="cc-gacha-btns">'
      + '<button class="cc-btn buy" data-act="pull" data-n="1">抽一次 ' + CIC + '' + o.pullCost + '</button>'
      + '<button class="cc-btn buy" data-act="pull" data-n="10">抽十次 ' + CIC + '' + o.tenCost + '</button>'
      + '</div>'
      + '<div class="cc-gacha-result" id="ccGachaResult"></div>'
      + '<div class="cc-note">抽到重复的装扮返还 ' + CIC + '' + o.dupRefund + '</div>'
      + '</div>';
  }

  function showGachaResults(results) {
    const el = document.getElementById('ccGachaResult'); if (!el) return;
    el.innerHTML = results.map(function (r) {
      const it = C.getCosmetic(r.id);
      return '<div class="cc-pull rarity-' + it.rarity + '">'
        + '<div class="cc-prev">' + previewHtml(it) + '</div>'
        + '<div class="cc-name">' + esc(it.name) + '</div>'
        + rarityTag(it.rarity)
        + (r.dup ? '<div class="cc-dup">重复 +' + CIC + '' + C.GACHA.dupRefund + '</div>' : '<div class="cc-new">NEW!</div>')
        + '</div>';
    }).join('');
  }

  function renderSlot() {
    curBet = C.SLOT_BETS[0];
    slotLast = ['❓', '❓', '❓'];
    const reel = function (id) {
      return '<div class="cc-reel"><div class="cc-reel-strip" id="' + id + '"><div class="cc-cell">❓</div></div></div>';
    };
    body.innerHTML =
      '<div class="cc-slot">'
      + '<div class="cc-reels">' + reel('ccR0') + reel('ccR1') + reel('ccR2') + '</div>'
      + '<div class="cc-bets">' + C.SLOT_BETS.map(function (b, i) { return '<button class="cc-bet' + (i === 0 ? ' active' : '') + '" data-bet="' + b + '">' + CIC + '' + b + '</button>'; }).join('') + '</div>'
      + '<button class="cc-btn buy" data-act="spin">🎰 拉一把</button>'
      + '<div class="cc-slot-result" id="ccSlotResult"></div>'
      + '<div class="cc-note">三个一样 = 大奖 · 两个🍒 = 小奖 · 三个7️⃣ = 头奖×100</div>'
      + '</div>';
  }

  function renderTab() {
    if (curTab === 'shop') renderShop();
    else if (curTab === 'gacha') renderGacha();
    else if (curTab === 'slot') renderSlot();
    else if (curTab === 'board') renderBoard();
    else if (curTab === 'super') renderSuper();
    else if (curTab === 'fortune') renderFortune();
  }

  /* ── Actions ──────────────────────────────────────────────── */
  async function onBuy(id) {
    const res = await buyTx(id);
    if (res.ok) { coins = res.coins; owned = res.owned; updateCoins(); renderShop(); toast('购买成功 🎉', 'success'); }
    else toast(res.reason === 'insufficient' ? '金币不足' : (res.reason === 'owned' ? '已经拥有啦' : '出错了'), 'error');
  }
  async function onEquip(id) { await equipCos(id); renderShop(); }
  async function onPull(n) {
    const res = await gachaTx(n);
    if (!res.ok) { toast(res.reason === 'insufficient' ? '金币不足' : '出错了', 'error'); return; }
    coins = res.coins; owned = res.owned; updateCoins();
    showGachaResults(res.results);
    const news = res.results.filter(function (r) { return !r.dup; }).length;
    toast(news ? ('恭喜获得 ' + news + ' 件新装扮！') : '又是重复的…再来！', 'success');
  }
  async function onSpin() {
    if (spinning) return;
    if (!affordOK(coins, curBet)) { toast('金币不足', 'error'); return; }
    spinning = true;
    const res = await slotTx(curBet);
    if (!res.ok) { spinning = false; toast(res.reason === 'insufficient' ? '金币不足' : '出错了', 'error'); return; }
    const rEl = document.getElementById('ccSlotResult');
    if (rEl) { rEl.textContent = ''; rEl.className = 'cc-slot-result'; }

    const CELL = 62;                                   // must match .cc-cell height
    const syms = C.SLOT_SYMBOLS.map(function (x) { return x.s; });
    const rand = function () { return syms[Math.floor(Math.random() * syms.length)]; };
    const durs = [1.3, 1.75, 2.2];                     // reels stop left → right, like a real slot
    let maxEnd = 0;

    for (let i = 0; i < 3; i++) {
      const strip = document.getElementById('ccR' + i);
      if (!strip) continue;
      const spins = 18 + i * 6;                          // later reels travel further at ~same speed
      const cells = [slotLast[i]];                       // start from the currently-shown symbol
      for (let k = 0; k < spins; k++) cells.push(rand());
      cells.push(res.symbols[i]);                         // the target lands last (dead-centre)
      strip.innerHTML = cells.map(function (s) { return '<div class="cc-cell">' + s + '</div>'; }).join('');
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      void strip.offsetHeight;                            // reflow so the reset isn't animated
      strip.classList.add('spinning');
      strip.style.transition = 'transform ' + durs[i] + 's cubic-bezier(0.1, 0.72, 0.2, 1)';
      strip.style.transform = 'translateY(' + (-((spins + 1) * CELL)) + 'px)';
      slotLast[i] = res.symbols[i];
      const endMs = durs[i] * 1000;
      maxEnd = Math.max(maxEnd, endMs);
      (function (st, dur) { setTimeout(function () { st.classList.remove('spinning'); }, dur - 220); })(strip, endMs);
    }

    setTimeout(function () {
      coins = res.coins; updateCoins();
      if (rEl) {
        if (res.payout > 0) { rEl.textContent = '🎉 中奖 +' + res.payout + ' 金币！'; rEl.className = 'cc-slot-result win'; toast('🎰 中奖 +' + res.payout + ' 金币！', 'success'); }
        else { rEl.textContent = '差一点，再来一把～'; rEl.className = 'cc-slot-result lose'; }
      }
      spinning = false;
    }, maxEnd + 260);
  }

  /* ── Overlay build / open / close ─────────────────────────── */
  function build() {
    if (built) return;
    built = true;
    overlay = document.createElement('div');
    overlay.className = 'cc-overlay';
    overlay.id = 'ccOverlay';
    overlay.innerHTML =
      '<div class="cc-card">'
      + '<button class="cc-close" id="ccClose" title="关闭">✕</button>'
      + '<div class="cc-header">'
      +   '<div class="cc-brand"><span class="cc-mark">🎰</span>'
      +     '<div><div class="cc-brand-name">金币乐园</div><div class="cc-brand-sub">用金币换装扮</div></div></div>'
      +   '<span class="cc-wallet" id="ccWallet" role="button" tabindex="0" title="点击查看金币记录"><span class="coin">' + CIC + '</span> <b id="ccCoins">0</b></span>'
      + '</div>'
      + '<div class="cc-tabs">'
      + '<button class="cc-tab active" data-tab="shop"><span class="ic">🛍️</span>商店</button>'
      + '<button class="cc-tab" data-tab="gacha"><span class="ic">🎁</span>扭蛋</button>'
      + '<button class="cc-tab" data-tab="slot"><span class="ic">🎰</span>老虎机</button>'
      + '<button class="cc-tab" data-tab="board"><span class="ic">💰</span>土豪榜</button>'
      + '<button class="cc-tab" data-tab="super"><span class="ic">🎆</span>特效</button>'
      + '<button class="cc-tab" data-tab="fortune"><span class="ic">🎋</span>求签</button>'
      + '</div><div class="cc-body" id="ccBody"></div>'
      + '</div>';
    document.body.appendChild(overlay);
    body = overlay.querySelector('#ccBody');
    coinsEl = overlay.querySelector('#ccCoins');

    overlay.querySelector('#ccClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    // Tap the wallet → coin history (shared with room/farm/aquarium)
    var walletEl = overlay.querySelector('#ccWallet');
    if (walletEl) {
      walletEl.addEventListener('click', openCoinHist);
      walletEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCoinHist(); } });
    }
    overlay.querySelectorAll('.cc-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        curTab = t.getAttribute('data-tab');
        overlay.querySelectorAll('.cc-tab').forEach(function (x) { x.classList.toggle('active', x === t); });
        renderTab();
      });
    });
    // Delegated clicks for the dynamic body content.
    body.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act], [data-bet]'); if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'buy') onBuy(btn.getAttribute('data-id'));
      else if (act === 'animprev') {                       // replay the entrance preview
        const cls = 'cos-anim-' + btn.getAttribute('data-val');
        btn.classList.remove(cls); void btn.offsetWidth; btn.classList.add(cls);
      }
      else if (act === 'equip') onEquip(btn.getAttribute('data-id'));
      else if (act === 'pull') onPull(parseInt(btn.getAttribute('data-n'), 10));
      else if (act === 'pool') buildPoolPopup();
      else if (act === 'spin') onSpin();
      else if (act === 'burn') onBurn(parseInt(btn.getAttribute('data-b'), 10));
      else if (act === 'super') onSuper(btn.getAttribute('data-id'));
      else if (act === 'fortune') onFortune();
      else if (btn.hasAttribute('data-bet')) {
        curBet = parseInt(btn.getAttribute('data-bet'), 10);
        body.querySelectorAll('.cc-bet').forEach(function (x) { x.classList.toggle('active', x === btn); });
      }
    });
  }

  async function open() {
    if (!hasFB || !auth.currentUser) { toast('请先登录', 'error'); return; }
    build();
    await loadRoom();
    updateCoins();
    curTab = 'shop';
    overlay.querySelectorAll('.cc-tab').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-tab') === 'shop'); });
    renderTab();
    overlay.classList.add('show');
  }
  function close() { if (overlay) overlay.classList.remove('show'); }

  /* ── Gacha prize pool + per-item odds ── */
  function buildPoolPopup() {
    const odds = C.gachaItemOdds();
    const order = ['SSR', 'SR', 'R', 'N'];
    let html = '<div class="cc-card cc-pool"><button class="cc-close" title="关闭">✕</button>'
      + '<div class="cc-title">🎲 扭蛋奖池 &amp; 概率</div>'
      + '<div class="cc-hint">奖池整体：传说 2% · 史诗 8% · 稀有 30% · 普通 60%（同稀有度平分）</div>'
      + '<div class="cc-pool-list">';
    order.forEach(function (rar) {
      const items = odds.filter(function (o) { return o.rarity === rar; });
      if (!items.length) return;
      html += '<div class="cc-sec r-' + rar + '">' + C.RARITY_NAMES[rar] + ' ' + rar + '</div>';
      items.forEach(function (o) {
        html += '<div class="cc-pool-row rarity-' + rar + '">'
          + '<span class="cc-pool-prev">' + previewHtml(o) + '</span>'
          + '<span class="cc-pool-name">' + esc(o.name) + '</span>'
          + '<span class="cc-pool-pct">' + o.percent.toFixed(2) + '%</span>'
          + '</div>';
      });
    });
    html += '</div></div>';
    const pop = document.createElement('div');
    pop.className = 'cc-overlay show';
    pop.innerHTML = html;
    document.body.appendChild(pop);
    function destroy() { pop.remove(); }
    pop.addEventListener('click', function (e) {
      if (e.target === pop) { destroy(); return; }
      const pv = e.target.closest('[data-act="animprev"]');   // replay an entrance preview here too
      if (pv) { const cls = 'cos-anim-' + pv.getAttribute('data-val'); pv.classList.remove(cls); void pv.offsetWidth; pv.classList.add(cls); }
    });
    pop.querySelector('.cc-close').addEventListener('click', destroy);
  }

  /* ── Boost popup (called from each bubble's 置顶 button) ───── */
  function buildBoostPopup(answerId) {
    const pop = document.createElement('div');
    pop.className = 'cc-overlay show';
    pop.innerHTML =
      '<div class="cc-card cc-boost">'
      + '<button class="cc-close" title="关闭">✕</button>'
      + '<div class="cc-title">⭐ 置顶这条留言</div>'
      + '<div class="cc-hint">置顶后会浮到留言板最上方并高亮显示</div>'
      + '<div class="cc-boost-opts">'
      + C.BOOST_OPTIONS.map(function (o) { return '<button class="cc-btn buy" data-h="' + o.hours + '" data-p="' + o.price + '">' + o.label + ' ' + CIC + '' + o.price + '</button>'; }).join('')
      + '</div></div>';
    document.body.appendChild(pop);
    function destroy() { pop.remove(); }
    pop.addEventListener('click', function (e) { if (e.target === pop) destroy(); });
    pop.querySelector('.cc-close').addEventListener('click', destroy);
    pop.querySelectorAll('[data-h]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        const res = await boostTx(answerId, parseInt(b.getAttribute('data-h'), 10), parseInt(b.getAttribute('data-p'), 10));
        if (res.ok) { toast('⭐ 置顶成功！', 'success'); destroy(); }
        else { toast(res.reason === 'insufficient' ? '金币不足' : '出错了', 'error'); b.disabled = false; }
      });
    });
  }
  window.openBoost = function (answerId) {
    if (!hasFB || !auth.currentUser) { toast('请先登录', 'error'); return; }
    if (!answerId) return;
    buildBoostPopup(answerId);
  };

  /* ── Entry button (in the live bar) + Esc to close ────────── */
  const openBtn = document.getElementById('coinCenterBtn');
  if (openBtn) openBtn.addEventListener('click', open);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay && overlay.classList.contains('show')) close(); });

  // Keep the localStorage cosmetic mirror fresh once logged in (for app.js posts).
  if (hasFB) auth.onAuthStateChanged(function (u) { if (u) loadRoom(); });
})();
