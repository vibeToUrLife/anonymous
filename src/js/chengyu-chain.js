/**
 * chengyu-chain.js — Daily 成语接龙 (idiom chain) widget for the board.
 *
 * Opened from the 🐉 button stacked above the riddle button. Everyone shares ONE
 * chain per day: each idiom must start with the last character of the previous
 * one (同音/homophone also counts). The chain, the "🏆 答对榜" (who answered how
 * many) and the "❌ 答错记录" (who typed a wrong answer) all reset each day.
 *
 * Scoring: each correct idiom pays a flat 20 coins, with NO daily cap. Validation
 * is STRICT — only real 成语 in the bundled dictionary (CHENGYU) are accepted, so
 * made-up words like 晓晓晓晓 are rejected. 同音 (homophone) joins use the per-idiom
 * first/last pinyin stored in the dictionary.
 *
 * Two parts:
 *   1. ChengyuLogic — pure helpers (daily seed, normalise, connect/validate),
 *      no DOM/Firebase, also exported for CommonJS.
 *   2. A browser IIFE that wires the FAB + overlay UI, the shared Firestore doc
 *      (chengyu_chain/{today}) and the coin reward.
 *
 * Depends on globals: CHENGYU (chengyu-data.js) and — for play/rewards —
 * db/auth/showToast from app.js. Loaded after both.
 */
(function (global) {
  'use strict';

  // YYYY-MM-DD for "today" (local time) — the daily doc id + seed.
  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // Stable string hash → same date always seeds the same starting idiom.
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }

  // Deterministic daily starter index (salted so it differs from the riddle pick).
  function dailySeedIndex(len, d) {
    if (!len) return 0;
    return hashStr(dateKey(d) + 'chengyu') % len;
  }

  // Drop all whitespace; keep the Chinese characters as typed.
  function normalize(s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, '').trim();
  }

  function lastChar(w) { return w ? w[w.length - 1] : ''; }

  // Is `word` a real 成语 in the dictionary? (own property only)
  function has(dict, word) { return !!dict && Object.prototype.hasOwnProperty.call(dict, word); }

  // Parse a dictionary value ("firstPinyin lastPinyin") into { f, l }.
  function pyOf(dict, word) {
    const v = dict && dict[word];
    if (typeof v !== 'string') return null;
    const i = v.indexOf(' ');
    return i < 0 ? { f: v, l: '' } : { f: v.slice(0, i), l: v.slice(i + 1) };
  }

  // Does `cand` legally follow `tip`? Exact last→first character always counts;
  // 同音 (homophone) counts when both idioms' pinyin is known in the dictionary.
  function connects(tipWord, candWord, dict) {
    if (!tipWord || !candWord) return false;
    if (candWord[0] === lastChar(tipWord)) return true;
    const t = pyOf(dict, tipWord), c = pyOf(dict, candWord);
    return !!(t && c && t.l && c.f && t.l === c.f);
  }

  // Validate a raw submission. STRICT: the word must be a real 成语 (in `dict`).
  // Returns { ok, word, reason }.
  function validate(input, tipWord, usedSet, dict) {
    const w = normalize(input);
    if (!/^[一-鿿]{4}$/.test(w)) return { ok: false, word: w, reason: '要输入四个汉字的成语' };
    if (!has(dict, w)) return { ok: false, word: w, reason: '这不是成语（成语库里查不到）' };
    if (usedSet && usedSet.has(w)) return { ok: false, word: w, reason: '这个成语已经用过了' };
    if (!connects(tipWord, w, dict)) return { ok: false, word: w, reason: '接不上「' + lastChar(tipWord) + '」（首字要相同或同音）' };
    return { ok: true, word: w };
  }

  const ChengyuLogic = {
    dateKey: dateKey, hashStr: hashStr, dailySeedIndex: dailySeedIndex,
    normalize: normalize, lastChar: lastChar, has: has, pyOf: pyOf,
    connects: connects, validate: validate, REWARD: 20
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ChengyuLogic;
  global.ChengyuLogic = ChengyuLogic;
})(typeof window !== 'undefined' ? window : globalThis);


