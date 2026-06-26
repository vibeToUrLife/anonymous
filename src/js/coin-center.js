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

  // ── State ──
  let coins = 0;
  let owned = [];
  let equip = { color: null, frame: null, badge: null, title: null };
  let overlay = null, body = null, coinsEl = null, built = false, curTab = 'shop';
  let curBet = C.SLOT_BETS[0];
  let spinning = false;
  let fortuneToday = null;   // today's drawn fortune (locked once drawn)

  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || ''); }
  function roomRef() { return db.collection('rooms').doc(auth.currentUser.uid); }
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

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

  async function loadRoom() {
    if (!hasFB || !auth.currentUser) return;
    try {
      const doc = await roomRef().get();
      const d = doc.exists ? doc.data() : {};
      coins = d.coins || 0;
      owned = Array.isArray(d.boardCosOwned) ? d.boardCosOwned : [];
      equip = Object.assign({ color: null, frame: null, badge: null, title: null }, d.boardCosEquip || {});
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
        if (cur < it.price) return { ok: false, reason: 'insufficient' };
        own.push(id);
        tx.set(ref, { coins: cur - it.price, boardCosOwned: own, coinsSpent: (d.coinsSpent || 0) + it.price }, { merge: true });
        return { ok: true, coins: cur - it.price, owned: own };
      });
    } catch (e) { return { ok: false, reason: 'error' }; }
  }

  async function gachaTx(n) {
    const cost = C.gachaCost(n);
    const rolled = []; for (let i = 0; i < n; i++) rolled.push(C.gachaRoll(Math.random));
    try {
      return await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (cur < cost) return { ok: false, reason: 'insufficient' };
        const own = Array.isArray(d.boardCosOwned) ? d.boardCosOwned.slice() : [];
        let refund = 0; const results = [];
        rolled.forEach(function (it) {
          const dup = own.indexOf(it.id) !== -1;
          if (dup) refund += C.GACHA.dupRefund; else own.push(it.id);
          results.push({ id: it.id, dup: dup });
        });
        const newCoins = cur - cost + refund;
        tx.set(ref, { coins: newCoins, boardCosOwned: own, coinsSpent: (d.coinsSpent || 0) + cost }, { merge: true });
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
        const cur = d.coins || 0; if (cur < bet) return { ok: false, reason: 'insufficient' };
        const newCoins = cur - bet + payout;
        tx.set(ref, { coins: newCoins, coinsSpent: (d.coinsSpent || 0) + bet }, { merge: true });
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
        const cur = d.coins || 0; if (cur < price) return { ok: false, reason: 'insufficient' };
        tx.set(ref, { coins: cur - price, coinsSpent: (d.coinsSpent || 0) + price }, { merge: true });
        return { ok: true, coins: cur - price };
      });
      if (!res.ok) return res;
      const until = Date.now() + hours * 3600000;
      try { await db.collection('answers').doc(answerId).set({ boostUntil: until }, { merge: true }); }
      catch (e) { roomRef().set({ coins: res.coins + price }, { merge: true }).catch(function () {}); return { ok: false, reason: 'error' }; }
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
          + '<span class="cc-lb-spent">🪙 ' + r.spent.toLocaleString() + '</span></div>';
      }).join('');
    } catch (e) { lb.innerHTML = '<div class="cc-hint">排行榜加载失败</div>'; }
  }
  async function burnTx(amount) {
    try {
      return await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (cur < amount) return { ok: false, reason: 'insufficient' };
        tx.set(ref, { coins: cur - amount, coinsSpent: (d.coinsSpent || 0) + amount }, { merge: true });
        return { ok: true, coins: cur - amount };
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
      + '<div class="cc-confirm-msg">确定要烧掉 <b>🪙 ' + amount.toLocaleString() + '</b> 金币来冲榜吗？'
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
      + C.SUPER_EFFECTS.map(function (e) { return '<button class="cc-btn buy cc-super-btn" data-act="super" data-id="' + e.id + '">' + e.emoji + ' ' + e.name + ' 🪙' + e.price + '</button>'; }).join('')
      + '</div>';
  }
  async function superTx(id) {
    const e = C.getSuper(id); if (!e) return { ok: false, reason: 'not_found' };
    try {
      return await db.runTransaction(async function (tx) {
        const ref = roomRef(); const doc = await tx.get(ref); const d = doc.exists ? doc.data() : {};
        const cur = d.coins || 0; if (cur < e.price) return { ok: false, reason: 'insufficient' };
        tx.set(ref, { coins: cur - e.price, coinsSpent: (d.coinsSpent || 0) + e.price }, { merge: true });
        return { ok: true, coins: cur - e.price };
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
      + (draw.bonus > 0 ? '<div class="cc-fortune-bonus">🪙 返还 ' + draw.bonus + '</div>' : '')
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
        + '<div class="cc-hint">每天可求一签 🪙' + C.FORTUNE_COST + ' · 抽中稀有签返还金币</div>'
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
        const cur = d.coins || 0; if (cur < C.FORTUNE_COST) return { ok: false, reason: 'insufficient' };
        const newCoins = cur - C.FORTUNE_COST + rolled.bonus;
        tx.set(ref, { coins: newCoins, coinsSpent: (d.coinsSpent || 0) + C.FORTUNE_COST, fortuneDay: today, fortuneResult: rolled }, { merge: true });
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
        const cur = d.coins || 0; if (cur < a.price) return { ok: false, reason: 'insufficient' };
        tx.set(ref, { coins: cur - a.price, coinsSpent: (d.coinsSpent || 0) + a.price }, { merge: true });
        return { ok: true, coins: cur - a.price };
      });
      if (!res.ok) return res;
      try {
        const giver = localStorage.getItem('flappy_name') || (auth.currentUser && auth.currentUser.displayName) || '匿名';
        const patch = { awards: {}, awardGivers: FieldValue.arrayUnion({ n: String(giver).slice(0, 20), a: awardId }) };
        patch.awards[awardId] = FieldValue.increment(1);
        await db.collection('answers').doc(answerId).set(patch, { merge: true });
      } catch (e) {
        // Refund if stamping the award failed.
        roomRef().set({ coins: res.coins + a.price, coinsSpent: FieldValue.increment(-a.price) }, { merge: true }).catch(function () {});
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
            + '<span class="cc-award-price">🪙 ' + a.price + '</span></button>';
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
  function updateCoins() { if (coinsEl) coinsEl.textContent = coins; }

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
    return '';
  }

  function renderShop() {
    let html = '<div class="cc-hint">购买装扮，装备后会显示在你的留言上 ✨</div>';
    C.COS_TYPES.forEach(function (type) {
      html += '<div class="cc-sec">' + C.COS_TYPE_NAMES[type] + '</div><div class="cc-grid">';
      C.byType(type).forEach(function (it) {
        const own = owned.indexOf(it.id) !== -1;
        const eq = equip[type] === it.id;
        html += '<div class="cc-item rarity-' + it.rarity + '">'
          + '<div class="cc-prev">' + previewHtml(it) + '</div>'
          + '<div class="cc-name">' + esc(it.name) + '</div>'
          + '<div class="cc-rar r-' + it.rarity + '">' + C.RARITY_NAMES[it.rarity] + '</div>'
          + (own
              ? '<button class="cc-btn ' + (eq ? 'eq' : 'own') + '" data-act="equip" data-id="' + it.id + '">' + (eq ? '已装备 ✓' : '装备') + '</button>'
              : '<button class="cc-btn buy" data-act="buy" data-id="' + it.id + '">🪙 ' + it.price + '</button>')
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
      + '<button class="cc-btn buy" data-act="pull" data-n="1">抽一次 🪙' + o.pullCost + '</button>'
      + '<button class="cc-btn buy" data-act="pull" data-n="10">抽十次 🪙' + o.tenCost + '</button>'
      + '</div>'
      + '<div class="cc-gacha-result" id="ccGachaResult"></div>'
      + '<div class="cc-note">抽到重复的装扮返还 🪙' + o.dupRefund + '</div>'
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
        + (r.dup ? '<div class="cc-dup">重复 +🪙' + C.GACHA.dupRefund + '</div>' : '<div class="cc-new">NEW!</div>')
        + '</div>';
    }).join('');
  }

  function renderSlot() {
    curBet = C.SLOT_BETS[0];
    body.innerHTML =
      '<div class="cc-slot">'
      + '<div class="cc-reels"><span id="ccR0">❓</span><span id="ccR1">❓</span><span id="ccR2">❓</span></div>'
      + '<div class="cc-bets">' + C.SLOT_BETS.map(function (b, i) { return '<button class="cc-bet' + (i === 0 ? ' active' : '') + '" data-bet="' + b + '">🪙' + b + '</button>'; }).join('') + '</div>'
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
    if (coins < curBet) { toast('金币不足', 'error'); return; }
    spinning = true;
    const res = await slotTx(curBet);
    if (!res.ok) { spinning = false; toast(res.reason === 'insufficient' ? '金币不足' : '出错了', 'error'); return; }
    const reels = [document.getElementById('ccR0'), document.getElementById('ccR1'), document.getElementById('ccR2')];
    const syms = C.SLOT_SYMBOLS.map(function (x) { return x.s; });
    const rEl = document.getElementById('ccSlotResult');
    if (rEl) { rEl.textContent = ''; rEl.className = 'cc-slot-result'; }
    let t = 0;
    const iv = setInterval(function () {
      reels.forEach(function (r) { if (r) r.textContent = syms[Math.floor(Math.random() * syms.length)]; });
      t += 80;
      if (t >= 700) {
        clearInterval(iv);
        reels.forEach(function (r, i) { if (r) r.textContent = res.symbols[i]; });
        coins = res.coins; updateCoins();
        if (rEl) {
          if (res.payout > 0) { rEl.textContent = '🎉 中奖 +' + res.payout + ' 金币！'; rEl.className = 'cc-slot-result win'; toast('🎰 中奖 +' + res.payout + ' 金币！', 'success'); }
          else { rEl.textContent = '差一点，再来一把～'; rEl.className = 'cc-slot-result lose'; }
        }
        spinning = false;
      }
    }, 80);
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
      + '<div class="cc-header"><span class="cc-title">🎰 金币乐园</span>'
      + '<span class="cc-coins">🪙 <b id="ccCoins">0</b></span></div>'
      + '<div class="cc-tabs">'
      + '<button class="cc-tab active" data-tab="shop">🛍️ 商店</button>'
      + '<button class="cc-tab" data-tab="gacha">🎁 扭蛋</button>'
      + '<button class="cc-tab" data-tab="slot">🎰 老虎机</button>'
      + '<button class="cc-tab" data-tab="board">💰 土豪榜</button>'
      + '<button class="cc-tab" data-tab="super">🎆 特效</button>'
      + '<button class="cc-tab" data-tab="fortune">🎋 求签</button>'
      + '</div><div class="cc-body" id="ccBody"></div>'
      + '</div>';
    document.body.appendChild(overlay);
    body = overlay.querySelector('#ccBody');
    coinsEl = overlay.querySelector('#ccCoins');

    overlay.querySelector('#ccClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
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
    pop.addEventListener('click', function (e) { if (e.target === pop) destroy(); });
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
      + C.BOOST_OPTIONS.map(function (o) { return '<button class="cc-btn buy" data-h="' + o.hours + '" data-p="' + o.price + '">' + o.label + ' 🪙' + o.price + '</button>'; }).join('')
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
