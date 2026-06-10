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

  // Correct if the (normalised) input equals or contains any accepted answer.
  function isCorrect(input, answers) {
    const n = normalize(input);
    if (!n) return false;
    return (answers || []).some(function (a) {
      const na = normalize(a);
      return na && (n === na || n.indexOf(na) !== -1);
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

  const today    = L.dateKey();
  const DONE_KEY = 'riddle_done_' + today;   // localStorage: 'solved' | 'revealed'
  let riddle     = RIDDLES[L.dailyIndex(RIDDLES.length)];

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
    answerEl.textContent = '答案：' + riddle.a[0];
  }

  function render() {
    riddle = RIDDLES[L.dailyIndex(RIDDLES.length)];   // recompute (in case the day rolled over)
    qEl.textContent = riddle.q;
    // Length clue based on the canonical answer a[0] (code-point safe for Chinese).
    if (lenEl) lenEl.textContent = '（答案 ' + [...riddle.a[0]].length + ' 个字）';
    inputEl.value = '';
    hintEl.hidden = true; hintEl.textContent = '💡 ' + riddle.hint;
    answerEl.hidden = true;
    feedbackEl.textContent = ''; feedbackEl.className = 'riddle-feedback';
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
    setTimeout(function () { if (!inputEl.disabled) inputEl.focus(); }, 60);
    // …then reconcile with the account: if THIS account already finished today
    // on another device, mirror that here and re-lock the UI.
    const acct = await fetchAccountDone();
    if (acct === 'solved' && doneState() !== 'solved') { setDone('solved'); render(); }
    else if (acct === 'revealed' && !doneState()) { setDone('revealed'); render(); }
  }
  function close() { overlay.classList.remove('show'); }

  // Award 100 coins, once per day. The transaction re-checks the day server-side
  // so the same day can't pay out twice (even from another device).
  async function claimReward() {
    if (typeof db === 'undefined' || typeof auth === 'undefined') return 'noauth';
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return 'noauth';
    const ref = db.collection('rooms').doc(uid);
    try {
      return await db.runTransaction(async function (tx) {
        const doc = await tx.get(ref);
        const data = doc.exists ? doc.data() : {};
        if (data.riddleLastSolvedDay === today) return 'already';
        tx.set(ref, { coins: (data.coins || 0) + L.REWARD, riddleLastSolvedDay: today }, { merge: true });
        return 'granted';
      });
    } catch (e) { return 'error'; }
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

  function reveal() {
    if (inputEl.disabled) return;
    if (doneState() !== 'solved') { setDone('revealed'); markAccountRevealed(); }   // viewing forfeits today's reward
    setPlayable(false);
    showAnswer();
    feedbackEl.textContent = '答案已揭晓，明天再来赚金币吧～';
    feedbackEl.className = 'riddle-feedback';
    rewardEl.textContent = '🪙 明天答对可得 100 金币';
  }

  fab.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  submitBtn.addEventListener('click', submit);
  hintBtn.addEventListener('click', function () { hintEl.hidden = false; });
  revealBtn.addEventListener('click', reveal);
  inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('show')) close();
  });

  // Gently pulse the FAB if today's teaser hasn't been attempted yet.
  if (!doneState()) fab.classList.add('has-new');
})();
