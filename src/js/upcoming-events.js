/**
 * Upcoming Events (便利贴) — pinned sticky notes for upcoming team events.
 *
 * Firestore path: events/{autoId}
 *   { uid, displayName, title, eventAt (ms), createdAt (ms) }
 *
 * A note stays pinned on the board until 8 hours AFTER its eventAt, then it
 * auto-disappears (filtered out client-side; the owner's stale notes are also
 * best-effort deleted). When an upcoming event is within 1 day — or within
 * 1 hour — a full-page 8-bit pixel reminder pops once per threshold per event
 * (guarded by localStorage) and fades out after a few seconds.
 *
 * `db` and `auth` are globals (firebase-config + app.js). showToast() is global.
 */

// eslint-disable-next-line no-unused-vars
const UpcomingEvents = (() => {
  const MAX_TITLE = 300;
  const GRACE_MS = 8 * 60 * 60 * 1000;   // note lives 8h past its event time
  const DAY_MS   = 24 * 60 * 60 * 1000;
  const HOUR_MS  = 60 * 60 * 1000;
  const FADE_MS  = 6000;                  // reminder auto-fades after ~6s…
  const FADE_MAX = 12000;                 // …but longer titles get time to be read

  // Developer UIDs — may delete ANY event (mirror isDeveloper in firestore.rules)
  const DEV_UIDS = ['HClZmAeuEaUVjHqUaFLFFMTMQnd2', 'eUs3isAgsaRT9VLKEFI4HEFbCnk1'];

  let _unsub = null;
  let _events = [];          // active (non-expired) events, sorted by eventAt asc
  let _tick = null;
  let _reminderOpen = false;
  let _reminderTimer = null;

  function _ref() { return db.collection('events'); }
  function _now() { return Date.now(); }
  function _isActive(ev) { return _now() < ev.eventAt + GRACE_MS; }

  /* ── Formatting ─────────────────────────────────────────────── */

  /** "Jun 20, 6:00 PM" */
  function _fmtDate(ms) {
    return new Date(ms).toLocaleString([], {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  /** "in 2d 3h" / "in 5h 12m" / "in 42m" / live / started */
  function _fmtCountdown(eventAt) {
    const dt = eventAt - _now();
    if (dt <= 0) return (_now() - eventAt < HOUR_MS) ? T('🔴 happening now') : T('✅ started');
    const d = Math.floor(dt / DAY_MS);
    const h = Math.floor((dt % DAY_MS) / HOUR_MS);
    const m = Math.floor((dt % HOUR_MS) / 60000);
    if (d > 0) return T('in {d}d {h}h', { d: d, h: h });
    if (h > 0) return T('in {h}h {m}m', { h: h, m: m });
    return T('in {n}m', { n: Math.max(1, m) });
  }

  /** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
  function _localInput(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function _displayName() {
    const u = auth.currentUser;
    if (!u) return 'Someone';
    return localStorage.getItem('flappy_custom_name_' + u.uid) ||
      localStorage.getItem('flappy_name') || u.displayName || 'Someone';
  }

  /* ── Data ───────────────────────────────────────────────────── */

  function _subscribe() {
    if (_unsub) return;
    _unsub = _ref().orderBy('eventAt', 'asc').onSnapshot(snap => {
      const all = [];
      snap.forEach(doc => all.push({ id: doc.id, ...doc.data() }));
      _events = all.filter(_isActive);
      _render();
      _maybeRemind();
      _cleanup(all);
    }, err => console.error('Events listener error:', err));
  }

  /** Best-effort: delete the current user's OWN notes that are long expired. */
  function _cleanup(all) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    all.forEach(ev => {
      if (ev.uid === uid && _now() > ev.eventAt + GRACE_MS) {
        _ref().doc(ev.id).delete().catch(() => {});
      }
    });
  }

  async function _create() {
    const titleEl = document.getElementById('ueTitle');
    const whenEl = document.getElementById('ueWhen');
    const btn = document.getElementById('ueSaveBtn');
    if (!titleEl || !whenEl) return;

    const title = titleEl.value.trim();
    const when = whenEl.value;
    if (!title) { _toast(T('Add a title')); return; }
    if (!when) { _toast(T('Pick a date & time')); return; }
    const eventAt = new Date(when).getTime();
    if (isNaN(eventAt)) { _toast(T('Invalid date')); return; }
    if (!auth.currentUser) { _toast(T('Please sign in')); return; }

    if (btn) btn.disabled = true;
    try {
      await _ref().add({
        uid: auth.currentUser.uid,
        displayName: _displayName(),
        title: title.slice(0, MAX_TITLE),
        eventAt: eventAt,
        createdAt: _now()
      });
      titleEl.value = '';
      _toggleForm(false);
      _toast(T('📌 Event pinned!'));
    } catch (err) {
      console.error('Failed to pin event:', err);
      _toast(T('Failed to pin event'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function _delete(id) {
    try { await _ref().doc(id).delete(); }
    catch (err) { console.error('Delete event failed:', err); _toast(T('Delete failed')); }
  }

  /* ── Sticky-note rendering ──────────────────────────────────── */

  function _render() {
    const wrap = document.getElementById('ueNotes');
    if (!wrap) return;

    if (!_events.length) {
      wrap.innerHTML = '<div class="ue-empty">' + T('No upcoming events pinned yet.') + '</div>';
      return;
    }

    const uid = auth.currentUser?.uid;
    const isDev = uid && DEV_UIDS.indexOf(uid) !== -1;
    const frag = document.createDocumentFragment();

    _events.forEach(ev => {
      const note = document.createElement('div');
      note.className = 'ue-note';
      const soon = ev.eventAt - _now();
      if (soon > 0 && soon <= HOUR_MS) note.classList.add('soon');

      const pin = document.createElement('span');
      pin.className = 'ue-note-pin';
      pin.textContent = '📌';

      const title = document.createElement('div');
      title.className = 'ue-note-title';
      title.textContent = ev.title;            // textContent — user free text

      const when = document.createElement('div');
      when.className = 'ue-note-when';
      when.textContent = '🗓️ ' + _fmtDate(ev.eventAt);

      const cd = document.createElement('div');
      cd.className = 'ue-note-cd';
      cd.textContent = _fmtCountdown(ev.eventAt);

      const by = document.createElement('div');
      by.className = 'ue-note-by';
      by.textContent = '— ' + (ev.displayName || T('Someone'));

      note.appendChild(pin);
      note.appendChild(title);
      note.appendChild(when);
      note.appendChild(cd);
      note.appendChild(by);

      if (uid && (ev.uid === uid || isDev)) {
        const del = document.createElement('button');
        del.className = 'ue-note-del';
        del.title = T('Remove');
        del.textContent = '✕';
        del.addEventListener('click', () => _delete(ev.id));
        note.appendChild(del);
      }

      frag.appendChild(note);
    });

    wrap.innerHTML = '';
    wrap.appendChild(frag);
  }

  /* ── Full-page 8-bit reminder ───────────────────────────────── */

  function _maybeRemind() {
    if (_reminderOpen) return;
    const now = _now();
    const upcoming = _events
      .filter(e => e.eventAt > now)
      .sort((a, b) => a.eventAt - b.eventAt);

    for (const ev of upcoming) {
      const dt = ev.eventAt - now;
      if (dt <= HOUR_MS) { if (_seen(ev.id, '1h')) { _showReminder(ev, '1h'); return; } }
      else if (dt <= DAY_MS) { if (_seen(ev.id, '1d')) { _showReminder(ev, '1d'); return; } }
    }
  }

  /** Returns true the FIRST time a (event, threshold) is hit, then never again. */
  function _seen(id, tag) {
    const key = 'seen_event_' + tag + '_' + id;
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, '1');
    } catch (e) {}
    return true;
  }

  /**
   * The CSS sizes the reminder as large as the viewport's width/height allow —
   * right for a short title, but a long one still wraps past the bottom. Find
   * the LARGEST --ue-fit that still fits, so it only shrinks as much as it has
   * to (a plain ratio overshoots: shrinking also removes wrapped lines).
   * offsetHeight is the layout height, so the uePop scale animation on the box
   * doesn't skew the measurement.
   */
  function _fitReminder(ov) {
    const box = ov && ov.querySelector('.ue-reminder-box');
    if (!box) return;
    const cs = getComputedStyle(ov);
    const avail = ov.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!(avail > 0)) return;

    const fitsAt = v => {
      box.style.setProperty('--ue-fit', v);
      return box.offsetHeight <= avail;
    };
    if (fitsAt(1)) return;                  // full size already fits — done

    // Binary search in [MIN_FIT, 1]. Below MIN_FIT the text stops being a
    // reminder and starts being fine print; the overlay scrolls as a backstop.
    const MIN_FIT = 0.5;
    let lo = MIN_FIT, hi = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      if (fitsAt(mid)) lo = mid; else hi = mid;
    }
    // Land on a value that is verified to fit in the CURRENT layout, not just
    // one that fit at some point during the search.
    while (!fitsAt(lo) && lo > MIN_FIT) lo = Math.max(MIN_FIT, lo - 0.05);
  }

  function _showReminder(ev, tag) {
    const ov = document.getElementById('ueReminder');
    if (!ov) return;
    _reminderOpen = true;

    const when = document.getElementById('ueReminderWhen');
    const title = document.getElementById('ueReminderTitle');
    const time = document.getElementById('ueReminderTime');
    if (when) when.textContent = (tag === '1h') ? T('>> IN ABOUT 1 HOUR <<') : T('>> COMING UP IN 1 DAY <<');
    if (title) title.textContent = ev.title;
    if (time) time.textContent = (_fmtDate(ev.eventAt) + ' · ' + _fmtCountdown(ev.eventAt)).toUpperCase();

    ov.classList.remove('hidden');
    void ov.offsetWidth;          // reflow so the fade-in transition runs
    _fitReminder(ov);
    ov.classList.add('show');

    // The pixel webfont is much wider than the fallback — re-fit once it lands.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (_reminderOpen) _fitReminder(ov); });
    }

    clearTimeout(_reminderTimer);
    const hold = Math.min(FADE_MAX, FADE_MS + (ev.title || '').length * 45);
    _reminderTimer = setTimeout(_hideReminder, hold);
  }

  function _hideReminder() {
    const ov = document.getElementById('ueReminder');
    if (!ov) return;
    clearTimeout(_reminderTimer);
    ov.classList.remove('show');  // CSS transitions opacity → 0 (fade out)
    setTimeout(() => { ov.classList.add('hidden'); _reminderOpen = false; }, 600);
  }

  /* ── Create form toggle ─────────────────────────────────────── */

  function _toggleForm(open) {
    const form = document.getElementById('ueForm');
    if (!form) return;
    const show = (open === undefined) ? form.classList.contains('hidden') : open;
    form.classList.toggle('hidden', !show);
    if (show) {
      const whenEl = document.getElementById('ueWhen');
      const titleEl = document.getElementById('ueTitle');
      if (whenEl) {
        whenEl.min = _localInput(_now());
        if (!whenEl.value) whenEl.value = _localInput(_now() + DAY_MS);
      }
      if (titleEl) titleEl.focus();
    }
  }

  /* ── Misc ───────────────────────────────────────────────────── */

  function _toast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    console.warn(msg);
  }

  function _startTick() {
    if (_tick) return;
    _tick = setInterval(() => {
      _events = _events.filter(_isActive);
      _render();
      _maybeRemind();
    }, 60000);
  }

  function init() {
    const addBtn = document.getElementById('ueAddBtn');
    const saveBtn = document.getElementById('ueSaveBtn');
    const cancelBtn = document.getElementById('ueCancelBtn');
    const titleEl = document.getElementById('ueTitle');
    const ov = document.getElementById('ueReminder');

    if (addBtn) addBtn.addEventListener('click', () => _toggleForm());
    if (saveBtn) saveBtn.addEventListener('click', _create);
    if (cancelBtn) cancelBtn.addEventListener('click', () => _toggleForm(false));
    // Plain Enter adds a new line (it's a textarea); Ctrl/⌘+Enter posts.
    if (titleEl) titleEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _create(); }
    });
    if (ov) ov.addEventListener('click', _hideReminder);
    // Rotating the phone / resizing the window changes what fits.
    window.addEventListener('resize', () => { if (_reminderOpen) _fitReminder(ov); });
    // The notes are redrawn on the 60s tick, so without this the countdowns and
    // the empty state stay in the old language for up to a minute after a switch.
    window.addEventListener('langchange', () => _render());

    auth.onAuthStateChanged(user => { if (user) { _subscribe(); _startTick(); } });
  }

  return { init };
})();
