/* ═══════════════════════════════════════════════════════════════════════
   admin.js — Developer admin dashboard for the whole site.

   SECURITY MODEL (two layers):
     1. This file's UID check is UX only — it just decides what to show.
        It can be bypassed in dev tools, so it is NOT the security boundary.
     2. The REAL boundary is firestore.rules → isDeveloper(). Every write here
        is rejected server-side unless the signed-in UID is a real developer.
        Opening this page as a non-dev gets you nothing.

   Keep DEVELOPER_UIDS in sync with isDeveloper() in firestore.rules.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();
  // Realtime Database — only used for moderating Pet World notice-board notes.
  // Guarded so the rest of the panel still works if the RTDB SDK failed to load.
  let rtdb = null;
  try { rtdb = firebase.database ? firebase.database() : null; } catch (e) { rtdb = null; }

  const DEVELOPER_UIDS = ['eUs3isAgsaRT9VLKEFI4HEFbCnk1'];
  const PRESENCE_TTL_MS = 180000;  // a viewer counts as "online" if seen in the last 3 min

  const roomsRef = db.collection('rooms');
  const $ = (id) => document.getElementById(id);

  /* ── helpers ─────────────────────────────────────────────────────────── */
  // Escape user-controlled free text before injecting it into innerHTML.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  }
  function setStatus(el, msg, kind) {
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  // Append an immutable audit-trail entry. Best-effort; never blocks the action.
  function writeLog(action, targetUid, targetName, detail) {
    const u = auth.currentUser;
    return db.collection('admin_log').add({
      action, targetUid: targetUid || null, targetName: targetName || null,
      detail: detail || '', byUid: u ? u.uid : null,
      byName: (u && (u.displayName || u.email)) || null, ts: Date.now()
    }).catch(() => {});
  }

  // Styled confirmation dialog → resolves true (confirmed) / false (cancelled).
  // opts: { title, message, confirmLabel, danger=true, requireText }
  // When requireText is set, the confirm button stays disabled until the user
  // types that exact text (used for destructive actions like reset).
  function confirmAction(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const modal = $('confirmModal'), ok = $('confirmOk'), cancel = $('confirmCancel'), x = $('confirmX');
      const wrap = $('confirmTypeWrap'), input = $('confirmTypeInput'), tlabel = $('confirmTypeLabel');
      const needType = !!opts.requireText;
      $('confirmTitle').textContent = opts.title || 'Confirm';
      $('confirmMsg').textContent = opts.message || '';
      ok.textContent = opts.confirmLabel || 'Confirm';
      ok.className = 'btn ' + (opts.danger === false ? 'primary' : 'danger');
      wrap.classList.toggle('hidden', !needType);
      if (needType) { tlabel.textContent = 'Type “' + opts.requireText + '” to confirm'; input.value = ''; ok.disabled = true; }
      else { ok.disabled = false; }

      const prevFocus = document.activeElement;
      modal.classList.remove('hidden');
      (needType ? input : ok).focus();

      function done(result) {
        modal.classList.add('hidden');
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        x.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onScrim);
        document.removeEventListener('keydown', onKey);
        input.removeEventListener('input', onInput);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(result);
      }
      function onOk() { if (needType && input.value.trim() !== opts.requireText) return; done(true); }
      function onCancel() { done(false); }
      function onScrim(e) { if (e.target === modal) done(false); }
      function onKey(e) { if (e.key === 'Escape') done(false); else if (e.key === 'Enter' && !needType) onOk(); }
      function onInput() { ok.disabled = input.value.trim() !== opts.requireText; }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      x.addEventListener('click', onCancel);
      modal.addEventListener('click', onScrim);
      document.addEventListener('keydown', onKey);
      if (needType) input.addEventListener('input', onInput);
    });
  }

  /* ── auth gate ───────────────────────────────────────────────────────── */
  function show(id) { ['loadingGate', 'authGate', 'deniedGate', 'dashboard'].forEach(g => $(g).classList.toggle('hidden', g !== id)); }

  $('googleSignInBtn').addEventListener('click', async () => {
    setStatus($('authError'), '');
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (e) { setStatus($('authError'), e.message || 'Sign-in failed', 'err'); }
  });
  const doSignOut = () => auth.signOut();
  $('signOutBtn').addEventListener('click', doSignOut);
  $('deniedSignOut').addEventListener('click', doSignOut);

  let booted = false;
  auth.onAuthStateChanged(async (user) => {
    const label = user ? (user.displayName || user.email || user.uid) : '';
    $('whoami').textContent = label;
    $('avatar').textContent = label ? label.charAt(0).toUpperCase() : '';
    $('idChip').classList.toggle('hidden', !user);
    $('signOutBtn').classList.toggle('hidden', !user);
    if (!user) { show('authGate'); return; }
    // Dev = a built-in bootstrap UID, OR present in the runtime developers/ allowlist.
    let isDev = DEVELOPER_UIDS.indexOf(user.uid) !== -1;
    if (!isDev) { try { isDev = (await db.collection('developers').doc(user.uid).get()).exists; } catch (e) {} }
    if (!isDev) { $('deniedUid').textContent = user.uid; show('deniedGate'); return; }
    show('dashboard');
    if (!booted) { booted = true; initDashboard(); }
  });

  /* ── tabs ────────────────────────────────────────────────────────────── */
  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      ['site', 'users', 'content', 'stats', 'games', 'economy'].forEach(name =>
        $('tab-' + name).classList.toggle('hidden', name !== t.dataset.tab));
      if (t.dataset.tab === 'content') loadContent();
      if (t.dataset.tab === 'stats')   loadStats();
      if (t.dataset.tab === 'games')   loadGames();
      if (t.dataset.tab === 'economy') loadEconomy();
    }));
  }

  function initDashboard() {
    initTabs();
    initSite();
    initUsers();
    loadAuditLog();
    bindStatCards();
    initCollapsibles();
  }

  // Make every card foldable by clicking its header. State is remembered per card
  // (keyed by its title) so a collapsed long list stays collapsed across reloads.
  function initCollapsibles() {
    document.querySelectorAll('#dashboard .card').forEach(card => {
      if (card.id === 'userDetail') return;                 // dynamic title — skip
      const head = card.querySelector(':scope > .card-head'); // only simple headers
      if (!head) return;                                     // skips the Stats overview (nested header)
      card.classList.add('collapsible');
      const key = 'admincollapse_' + head.textContent.trim().slice(0, 40);
      if (localStorage.getItem(key) === '1') card.classList.add('collapsed');
      head.addEventListener('click', () => {
        const collapsed = card.classList.toggle('collapsed');
        try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch (e) {}
      });
    });
  }

  /* ═══════════════ SITE TAB ═══════════════ */
  const maintRef = db.doc('app_state/maintenance');
  const codeRef  = db.doc('app_state/access_code');
  const wnRef    = db.doc('app_state/whats_new');

  function initSite() {
    // Maintenance
    maintRef.get().then(s => {
      const d = s.exists ? s.data() : {};
      $('maintToggle').checked = !!d.enabled;
      $('maintMsg').value = d.message || '';
      renderMaintState(!!d.enabled, d.updatedBy, d.updatedAt);
    }).catch(e => setStatus($('maintStatus'), e.message, 'err'));

    $('maintSave').addEventListener('click', () => {
      const enabled = $('maintToggle').checked;
      const u = auth.currentUser;
      $('maintSave').disabled = true;
      setStatus($('maintStatus'), 'Saving…');
      maintRef.set({ enabled, message: $('maintMsg').value.trim(),
                     updatedBy: (u.displayName || u.email), updatedAt: Date.now() })
        .then(() => { renderMaintState(enabled, u.displayName || u.email, Date.now());
                      setStatus($('maintStatus'), enabled ? '✅ Maintenance is ON site-wide.' : '✅ Site is live.', 'ok');
                      writeLog('maintenance', null, null, enabled ? 'enabled' : 'disabled'); })
        .catch(e => setStatus($('maintStatus'), e.message, 'err'))
        .finally(() => { $('maintSave').disabled = false; });
    });

    // Access code
    codeRef.get().then(s => { $('codeInput').value = (s.exists && s.data().code) || ''; })
      .catch(e => setStatus($('codeStatus'), e.message, 'err'));
    $('codeSave').addEventListener('click', () => {
      const code = $('codeInput').value.trim();
      if (!code) return setStatus($('codeStatus'), '⚠️ Code cannot be empty.', 'err');
      $('codeSave').disabled = true;
      setStatus($('codeStatus'), 'Saving…');
      codeRef.set({ code }, { merge: true })
        .then(() => { setStatus($('codeStatus'), '✅ Access code updated.', 'ok'); writeLog('access_code', null, null, 'changed'); })
        .catch(e => setStatus($('codeStatus'), e.message, 'err'))
        .finally(() => { $('codeSave').disabled = false; });
    });

    // Access-code wrong attempts (post-login gate) — list offenders + unlock.
    $('accessAttemptsRefresh').addEventListener('click', loadAccessAttempts);
    loadAccessAttempts();

    // Announcement (What's New) — same shape index.html reads: {version, badge, items[]}
    wnRef.get().then(s => {
      const d = s.exists ? s.data() : {};
      $('wnVersion').value = d.version || '';
      $('wnBadge').value   = d.badge || '';
      $('wnItems').value   = Array.isArray(d.items) ? d.items.join('\n') : '';
    }).catch(e => setStatus($('wnStatus'), e.message, 'err'));
    $('wnSave').addEventListener('click', () => {
      const version = $('wnVersion').value.trim();
      if (!version) return setStatus($('wnStatus'), '⚠️ Version key is required.', 'err');
      const items = $('wnItems').value.split('\n').map(s => s.trim()).filter(Boolean);
      $('wnSave').disabled = true;
      setStatus($('wnStatus'), 'Publishing…');
      wnRef.set({ version, badge: $('wnBadge').value.trim(), items })
        .then(() => { setStatus($('wnStatus'), '✅ Published — users see it on next visit.', 'ok'); writeLog('announcement', null, null, version); })
        .catch(e => setStatus($('wnStatus'), e.message, 'err'))
        .finally(() => { $('wnSave').disabled = false; });
    });

    // Countdown timer — app_state/countdown = { targetTs }; deleting it = default schedule.
    const cdRef = db.doc('app_state/countdown');
    cdRef.get().then(s => { if (s.exists && s.data().targetTs) $('cdTime').value = toLocalInput(s.data().targetTs); }).catch(() => {});
    $('cdSet').addEventListener('click', () => {
      const v = $('cdTime').value;
      if (!v) return setStatus($('cdStatus'), '⚠️ Pick a date & time.', 'err');
      const ts = new Date(v).getTime();
      if (isNaN(ts)) return setStatus($('cdStatus'), '⚠️ Invalid time.', 'err');
      if (ts <= Date.now()) return setStatus($('cdStatus'), '⚠️ Pick a time in the future.', 'err');
      cdRef.set({ targetTs: ts })
        .then(() => { setStatus($('cdStatus'), '✅ Countdown set site-wide.', 'ok'); writeLog('countdown', null, null, new Date(ts).toLocaleString()); })
        .catch(e => setStatus($('cdStatus'), e.message, 'err'));
    });
    $('cdClear').addEventListener('click', () => {
      cdRef.delete()
        .then(() => { $('cdTime').value = ''; setStatus($('cdStatus'), '✅ Cleared — using default schedule.', 'ok'); writeLog('countdown', null, null, 'cleared'); })
        .catch(e => setStatus($('cdStatus'), e.message, 'err'));
    });

    // Food spin result — app_state/spin_result = { text, foodId, ts }.
    const spinRef = db.doc('app_state/spin_result');
    spinRef.get().then(s => { if (s.exists && s.data().text) $('spinText').value = s.data().text; }).catch(() => {});
    $('spinSet').addEventListener('click', () => {
      const text = $('spinText').value.trim();
      if (!text) return setStatus($('spinStatus'), '⚠️ Enter result text.', 'err');
      spinRef.set({ text, foodId: null, ts: Date.now() })
        .then(() => { setStatus($('spinStatus'), '✅ Spin result set for everyone.', 'ok'); writeLog('spin_result', null, null, text); })
        .catch(e => setStatus($('spinStatus'), e.message, 'err'));
    });
    $('spinClear').addEventListener('click', () => {
      spinRef.set({ text: null, foodId: null, ts: Date.now() })
        .then(() => { $('spinText').value = ''; setStatus($('spinStatus'), '✅ Cleared.', 'ok'); writeLog('spin_result', null, null, 'cleared'); })
        .catch(e => setStatus($('spinStatus'), e.message, 'err'));
    });

    // Feature switches
    loadFeatures();

    // Developer allowlist
    loadDevelopers();
    $('devAddBtn').addEventListener('click', () => {
      const uid = $('devUidInput').value.trim();
      if (!uid) return setStatus($('devStatus'), '⚠️ Enter a UID.', 'err');
      if (DEVELOPER_UIDS.indexOf(uid) !== -1) return setStatus($('devStatus'), 'Already a built-in developer.', 'err');
      $('devAddBtn').disabled = true;
      setStatus($('devStatus'), 'Adding…');
      db.collection('developers').doc(uid).set({ at: Date.now(), by: auth.currentUser.uid })
        .then(() => { setStatus($('devStatus'), '✅ Developer added.', 'ok'); $('devUidInput').value = ''; writeLog('dev_add', uid, null, ''); loadDevelopers(); })
        .catch(e => setStatus($('devStatus'), e.message, 'err'))
        .finally(() => { $('devAddBtn').disabled = false; });
    });
  }

  const FEATURES = [
    { key: 'coin_rush', label: 'Coin Rush' },
    { key: 'knock', label: 'Bubble Knock & Ripples' },
    { key: 'riddle', label: 'Daily Riddle' },
    { key: 'chengyu', label: '成语接龙 Chain' },
    { key: 'quote_comments', label: 'Quote Comments' },
    { key: 'jar', label: '泡泡罐 Bubble Jar' },
    { key: 'doodle', label: '涂鸦 Doodle' },
    { key: 'wall', label: '涂鸦墙 Graffiti Wall' }
  ];
  function loadFeatures() {
    const featRef = db.doc('app_state/features');
    featRef.get().then(s => {
      const f = s.exists ? s.data() : {};
      $('featureList').innerHTML = FEATURES.map(ft => {
        const on = f[ft.key] !== false;
        return '<div class="item"><div class="row" style="justify-content:space-between"><strong>' + esc(ft.label) + '</strong>' +
          '<label class="switch"><input type="checkbox" data-feat="' + ft.key + '"' + (on ? ' checked' : '') + '><span class="slider"></span></label></div></div>';
      }).join('');
      $('featureList').querySelectorAll('[data-feat]').forEach(cb => cb.addEventListener('change', () => {
        const key = cb.dataset.feat, on = cb.checked;
        featRef.set({ [key]: on }, { merge: true })
          .then(() => writeLog('feature_' + (on ? 'on' : 'off'), null, null, key))
          .catch(e => { alert(e.message); cb.checked = !on; });
      }));
    }).catch(e => { $('featureList').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  function loadDevelopers() {
    // Built-in (bootstrap) devs — permanent, shown as locked.
    const builtins = DEVELOPER_UIDS.map(uid =>
      '<div class="item"><div class="row" style="justify-content:space-between;gap:10px"><strong style="min-width:0;word-break:break-all">' + esc(uid) + '</strong><span class="chip good">built-in</span></div></div>'
    ).join('');
    db.collection('developers').get().then(snap => {
      let extra = '';
      snap.forEach(doc => {
        extra += '<div class="item" data-uid="' + esc(doc.id) + '"><div class="row" style="justify-content:space-between;gap:10px">' +
          '<strong style="min-width:0;word-break:break-all">' + esc(doc.id) + '</strong>' +
          '<button class="btn sm danger" data-rmdev>Remove</button></div></div>';
      });
      $('devList').innerHTML = builtins + extra;
      $('devList').querySelectorAll('[data-rmdev]').forEach(btn => btn.addEventListener('click', async () => {
        const uid = btn.closest('[data-uid]').dataset.uid;
        const ok = await confirmAction({ title: 'Remove developer', confirmLabel: 'Remove', message: 'Remove admin access for ' + uid + '?' });
        if (!ok) return;
        try { await db.collection('developers').doc(uid).delete(); writeLog('dev_remove', uid, null, ''); loadDevelopers(); }
        catch (e) { setStatus($('devStatus'), e.message, 'err'); }
      }));
    }).catch(e => { $('devList').innerHTML = builtins + '<div class="status err">' + esc(e.message) + '</div>'; });
  }
  // Format a ms timestamp for an <input type="datetime-local"> (local time, YYYY-MM-DDTHH:mm).
  function toLocalInput(ts) {
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function renderMaintState(on, by, at) {
    $('maintState').textContent = on ? '🔴 Site is in maintenance' : '🟢 Site is live';
    $('maintState').className = on ? 'chip bad' : 'chip good';
    if (at) $('maintState').title = 'by ' + (by || '?') + ' · ' + fmtDate(at);
  }

  /* ═══════════════ USERS TAB ═══════════════ */
  let selectedUid = null, selectedBanned = false;

  function initUsers() {
    $('userSearch').addEventListener('click', runSearch);
    $('userQuery').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
    $('coinGrant').addEventListener('click', () => adjustCoins('grant'));
    $('coinDeduct').addEventListener('click', () => adjustCoins('deduct'));
    $('coinSet').addEventListener('click', () => adjustCoins('set'));
    $('nameSave').addEventListener('click', renameUser);
    $('banBtn').addEventListener('click', toggleBan);
    $('resetBtn').addEventListener('click', resetAccount);
    $('clearAchBtn').addEventListener('click', clearAchievements);
    $('resetRiddleBtn').addEventListener('click', resetRiddle);
  }

  async function clearAchievements() {
    if (!selectedUid) return;
    const ok = await confirmAction({ title: 'Clear achievements', confirmLabel: 'Clear',
      message: 'Clear all achievements for “' + $('udName').textContent + '”?' });
    if (!ok) return;
    try {
      await roomsRef.doc(selectedUid).update({ achievements: firebase.firestore.FieldValue.delete() });
      writeLog('clear_achievements', selectedUid, $('udName').textContent, '');
      setStatus($('userActionStatus'), '✅ Achievements cleared.', 'ok');
      loadAuditLog();
    } catch (e) { setStatus($('userActionStatus'), e.message, 'err'); }
  }
  async function resetRiddle() {
    if (!selectedUid) return;
    const ok = await confirmAction({ title: 'Reset riddle progress', confirmLabel: 'Reset',
      message: 'Reset daily-riddle progress for “' + $('udName').textContent + '”? They can answer today again.' });
    if (!ok) return;
    try {
      const del = firebase.firestore.FieldValue.delete();
      await roomsRef.doc(selectedUid).update({ riddleLastSolvedDay: del, riddleLastRevealedDay: del });
      writeLog('reset_riddle', selectedUid, $('udName').textContent, '');
      setStatus($('userActionStatus'), '✅ Riddle progress reset.', 'ok');
      loadAuditLog();
    } catch (e) { setStatus($('userActionStatus'), e.message, 'err'); }
  }

  async function runSearch() {
    const q = $('userQuery').value.trim();
    if (!q) return;
    setStatus($('userSearchStatus'), 'Searching…');
    $('userResults').innerHTML = '';
    try {
      const found = new Map();
      const snap = await roomsRef.where('displayName', '==', q).limit(10).get();
      snap.forEach(d => found.set(d.id, d.data()));
      if (q.length >= 16 && q.indexOf(' ') === -1) {
        const d = await roomsRef.doc(q).get();
        if (d.exists) found.set(d.id, d.data());
      }
      if (!found.size) { setStatus($('userSearchStatus'), 'No user found.', 'err'); return; }
      setStatus($('userSearchStatus'), found.size + ' result(s).', 'ok');
      found.forEach((data, uid) => {
        const div = document.createElement('div');
        div.className = 'item';
        div.style.cursor = 'pointer';
        div.innerHTML = '<strong>' + esc(data.displayName || '(no name)') + '</strong>' +
          ' <span class="chip">💰 ' + (data.coins || 0) + '</span>' +
          '<div class="meta">' + esc(uid) + '</div>';
        div.addEventListener('click', () => openUser(uid));
        $('userResults').appendChild(div);
      });
    } catch (e) { setStatus($('userSearchStatus'), e.message, 'err'); }
  }

  async function openUser(uid) {
    setStatus($('userActionStatus'), '');
    try {
      const [roomSnap, banSnap] = await Promise.all([
        roomsRef.doc(uid).get(),
        db.collection('banned').doc(uid).get()
      ]);
      if (!roomSnap.exists) return setStatus($('userSearchStatus'), 'User no longer exists.', 'err');
      const d = roomSnap.data();
      selectedUid = uid;
      selectedBanned = banSnap.exists;
      $('userDetail').classList.remove('hidden');
      $('udName').textContent = d.displayName || '(no name)';
      $('udUid').textContent = uid;
      $('udCoins').textContent = d.coins || 0;
      $('nameEdit').value = d.displayName || '';
      $('coinAmt').value = '';
      const pets = Array.isArray(d.pets) ? d.pets.length : 0;
      $('udProfile').innerHTML =
        '<span class="k">Coins</span><span>' + (d.coins || 0) + '</span>' +
        '<span class="k">Pets</span><span>' + pets + '</span>' +
        '<span class="k">Login streak</span><span>' + (d.loginStreak || 0) + '</span>' +
        '<span class="k">Last seen</span><span>' + fmtDate(d.lastSeen) + '</span>' +
        '<span class="k">Status</span><span>' + (selectedBanned ? '<span class="chip bad">⛔ Banned</span>' : '<span class="chip good">Active</span>') + '</span>';
      renderBanBtn();
      $('userDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { setStatus($('userActionStatus'), e.message, 'err'); }
  }

  function renderBanBtn() { $('banBtn').textContent = selectedBanned ? 'Unban user' : 'Ban user'; }

  async function adjustCoins(mode) {
    if (!selectedUid) return;
    const amt = parseInt($('coinAmt').value, 10);
    if (isNaN(amt)) return setStatus($('userActionStatus'), '⚠️ Enter a number.', 'err');
    try {
      const snap = await roomsRef.doc(selectedUid).get();
      const cur = (snap.exists && snap.data().coins) || 0;
      let next = mode === 'grant' ? cur + amt : mode === 'deduct' ? cur - amt : amt;
      if (next < 0) next = 0;
      await roomsRef.doc(selectedUid).update({ coins: next });
      $('udCoins').textContent = next;
      writeLog('coins', selectedUid, $('udName').textContent, mode + ': ' + cur + ' → ' + next);
      setStatus($('userActionStatus'), '✅ Coins: ' + cur + ' → ' + next, 'ok');
      loadAuditLog();
    } catch (e) { setStatus($('userActionStatus'), e.message, 'err'); }
  }

  async function renameUser() {
    if (!selectedUid) return;
    const name = $('nameEdit').value.trim();
    if (!name) return setStatus($('userActionStatus'), '⚠️ Name cannot be empty.', 'err');
    try {
      const old = $('udName').textContent;
      await roomsRef.doc(selectedUid).update({ displayName: name });
      $('udName').textContent = name;
      writeLog('rename', selectedUid, name, '"' + old + '" → "' + name + '"');
      setStatus($('userActionStatus'), '✅ Renamed.', 'ok');
      loadAuditLog();
    } catch (e) { setStatus($('userActionStatus'), e.message, 'err'); }
  }

  async function toggleBan() {
    if (!selectedUid) return;
    const name = $('udName').textContent;
    const banDoc = db.collection('banned').doc(selectedUid);
    try {
      if (selectedBanned) {
        const ok = await confirmAction({ title: 'Unban user', danger: false, confirmLabel: 'Unban',
          message: 'Unban “' + name + '”? They will be able to use the site again.' });
        if (!ok) return;
        await banDoc.delete();
        selectedBanned = false;
        writeLog('unban', selectedUid, name, '');
        setStatus($('userActionStatus'), '✅ User unbanned.', 'ok');
      } else {
        const ok = await confirmAction({ title: 'Ban user', confirmLabel: 'Ban user',
          message: 'Ban “' + name + '”? They will be blocked from the site and can no longer earn coins.' });
        if (!ok) return;
        await banDoc.set({ by: auth.currentUser.uid, at: Date.now() });
        selectedBanned = true;
        writeLog('ban', selectedUid, name, '');
        setStatus($('userActionStatus'), '⛔ User banned.', 'ok');
      }
      renderBanBtn();
      openUser(selectedUid);  // refresh status row
      loadAuditLog();
    } catch (e) { setStatus($('userActionStatus'), e.message, 'err'); }
  }

  async function resetAccount() {
    if (!selectedUid) return;
    const name = $('udName').textContent;
    const ok = await confirmAction({
      title: 'Reset account',
      message: 'This WIPES the account (coins, pets, rooms, decor) but keeps the name. This cannot be undone.',
      confirmLabel: 'Reset account',
      requireText: name        // must type the user's name to enable the button
    });
    if (!ok) return;
    try {
      // Overwrite (no merge) → clean slate, identity kept.
      await roomsRef.doc(selectedUid).set({ displayName: name, coins: 0, lastSeen: Date.now() });
      writeLog('reset', selectedUid, name, 'account wiped');
      setStatus($('userActionStatus'), '✅ Account reset to a clean slate.', 'ok');
      openUser(selectedUid);
      loadAuditLog();
    } catch (e) { setStatus($('userActionStatus'), e.message, 'err'); }
  }

  function loadAuditLog() {
    db.collection('admin_log').orderBy('ts', 'desc').limit(20).get().then(snap => {
      if (snap.empty) { $('auditLog').innerHTML = '<div class="muted">No actions yet.</div>'; return; }
      let html = '';
      snap.forEach(doc => {
        const a = doc.data();
        html += '<div class="item"><strong>' + esc(a.action) + '</strong>' +
          (a.targetName ? ' → ' + esc(a.targetName) : '') +
          (a.detail ? ' <span class="muted">(' + esc(a.detail) + ')</span>' : '') +
          '<div class="meta">' + esc(a.byName || a.byUid || '?') + ' · ' + fmtDate(a.ts) + '</div></div>';
      });
      $('auditLog').innerHTML = html;
    }).catch(e => { $('auditLog').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  // ── Access-code wrong attempts (from the post-login gate) ──
  // Only fetches OFFENDERS (failedCount > 0) so verified users don't bloat the
  // read. Single-field index (auto) — no composite index needed.
  function loadAccessAttempts() {
    const box = $('accessAttemptsList');
    box.innerHTML = '<div class="muted">Loading…</div>';
    db.collection('access_attempts')
      .where('failedCount', '>', 0)
      .orderBy('failedCount', 'desc')
      .limit(100).get()
      .then(snap => {
        if (snap.empty) { box.innerHTML = '<div class="muted">No wrong attempts. 🎉</div>'; return; }
        let html = '';
        snap.forEach(doc => {
          const a = doc.data();
          const name = a.displayName || a.email || doc.id;
          // The actual wrong strings they typed — useful for spotting typos vs. probing.
          const tried = Array.isArray(a.wrongCodes)
            ? a.wrongCodes.map(w => esc(w.code)).join(', ') : '';
          const lastAt = Array.isArray(a.wrongCodes) && a.wrongCodes.length
            ? a.wrongCodes[a.wrongCodes.length - 1].at : a.updatedAt;
          const lockedTag = a.locked
            ? ' <span class="badge" style="color:#fca5a5">LOCKED</span>' : '';
          html += '<div class="item"><strong>' + esc(name) + '</strong>' + lockedTag +
            ' <span class="muted">· ' + (a.failedCount || 0) + '/3 wrong</span>' +
            (a.email ? '<div class="meta">' + esc(a.email) + '</div>' : '') +
            (tried ? '<div class="meta">tried: ' + tried + '</div>' : '') +
            '<div class="meta">' + fmtDate(lastAt) + '</div>' +
            '<div class="row" style="margin-top:8px"><button class="btn" data-unlock="' + esc(doc.id) +
              '">Unlock / reset</button></div></div>';
        });
        box.innerHTML = html;
        box.querySelectorAll('[data-unlock]').forEach(b =>
          b.addEventListener('click', () => unlockAccess(b.getAttribute('data-unlock'))));
      })
      .catch(e => { box.innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  // Clear a user's failed count + lock so they can try the gate again.
  function unlockAccess(uid) {
    db.collection('access_attempts').doc(uid)
      .set({ failedCount: 0, locked: false, wrongCodes: [], updatedAt: Date.now() }, { merge: true })
      .then(() => { writeLog('access_unlock', uid, null, 'reset attempts'); loadAccessAttempts(); loadAuditLog(); })
      .catch(e => alert('Unlock failed: ' + e.message));
  }

  /* ═══════════════ CONTENT TAB ═══════════════ */
  function loadContent() { loadEvents(); loadFood(); loadBubbles(); loadQuoteComments(); loadChengyu(); loadWorldNotes(); }

  // ── Pet World notice-board notes (Realtime Database, not Firestore) ──
  // Notes live at world/scenes/{scene}/{shard}/notes/{id} = {uid,name,text,x,y,ts}.
  // We read each scene's whole node (one allowed read: world/scenes/$scene is
  // ".read": auth) and flatten every shard's notes into one newest-first list.
  const WORLD_SCENE_LABELS = { pool: '🏊 Splash Pool', egypt: '🐫 Desert of Egypt', grassland: '🌿 Green Grassland' };
  function loadWorldNotes() {
    const box = $('worldNotesList'); if (!box) return;
    const rb = $('worldNotesRefresh');
    if (rb && !rb._bound) { rb._bound = true; rb.addEventListener('click', loadWorldNotes); }
    if (!rtdb) { box.innerHTML = '<div class="status err">Realtime Database SDK not loaded.</div>'; return; }
    box.innerHTML = '<div class="muted">Loading…</div>';
    const scenes = Object.keys(WORLD_SCENE_LABELS);
    Promise.all(scenes.map(scene =>
      rtdb.ref('world/scenes/' + scene).once('value')
        .then(snap => ({ scene, val: snap.val() || {} }))
        .catch(() => ({ scene, val: {} }))
    )).then(results => {
      const rows = [];
      results.forEach(({ scene, val }) => {
        Object.keys(val).forEach(shard => {
          const notes = (val[shard] && val[shard].notes) || {};
          Object.keys(notes).forEach(id => { if (notes[id]) rows.push({ scene, shard, id, n: notes[id] }); });
        });
      });
      rows.sort((a, b) => (b.n.ts || 0) - (a.n.ts || 0));
      if (!rows.length) { box.innerHTML = '<div class="muted">No notes on any board.</div>'; return; }
      box.innerHTML = '';
      rows.forEach(({ scene, shard, id, n }) => {
        const label = WORLD_SCENE_LABELS[scene] || scene;
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML =
          '<div class="row" style="justify-content:space-between;gap:10px">' +
            '<strong style="min-width:0;word-break:break-word">' + esc(n.text || '(empty)') + '</strong>' +
            '<button class="btn sm danger">Delete</button>' +
          '</div>' +
          '<div class="meta">— ' + esc(n.name || 'Pet') + ' · <span class="chip">' + esc(label) + '</span> shard ' + esc(shard) + ' · ' + fmtDate(n.ts) + '</div>';
        div.querySelector('button').addEventListener('click', async () => {
          const ok = await confirmAction({ title: 'Delete board note', confirmLabel: 'Delete',
            message: 'Delete “' + (n.text || 'this note') + '” from the ' + label + ' board? This removes it for everyone.' });
          if (!ok) return;
          try {
            await rtdb.ref('world/scenes/' + scene + '/' + shard + '/notes/' + id).remove();
            writeLog('world_note_delete', n.uid || null, n.name || null, (n.text || '').slice(0, 60));
            loadWorldNotes();
          } catch (e) {
            alert((e && e.message) || 'Delete failed — check the Realtime Database rules are published with the admin-delete clause.');
          }
        });
        box.appendChild(div);
      });
    }).catch(e => { box.innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  // YYYY-MM-DD for local "today" (matches the app's getTodayKey).
  function todayKey() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function recentDays(n) {
    const out = [], b = new Date(), p = x => String(x).padStart(2, '0');
    for (let i = 0; i < n; i++) { const d = new Date(b.getFullYear(), b.getMonth(), b.getDate() - i); out.push(d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())); }
    return out;
  }

  // ── Quote comments moderation (last 7 days) ──
  function loadQuoteComments() {
    const days = recentDays(7);
    Promise.all(days.map(d =>
      db.collection('quote_comments').doc(d).collection('comments').orderBy('createdAt', 'desc').get()
        .then(s => ({ d, s })).catch(() => ({ d, s: null }))
    )).then(results => {
      let html = '', any = false;
      results.forEach(({ d, s }) => {
        if (!s || s.empty) return;
        any = true;
        html += '<div class="meta" style="margin:10px 0 4px">' + d + '</div>';
        s.forEach(doc => {
          const c = doc.data();
          html += '<div class="item" data-date="' + d + '" data-id="' + doc.id + '">' +
            '<div class="row" style="justify-content:space-between;gap:10px"><strong>' + esc(c.displayName || '?') + '</strong><button class="btn sm danger" data-del>Delete</button></div>' +
            '<div style="margin:6px 0;word-break:break-word">' + esc(c.text) + '</div>' +
            '<div class="meta">' + fmtDate(c.createdAt) + '</div></div>';
        });
      });
      $('commentList').innerHTML = any ? html : '<div class="muted">No comments in the last 7 days.</div>';
      $('commentList').querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
        const item = btn.closest('[data-id]'), date = item.dataset.date, id = item.dataset.id;
        const ok = await confirmAction({ title: 'Delete comment', confirmLabel: 'Delete', message: 'Delete this comment? This cannot be undone.' });
        if (!ok) return;
        try { await db.collection('quote_comments').doc(date).collection('comments').doc(id).delete(); writeLog('comment_delete', null, null, date); loadQuoteComments(); }
        catch (e) { alert(e.message); }
      }));
    }).catch(e => { $('commentList').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  // ── 成语接龙 chain cleanup (today) ──
  function loadChengyu() {
    const day = todayKey();
    db.collection('chengyu_chain').doc(day).get().then(snap => {
      if (!snap.exists) { $('chengyuBox').innerHTML = '<div class="muted">No chain today (' + day + ').</div>'; return; }
      const d = snap.data();
      const links = Array.isArray(d.links) ? d.links : [];
      const wrong = Array.isArray(d.wrong) ? d.wrong : [];
      const linksHtml = links.map((l, i) =>
        '<div class="item"><div class="row" style="justify-content:space-between"><div><span class="chip">#' + (i + 1) + '</span> <strong>' + esc(l.w) + '</strong> <span class="muted">' + esc(l.name || '?') + '</span></div>' +
        (i > 0 ? '<button class="btn sm danger" data-rm="' + i + '">Remove</button>' : '<span class="chip">seed</span>') + '</div></div>'
      ).join('');
      let html = '<div class="meta" style="margin-bottom:10px">Seed <strong>' + esc(d.seed || (links[0] && links[0].w) || '?') + '</strong> · ' + links.length + ' links · ' + wrong.length + ' wrong</div>';
      html += '<button class="collapse-toggle" id="chToggle" aria-expanded="false"><svg class="chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>Chain links (' + links.length + ')</button>';
      html += '<div id="chLinks" class="list hidden" style="margin-top:8px">' + linksHtml + '</div>';
      html += '<div class="row" style="margin-top:12px"><button class="btn sm" id="chWrong">Clear wrong attempts (' + wrong.length + ')</button><button class="btn sm danger" id="chReset">Reset day</button></div>';
      html += '<div class="status" id="chStatus"></div>';
      $('chengyuBox').innerHTML = html;

      $('chToggle').addEventListener('click', () => {
        const open = $('chToggle').classList.toggle('open');
        $('chLinks').classList.toggle('hidden', !open);
        $('chToggle').setAttribute('aria-expanded', open);
      });

      const ref = db.collection('chengyu_chain').doc(day);
      $('chengyuBox').querySelectorAll('[data-rm]').forEach(btn => btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.rm, 10);
        const ok = await confirmAction({ title: 'Trim chain', confirmLabel: 'Remove', message: 'Remove “' + links[idx].w + '” and every link after it? (Removing a middle link would break the chain.)' });
        if (!ok) return;
        try { await ref.update({ links: links.slice(0, idx) }); writeLog('chengyu_trim', null, null, day + ' → ' + idx + ' links'); loadChengyu(); }
        catch (e) { setStatus($('chStatus'), e.message, 'err'); }
      }));
      $('chWrong').addEventListener('click', async () => {
        const ok = await confirmAction({ title: 'Clear wrong attempts', danger: false, confirmLabel: 'Clear', message: 'Clear the wrong-attempt history for ' + day + '?' });
        if (!ok) return;
        try { await ref.update({ wrong: [] }); writeLog('chengyu_clearwrong', null, null, day); loadChengyu(); }
        catch (e) { setStatus($('chStatus'), e.message, 'err'); }
      });
      $('chReset').addEventListener('click', async () => {
        const ok = await confirmAction({ title: 'Reset chain', confirmLabel: 'Reset', requireText: day, message: 'Delete today’s (' + day + ') idiom chain entirely? It will reseed for users.' });
        if (!ok) return;
        try { await ref.delete(); writeLog('chengyu_reset', null, null, day); loadChengyu(); }
        catch (e) { setStatus($('chStatus'), e.message, 'err'); }
      });
    }).catch(e => { $('chengyuBox').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  // ── Food suggestions moderation ──
  function loadFood() {
    db.collection('food_suggestions').orderBy('ts', 'desc').limit(50).get().then(snap => {
      if (snap.empty) { $('foodList').innerHTML = '<div class="muted">No suggestions.</div>'; return; }
      $('foodList').innerHTML = '';
      snap.forEach(doc => {
        const f = doc.data();
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML =
          '<div class="row" style="justify-content:space-between;gap:10px">' +
            '<strong style="min-width:0;word-break:break-word">' + esc(f.text) + '</strong>' +
            '<button class="btn sm danger">Delete</button>' +
          '</div>' +
          '<div class="meta">👍 ' + (f.votes || 0) + ' · ' + fmtDate(f.ts) + (f.removed ? ' · <span class="chip warn">removed from spin</span>' : '') + '</div>';
        div.querySelector('button').addEventListener('click', async () => {
          const ok = await confirmAction({ title: 'Delete suggestion', confirmLabel: 'Delete',
            message: 'Delete “' + (f.text || 'this item') + '”? This cannot be undone.' });
          if (!ok) return;
          try { await db.collection('food_suggestions').doc(doc.id).delete(); writeLog('food_delete', null, null, (f.text || '').slice(0, 60)); loadFood(); }
          catch (e) { alert(e.message); }
        });
        $('foodList').appendChild(div);
      });
    }).catch(e => { $('foodList').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  function loadEvents() {
    db.collection('events').orderBy('createdAt', 'desc').limit(50).get().then(snap => {
      if (snap.empty) { $('eventsList').innerHTML = '<div class="muted">No events.</div>'; return; }
      $('eventsList').innerHTML = '';
      snap.forEach(doc => {
        const e = doc.data();
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML =
          '<div class="row" style="justify-content:space-between">' +
            '<strong>' + esc(e.title) + '</strong>' +
            '<button class="btn sm danger">Delete</button>' +
          '</div>' +
          '<div class="meta">by ' + esc(e.displayName || '?') + ' · event ' + fmtDate(e.eventAt) + '</div>';
        div.querySelector('button').addEventListener('click', async () => {
          const ok = await confirmAction({ title: 'Delete event', confirmLabel: 'Delete',
            message: 'Delete “' + (e.title || 'this event') + '”? This cannot be undone.' });
          if (!ok) return;
          try { await db.collection('events').doc(doc.id).delete(); writeLog('event_delete', null, null, (e.title || '').slice(0, 60)); loadEvents(); }
          catch (err) { alert(err.message); }
        });
        $('eventsList').appendChild(div);
      });
    }).catch(e => { $('eventsList').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  // ── Bubble board ──
  function loadBubbles() {
    db.collection('answers').orderBy('ts', 'desc').limit(50).get().then(snap => {
      if (snap.empty) { $('bubbleList').innerHTML = '<div class="muted">No bubbles.</div>'; return; }
      $('bubbleList').innerHTML = '';
      snap.forEach(doc => $('bubbleList').appendChild(bubbleItem(doc.id, doc.data())));
    }).catch(e => { $('bubbleList').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }

  function bubbleItem(id, b) {
    const sender = b.name ? '<span class="chip">' + esc(b.name) + '</span>'
                          : '<span class="chip warn">Anonymous</span>';
    let content;
    if (b.type === 'poll') content = '📊 <strong>Poll:</strong> ' + esc(b.text || '') + ' <span class="muted">(' + ((b.pollOptions || []).length) + ' options)</span>';
    else if (b.text) content = esc(b.text);
    else if (b.image) content = '<span class="muted">🖼️ image only</span>';
    else content = '<span class="muted">(empty)</span>';
    const replies = Array.isArray(b.replies) ? b.replies.length : 0;

    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML =
      '<div class="row" style="justify-content:space-between;gap:10px">' +
        '<div style="min-width:0">' + sender + (b.image ? ' <span class="chip">🖼️</span>' : '') + '</div>' +
        '<button class="btn sm danger">Delete</button>' +
      '</div>' +
      '<div style="margin:8px 0;word-break:break-word">' + content + '</div>' +
      '<div class="meta">' + fmtDate(b.ts) + (replies ? ' · 💬 ' + replies + ' repl' + (replies > 1 ? 'ies' : 'y') : '') + '</div>';

    div.querySelector('button').addEventListener('click', async () => {
      const ok = await confirmAction({ title: 'Delete bubble', confirmLabel: 'Delete',
        message: 'Delete this bubble' + (b.name ? ' from “' + b.name + '”' : '') + '? This cannot be undone.' });
      if (!ok) return;
      try {
        await db.collection('answers').doc(id).delete();
        writeLog('bubble_delete', null, b.name || 'Anonymous', (b.text || '').slice(0, 60));
        loadBubbles();
      } catch (e) { alert(e.message); }
    });
    return div;
  }

  /* ═══════════════ STATS TAB ═══════════════ */
  function initStatsOnce() { if (!$('statsRefresh')._bound) { $('statsRefresh')._bound = true; $('statsRefresh').addEventListener('click', loadStats); } }

  // Count docs in a collection. Uses the cheap count() aggregation when the SDK
  // supports it; otherwise falls back to a plain read (.size) — the compat build
  // doesn't always expose aggregation, so this keeps stats working either way.
  async function countDocs(query) {
    try {
      if (typeof query.count === 'function') {
        const c = await query.count().get();
        if (c && typeof c.data().count === 'number') return c.data().count;
      }
    } catch (e) { /* fall through to a normal read */ }
    return (await query.get()).size;
  }

  async function loadStats() {
    initStatsOnce();
    setStatus($('statsStatus'), 'Loading…');

    // Online now — small collection, read & count client-side by recency.
    try {
      const ps = await db.collection('board_presence').get();
      const now = Date.now();
      let online = 0;
      ps.forEach(d => { if ((now - (d.data().lastSeen || 0)) < PRESENCE_TTL_MS) online++; });
      $('statOnline').textContent = online;
    } catch (e) { $('statOnline').textContent = '—'; }

    // Banned users
    try { $('statBanned').textContent = await countDocs(db.collection('banned')); }
    catch (e) { $('statBanned').textContent = '—'; }

    // Total users + coins in economy.
    // sum() aggregation isn't in the compat SDK, so to get total coins we read the
    // rooms collection once and compute BOTH numbers from that single pass.
    try {
      const AF = firebase.firestore.AggregateField;
      if (AF && AF.sum && typeof roomsRef.aggregate === 'function') {
        const [users, sum] = await Promise.all([
          countDocs(roomsRef),
          roomsRef.aggregate({ total: AF.sum('coins') }).get()
        ]);
        $('statUsers').textContent = users;
        $('statCoins').textContent = Number(sum.data().total || 0).toLocaleString();
      } else {
        const rooms = await getRooms(true);   // one read → fills cache for the drill-downs
        let coins = 0;
        rooms.forEach(r => { coins += (r.coins || 0); });
        $('statUsers').textContent = rooms.length;
        $('statCoins').textContent = coins.toLocaleString();
      }
    } catch (e) {
      $('statUsers').textContent = '—';
      $('statCoins').textContent = '—';
      setStatus($('statsStatus'), 'Stats error: ' + e.message, 'err');
      return;
    }

    setStatus($('statsStatus'), 'Updated ' + fmtDate(Date.now()), 'ok');
  }

  /* ── Stat drill-down modal ── */
  let _roomsCache = null;
  // All rooms as [{uid, ...data}]. Cached so repeated drill-downs don't re-read.
  async function getRooms(force) {
    if (_roomsCache && !force) return _roomsCache;
    const snap = await roomsRef.get();
    _roomsCache = [];
    snap.forEach(d => _roomsCache.push(Object.assign({ uid: d.id }, d.data())));
    return _roomsCache;
  }

  // A clickable user row → opens that user in the Users tab.
  function rowUser(uid, name, right) {
    return '<div class="item tap" data-uid="' + esc(uid) + '">' +
      '<div class="row" style="justify-content:space-between">' +
        '<strong>' + esc(name || '(no name)') + '</strong>' + (right || '') +
      '</div>' +
      '<div class="meta">' + esc(uid) + '</div></div>';
  }
  function wireUserRows(container) {
    container.querySelectorAll('.item[data-uid]').forEach(el =>
      el.addEventListener('click', () => openUserFromModal(el.dataset.uid)));
  }
  function openUserFromModal(uid) {
    closeStatModal();
    const tab = document.querySelector('.tab[data-tab="users"]');
    if (tab) tab.click();
    openUser(uid);
  }

  async function renderOnline(body) {
    const [ps, rooms] = await Promise.all([db.collection('board_presence').get(), getRooms()]);
    const nameBy = {}; rooms.forEach(r => nameBy[r.uid] = r.displayName);
    const now = Date.now(); const online = [];
    ps.forEach(d => { const x = d.data(); if ((now - (x.lastSeen || 0)) < PRESENCE_TTL_MS) online.push({ uid: d.id, lastSeen: x.lastSeen }); });
    online.sort((a, b) => b.lastSeen - a.lastSeen);
    if (!online.length) { body.innerHTML = '<div class="muted">No one online right now.</div>'; return; }
    body.innerHTML = online.map(o => rowUser(o.uid, nameBy[o.uid], '<span class="chip good">● online</span>')).join('');
    wireUserRows(body);
  }

  async function renderUsers(body) {
    const rooms = (await getRooms()).slice().sort((a, b) => (b.coins || 0) - (a.coins || 0));
    const cap = rooms.slice(0, 100);
    body.innerHTML = '<div class="muted" style="margin-bottom:10px">' + rooms.length + ' total' +
      (rooms.length > 100 ? ' · showing top 100 by coins' : '') + '</div>' +
      cap.map(r => rowUser(r.uid, r.displayName, '<span class="chip">💰 ' + (r.coins || 0) + '</span>')).join('');
    wireUserRows(body);
  }

  async function renderCoins(body) {
    const rooms = await getRooms();
    const total = rooms.reduce((s, r) => s + (r.coins || 0), 0);
    const avg = rooms.length ? Math.round(total / rooms.length) : 0;
    const top = rooms.slice().sort((a, b) => (b.coins || 0) - (a.coins || 0)).slice(0, 10);
    body.innerHTML =
      '<div class="modal-sum">' +
        '<div class="b"><div class="n">' + total.toLocaleString() + '</div><div class="l">Total coins</div></div>' +
        '<div class="b"><div class="n">' + avg.toLocaleString() + '</div><div class="l">Avg / user</div></div>' +
        '<div class="b"><div class="n">' + rooms.length + '</div><div class="l">Users</div></div>' +
      '</div>' +
      '<div class="muted" style="margin-bottom:8px">Top holders</div>' +
      top.map(r => rowUser(r.uid, r.displayName, '<span class="chip warn">💰 ' + (r.coins || 0) + '</span>')).join('');
    wireUserRows(body);
  }

  async function renderBanned(body) {
    const [bs, rooms] = await Promise.all([db.collection('banned').get(), getRooms()]);
    const nameBy = {}; rooms.forEach(r => nameBy[r.uid] = r.displayName);
    const banned = []; bs.forEach(d => banned.push(Object.assign({ uid: d.id }, d.data())));
    if (!banned.length) { body.innerHTML = '<div class="muted">No banned users.</div>'; return; }
    body.innerHTML = banned.map(b =>
      '<div class="item tap" data-uid="' + esc(b.uid) + '">' +
        '<div class="row" style="justify-content:space-between">' +
          '<strong>' + esc(nameBy[b.uid] || '(no name)') + '</strong>' +
          '<button class="btn sm danger" data-unban="' + esc(b.uid) + '">Unban</button>' +
        '</div>' +
        '<div class="meta">' + esc(b.uid) + (b.at ? ' · banned ' + fmtDate(b.at) : '') + '</div></div>'
    ).join('');
    body.querySelectorAll('[data-unban]').forEach(btn => btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const uid = btn.dataset.unban;
      const ok = await confirmAction({ title: 'Unban user', danger: false, confirmLabel: 'Unban',
        message: 'Unban “' + (nameBy[uid] || uid) + '”?' });
      if (!ok) return;
      try {
        await db.collection('banned').doc(uid).delete();
        writeLog('unban', uid, nameBy[uid] || null, 'via stats');
        openStatModal('banned');
        loadStats();
      } catch (e) { alert(e.message); }
    }));
    body.querySelectorAll('.item[data-uid]').forEach(el =>
      el.addEventListener('click', () => openUserFromModal(el.dataset.uid)));
  }

  const STAT_DETAIL = { online: renderOnline, users: renderUsers, coins: renderCoins, banned: renderBanned };
  const STAT_TITLE  = { online: 'Online now', users: 'All users', coins: 'Coin economy', banned: 'Banned users' };
  let _lastFocus = null;

  function openStatModal(metric) {
    const body = $('statModalBody');
    $('statModalTitle').textContent = STAT_TITLE[metric] || 'Details';
    body.innerHTML = '<div class="muted">Loading…</div>';
    _lastFocus = document.activeElement;
    $('statModal').classList.remove('hidden');
    $('statModalClose').focus();
    const render = STAT_DETAIL[metric];
    if (render) render(body).catch(e => { body.innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; });
  }
  function closeStatModal() {
    $('statModal').classList.add('hidden');
    if (_lastFocus && _lastFocus.focus) _lastFocus.focus();
  }

  let _statCardsBound = false;
  function bindStatCards() {
    if (_statCardsBound) return;
    _statCardsBound = true;
    document.querySelectorAll('.stat.clickable').forEach(card => {
      const open = () => openStatModal(card.dataset.metric);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    $('statModalClose').addEventListener('click', closeStatModal);
    $('statModal').addEventListener('click', e => { if (e.target === $('statModal')) closeStatModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('statModal').classList.contains('hidden')
          && $('confirmModal').classList.contains('hidden')) closeStatModal();
    });
  }

  /* ═══════════════ ECONOMY TAB ═══════════════ */
  // Mirrors the hardcoded defaults in coin-spend-logic.js (odds shown as %).
  const ECON_DEFAULTS = {
    gacha: { pullCost: 800, tenCost: 7200, dupRefund: 100, odds: { SSR: 2, SR: 8, R: 30, N: 60 } },
    slot: { bets: [50, 100, 500], twoCherry: 2 },
    fortune: { cost: 500 }
  };
  const econRef = db.doc('app_state/economy');
  let _econBound = false;

  function loadEconomy() {
    if (!_econBound) { _econBound = true; bindEconomy(); }
    econRef.get().then(s => {
      const c = s.exists ? s.data() : {};
      const g = c.gacha || {}, sl = c.slot || {}, ft = c.fortune || {}, D = ECON_DEFAULTS;
      $('ecGachaPull').value = g.pullCost ?? D.gacha.pullCost;
      $('ecGachaTen').value = g.tenCost ?? D.gacha.tenCost;
      $('ecGachaDup').value = g.dupRefund ?? D.gacha.dupRefund;
      const od = g.odds || {};
      $('ecOddsSSR').value = od.SSR != null ? +(od.SSR * 100).toFixed(2) : D.gacha.odds.SSR;
      $('ecOddsSR').value = od.SR != null ? +(od.SR * 100).toFixed(2) : D.gacha.odds.SR;
      $('ecOddsR').value = od.R != null ? +(od.R * 100).toFixed(2) : D.gacha.odds.R;
      $('ecOddsN').value = od.N != null ? +(od.N * 100).toFixed(2) : D.gacha.odds.N;
      const bets = Array.isArray(sl.bets) ? sl.bets : D.slot.bets;
      $('ecSlotBet1').value = bets[0] ?? D.slot.bets[0];
      $('ecSlotBet2').value = bets[1] ?? D.slot.bets[1];
      $('ecSlotBet3').value = bets[2] ?? D.slot.bets[2];
      $('ecSlotCherry').value = sl.twoCherry ?? D.slot.twoCherry;
      $('ecFortuneCost').value = ft.cost ?? D.fortune.cost;
    }).catch(e => setStatus($('ecGachaStatus'), e.message, 'err'));
  }

  function bindEconomy() {
    $('ecGachaSave').addEventListener('click', () => {
      const pull = parseInt($('ecGachaPull').value, 10), ten = parseInt($('ecGachaTen').value, 10), dup = parseInt($('ecGachaDup').value, 10);
      const ssr = parseFloat($('ecOddsSSR').value), sr = parseFloat($('ecOddsSR').value), r = parseFloat($('ecOddsR').value), n = parseFloat($('ecOddsN').value);
      if ([pull, ten, dup, ssr, sr, r, n].some(x => isNaN(x) || x < 0)) return setStatus($('ecGachaStatus'), '⚠️ All fields must be numbers ≥ 0.', 'err');
      const sum = ssr + sr + r + n;
      if (Math.abs(sum - 100) > 0.01) return setStatus($('ecGachaStatus'), '⚠️ Odds must total 100% (now ' + sum + '%).', 'err');
      econRef.set({ gacha: { pullCost: pull, tenCost: ten, dupRefund: dup, odds: { SSR: ssr / 100, SR: sr / 100, R: r / 100, N: n / 100 } } }, { merge: true })
        .then(() => { setStatus($('ecGachaStatus'), '✅ Saved. Applies on users’ next load.', 'ok'); writeLog('economy_gacha', null, null, 'pull ' + pull + ', odds ' + ssr + '/' + sr + '/' + r + '/' + n); })
        .catch(e => setStatus($('ecGachaStatus'), e.message, 'err'));
    });
    $('ecSlotSave').addEventListener('click', () => {
      const b = [parseInt($('ecSlotBet1').value, 10), parseInt($('ecSlotBet2').value, 10), parseInt($('ecSlotBet3').value, 10)];
      const cherry = parseInt($('ecSlotCherry').value, 10);
      if (b.some(x => isNaN(x) || x <= 0) || isNaN(cherry) || cherry < 0) return setStatus($('ecSlotStatus'), '⚠️ Enter valid numbers.', 'err');
      econRef.set({ slot: { bets: b, twoCherry: cherry } }, { merge: true })
        .then(() => { setStatus($('ecSlotStatus'), '✅ Saved. Applies on users’ next load.', 'ok'); writeLog('economy_slot', null, null, b.join('/') + ' ×' + cherry); })
        .catch(e => setStatus($('ecSlotStatus'), e.message, 'err'));
    });
    $('ecFortuneSave').addEventListener('click', () => {
      const cost = parseInt($('ecFortuneCost').value, 10);
      if (isNaN(cost) || cost < 0) return setStatus($('ecFortuneStatus'), '⚠️ Enter a valid cost.', 'err');
      econRef.set({ fortune: { cost } }, { merge: true })
        .then(() => { setStatus($('ecFortuneStatus'), '✅ Saved. Applies on users’ next load.', 'ok'); writeLog('economy_fortune', null, null, String(cost)); })
        .catch(e => setStatus($('ecFortuneStatus'), e.message, 'err'));
    });
  }

  /* ═══════════════ GAMES TAB ═══════════════ */
  // Delete every doc in an array of refs, in batches (Firestore caps a batch at 500).
  async function deleteRefs(refs) {
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach(r => batch.delete(r));
      await batch.commit();
    }
  }

  let _gamesBound = false;
  function loadGames() {
    if (!_gamesBound) {
      _gamesBound = true;
      $('lbLoad').addEventListener('click', loadLeaderboard);
      $('lbGame').addEventListener('change', loadLeaderboard);
      $('lbReset').addEventListener('click', resetLeaderboard);
      $('crLoad').addEventListener('click', loadCoinRush);
      $('crReset').addEventListener('click', resetCoinRush);
    }
    loadLeaderboard();
    loadCoinRush();
  }
  const gameLabel = () => $('lbGame').options[$('lbGame').selectedIndex].text;

  function loadLeaderboard() {
    const col = $('lbGame').value;
    setStatus($('lbStatus'), 'Loading…');
    db.collection(col).orderBy('score', 'desc').limit(50).get().then(snap => {
      if (snap.empty) { $('lbList').innerHTML = '<div class="muted">No entries.</div>'; setStatus($('lbStatus'), ''); return; }
      setStatus($('lbStatus'), snap.size + ' entries (top 50).');
      $('lbList').innerHTML = '';
      let rank = 0;
      snap.forEach(doc => {
        rank++;
        const e = doc.data();
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML =
          '<div class="row" style="justify-content:space-between;gap:10px">' +
            '<div style="min-width:0"><span class="chip">#' + rank + '</span> <strong>' + esc(e.name || doc.id) + '</strong></div>' +
            '<div class="row"><span class="chip warn">' + (e.score || 0) + '</span><button class="btn sm danger">Delete</button></div>' +
          '</div>' +
          '<div class="meta">' + esc(doc.id) + (e.ts ? ' · ' + fmtDate(e.ts) : '') + '</div>';
        div.querySelector('button').addEventListener('click', async () => {
          const ok = await confirmAction({ title: 'Delete entry', confirmLabel: 'Delete',
            message: 'Delete ' + (e.name || doc.id) + '’s score of ' + (e.score || 0) + '?' });
          if (!ok) return;
          try { await db.collection(col).doc(doc.id).delete(); writeLog('lb_delete', null, e.name || doc.id, col + ' = ' + (e.score || 0)); loadLeaderboard(); }
          catch (err) { alert(err.message); }
        });
        $('lbList').appendChild(div);
      });
    }).catch(e => { $('lbList').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; setStatus($('lbStatus'), ''); });
  }

  async function resetLeaderboard() {
    const col = $('lbGame').value, label = gameLabel();
    const ok = await confirmAction({ title: 'Reset leaderboard', confirmLabel: 'Reset board', requireText: label,
      message: 'This deletes EVERY entry on the ' + label + ' leaderboard. This cannot be undone.' });
    if (!ok) return;
    setStatus($('lbStatus'), 'Resetting…');
    try {
      const snap = await db.collection(col).get();
      const refs = []; snap.forEach(d => refs.push(d.ref));
      await deleteRefs(refs);
      writeLog('lb_reset', null, null, col + ' (' + refs.length + ' entries)');
      setStatus($('lbStatus'), '✅ Board reset (' + refs.length + ' removed).', 'ok');
      loadLeaderboard();
    } catch (e) { setStatus($('lbStatus'), e.message, 'err'); }
  }

  function loadCoinRush() {
    const day = todayKey();
    setStatus($('crStatus'), 'Loading ' + day + '…');
    db.collection('coin_rush').doc(day).collection('scores').orderBy('score', 'desc').limit(50).get().then(snap => {
      if (snap.empty) { $('crList').innerHTML = '<div class="muted">No scores today (' + day + ').</div>'; setStatus($('crStatus'), ''); return; }
      setStatus($('crStatus'), snap.size + ' players today (' + day + ').');
      $('crList').innerHTML = '';
      let rank = 0;
      snap.forEach(doc => {
        rank++;
        const e = doc.data();
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML =
          '<div class="row" style="justify-content:space-between"><div><span class="chip">#' + rank + '</span> ' + esc(e.name || doc.id) + '</div><span class="chip warn">' + (e.score || 0) + ' pops</span></div>' +
          '<div class="meta">' + esc(doc.id) + '</div>';
        $('crList').appendChild(div);
      });
    }).catch(e => { $('crList').innerHTML = '<div class="status err">' + esc(e.message) + '</div>'; setStatus($('crStatus'), ''); });
  }

  async function resetCoinRush() {
    const day = todayKey();
    const ok = await confirmAction({ title: 'Reset Coin Rush', confirmLabel: 'Reset today', requireText: day,
      message: 'This wipes today’s (' + day + ') Coin Rush scores and bonus claims. This cannot be undone.' });
    if (!ok) return;
    setStatus($('crStatus'), 'Resetting…');
    try {
      const [scores, claims] = await Promise.all([
        db.collection('coin_rush').doc(day).collection('scores').get(),
        db.collection('coin_rush').doc(day).collection('claims').get()
      ]);
      const refs = []; scores.forEach(d => refs.push(d.ref)); claims.forEach(d => refs.push(d.ref));
      await deleteRefs(refs);
      writeLog('coinrush_reset', null, null, day + ' (' + scores.size + ' scores, ' + claims.size + ' claims)');
      setStatus($('crStatus'), '✅ Coin Rush reset for ' + day + '.', 'ok');
      loadCoinRush();
    } catch (e) { setStatus($('crStatus'), e.message, 'err'); }
  }
})();
