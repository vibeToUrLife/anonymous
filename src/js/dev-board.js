/* ============================================================
   📣 Dev board — what changed, posted by the developer.

   A chip beside the settings gear with a dot when something is new, and
   a sheet behind it: newest first, a couple of posts with a "show all".
   Readers can leave one reaction per post; the composer only exists for
   a developer.

   It began as a card in the page and that was wrong. Anything living
   above the message board is scrolled past on every visit, and even
   folded to a 42px strip it was still 42px of nothing between the
   reader and what they came for. A sheet costs the page zero height and
   still announces itself, because the dot is on a chip that is always
   on screen.

   Deliberately NOT a second announcement system. app_state/whats_new is
   the popup that must be seen once per release; this is the archive you
   can scroll back through, and the place a screenshot fits. A post can
   be both — publishing here does not touch the popup.

   Storage: one document per post in `dev_updates`, because an image is
   stored inline as a data URL and a single doc holding every post would
   hit Firestore's 1 MiB ceiling within a dozen updates. Which reaction
   is yours lives in localStorage, exactly as the bubble board does it —
   the document keeps a plain tally.
   ============================================================ */
(function () {
  'use strict';

  const COL = 'dev_updates';
  const SEEN_KEY = 'devboard_seen_ts';
  const MINE_KEY = 'devboard_react_';
  const COLLAPSED = 2;
  const KINDS = [
    { id: 'heart', emoji: '❤️' },
    { id: 'party', emoji: '🎉' },
    { id: 'up',    emoji: '👍' },
  ];
  // Must match isDeveloper() in firestore.rules — the rules are what actually
  // enforce this; the check here only decides whether to show the composer.
  const DEV_UIDS = ['eUs3isAgsaRT9VLKEFI4HEFbCnk1'];

  let posts = [];
  let expanded = false;      // "show all" inside the list
  let open = false;          // the sheet
  let unsub = null;
  let busy = false;

  const $ = (id) => document.getElementById(id);
  const hasFB = () => typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length;
  const db = () => firebase.firestore();
  const me = () => (hasFB() && firebase.auth().currentUser) || null;
  const isDev = () => { const u = me(); return !!u && DEV_UIDS.indexOf(u.uid) !== -1; };
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const seenTs = () => { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch (e) { return 0; } };
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, String(newestTs(posts))); } catch (e) {} };
  const myReaction = (id) => { try { return localStorage.getItem(MINE_KEY + id) || null; } catch (e) { return null; } };
  const setMyReaction = (id, kind) => {
    try { kind ? localStorage.setItem(MINE_KEY + id, kind) : localStorage.removeItem(MINE_KEY + id); } catch (e) {}
  };

  const TAG_LABEL = { feature: '🆕 New', fix: '🔧 Fixed', event: '🎉 Event' };
  // Named _t to match jar-logic.js and maintenance.js — the same wrapper for the
  // same reason, and the coverage tooling knows to look for it.
  const _t = (s, v) => (typeof T === 'function' ? T(s, v) : s);

  function when(ts) {
    const d = new Date(ts || 0);
    return _t('{m}/{d}', { m: d.getMonth() + 1, d: d.getDate() });
  }

  /* ── render ── */

  function render() {
    const card = $('devBoardCard');
    if (!card) return;
    const list = $('devBoardList');
    const dot = $('devBoardDot');
    const more = $('devBoardMore');
    if (!list) return;

    /* An empty board is nobody's business but the developer's: until the first
       update exists there is nothing to announce, so the chip is not there
       either. The developer keeps it, or there would be nowhere to post from. */
    const btn = $('devBoardBtn');
    const sheet = $('devBoardSheet');
    const unseen = unseenCount(posts, seenTs());
    if (btn) btn.classList.toggle('hidden', !posts.length && !isDev());
    if (dot) {
      dot.textContent = unseen > 99 ? '99+' : String(unseen);
      dot.classList.toggle('hidden', !unseen);
    }
    if (sheet) sheet.classList.toggle('hidden', !open);
    if (!open) return;

    if (!posts.length) {
      list.innerHTML = '<div class="dev-board-empty">' + esc(_t('Nothing posted yet.')) + '</div>';
      if (more) more.classList.add('hidden');
      renderComposer();
      return;
    }

    const shown = visiblePosts(posts, expanded, COLLAPSED, seenTs());
    list.innerHTML = shown.map(function (p) {
      const isNew = (p.ts || 0) > seenTs();
      const mine = myReaction(p.id);
      const reacts = KINDS.map(function (k) {
        const n = reactionCount(p, k.id);
        return '<button class="dev-react' + (mine === k.id ? ' on' : '') + '" data-post="' + esc(p.id) +
               '" data-kind="' + k.id + '">' + k.emoji + (n ? ' ' + n : '') + '</button>';
      }).join('');
      return '<article class="dev-post' + (isNew ? ' is-new' : '') + '">' +
        '<div class="dev-post-head">' +
          '<span class="dev-tag dev-tag-' + esc(p.tag || 'feature') + '">' +
            esc(_t(TAG_LABEL[p.tag] || TAG_LABEL.feature)) + '</span>' +
          '<span class="dev-post-when">' + esc(when(p.ts)) + '</span>' +
          (isDev() ? '<button class="dev-post-del" data-del="' + esc(p.id) + '" title="' +
            esc(_t('Delete')) + '">✕</button>' : '') +
        '</div>' +
        '<h4 class="dev-post-title">' + esc(p.title) + '</h4>' +
        (p.body ? '<p class="dev-post-body">' + esc(p.body).replace(/\n/g, '<br>') + '</p>' : '') +
        (p.image ? '<img class="dev-post-img" src="' + esc(p.image) + '" alt="' + esc(_t('screenshot')) + '" loading="lazy">' : '') +
        '<div class="dev-post-foot">' +
          '<span class="dev-reacts">' + reacts + '</span>' +
          (p.link ? '<a class="dev-post-link" href="' + esc(p.link) + '">' +
            esc(_t('Take a look →')) + '</a>' : '') +
        '</div>' +
      '</article>';
    }).join('');

    if (more) {
      const hidden = posts.length - shown.length;
      more.classList.toggle('hidden', !hidden && !expanded);
      more.textContent = expanded ? _t('Collapse ▴') : _t('Show all ({n}) ▾', { n: posts.length });
    }
    renderComposer();
  }

  function renderComposer() {
    const box = $('devBoardCompose');
    if (!box) return;
    box.classList.toggle('hidden', !isDev());
  }

  /* ── reactions ── */

  async function react(id, kind) {
    if (!hasFB() || !me()) return;
    const mine = myReaction(id);
    const next = nextReaction(mine, kind);
    const delta = reactionDelta(mine, next);
    if (!Object.keys(delta).length) return;

    setMyReaction(id, next);                       // optimistic, like the bubble board
    const post = posts.find(p => p.id === id);
    if (post) {
      post.reactions = Object.assign({}, post.reactions);
      for (const k in delta) post.reactions[k] = Math.max(0, (post.reactions[k] || 0) + delta[k]);
    }
    render();

    try {
      const updates = {};
      for (const k in delta) updates['reactions.' + k] = firebase.firestore.FieldValue.increment(delta[k]);
      await db().collection(COL).doc(id).update(updates);
    } catch (e) {
      setMyReaction(id, mine);                     // put it back if the write did not land
      if (typeof showToast === 'function') showToast(_t('Reaction failed'), 'error');
      subscribe(true);
    }
  }

  /* ── composing (developer only) ── */

  let pendingImage = null;

  async function pickImage(file) {
    if (!file) return;
    try {
      // Same pipeline the bubble board uses, so there is one place that knows
      // how to shrink a photo. 560px wide keeps a screenshot readable.
      pendingImage = await compressImage(file, 560, 560, 0.72);
      const prev = $('devComposePreview');
      if (prev) { prev.src = pendingImage; prev.classList.remove('hidden'); }
    } catch (e) {
      pendingImage = null;
      if (typeof showToast === 'function') showToast(_t('Could not read that image'), 'error');
    }
  }

  async function publish() {
    if (busy || !isDev()) return;
    const title = ($('devComposeTitle') || {}).value || '';
    const body = ($('devComposeBody') || {}).value || '';
    const link = ($('devComposeLink') || {}).value || '';
    const tag = ($('devComposeTag') || {}).value || 'feature';
    if (!title.trim()) { if (typeof showToast === 'function') showToast(_t('Give it a title first'), 'error'); return; }

    const post = { tag: tag, title: title.trim(), body: body.trim(), link: link.trim(), image: pendingImage || '' };
    const fit = postFits(post);
    if (!fit.ok) {
      // Refuse before the upload rather than after — an over-size document is
      // rejected by Firestore only once the whole thing has been sent.
      if (typeof showToast === 'function') {
        showToast(_t('Too big to post ({size}KB of {cap}KB) — use a smaller image',
          { size: Math.round(fit.size / 1024), cap: Math.round(fit.cap / 1024) }), 'error');
      }
      return;
    }

    busy = true;
    try {
      await db().collection(COL).add(Object.assign({}, post, {
        ts: Date.now(),
        by: (me() && me().uid) || '',
        reactions: {},
      }));
      ['devComposeTitle', 'devComposeBody', 'devComposeLink'].forEach(function (id) {
        const el = $(id); if (el) el.value = '';
      });
      pendingImage = null;
      const prev = $('devComposePreview');
      if (prev) { prev.src = ''; prev.classList.add('hidden'); }
      const fileEl = $('devComposeFile'); if (fileEl) fileEl.value = '';
      if (typeof showToast === 'function') showToast(_t('📣 Posted!'), 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast(_t('Could not post — check the rules are published'), 'error');
    }
    busy = false;
  }

  async function remove(id) {
    if (!isDev()) return;
    try { await db().collection(COL).doc(id).delete(); }
    catch (e) { if (typeof showToast === 'function') showToast(_t('Could not delete'), 'error'); }
  }

  /* ── data ── */

  function subscribe(force) {
    if (!hasFB() || !me()) return;
    if (unsub && !force) return;
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    try {
      unsub = db().collection(COL).orderBy('ts', 'desc').limit(30)
        .onSnapshot(function (snap) {
          posts = [];
          snap.forEach(function (d) { posts.push(Object.assign({ id: d.id }, d.data())); });
          render();
        }, function () { /* a board that cannot load simply stays empty */ });
    } catch (e) {}
  }

  /* ── wiring ── */

  function init() {
    const card = $('devBoardCard');
    if (!card) return;

    card.addEventListener('click', function (e) {
      const r = e.target.closest && e.target.closest('.dev-react');
      if (r) { react(r.getAttribute('data-post'), r.getAttribute('data-kind')); return; }
      const d = e.target.closest && e.target.closest('[data-del]');
      if (d) { remove(d.getAttribute('data-del')); return; }
    });

    const more = $('devBoardMore');
    if (more) more.addEventListener('click', function () { expanded = !expanded; render(); });

    /* Opening the sheet is what marks the updates read — and only then, because
       a badge cleared on page load would mean nobody ever learns something
       arrived. Closing does not un-read them. */
    function openSheet() {
      open = true;
      expanded = false;
      render();
      if (unseenCount(posts, seenTs())) { markSeen(); setTimeout(render, 900); }
    }
    function closeSheet() { open = false; render(); }

    const btn = $('devBoardBtn');
    if (btn) btn.addEventListener('click', openSheet);
    const close = $('devBoardClose');
    if (close) close.addEventListener('click', closeSheet);

    const sheet = $('devBoardSheet');
    if (sheet) sheet.addEventListener('click', function (e) {
      if (e.target === sheet) closeSheet();          // tap the scrim to dismiss
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) closeSheet();
    });

    const pub = $('devComposePost');
    if (pub) pub.addEventListener('click', publish);
    const file = $('devComposeFile');
    if (file) file.addEventListener('change', function (e) { pickImage(e.target.files && e.target.files[0]); });

    if (hasFB()) {
      firebase.auth().onAuthStateChanged(function () { subscribe(true); render(); });
      subscribe();
    }
    render();
    if (typeof window !== 'undefined') window.addEventListener('langchange', render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
