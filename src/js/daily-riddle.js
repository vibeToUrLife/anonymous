/**
 * daily-riddle.js — Daily 脑筋急转弯 (brain teaser) widget for the board.
 *
 * Opened from the 🧠 button stacked above the feedback button. Each day shows
 * one deterministically-chosen riddle (everyone gets the same one). The user can
 * type an answer, ask for a hint, or reveal the answer. Solving the day's riddle
 * pays a flat 100 coins — once per day, guarded by a Firestore transaction so it
 * can't be double-claimed across devices.
 *
 * Two parts:
 *   1. RiddleLogic — pure helpers (daily pick, answer normalisation/matching),
 *      no DOM/Firebase, also exported for Node/CommonJS.
 *   2. A browser IIFE that wires the FAB + overlay UI and the coin reward.
 *
 * Depends on globals: DAILY_RIDDLES (riddles-data.js), and — for the reward —
 * db/auth/showToast from app.js. Loaded after both.
 */
(function (global) {
  'use strict';

  // YYYY-MM-DD for "today" (local time) — the daily seed + reward key.
  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // Stable string hash → same date always maps to the same riddle for everyone.
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }

  // Deterministic index into a list of `len` riddles for the given day.
  function dailyIndex(len, d) {
    if (!len) return 0;
    return hashStr(dateKey(d) + 'riddle') % len;   // salted so it differs from the quote pick
  }

  // Normalise an answer for lenient matching: trim, lowercase latin, drop
  // whitespace and punctuation (both Chinese and ASCII).
  function normalize(s) {
    return (s == null ? '' : String(s)).trim().toLowerCase()
      .replace(/[\s，。、！？；：,.!?;:"'“”‘’（）()【】\[\]{}~`·…—\-_]/g, '');
  }

  // Lenient match: correct if the (normalised) input equals an answer, contains
  // an answer (user typed a fuller sentence), or is itself a 2+ char fragment of
  // an answer (user typed only the key part, e.g. "圣诞" for "圣诞老人").
  function isCorrect(input, answers) {
    const n = normalize(input);
    if (!n) return false;
    return (answers || []).some(function (a) {
      const na = normalize(a);
      if (!na) return false;
      return n === na || n.indexOf(na) !== -1 || (n.length >= 2 && na.indexOf(n) !== -1);
    });
  }

  const RiddleLogic = { dateKey: dateKey, hashStr: hashStr, dailyIndex: dailyIndex, normalize: normalize, isCorrect: isCorrect, REWARD: 100 };
  if (typeof module !== 'undefined' && module.exports) module.exports = RiddleLogic;
  global.RiddleLogic = RiddleLogic;
})(typeof window !== 'undefined' ? window : globalThis);


/* ── Browser UI (needs DOM + DAILY_RIDDLES; reward needs db/auth) ── */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const L = (typeof RiddleLogic !== 'undefined') ? RiddleLogic : null;
  const RIDDLES = (typeof DAILY_RIDDLES !== 'undefined') ? DAILY_RIDDLES : [];
  if (!L || !RIDDLES.length) return;

  const fab     = document.getElementById('riddleFab');
  const overlay = document.getElementById('riddleOverlay');
  if (!fab || !overlay) return;

  const qEl        = document.getElementById('riddleQ');
  const lenEl      = document.getElementById('riddleLen');
  const inputEl    = document.getElementById('riddleInput');
  const submitBtn  = document.getElementById('riddleSubmit');
  const hintBtn    = document.getElementById('riddleHintBtn');
  const revealBtn  = document.getElementById('riddleRevealBtn');
  const hintEl     = document.getElementById('riddleHint');
  const answerEl   = document.getElementById('riddleAnswer');
  const feedbackEl = document.getElementById('riddleFeedback');
  const rewardEl   = document.getElementById('riddleReward');
  const closeBtn   = document.getElementById('riddleClose');
  const cancelBtn  = document.getElementById('riddleRevealCancel');
  const warnEl     = document.getElementById('riddleWarn');
  const solversEl  = document.getElementById('riddleSolvers');
  const rankEl     = document.getElementById('riddleRank');

  let today    = L.dateKey();
  let DONE_KEY = 'riddle_done_' + today;   // localStorage: 'solved' | 'revealed'
  let riddle     = RIDDLES[L.dailyIndex(RIDDLES.length)];
  let _revealArmed = false;   // 查看答案 needs two taps (first arms the forfeit warning)
  let _solversUnsub = null;   // live "今日答对" subscription
  let _rankUnsub = null;      // live "本周答对榜" subscription
  let _rankList = [];         // last rendered weekly ranking (so the "上周获奖" line can re-render)
  let _dayWatch = null;       // interval that catches midnight rolling over while open
  let _lastWeekWinners = null;// [{uid,name,count,prize}] paid out last week (for the "上周获奖" line)

  // ── Weekly leaderboard: the board resets every week (Sunday 00:00 local), and
  //    last week's top 3 are paid 5000/3000/1000 coins at settlement. weekId is
  //    the Sunday date (YYYY-MM-DD) that starts the week; kept in sync with `today`.
  const WEEK_PRIZES = [5000, 3000, 1000];   // 🥇 🥈 🥉
  function weekIdFor(d) {
    d = d || new Date();
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - s.getDay());     // back up to Sunday (getDay: 0=Sun … 6=Sat)
    return L.dateKey(s);
  }
  function prevWeekId() {
    const x = new Date();
    const s = new Date(x.getFullYear(), x.getMonth(), x.getDate());
    s.setDate(s.getDate() - s.getDay() - 7); // Sunday that started last week
    return L.dateKey(s);
  }
  let weekId = weekIdFor();

  // Re-key to the current calendar day. `today`/`DONE_KEY` are captured at load,
  // so if the page/modal is left open past midnight they'd still point at
  // yesterday — and yesterday's "solved/revealed" state would make render()
  // reveal the NEW day's answer (and block the reward). Everything that reads
  // the day (doneState, fetchAccountDone, claimReward, recordSolver,
  // subscribeSolvers…) reads these module vars at call time, so refreshing them
  // here fixes all of it. Returns true only when the day actually changed.
  function refreshDay() {
    const d = L.dateKey();
    if (d === today) return false;
    today = d;
    DONE_KEY = 'riddle_done_' + today;
    weekId = weekIdFor();          // the week may have rolled over too
    return true;
  }

  function doneState() { try { return localStorage.getItem(DONE_KEY); } catch (e) { return null; } }
  function setDone(v) { try { localStorage.setItem(DONE_KEY, v); } catch (e) {} }

  function setPlayable(on) {
    inputEl.disabled = !on;
    submitBtn.disabled = !on;
    revealBtn.disabled = !on;
    inputEl.style.display = on ? '' : 'none';
    submitBtn.style.display = on ? '' : 'none';
    revealBtn.style.display = on ? '' : 'none';
  }

  function showAnswer() {
    answerEl.hidden = false;
    // Show every accepted answer (canonical first), so users see all that count.
    answerEl.textContent = riddle.a.length > 1
      ? '答案：' + riddle.a.join('、') + '（都算对）'
      : '答案：' + riddle.a[0];
  }

  function render() {
    refreshDay();                                     // re-key to the current day BEFORE reading doneState
    riddle = RIDDLES[L.dailyIndex(RIDDLES.length)];   // recompute (in case the day rolled over)
    qEl.textContent = riddle.q;
    // Length clue based on the canonical answer a[0] (code-point safe for Chinese).
    if (lenEl) lenEl.textContent = '（答案 ' + [...riddle.a[0]].length + ' 个字）';
    inputEl.value = '';
    hintEl.hidden = true; hintEl.textContent = '💡 ' + riddle.hint;
    answerEl.hidden = true;
    feedbackEl.textContent = ''; feedbackEl.className = 'riddle-feedback';
    disarmReveal();
    const st = doneState();
    if (st === 'solved') {
      setPlayable(false);
      feedbackEl.textContent = '✅ 今天已经答对啦，奖励已到账！';
      feedbackEl.className = 'riddle-feedback ok';
      showAnswer();
      rewardEl.textContent = '🪙 明天再来挑战，再赚 100 金币！';
    } else if (st === 'revealed') {
      setPlayable(false);
      feedbackEl.textContent = '今天已看过答案，明天再来赚金币吧～';
      showAnswer();
      rewardEl.textContent = '🪙 明天答对可得 100 金币';
    } else {
      setPlayable(true);
      rewardEl.textContent = '🪙 答对奖励 100 金币（每天一次）';
    }
  }

  // Pull today's done-state from the ACCOUNT (Firestore), not just this device.
  // riddleLastSolvedDay / riddleLastRevealedDay are written per-account, so a
  // riddle finished on one device locks every other device of the same account.
  async function fetchAccountDone() {
    if (typeof db === 'undefined' || typeof auth === 'undefined') return null;
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return null;
    try {
      const doc = await db.collection('rooms').doc(uid).get();
      const data = doc.exists ? doc.data() : {};
      if (data.riddleLastSolvedDay === today) return 'solved';
      if (data.riddleLastRevealedDay === today) return 'revealed';
      return null;
    } catch (e) { return null; }
  }

  async function open() {
    render();   // paint immediately from the local cache…
    overlay.classList.add('show');
    fab.classList.remove('has-new');
    subscribeSolvers();   // live "今日答对" list (names only)
    subscribeRank();      // live "本周答对榜"
    maybeSettleLastWeek();// pay out last week's top 3 if a new week just started (idempotent)
    startDayWatch();      // if it's left open at midnight, roll over to the new day
    setTimeout(function () { if (!inputEl.disabled) inputEl.focus(); }, 60);
    // …then reconcile with the account: if THIS account already finished today
    // on another device, mirror that here and re-lock the UI.
    const acct = await fetchAccountDone();
    if (acct === 'solved' && doneState() !== 'solved') { setDone('solved'); render(); }
    else if (acct === 'revealed' && !doneState()) { setDone('revealed'); render(); }
  }
  function close() { overlay.classList.remove('show'); unsubscribeSolvers(); unsubscribeRank(); stopDayWatch(); }

  // While the overlay is open, watch for midnight rolling the calendar day over.
  // When it does, re-key to the new day and rebuild the panel so the widget
  // shows the fresh (playable) riddle instead of leaking yesterday's answer, and
  // re-point the "今日答对" list at the new day's doc.
  function startDayWatch() {
    stopDayWatch();
    _dayWatch = setInterval(function () {
      if (!overlay.classList.contains('show')) return;
      if (!refreshDay()) return;   // still the same day → nothing to do
      render();
      subscribeSolvers();
      subscribeRank();
      maybeSettleLastWeek();       // a new week may have just begun → settle last week
      updateFabPulse();
    }, 30000);
  }
  function stopDayWatch() {
    if (_dayWatch) { clearInterval(_dayWatch); _dayWatch = null; }
  }

  // Award 100 coins, once per day. The transaction re-checks the day server-side
  // so the same day can't pay out twice (even from another device).
  async function claimReward() {
    if (typeof db === 'undefined' || typeof auth === 'undefined') return 'noauth';
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return 'noauth';
    const ref = db.collection('rooms').doc(uid);
    const weekRef = db.collection('riddle_week').doc(weekId).collection('users').doc(uid);
    try {
      return await db.runTransaction(async function (tx) {
        const doc = await tx.get(ref);
        const data = doc.exists ? doc.data() : {};
        if (data.riddleLastSolvedDay === today) return 'already';
        tx.set(ref, { coins: (data.coins || 0) + L.REWARD, riddleLastSolvedDay: today }, { merge: true });
        // Bump my WEEKLY correct-answer count in the same transaction, so it can
        // only ever rise once per day (the day-guard above + the rules' lastDay
        // check both enforce it). weekId rolls the board over every Sunday.
        tx.set(weekRef, { name: myName(), count: firebase.firestore.FieldValue.increment(1), lastDay: today, at: Date.now() }, { merge: true });
        return 'granted';
      });
    } catch (e) { return 'error'; }
  }

  // ── Weekly settlement (auto + idempotent) ──────────────────────────────────
  // The first client to open the riddle in a NEW week pays last week's top 3
  // (5000/3000/1000 coins) into their rooms and writes a one-time marker doc, all
  // in ONE transaction guarded by the marker — so the payout can never run twice,
  // no matter how many clients open at once. Last week's counts are frozen (the
  // reward transaction only ever writes the CURRENT week), so the top-3 read is
  // stable. Best-effort: any failure just means another client settles later.
  async function maybeSettleLastWeek() {
    if (typeof db === 'undefined' || typeof auth === 'undefined' || typeof firebase === 'undefined') return;
    if (!(auth.currentUser && auth.currentUser.uid)) return;
    const markerRef = db.collection('riddle_week').doc(prevWeekId());
    try {
      const marker = await markerRef.get();
      if (marker.exists && (marker.data() || {}).settled) { showLastWeek((marker.data() || {}).winners); return; }
      const snap = await markerRef.collection('users').orderBy('count', 'desc').limit(WEEK_PRIZES.length).get();
      const top = [];
      snap.forEach(function (d) { const x = d.data() || {}; top.push({ uid: d.id, name: x.name || '匿名', count: x.count || 0 }); });
      const winners = await db.runTransaction(async function (tx) {
        const m = await tx.get(markerRef);
        if (m.exists && (m.data() || {}).settled) return (m.data() || {}).winners || [];   // someone beat us to it
        const paid = [];
        for (let i = 0; i < top.length; i++) {
          const prize = WEEK_PRIZES[i] || 0;
          if (prize > 0) {
            tx.set(db.collection('rooms').doc(top[i].uid),
                   { coins: firebase.firestore.FieldValue.increment(prize) }, { merge: true });
          }
          paid.push({ uid: top[i].uid, name: top[i].name, count: top[i].count, prize: prize });
        }
        tx.set(markerRef, { settled: true, winners: paid, at: Date.now() });   // create-once (rules forbid update/delete)
        return paid;
      });
      showLastWeek(winners);
    } catch (e) { /* another client settled it, or offline — safe to skip */ }
  }

  // Show last week's paid winners above the weekly board (re-renders with the
  // cached list so it appears without waiting for the next live snapshot).
  function showLastWeek(winners) {
    _lastWeekWinners = Array.isArray(winners) ? winners.filter(function (w) { return w && w.prize; }) : null;
    renderRank(_rankList);
  }

  async function submit() {
    if (inputEl.disabled) return;
    if (!L.isCorrect(inputEl.value, riddle.a)) {
      feedbackEl.textContent = '❌ 再想想~ 可以点"💡 提示"哦';
      feedbackEl.className = 'riddle-feedback wrong';
      // replay the shake animation
      inputEl.classList.remove('shake'); void inputEl.offsetWidth; inputEl.classList.add('shake');
      return;
    }
    // Correct — lock the UI, reveal, then settle the reward.
    setDone('solved');
    recordSolver();   // add me to today's "答对" list (name only)
    setPlayable(false);
    showAnswer();
    feedbackEl.textContent = '🎉 答对了！';
    feedbackEl.className = 'riddle-feedback ok';
    const res = await claimReward();
    if (res === 'granted') {
      feedbackEl.textContent = '🎉 答对了！+100 金币 🪙';
      if (typeof showToast === 'function') showToast('🧠 答对脑筋急转弯，+100 金币！', 'success');
      rewardEl.textContent = '🪙 已领取今日奖励，明天再来！';
    } else if (res === 'already') {
      feedbackEl.textContent = '🎉 答对了！(今天已领过奖励)';
      rewardEl.textContent = '🪙 今天的奖励已经领过啦';
    } else {
      feedbackEl.textContent = '🎉 答对了！(登录后才能领取金币)';
      rewardEl.textContent = '🪙 登录后答对可得 100 金币';
    }
  }

  // Best-effort: record on the account that today's answer was revealed, so the
  // forfeit also syncs to the user's other devices.
  async function markAccountRevealed() {
    if (typeof db === 'undefined' || typeof auth === 'undefined') return;
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return;
    try {
      await db.collection('rooms').doc(uid).set({ riddleLastRevealedDay: today }, { merge: true });
    } catch (e) {}
  }

  // Two-step "查看答案": the first tap only ARMS the forfeit warning; the second
  // tap actually reveals. "取消" disarms. Stops accidental loss of the daily reward.
  function armReveal() {
    if (inputEl.disabled) return;
    _revealArmed = true;
    if (warnEl) warnEl.hidden = false;
    revealBtn.textContent = '⚠️ 确定看答案？(放弃今天机会)';
    if (cancelBtn) cancelBtn.hidden = false;
  }
  function disarmReveal() {
    _revealArmed = false;
    if (warnEl) warnEl.hidden = true;
    revealBtn.textContent = '查看答案';
    if (cancelBtn) cancelBtn.hidden = true;
  }
  function onRevealClick() {
    if (inputEl.disabled) return;
    if (!_revealArmed) { armReveal(); return; }   // first tap → warn
    disarmReveal();
    reveal();                                      // second tap → reveal + forfeit
  }

  function reveal() {
    if (doneState() !== 'solved') { setDone('revealed'); markAccountRevealed(); }   // viewing forfeits today's reward
    setPlayable(false);
    showAnswer();
    feedbackEl.textContent = '答案已揭晓，明天再来赚金币吧～';
    feedbackEl.className = 'riddle-feedback';
    rewardEl.textContent = '🪙 明天答对可得 100 金币';
  }

  /* ── "今日答对" live list (names only — never the answer) ── */

  // The board display name: profile name first, else Firebase displayName, else 匿名.
  function myName() {
    let name = '';
    try { name = localStorage.getItem('flappy_name') || ''; } catch (e) {}
    if (!name) name = (auth.currentUser && auth.currentUser.displayName) || '匿名';
    return name;
  }

  // Record THIS account as having solved today. Owner-only doc at
  // riddle_solvers/{today}/solvers/{uid}; the name comes from the board profile.
  async function recordSolver() {
    if (typeof db === 'undefined' || typeof auth === 'undefined') return;
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return;
    try {
      await db.collection('riddle_solvers').doc(today).collection('solvers').doc(uid)
        .set({ name: myName(), at: Date.now() }, { merge: true });
    } catch (e) {}
  }

  function _escapeName(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  function renderSolvers(list) {
    if (!solversEl) return;
    solversEl.hidden = false;
    const body = list.length
      ? '<div class="riddle-solvers-list">' +
          list.map(function (s) { return '<span class="riddle-solver-chip">' + _escapeName(s.name || '匿名') + '</span>'; }).join('') +
        '</div>'
      : '<div class="riddle-solvers-empty">还没有人答对，快来抢首位！</div>';
    solversEl.innerHTML = '<div class="riddle-solvers-title">🏆 今日答对（' + list.length + '）</div>' + body;
  }

  function subscribeSolvers() {
    if (typeof db === 'undefined') { if (solversEl) solversEl.hidden = true; return; }
    unsubscribeSolvers();
    renderSolvers([]);   // show the section right away (empty state) while it loads
    try {
      _solversUnsub = db.collection('riddle_solvers').doc(today).collection('solvers')
        .onSnapshot(function (snap) {
          const list = [];
          snap.forEach(function (d) { list.push(d.data() || {}); });
          list.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
          renderSolvers(list);
        }, function () {});
    } catch (e) {}
  }
  function unsubscribeSolvers() {
    if (_solversUnsub) { _solversUnsub(); _solversUnsub = null; }
  }

  /* ── "🏅 答对排行榜" — all-time top solvers by total correct count ── */

  const RANK_MEDALS = ['🥇', '🥈', '🥉'];

  function renderRank(list) {
    if (!rankEl) return;
    rankEl.hidden = false;
    const note = '<div class="riddle-rank-note">' +
      '📖 答对每日谜语 +1 次（每天最多 +1），比谁一周答对得多<br>' +
      '🗓️ 每周日 00:00 刷新新一周榜单<br>' +
      '🏆 每周结算：上周前三名自动到账 🥇5000 / 🥈3000 / 🥉1000 金币 🪙' +
      '</div>';
    const lastWeek = (_lastWeekWinners && _lastWeekWinners.length)
      ? '<div class="riddle-rank-last">🎁 上周获奖：' +
          _lastWeekWinners.map(function (w, i) {
            return (RANK_MEDALS[i] || (i + 1)) + _escapeName(w.name || '匿名') + ' +' + (w.prize || 0);
          }).join('　') +
        '</div>'
      : '';
    const body = list.length
      ? '<div class="riddle-rank-list">' +
          list.map(function (r, i) {
            return '<div class="riddle-rank-row">' +
                     '<span class="riddle-rank-pos">' + (RANK_MEDALS[i] || (i + 1)) + '</span>' +
                     '<span class="riddle-rank-name">' + _escapeName(r.name || '匿名') + '</span>' +
                     '<span class="riddle-rank-count">' + (r.count || 0) + ' 次</span>' +
                   '</div>';
          }).join('') +
        '</div>'
      : '<div class="riddle-solvers-empty">本周还没有人上榜，答对就能登顶！</div>';
    rankEl.innerHTML = '<div class="riddle-solvers-title">🏅 本周答对榜</div>' + note + lastWeek + body;
  }

  function subscribeRank() {
    if (typeof db === 'undefined') { if (rankEl) rankEl.hidden = true; return; }
    unsubscribeRank();
    _rankList = [];
    renderRank([]);   // show the section right away (empty state) while it loads
    try {
      _rankUnsub = db.collection('riddle_week').doc(weekId).collection('users').orderBy('count', 'desc').limit(10)
        .onSnapshot(function (snap) {
          const list = [];
          snap.forEach(function (d) { list.push(d.data() || {}); });
          _rankList = list;
          renderRank(list);
        }, function () {});
    } catch (e) {}
  }
  function unsubscribeRank() {
    if (_rankUnsub) { _rankUnsub(); _rankUnsub = null; }
  }

  fab.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  submitBtn.addEventListener('click', submit);
  hintBtn.addEventListener('click', function () { hintEl.hidden = false; });
  revealBtn.addEventListener('click', onRevealClick);
  if (cancelBtn) cancelBtn.addEventListener('click', disarmReveal);
  inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('show')) close();
  });

  // Gently pulse the FAB if today's teaser hasn't been attempted yet.
  function updateFabPulse() {
    if (!doneState()) fab.classList.add('has-new');
    else fab.classList.remove('has-new');
  }
  updateFabPulse();
})();
