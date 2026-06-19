/**
 * coin-rush.js — Browser controller for the daily Coin Rush on the bubble board.
 *
 * Drives the whole lifecycle off a once-per-second tick:
 *   scheduled → imminent → live → results
 * using the pure schedule/phase logic in coin-rush-logic.js (CoinRush). At 9am
 * the board reveals today's seeded-random rush time and counts down; at the
 * start a "Tap to Join" banner appears; tapping opens a full-screen overlay of
 * gold coin-bubbles to pop (reusing the Playground's .pg-* visuals). When the
 * 60s window closes a daily ranking is shown and the top 3 get bonus coins.
 *
 * No server: the time is derived from the date so every client agrees, scores
 * are owner-written to coin_rush/{day}/scores/{uid}, and the top-3 bonus is paid
 * via a one-time, transaction-guarded claim. Coins are batched into rooms/{uid}
 * exactly like bubble-playground.js.
 *
 * Depends on globals from app.js (db, auth, firebase) and CoinRush. Loaded after
 * both.
 */
(function () {
  'use strict';

  if (typeof db === 'undefined' || typeof auth === 'undefined' || typeof firebase === 'undefined') return;
  const CR = (typeof CoinRush !== 'undefined') ? CoinRush : null;
  if (!CR) return;

  const FieldValue = firebase.firestore.FieldValue;

  const SCORE_WRITE_MS = 4000;   // throttle score-doc writes
  const WALLET_FLUSH_MS = 6000;  // batch wallet coin increments
  const MAX_BALLS = 14;          // coins on the field at once

  // Realtime DB (robbing mode). Guarded: if RTDB isn't configured firebase
  // .database() throws and we silently fall back to the solo "same layout" mode.
  let rtdb = null;
  try { rtdb = (CR.ROBBING && firebase.database) ? firebase.database() : null; } catch (e) { rtdb = null; }
  const robbingOn = !!rtdb;

  /* ── identity ─────────────────────────────────────────────── */
  let myUid = null, myName = 'Anonymous';
  auth.onAuthStateChanged((u) => {
    myUid = u ? u.uid : null;
    if (u) myName = currentName();
  });
  function currentName() {
    return localStorage.getItem('flappy_name') ||
           (auth.currentUser && auth.currentUser.displayName) || 'Anonymous';
  }

  /* ── schedule state ───────────────────────────────────────── */
  let dayKey = CR.dayKeyOf(Date.now());
  let schedule = CR.coinRushSchedule(dayKey);   // today's real, seeded schedule
  function activeSchedule() { return schedule; }

  // Per-rush scoring state
  let currentRushId = null, finalizedId = null;
  let sessionScore = 0, sessionCoinsEarned = 0, participated = false;
  let pendingWallet = 0, walletTimer = null, scoreTimer = null;

  /* ── time formatting helpers (UI only) ────────────────────── */
  function clockAt(ts) {
    const d = new Date(ts); let h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }
  function fmtDur(ms) {
    ms = Math.max(0, ms); const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? h + ':' + p(m) + ':' + p(ss) : m + ':' + p(ss);
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = (s == null ? '' : String(s));
    return d.innerHTML;
  }

  /* ── main 1s tick ─────────────────────────────────────────── */
  function tick() {
    const now = Date.now();
    const k = CR.dayKeyOf(now);
    if (k !== dayKey) {                       // new day → fresh schedule
      dayKey = k; schedule = CR.coinRushSchedule(k);
      currentRushId = null; finalizedId = null;
    }
    const sched = activeSchedule();
    const ph = CR.coinRushPhase(now, sched, CR);
    handleTransitions(ph, sched);
    renderBanner(ph, sched);
    renderCountdown(ph);
  }

  function handleTransitions(ph, sched) {
    const id = sched ? (dayKey + '@' + sched.startMs) : null;

    if (ph.phase === 'live' && currentRushId !== id) {   // a rush just began
      currentRushId = id; finalizedId = null;
      sessionScore = 0; sessionCoinsEarned = 0; participated = false;
      myRobScore = 0;
      spawning = true;
    }
    if (ph.phase === 'results' && currentRushId === id && finalizedId !== id) {
      finalizedId = id;
      onRushEnd();
    }
    if (ph.phase === 'live' && overlay && finalizedId !== id) updateTimer(ph.msUntilEnd);
  }

  /* ── board banner ─────────────────────────────────────────── */
  const banner = document.getElementById('crBanner');
  const bnEmoji = document.getElementById('crBannerEmoji');
  const bnLabel = document.getElementById('crBannerLabel');
  const bnSub   = document.getElementById('crBannerSub');
  const bnBtn   = document.getElementById('crBannerBtn');
  if (bnBtn) bnBtn.addEventListener('click', () => {
    const ph = CR.coinRushPhase(Date.now(), activeSchedule(), CR);
    if (ph.phase === 'live') openOverlay();
    else if (ph.phase === 'results') viewResults();
  });
  const bnInfo = document.getElementById('crBannerInfo');
  if (bnInfo) bnInfo.addEventListener('click', showGameInfo);

  function renderBanner(ph, sched) {
    if (!banner) return;
    // In the final seconds the big fixed countdown takes over; hide the inline banner.
    const inFinal = (ph.phase === 'scheduled' || ph.phase === 'imminent')
                    && ph.msUntilStart > 0 && ph.msUntilStart <= CR.FINAL_COUNTDOWN_MS;
    if (inFinal) { banner.classList.add('hidden'); return; }
    banner.classList.remove('urgent', 'live');
    const show = (em, label, sub, btnText) => {
      bnEmoji.textContent = em; bnLabel.textContent = label; bnSub.textContent = sub;
      if (btnText) { bnBtn.textContent = btnText; bnBtn.classList.remove('hidden'); }
      else bnBtn.classList.add('hidden');
      banner.classList.remove('hidden');
    };
    switch (ph.phase) {
      case 'scheduled':
        show('💰', 'Coin Rush at ' + clockAt(sched.startMs), 'starts in ' + fmtDur(ph.msUntilStart), null);
        break;
      case 'imminent':
        show('⚡', 'Coin Rush starting!', 'in ' + fmtDur(ph.msUntilStart), null);
        banner.classList.add('urgent');
        break;
      case 'live':
        show('💰', 'Coin Rush is LIVE!', fmtDur(ph.msUntilEnd) + ' left', 'Tap to Join');
        banner.classList.add('live');
        break;
      case 'results':
        show('🏆', 'Coin Rush results', 'tap to view the ranking', 'View');
        break;
      default: // idle / none
        banner.classList.add('hidden');
    }
  }

  // Big, fixed (scroll-proof) final countdown shown in the last seconds.
  let countdownEl = null;
  function renderCountdown(ph) {
    const inFinal = (ph.phase === 'scheduled' || ph.phase === 'imminent')
                    && ph.msUntilStart > 0 && ph.msUntilStart <= CR.FINAL_COUNTDOWN_MS;
    if (!inFinal) {
      if (countdownEl) { countdownEl.remove(); countdownEl = null; }
      return;
    }
    if (!countdownEl) {
      countdownEl = document.createElement('div');
      countdownEl.id = 'crCountdown';
      countdownEl.innerHTML =
        '<div class="cr-cd-label">💰 Coin Rush starts in</div>' +
        '<div class="cr-cd-num" id="crCdNum"></div>' +
        '<div class="cr-cd-hint">Get ready to tap! 💰</div>';
      document.body.appendChild(countdownEl);
    }
    const secs = String(Math.ceil(ph.msUntilStart / 1000));
    const numEl = countdownEl.querySelector('#crCdNum');
    if (numEl && numEl.textContent !== secs) {
      numEl.textContent = secs;
      numEl.classList.remove('pop'); void numEl.offsetWidth; numEl.classList.add('pop');  // retrigger pop
    }
  }

  /* ── overlay (live field + results) ───────────────────────── */
  let overlay = null, field = null;
  let balls = [], frameId = null, lastT = 0, spawning = false;
  let rng = Math.random;   // deterministic per-rush RNG → every player spawns the same coins
  // Robbing-mode state (one shared finite pot via RTDB)
  let coinEls = {};          // coinId → rendered element
  let claimedSet = {};       // coinId → uid (local mirror of RTDB claims)
  let claimsRef = null, claimsCb = null, myRobScore = 0;

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'crOverlay';
    overlay.innerHTML =
      '<div class="pg-header">' +
        '<span class="pg-title">💰 Coin Rush</span>' +
        '<span class="cr-timer" id="crTimer"></span>' +
        '<span class="pg-coins" id="crScore">Score 0</span>' +
        '<button class="pg-close" id="crClose" title="Close">✕</button>' +
      '</div>' +
      '<div class="cr-body" id="crBody"></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('cr-open');
    overlay.querySelector('#crClose').addEventListener('click', closeOverlay);
  }

  function openOverlay() {
    ensureOverlay();
    const body = overlay.querySelector('#crBody');
    body.innerHTML = '<div class="pg-hint">' +
      (robbingOn ? 'Grab the coins before others do! 💰' : 'Tap the coins as fast as you can! 💰') +
      '</div><div class="pg-field" id="crField"></div>';
    field = body.querySelector('#crField');
    updateScoreLabel();
    spawning = true;
    if (robbingOn) { startRobbing(); return; }   // shared pot via RTDB
    // Solo mode: re-seed from the day's shared rush seed so every player spawns
    // the identical coin layout (no coordination, no extra Firestore traffic).
    rng = CR.makeRng(CR.coinRushSeed(dayKey));
    requestAnimationFrame(() => {
      if (!overlay || !field) return;
      balls = [];
      for (let i = 0; i < MAX_BALLS; i++) spawnOne();
      lastT = performance.now();
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(frame);
    });
  }

  function closeOverlay() {
    if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
    cleanupRobbing();
    flushScore(); flushWallet();
    balls = []; field = null;
    if (overlay) { overlay.remove(); overlay = null; }
    document.body.classList.remove('cr-open');
  }

  function updateTimer(msLeft) {
    const t = overlay && overlay.querySelector('#crTimer');
    if (!t) return;
    t.textContent = fmtDur(msLeft);
    t.classList.toggle('urgent', msLeft <= 10000);
  }
  function updateScoreLabel() {
    const s = overlay && overlay.querySelector('#crScore');
    if (s) s.textContent = 'Score ' + (robbingOn ? myRobScore : sessionScore);
  }

  /* ── coin-bubble spawn + physics (gold reskin of the Playground) ── */
  function apply(b) { b.el.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)'; }

  function spawnOne() {
    if (!field) return;
    const W = field.clientWidth, H = field.clientHeight;
    const size = Math.round(44 + rng() * 22);
    const el = document.createElement('div');
    el.className = 'pg-ball cr-coin';
    el.textContent = '★';
    el.style.background = CR.COLORS[Math.floor(rng() * CR.COLORS.length)];
    el.style.width = el.style.height = size + 'px';
    el.style.fontSize = Math.round(size * 0.5) + 'px';
    field.appendChild(el);
    const b = {
      el: el, size: size, popped: false,
      x: rng() * Math.max(1, W - size),
      y: rng() * Math.max(1, H - size),
      vx: (rng() * 2 - 1) * 120,
      vy: (rng() * 2 - 1) * 120
    };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); pop(b); });
    apply(b);
    balls.push(b);
  }

  function frame(now) {
    if (!overlay || !field) return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
    lastT = now;
    const W = field.clientWidth, H = field.clientHeight;
    balls.forEach((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
      else if (b.x + b.size >= W) { b.x = W - b.size; b.vx = -Math.abs(b.vx); }
      if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); }
      else if (b.y + b.size >= H) { b.y = H - b.size; b.vy = -Math.abs(b.vy); }
      apply(b);
    });
    frameId = requestAnimationFrame(frame);
  }

  function pop(b) {
    if (b.popped) return;
    b.popped = true;
    popFx(b);
    b.el.remove();
    balls = balls.filter((x) => x !== b);
    sessionScore++; participated = true;
    const g = CR.grantRushCoins(sessionCoinsEarned, 1);
    sessionCoinsEarned = g.earned;
    if (g.granted > 0) { pendingWallet += g.granted; scheduleWalletFlush(); }
    updateScoreLabel();
    scheduleScoreWrite();
    if (spawning && field) spawnOne();   // keep the field full
  }

  function popFx(b) {
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2, N = 10;
    for (let i = 0; i < N; i++) {
      const p = document.createElement('div');
      p.className = 'pg-pop';
      const ang = (Math.PI * 2) * (i / N), dist = 26 + Math.random() * 26;
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = b.el.style.background;
      p.style.setProperty('--px', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--py', Math.sin(ang) * dist + 'px');
      field.appendChild(p);
      (function (node) { setTimeout(() => node.remove(), 600); })(p);
    }
  }

  /* ── robbing: one shared finite pot via Realtime DB ──────────
     Layout is the deterministic per-day pool; only CLAIMS sync over RTDB. A tap
     runs an RTDB transaction to claim a coin id — first grabber wins, everyone
     else sees it vanish. Ranking is tallied from the claims at the end. ── */
  function rtdbBase() { return rtdb.ref('coin_rush/' + dayKey); }

  function startRobbing() {
    coinEls = {}; claimedSet = {};
    if (myUid) rtdbBase().child('players/' + myUid).set(currentName()).catch(() => {});
    requestAnimationFrame(() => { if (overlay && field) renderPool(); });
    claimsRef = rtdbBase().child('claims');
    claimsCb = claimsRef.on('child_added', (snap) => {
      const coinId = snap.key, uid = snap.val();
      if (claimedSet[coinId]) return;
      claimedSet[coinId] = uid;
      removeCoinEl(coinId);                        // grabbed → gone for everyone
      if (uid === myUid) {                         // I won it (authoritative count)
        myRobScore++; participated = true;
        pendingWallet += CR.COINS_EACH; scheduleWalletFlush();
        updateScoreLabel();
      }
      if (Object.keys(claimedSet).length >= CR.POOL_SIZE) onPotEmpty();
    });
  }

  function renderPool() {
    const W = field.clientWidth, H = field.clientHeight;
    const pool = CR.generatePool(CR.coinRushSeed(dayKey), CR.POOL_SIZE);
    pool.forEach((c) => {
      if (claimedSet[c.id]) return;
      const size = Math.round(32 + c.sizeF * 20);
      const el = document.createElement('div');
      el.className = 'pg-ball cr-coin';
      el.textContent = '★';
      el.style.background = CR.COLORS[c.colorIdx];
      el.style.width = el.style.height = size + 'px';
      el.style.fontSize = Math.round(size * 0.5) + 'px';
      el.style.transform = 'translate(' + (c.nx * Math.max(1, W - size)) + 'px,' +
                                          (c.ny * Math.max(1, H - size)) + 'px)';
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); claimCoin(c.id); });
      field.appendChild(el);
      coinEls[c.id] = el;
    });
  }

  function removeCoinEl(coinId) {
    const el = coinEls[coinId];
    if (el) { el.remove(); delete coinEls[coinId]; }
  }

  function claimCoin(coinId) {
    if (!myUid || claimedSet[coinId]) return;
    rtdbBase().child('claims/' + coinId).transaction(
      (cur) => (cur === null ? myUid : undefined),       // null → grab it; else abort
      (err, committed, snap) => {                         // lost the race → drop it now
        if (!committed || !snap || snap.val() !== myUid) removeCoinEl(coinId);
      }
    );
  }

  function onPotEmpty() {
    if (currentRushId && finalizedId !== currentRushId) { finalizedId = currentRushId; onRushEnd(); }
  }

  function cleanupRobbing() {
    if (claimsRef && claimsCb) claimsRef.off('child_added', claimsCb);
    claimsRef = null; claimsCb = null; coinEls = {};
  }

  function rtdbRanking() {
    return rtdbBase().once('value').then((snap) => {
      const data = snap.val() || {};
      return CR.tallyClaims(data.claims || {}, data.players || {});
    }).catch(() => []);
  }

  function finalizeRobbing() {
    rtdbRanking().then((ranked) => {
      if (overlay) showResults(ranked, {});
      if (myUid) {
        const mine = CR.findRank(ranked, myUid);
        if (mine && mine.rank <= 3) claimBonus(mine.rank);
      }
    });
  }

  /* ── score writes + wallet flush (batched, like the Playground) ── */
  function scheduleScoreWrite() { if (!scoreTimer) scoreTimer = setTimeout(flushScore, SCORE_WRITE_MS); }
  function flushScore() {
    if (scoreTimer) { clearTimeout(scoreTimer); scoreTimer = null; }
    if (robbingOn || !myUid || !participated) return;   // robbing tallies from RTDB, not score docs
    db.collection('coin_rush').doc(dayKey).collection('scores').doc(myUid)
      .set({ name: currentName(), score: sessionScore, coins: sessionCoinsEarned, updatedAt: Date.now() }, { merge: true })
      .catch(() => {});
  }
  function scheduleWalletFlush() { if (!walletTimer) walletTimer = setTimeout(flushWallet, WALLET_FLUSH_MS); }
  function flushWallet() {
    if (walletTimer) { clearTimeout(walletTimer); walletTimer = null; }
    if (!pendingWallet || !myUid) return;
    const amt = pendingWallet; pendingWallet = 0;
    db.collection('rooms').doc(myUid)
      .set({ coins: FieldValue.increment(amt) }, { merge: true })
      .catch(() => { pendingWallet += amt; });   // restore so we retry
  }

  /* ── end of rush → settle → results + bonus ───────────────── */
  function onRushEnd() {
    spawning = false;
    flushScore(); flushWallet();
    if (overlay) {
      const t = overlay.querySelector('#crTimer'); if (t) { t.textContent = 'Ended'; t.classList.add('urgent'); }
      const h = overlay.querySelector('.pg-hint'); if (h) h.textContent = 'Tallying the results… 🏆';
    }
    setTimeout(finalize, CR.SETTLE_MS);
  }

  function finalize() {
    if (robbingOn) { finalizeRobbing(); return; }
    loadScores().then((ranked) => {
      if (overlay) showResults(ranked, {});
      if (myUid) {
        const mine = CR.findRank(ranked, myUid);
        if (mine && mine.rank <= 3) claimBonus(mine.rank);
      }
    });
  }

  function viewResults() {
    const src = robbingOn ? rtdbRanking() : loadScores();
    src.then((ranked) => { ensureOverlay(); showResults(ranked, {}); });
  }

  function loadScores() {
    return db.collection('coin_rush').doc(dayKey).collection('scores')
      .orderBy('score', 'desc').limit(30).get()
      .then((snap) => {
        const docs = [];
        snap.forEach((doc) => {
          const x = doc.data() || {};
          docs.push({ uid: doc.id, name: x.name, score: x.score || 0, updatedAt: x.updatedAt || 0 });
        });
        return CR.rankScores(docs);
      })
      .catch(() => []);
  }

  function showResults(ranked, opts) {
    ensureOverlay();
    if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
    field = null; balls = [];                     // stop animating the (now removed) field
    const t = overlay.querySelector('#crTimer'); if (t) t.textContent = '';
    const myScoreNow = robbingOn ? myRobScore : sessionScore;
    const sc = overlay.querySelector('#crScore'); if (sc) sc.textContent = participated ? ('Score ' + myScoreNow) : '🏆';
    let rows = '';
    if (!ranked.length) {
      rows = '<div class="cr-empty">No one joined this rush 😴</div>';
    } else {
      ranked.slice(0, 20).forEach((r) => {
        const rankCls = r.rank <= 3 ? ' cr-rank-' + r.rank : '';
        const bonus = CR.computeBonus(r.rank);
        const me = (r.uid === myUid) ? ' me' : '';
        rows += '<div class="cr-row' + me + '">' +
          '<span class="cr-rank' + rankCls + '">' + r.rank + '</span>' +
          '<span class="cr-name">' + escapeHtml(r.name || 'Anonymous') + '</span>' +
          '<span class="cr-score">' + (r.score || 0) + '</span>' +
          (bonus ? '<span class="cr-bonus">+' + bonus + ' 💰</span>' : '<span class="cr-bonus"></span>') +
          '</div>';
      });
    }
    const title = opts && opts.mock ? '🏆 Results preview (mock)' : '🏆 Today\'s Coin Rush ranking';
    overlay.querySelector('#crBody').innerHTML =
      '<div class="cr-results">' +
        '<div class="cr-results-title">' + title + '</div>' +
        '<div class="cr-rows">' + rows + '</div>' +
        '<button class="cr-results-close" id="crResultsClose">Close</button>' +
      '</div>';
    overlay.querySelector('#crResultsClose').addEventListener('click', closeOverlay);
  }

  /**
   * Pay the top-3 bonus exactly once. A transaction creates the one-time claim
   * doc and credits the wallet atomically; if the claim already exists (another
   * tab, a refresh) nothing is paid twice. The claim create + bonus bound are
   * also enforced in firestore.rules.
   */
  function claimBonus(rank) {
    const bonus = CR.computeBonus(rank);
    if (bonus <= 0 || !myUid) return;
    const claimRef = db.collection('coin_rush').doc(dayKey).collection('claims').doc(myUid);
    const roomRef = db.collection('rooms').doc(myUid);
    db.runTransaction((tx) =>
      tx.get(claimRef).then((snap) => {
        if (snap.exists) return false;
        tx.set(claimRef, { bonus: bonus, rank: rank, claimedAt: Date.now() });
        tx.set(roomRef, { coins: FieldValue.increment(bonus) }, { merge: true });
        return true;
      })
    ).then((paid) => { if (paid) toast('🏆 You placed #' + rank + '! +' + bonus + ' 💰 bonus'); })
     .catch(() => {});
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'cr-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 20);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4200);
  }

  // "How to play" card, opened by the ⓘ on the board banner.
  function showGameInfo() {
    if (document.getElementById('crInfoOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'crInfoOverlay'; ov.className = 'cr-info-overlay';
    ov.innerHTML =
      '<div class="cr-info-card">' +
        '<div class="cr-info-title">💰 Coin Rush</div>' +
        '<p class="cr-info-text">Once each weekday a coin rush starts at a surprise time. ' +
        'Race your coworkers to grab the coins before they\'re gone — every coin is money in ' +
        'your wallet. The top 3 grabbers win bonus coins (1st 1000 / 2nd 500 / 3rd 300). ' +
        'Watch the countdown!</p>' +
        '<button class="cr-info-close" id="crInfoClose" type="button">Got it</button>' +
      '</div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('#crInfoClose').addEventListener('click', close);
  }

  /* ── flush on leave (don't lose pops/coins) ───────────────── */
  window.addEventListener('beforeunload', () => { flushScore(); flushWallet(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flushScore(); flushWallet(); } });

  /* ── start the clock (after all state above is initialized) ── */
  setInterval(tick, 1000);
  tick();
})();