/* ── Browser UI (needs DOM + CHENGYU; play/reward needs db/auth) ── */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const L = (typeof ChengyuLogic !== 'undefined') ? ChengyuLogic : null;
  const DICT = (typeof CHENGYU !== 'undefined') ? CHENGYU : null;
  if (!L || !DICT) return;
  const WORDS = Object.keys(DICT);
  if (!WORDS.length) return;

  const fab     = document.getElementById('cjFab');
  const overlay = document.getElementById('cjOverlay');
  if (!fab || !overlay) return;

  const closeBtn  = document.getElementById('cjClose');
  const nextEl    = document.getElementById('cjNext');
  const chainEl   = document.getElementById('cjChain');
  const inputEl   = document.getElementById('cjInput');
  const submitBtn = document.getElementById('cjSubmit');
  const reseedBtn = document.getElementById('cjReseed');
  const feedbackEl = document.getElementById('cjFeedback');
  const boardEl   = document.getElementById('cjBoard');
  const wrongEl   = document.getElementById('cjWrong');

  const today    = L.dateKey();
  const seedWord = WORDS[L.dailySeedIndex(WORDS.length)];
  const PLAYED_KEY = 'cj_played_' + today;

  const docRef = (typeof db !== 'undefined') ? db.collection('chengyu_chain').doc(today) : null;
  let _unsub = null;
  let _data  = null;    // latest snapshot data (null before first load)
  let _busy  = false;   // a transaction is in flight
  let _expand = { chain: false, board: false, wrong: false };   // "show last 3 / expand" per list

  function myName() {
    let name = '';
    try { name = localStorage.getItem('flappy_name') || ''; } catch (e) {}
    if (!name) name = (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.displayName) || '匿名';
    return name;
  }

  // The seed link the day always starts from (system-owned, earns nothing).
  function seedLink()    { return { w: seedWord, uid: 'sys', name: '系统', at: 0 }; }
  function initialData() { return { seed: seedWord, links: [seedLink()], wrong: [] }; }
  // Current view of the day (live snapshot, or a synthesized seed-only day).
  function current()     { return _data || initialData(); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  function tipWord() {
    const links = current().links || [];
    return links.length ? links[links.length - 1].w : seedWord;
  }
  function usedSet() {
    return new Set((current().links || []).map(function (l) { return l.w; }));
  }

  // "展开全部 / 收起" toggle shown under a list when it has more than 3 rows.
  function moreToggle(list, total) {
    if (total <= 3) return '';
    return _expand[list]
      ? '<button class="cj-more" data-list="' + list + '">收起 ▴</button>'
      : '<button class="cj-more" data-list="' + list + '">展开全部（' + total + '）▾</button>';
  }

  function render() {
    const data  = current();
    const links = data.links || [];
    const lastLink = links[links.length - 1];
    nextEl.textContent = '接龙：下一个要接「' + L.lastChar(tipWord()) + '」（首字相同或同音）';

    // Chain: show the most recent 3 by default, expand for the full chain.
    const shownLinks = _expand.chain ? links : links.slice(-3);
    chainEl.classList.toggle('expanded', _expand.chain);
    chainEl.innerHTML = shownLinks.map(function (l) {
      const sys = l.uid === 'sys';
      const who = esc(l.name || (sys ? '系统' : '匿名'));
      return '<div class="cj-link' + (l === lastLink ? ' tip' : '') + '">' +
               '<span class="cj-word">' + esc(l.w) + '</span>' +
               '<span class="cj-by">· ' + who + '</span>' +
             '</div>';
    }).join('') + moreToggle('chain', links.length);
    if (!_expand.chain) chainEl.scrollTop = chainEl.scrollHeight;

    // 换开头 is only allowed before anyone has answered (just the seed present).
    reseedBtn.style.display = (links.length > 1) ? 'none' : '';

    renderBoard(links);
    renderWrong(data.wrong || []);
  }

  // 🏆 答对榜 — everyone who added a correct idiom, by count (top 3, expandable).
  function renderBoard(links) {
    const map = Object.create(null);
    const order = [];
    links.forEach(function (l) {
      if (l.uid === 'sys') return;                 // skip seed / 换开头
      const k = l.uid || l.name;
      if (!map[k]) { map[k] = { name: l.name || '匿名', n: 0 }; order.push(k); }
      map[k].n++;
    });
    const arr = order.map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.n - a.n; });
    const shown = _expand.board ? arr : arr.slice(0, 3);
    const body = arr.length
      ? '<div class="cj-rank-list">' + shown.map(function (s) {
          return '<span class="cj-rank"><b>' + esc(s.name) + '</b> ×' + s.n + ' · ' + (s.n * L.REWARD) + '💰</span>';
        }).join('') + '</div>' + moreToggle('board', arr.length)
      : '<span class="cj-empty">还没有人答对，快来抢首位！</span>';
    boardEl.innerHTML = '<div class="cj-sec-title">🏆 答对榜</div>' + body;
  }

  // ❌ 答错记录 — who typed a wrong answer (most recent first; last 3, expandable).
  function renderWrong(wrong) {
    const all = wrong.slice().reverse();
    const shown = _expand.wrong ? all : all.slice(0, 3);
    const body = all.length
      ? shown.map(function (e) {
          return '<div class="cj-wrong-item"><b>' + esc(e.name || '匿名') + '</b>「' + esc(e.w) + '」' +
                 '<span class="cj-wrong-why">' + esc(e.reason || '') + '</span></div>';
        }).join('') + moreToggle('wrong', all.length)
      : '<span class="cj-empty">还没有人答错～</span>';
    wrongEl.innerHTML = '<div class="cj-sec-title">❌ 答错记录</div>' + body;
  }

  function setFeedback(msg, cls) {
    feedbackEl.textContent = msg || '';
    feedbackEl.className = 'cj-feedback' + (cls ? ' ' + cls : '');
  }
  function shake() {
    inputEl.classList.remove('shake'); void inputEl.offsetWidth; inputEl.classList.add('shake');
  }
  function markPlayed() { try { localStorage.setItem(PLAYED_KEY, '1'); } catch (e) {} }
  function played()     { try { return localStorage.getItem(PLAYED_KEY) === '1'; } catch (e) { return false; } }

  function subscribe() {
    if (!docRef) return;
    unsubscribe();
    try {
      _unsub = docRef.onSnapshot(function (snap) {
        _data = snap.exists ? snap.data() : null;
        render();
      }, function () {});
    } catch (e) {}
  }
  function unsubscribe() { if (_unsub) { _unsub(); _unsub = null; } }

  function open() {
    render();                       // paint instantly from cache/seed
    overlay.classList.add('show');
    fab.classList.remove('has-new');
    subscribe();
    setTimeout(function () { if (!inputEl.disabled) inputEl.focus(); }, 60);
  }
  function close() { overlay.classList.remove('show'); unsubscribe(); }

  // Append a valid idiom (race-safe) and pay 20 coins — all in one transaction
  // so the chain can't fork and coins can't double-pay.
  async function appendLink(word) {
    if (typeof db === 'undefined' || typeof auth === 'undefined') return 'noauth';
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return 'noauth';
    const name = myName();
    const roomRef = db.collection('rooms').doc(uid);
    try {
      return await db.runTransaction(async function (tx) {
        const d    = await tx.get(docRef);
        const room = await tx.get(roomRef);                     // all reads before writes
        const data = d.exists ? d.data() : initialData();
        const links = data.links || [];
        const tip  = links.length ? links[links.length - 1].w : (data.seed || seedWord);
        const used = new Set(links.map(function (l) { return l.w; }));
        const res  = L.validate(word, tip, used, DICT);
        if (!res.ok) return 'stale:' + res.reason;              // tip moved or already used
        const link = { w: word, uid: uid, name: name, at: Date.now() };
        if (!d.exists) {
          const base = initialData(); base.links.push(link); tx.set(docRef, base);
        } else {
          tx.update(docRef, { links: links.concat([link]) });
        }
        const rd = room.exists ? room.data() : {};              // every correct idiom pays 20 coins
        tx.set(roomRef, { coins: (rd.coins || 0) + L.REWARD }, { merge: true });
        return 'granted';
      });
    } catch (e) { return 'error'; }
  }

  // Record a wrong attempt to the public 答错记录 (kept to the last 50).
  async function recordWrong(word, reason) {
    if (!docRef || typeof auth === 'undefined') return;
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid || !word || [...word].length < 2) return;          // ignore stray 1-char typos
    const entry = { w: word, uid: uid, name: myName(), reason: reason || '', at: Date.now() };
    try {
      await db.runTransaction(async function (tx) {
        const d    = await tx.get(docRef);
        const data = d.exists ? d.data() : initialData();
        let wrong  = (data.wrong || []).concat([entry]);
        if (wrong.length > 50) wrong = wrong.slice(wrong.length - 50);
        if (!d.exists) { const base = initialData(); base.wrong = wrong; tx.set(docRef, base); }
        else           { tx.update(docRef, { wrong: wrong }); }
      });
    } catch (e) {}
  }

  // Don't like today's opening? Roll a new one — ONLY before anyone has answered
  // (once the chain has started the opening is locked).
  async function appendReseed() {
    if (typeof db === 'undefined' || typeof auth === 'undefined') return 'noauth';
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return 'noauth';
    try {
      return await db.runTransaction(async function (tx) {
        const d    = await tx.get(docRef);
        const data = d.exists ? d.data() : initialData();
        const links = data.links || [];
        if (links.length > 1) return 'locked';                  // already started — opening is fixed
        const used = new Set(links.map(function (l) { return l.w; }));
        const pool = WORDS.filter(function (w) { return !used.has(w); });
        if (!pool.length) return 'error';
        const pick = pool[Math.floor(Math.random() * pool.length)];
        tx.set(docRef, { seed: pick, links: [{ w: pick, uid: 'sys', name: '系统', at: 0 }], wrong: data.wrong || [] });
        return 'ok';
      });
    } catch (e) { return 'error'; }
  }

  async function submit() {
    if (_busy) return;
    const res = L.validate(inputEl.value, tipWord(), usedSet(), DICT);
    if (!res.ok) {
      setFeedback('❌ ' + res.reason, 'wrong');
      shake();
      recordWrong(res.word, res.reason);
      return;
    }
    _busy = true; submitBtn.disabled = true;
    const out = await appendLink(res.word);
    _busy = false; submitBtn.disabled = false;
    if (out === 'granted') {
      inputEl.value = ''; markPlayed();
      setFeedback('🎉 接上了！+' + L.REWARD + ' 金币 💰', 'ok');
      if (typeof showToast === 'function') showToast('🐉 成语接龙 +' + L.REWARD + ' 金币！', 'success');
    } else if (out === 'noauth') {
      setFeedback('请先登录再玩哦', 'wrong');
    } else if (out && out.indexOf('stale:') === 0) {
      setFeedback('🐢 手慢了，接龙刚被接走，请接「' + L.lastChar(tipWord()) + '」', 'wrong'); shake();
    } else {
      setFeedback('出错了，请再试一次', 'wrong');
    }
  }

  async function reseed() {
    if (_busy) return;
    _busy = true; reseedBtn.disabled = true;
    const out = await appendReseed();
    _busy = false; reseedBtn.disabled = false;
    if (out === 'ok') setFeedback('🔄 换了个新开头，开始接「' + L.lastChar(tipWord()) + '」', '');
    else if (out === 'locked') setFeedback('接龙已经开始啦，不能再换开头咯', 'wrong');
    else if (out === 'noauth') setFeedback('请先登录再玩哦', 'wrong');
    else setFeedback('出错了，请再试一次', 'wrong');
  }

  fab.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('.cj-more');
    if (!btn) return;
    _expand[btn.dataset.list] = !_expand[btn.dataset.list];
    render();
  });
  submitBtn.addEventListener('click', submit);
  reseedBtn.addEventListener('click', reseed);
  inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('show')) close();
  });

  // Gently pulse the FAB if you haven't added to today's chain yet.
  if (!played()) fab.classList.add('has-new');
})();
