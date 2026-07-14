/**
 * bubble-jar.js — 🏺 泡泡罐: catch a bubble before it expires, re-read it later.
 *
 * Saves a small TEXT snapshot (images become a "🖼️ 图片留言" note — their data
 * is never copied). localStorage is the instant cache; the jar also SYNCS to
 * the signed-in user's rooms/{uid}.jar field so it follows them across devices
 * — the same pattern the app already uses for `settings` (server ∪ local wins
 * on load; no new security rule, since the owner may already write their room).
 * Reads are lazy (one merge the first time you catch or open the jar) and
 * writes are debounced, so the sync costs ~nothing. Pure rules live in
 * jar-logic.js.
 *
 * Entry points:
 *  · the 🏺 收藏 button in every bubble footer (app.js calls window.jarCatch);
 *  · the 🏺 泡泡罐 toggle in the live bar opens the jar overlay.
 *
 * Feature flag: jar — feature-flags.js hides #jarToggle; this file also hides
 * the per-bubble buttons with an injected rule and no-ops jarCatch.
 */
(function () {
  'use strict';

  const Jar = window.JarLogic;
  if (!Jar) return;

  const toggle = document.getElementById('jarToggle');
  const canCloud = (typeof db !== 'undefined' && typeof auth !== 'undefined');

  // Soft accent palette — a stable colour per card (via JarLogic.hashId).
  const ACCENTS = ['#c8b6ff', '#ffb3c7', '#a0e7e5', '#ffd6a5',
                   '#b5ead7', '#bde0fe', '#f7a8c4', '#caffbf'];

  function disabled() { return window.FEATURES && window.FEATURES.jar === false; }
  // The jar is PER-ACCOUNT: namespace the cache by uid so switching Google
  // accounts in the same browser never shows or writes another user's jar.
  function keyFor(uid) { return 'bubble_jar_' + (uid || 'anon'); }
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(keyFor(myUid))) || []; } catch (e) { return []; }
  }
  function saveLocal(list) {
    try { localStorage.setItem(keyFor(myUid), JSON.stringify(list)); return true; }
    catch (e) { return false; }                    // quota full / storage blocked
  }
  // Uploaded photos are base64 — too big to sync in the shared rooms/{uid} doc,
  // so they live in a SEPARATE per-account localStorage key and show only on the
  // device that saved them. (Hosted image/GIF URLs ride on the entry itself via
  // JarLogic.snapshot and DO sync across devices.)
  const LOCAL_IMG_MAX = 720 * 1024;                // covers uploaded GIF files (~670KB base64) too
  function imgKeyFor(uid) { return 'bubble_jar_img_' + (uid || 'anon'); }
  function loadLocalImgs() {
    try { return JSON.parse(localStorage.getItem(imgKeyFor(myUid))) || {}; } catch (e) { return {}; }
  }
  function saveLocalImgs(map) {
    try { localStorage.setItem(imgKeyFor(myUid), JSON.stringify(map)); return true; } catch (e) { return false; }
  }
  function pruneLocalImgs() {                       // forget images whose entry left the jar
    const ids = {}; for (const e of items) if (e && e.id) ids[e.id] = 1;
    let changed = false;
    for (const k in localImgs) if (!ids[k]) { delete localImgs[k]; changed = true; }
    if (changed) saveLocalImgs(localImgs);
  }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); }

  /* ── In-memory jar (source of truth) + cloud sync ────────── */
  let myUid = null;
  let items = loadLocal();     // anon cache until auth resolves
  let localImgs = loadLocalImgs();   // base64 photos, this device only (id → dataURL)
  let hydrated = false;        // have we merged THIS user's cloud copy yet?
  let hydrating = null;        // in-flight hydrate promise
  let saveTimer = null;
  let syncState = canCloud ? 'idle' : 'local';   // idle|syncing|synced|error|local
  // Overlay state — declared here (before the auth observer that closes over it)
  // so those references can never hit a temporal-dead-zone on an early auth event.
  let overlay = null, listEl = null, searchQ = '';

  function cloudReady() { return canCloud && !!myUid && hydrated; }

  if (canCloud) auth.onAuthStateChanged((u) => {
    const next = u ? u.uid : null;
    if (next === myUid) return;
    // Flush the OUTGOING user's pending save to THEIR doc before we switch —
    // flushCloud reads myUid/items synchronously, so do it before reassigning.
    if (saveTimer && myUid && hydrated) flushCloud();
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    myUid = next;
    hydrated = false; hydrating = null;            // fresh per-account sync
    items = loadLocal();                           // this account's own cache
    localImgs = loadLocalImgs();                   // and its own device-local photos
    if (overlay) {                                 // repaint if the jar is open
      searchQ = '';
      const s = overlay.querySelector('.jar-search'); if (s) s.value = '';
      setSync(canCloud && myUid ? 'idle' : 'local');
      renderList();
      ensureHydrated();
    }
  });

  function setSync(s) {
    syncState = s;
    if (!overlay) return;
    const pill = overlay.querySelector('.jar-sync');
    if (!pill) return;
    pill.dataset.state = s;
    pill.textContent = s === 'syncing' ? '☁️ 同步中…'
                     : s === 'synced' ? '☁️ 已同步'
                     : s === 'error' ? '⚠️ 未同步'
                     : '';
    pill.style.display = (s === 'idle' || s === 'local') ? 'none' : '';
  }

  // One-time reconcile of the cloud copy with the local one. Resolves to TRUE
  // only when `items` now reflects the cloud (i.e. it is safe to push). On a
  // failed read it resolves FALSE and leaves hydrated=false so we never write
  // an un-merged array over the cloud (which would drop cloud-only entries).
  function ensureHydrated() {
    if (!canCloud || !myUid) return Promise.resolve(false);   // no cloud → never push
    if (hydrated) return Promise.resolve(true);
    if (hydrating) return hydrating;
    const uid = myUid;                             // pin the account for this read
    setSync('syncing');
    hydrating = db.collection('rooms').doc(uid).get()
      .then((snap) => {
        if (myUid !== uid) return false;           // account switched mid-read → discard
        const cloud = (snap.exists && Array.isArray(snap.data().jar)) ? snap.data().jar : [];
        items = Jar.merge(cloud, items);           // cloud ∪ local, newest-first
        saveLocal(items);
        pruneLocalImgs();                          // forget photos for dropped entries
        hydrated = true;
        setSync('synced');
        if (listEl) renderList();
        scheduleCloudSave();                       // push the union back up
        return true;
      })
      // Guard the reset like the success path (line ~100): a discarded outgoing
      // read must not null the NEW account's in-flight `hydrating` promise.
      .catch(() => { if (myUid === uid) { setSync('error'); hydrating = null; } return false; });
    return hydrating;
  }

  function scheduleCloudSave() {
    if (!cloudReady()) return;                      // only push a hydrated jar
    setSync('syncing');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushCloud, 1200);
  }
  function flushCloud() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!cloudReady()) return;                      // never clobber with un-merged data
    const uid = myUid;                              // pin: this write belongs to THIS account
    db.collection('rooms').doc(uid)
      .set({ jar: items, jarUpdatedAt: Date.now() }, { merge: true })
      .then(() => { if (myUid === uid) setSync('synced'); })   // don't paint a switched-in account's pill
      .catch(() => { if (myUid === uid) setSync('error'); });
  }

  // The flags doc loads async; once it lands, a disabled jar also hides the
  // per-bubble 收藏 buttons (feature-flags.js itself only hides element ids).
  let cssInjected = false;
  function applyFlagCss() {
    if (!disabled() || cssInjected) return;
    cssInjected = true;
    const st = document.createElement('style');
    st.textContent = '.jar-btn { display: none !important; }';
    document.head.appendChild(st);
  }
  applyFlagCss();
  let tries = 0;
  const iv = setInterval(() => {
    if (window.FEATURES) { applyFlagCss(); clearInterval(iv); }
    else if (++tries > 100) clearInterval(iv);
  }, 100);

  /* ── Catch (called from the bubble footer in app.js) ─────── */
  window.jarCatch = function (a, bubbleEl) {
    if (disabled()) return;
    const entry = Jar.snapshot(a, Date.now());
    const res = Jar.add(items, entry);
    if (!res.added) {
      toast(res.reason === 'dup' ? '已经在泡泡罐里啦 🏺' : '无法收藏这条留言');
      return;
    }
    items = res.list;
    const okLocal = saveLocal(items);
    if (!okLocal && !(canCloud && myUid)) {        // no durable store at all → don't lie
      items = Jar.remove(items, entry.id);
      toast('保存失败 —— 存储空间不够了', 'error');
      return;
    }
    // A base64 photo → keep it on THIS device so the card can show it (hosted
    // image/GIF URLs already ride on the entry via snapshot()).
    if (!entry.img && a && typeof a.image === 'string' &&
        a.image.lastIndexOf('data:', 0) === 0 && a.image.length <= LOCAL_IMG_MAX) {
      localImgs[entry.id] = a.image;
      saveLocalImgs(localImgs);
    }
    pruneLocalImgs();   // a full jar just evicted its oldest entry — reclaim its photo now
                        // (runs every catch, so anon/local-only users don't leak either)
    flyToJar(bubbleEl);
    toast('🏺 收进泡泡罐了！');
    if (listEl) renderList();
    ensureHydrated().then(scheduleCloudSave);      // merge cloud first, then push
  };

  function removeEntry(id) {
    // Hydrate first: removing before the cloud merge would drop cloud-only
    // entries when we push `items` back up.
    ensureHydrated().then((ok) => {
      if (canCloud && myUid && !ok) {              // cloud expected but not merged:
        toast('同步暂时不可用，稍后再删', 'error');   // deleting now would resurrect on next sync
        return;
      }
      items = Jar.remove(items, id);
      saveLocal(items);
      if (localImgs[id]) { delete localImgs[id]; saveLocalImgs(localImgs); }
      if (listEl) renderList();
      scheduleCloudSave();                         // no-ops in local-only mode
    });
  }

  // A ghost of the bubble shrinks and flies toward the jar button.
  function flyToJar(bubbleEl) {
    if (!bubbleEl || !bubbleEl.animate || document.body.classList.contains('no-animations')) return;
    const from = bubbleEl.getBoundingClientRect();
    const to = toggle ? toggle.getBoundingClientRect()
                      : { left: window.innerWidth - 40, top: 20, width: 0, height: 0 };
    const ghost = bubbleEl.cloneNode(true);
    ghost.className = bubbleEl.className + ' jar-ghost';
    // opacity must be inline: .jar-ghost kills the floatIn animation whose
    // forwards-fill is what normally lifts bubbles from their opacity:0 start.
    ghost.style.cssText = 'position:fixed;margin:0;left:' + from.left + 'px;top:' + from.top +
      'px;width:' + from.width + 'px;pointer-events:none;z-index:600;opacity:.9;';
    document.body.appendChild(ghost);
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    try {
      ghost.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 0.9 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.05)', opacity: 0.2 }
      ], { duration: 550, easing: 'cubic-bezier(0.5, -0.2, 0.8, 0.6)' })
        .addEventListener('finish', () => ghost.remove());
      if (toggle && toggle.animate) {
        setTimeout(() => toggle.animate(
          [{ scale: '1' }, { scale: '1.25' }, { scale: '1' }], { duration: 300 }), 480);
      }
    } catch (_) { ghost.remove(); }
    setTimeout(() => ghost.remove(), 900);         // safety net
  }

  /* ── Overlay ─────────────────────────────────────────────── */
  // Tap a jar photo/GIF → open the board's shared pan-&-zoom lightbox (z-index
  // 500, above the jar's 390), the same #lightbox app.js already wires up.
  function openJarImage(src) {
    if (!src) return;
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightboxImg');
    if (lb && lbImg) { lbImg.src = src; lb.classList.add('show'); }
  }

  function card(e, idx, now) {
    const el = document.createElement('div');
    el.className = 'jar-card';
    el.style.setProperty('--accent', ACCENTS[Jar.hashId(e.id) % ACCENTS.length]);
    el.style.setProperty('--i', Math.min(idx, 12));   // capped stagger

    const del = document.createElement('button');
    del.className = 'jar-card-del';
    del.type = 'button';
    del.title = '移出泡泡罐';
    del.textContent = '✕';
    del.addEventListener('click', () => removeEntry(e.id));
    el.appendChild(del);

    // Image / GIF: a synced hosted URL (e.img) or a device-local base64 photo.
    const src = e.img || localImgs[e.id] || null;
    if (src) {
      const media = document.createElement('img');
      media.className = 'jar-card-img';
      media.src = src;
      media.loading = 'lazy';
      media.alt = '';
      media.title = '点击放大';
      media.addEventListener('click', (ev) => { ev.stopPropagation(); openJarImage(src); });
      el.appendChild(media);
    }

    const body = document.createElement('div');
    body.className = 'jar-card-body';
    // With the image shown, drop the redundant "🖼️ 图片留言" placeholder caption.
    if (src && e.t === '🖼️ 图片留言') body.style.display = 'none';
    else body.textContent = e.t || '💬';
    el.appendChild(body);

    const foot = document.createElement('div');
    foot.className = 'jar-card-foot';
    const who = document.createElement('span');
    who.className = 'jar-card-who';
    who.textContent = e.n ? e.n : '匿名';
    const when = document.createElement('span');
    when.className = 'jar-card-when';
    when.textContent = '收于 ' + Jar.relTime(e.at, now);
    const copy = document.createElement('button');
    copy.className = 'jar-card-copy';
    copy.type = 'button';
    copy.title = '复制文字';
    copy.textContent = '⧉';
    copy.addEventListener('click', () => {
      const text = e.t || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast('已复制 ✓')).catch(() => {});
      }
    });
    foot.appendChild(who);
    foot.appendChild(when);
    foot.appendChild(copy);
    el.appendChild(foot);
    return el;
  }

  function renderList() {
    if (!listEl || !overlay) return;
    const countEl = overlay.querySelector('.jar-count');
    if (countEl) countEl.textContent = items.length + '/' + Jar.CAP;
    const searchEl = overlay.querySelector('.jar-search');
    if (searchEl) {
      const showSearch = items.length > 8;
      searchEl.style.display = showSearch ? '' : 'none';
      // Don't leave a hidden filter applied (would hide real entries with no
      // visible box to clear it).
      if (!showSearch && searchQ) { searchQ = ''; searchEl.value = ''; }
    }

    if (!items.length) {
      listEl.innerHTML =
        '<div class="jar-empty"><div class="jar-empty-icon">🏺</div>' +
        '<div class="jar-empty-title">罐子还是空的</div>' +
        '<div class="jar-empty-text">在任意留言下点 <b>🏺 收藏</b>，' +
        '留言过期消失后也能在这里回味。</div>' +
        '<div class="jar-empty-note">☁️ 现在会跟着你的账号跨设备同步</div></div>';
      return;
    }
    const q = searchQ.trim().toLowerCase();
    const shown = q
      ? items.filter(e => e && (((e.t || '').toLowerCase().indexOf(q) >= 0) ||
                                ((e.n || '').toLowerCase().indexOf(q) >= 0)))
      : items;
    listEl.innerHTML = '';
    if (!shown.length) {
      const none = document.createElement('div');
      none.className = 'jar-empty jar-empty-sm';
      none.textContent = '没有匹配的收藏';
      listEl.appendChild(none);
      return;
    }
    const now = Date.now();
    shown.forEach((e, idx) => { if (e && e.id) listEl.appendChild(card(e, idx, now)); });
  }

  function open() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'jar-overlay';
    overlay.innerHTML =
      '<div class="jar-panel">' +
        '<div class="jar-head">' +
          '<span class="jar-title">🏺 泡泡罐</span>' +
          '<span class="jar-count"></span>' +
          '<span class="jar-sync" data-state="idle"></span>' +
          '<button class="jar-close" type="button" title="Close (Esc)">✕</button>' +
        '</div>' +
        '<div class="jar-sub">收藏过的留言 · 跨设备同步</div>' +
        '<input class="jar-search" type="text" placeholder="🔍 搜索收藏…" />' +
        '<div class="jar-list"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    listEl = overlay.querySelector('.jar-list');
    overlay.querySelector('.jar-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const searchEl = overlay.querySelector('.jar-search');
    searchEl.addEventListener('input', () => { searchQ = searchEl.value; renderList(); });
    if (toggle) toggle.classList.add('active');

    renderList();                 // instant local view
    setSync(syncState);
    ensureHydrated();             // merge cloud in, then re-render
  }

  function close() {
    if (!overlay) return;
    if (saveTimer) flushCloud();   // don't lose a pending sync on close
    overlay.remove();
    overlay = null; listEl = null; searchQ = '';
    if (toggle) toggle.classList.remove('active');
  }

  if (toggle) toggle.addEventListener('click', () => { overlay ? close() : open(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay) close(); });
  // Never lose a debounced sync when the tab is hidden or unloads.
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) flushCloud(); });
  window.addEventListener('beforeunload', () => { if (saveTimer) flushCloud(); });
})();
