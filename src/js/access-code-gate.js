/**
 * access-code-gate.js — second-stage gate shown AFTER Google login.
 *
 * NEW ORDER (index.html): Google login FIRST, then the access code.
 *   1. app.js signs the user in with Google and reveals #appContent.
 *   2. This module (via its OWN auth observer) then checks whether THIS user
 *      has already cleared the access code. If not, it shows #accessGate on top
 *      of the app so nothing is usable until the correct code is entered.
 *   3. The user gets a limited number of tries (ACCESS_MAX_ATTEMPTS). Every
 *      WRONG code is recorded in Firestore at access_attempts/{uid} so the
 *      admin panel can see who is fat-fingering / brute-forcing. After the
 *      limit is reached the account is locked out of the gate.
 *
 * Because Google login now happens first, we always know WHO is at the gate,
 * which is what makes the per-user attempt log and lockout possible.
 *
 * Firestore doc (per user):  access_attempts/{uid}
 *   { uid, email, displayName, failedCount, verified, locked,
 *     wrongCodes:[{code,at}], firstSeenAt, updatedAt }
 *
 * Read/write budget is kept small on purpose:
 *   - A verified user is remembered in localStorage, so returning visits touch
 *     Firestore 0 times.
 *   - The access code itself is fetched once and cached in memory.
 *   - Each code submit is a single write (correct or wrong).
 *
 * Depends on the globals `auth` and `db` defined by app.js — this script must
 * be loaded AFTER app.js.
 */
(function () {
  'use strict';

  // How many WRONG codes a user may enter before the gate locks them out.
  // Product rule: "3 chances to get it wrong." Single source of truth — no
  // magic numbers sprinkled through the logic below.
  var ACCESS_MAX_ATTEMPTS = 3;

  // Fast-path cache, shared with access-gate.js (which guards every other page).
  var LS_VERIFIED = 'access_code_verified';

  var gate    = document.getElementById('accessGate');
  var input   = document.getElementById('accessCodeInput');
  var btn     = document.getElementById('accessEnterBtn');
  var errorEl = document.getElementById('accessError');
  // If the markup isn't here, this isn't the index page — do nothing.
  if (!gate || !input || !btn || !errorEl) return;

  var attemptsRef = null;   // db.doc('access_attempts/{uid}') for the current user
  var state       = null;   // in-memory mirror of that doc
  var cachedCode  = null;   // access code, fetched once
  var wired       = false;  // submit handlers attached only once

  function showGate() {
    gate.classList.remove('hidden');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
  }
  function hideGate() { gate.classList.add('hidden'); }

  function markVerifiedLocally() {
    try { localStorage.setItem(LS_VERIFIED, 'true'); } catch (e) {}
  }

  // Fetch the access code once and cache it. Read is now authenticated
  // (the user is always signed in by the time the gate shows).
  function getAccessCode() {
    if (cachedCode !== null) return Promise.resolve(cachedCode);
    return db.doc('app_state/access_code').get().then(function (doc) {
      cachedCode = (doc.exists && doc.data().code) || '';
      return cachedCode;
    }).catch(function () { return null; });
  }

  function remainingAttempts() {
    return Math.max(0, ACCESS_MAX_ATTEMPTS - ((state && state.failedCount) || 0));
  }

  // Reset the gate controls to the normal "enter a code" state.
  function renderPrompt() {
    input.disabled = false;
    btn.disabled = false;
    btn.textContent = 'Enter';
    errorEl.textContent = '';
  }

  // Locked-out state: no more tries. Turn the button into an escape hatch
  // (sign out) so a locked user isn't trapped on a dead screen.
  function renderLocked() {
    input.disabled = true;
    input.value = '';
    errorEl.textContent = 'Too many incorrect attempts. This account is locked — please contact the admin.';
    btn.textContent = 'Sign out';
    btn.disabled = false;
  }

  // Persist the current attempt state to Firestore (one write). `extra` lets a
  // caller force specific fields (e.g. verified/locked) in the same write.
  function persist(extra) {
    var u = auth.currentUser;
    if (!u || !attemptsRef) return Promise.resolve();
    var payload = {
      uid: u.uid,
      email: u.email || null,
      displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'Anonymous'),
      failedCount: state.failedCount,
      verified: !!state.verified,
      locked: !!state.locked,
      wrongCodes: state.wrongCodes,
      updatedAt: Date.now()
    };
    if (!state.firstSeenAt) {
      state.firstSeenAt = Date.now();
      payload.firstSeenAt = state.firstSeenAt;
    }
    if (extra) { for (var k in extra) payload[k] = extra[k]; }
    return attemptsRef.set(payload, { merge: true }).catch(function () {});
  }

  function verifyCode() {
    // When locked, the button doubles as "Sign out".
    if (state && state.locked) { auth.signOut(); return; }

    var entered = (input.value || '').trim();
    if (!entered) { errorEl.textContent = 'Please enter the access code.'; return; }

    getAccessCode().then(function (code) {
      if (code === null) { errorEl.textContent = 'Could not load the gate. Please try again.'; return; }

      if (entered === code) {
        // Correct — remember it and let them through.
        state.verified = true;
        markVerifiedLocally();
        persist({ verified: true });
        errorEl.textContent = '';
        hideGate();
        return;
      }

      // Wrong — log it for the admin panel and count down the remaining tries.
      state.failedCount = (state.failedCount || 0) + 1;
      state.wrongCodes = (state.wrongCodes || [])
        .concat([{ code: entered, at: Date.now() }])
        .slice(-ACCESS_MAX_ATTEMPTS);   // keep at most the last few — bounded doc size
      input.value = '';

      if (state.failedCount >= ACCESS_MAX_ATTEMPTS) {
        state.locked = true;
        persist({ locked: true });
        renderLocked();
      } else {
        persist();
        var left = remainingAttempts();
        errorEl.textContent = 'Incorrect code. ' + left + ' attempt' + (left === 1 ? '' : 's') + ' left.';
        try { input.focus(); } catch (e) {}
      }
    });
  }

  function wireOnce() {
    if (wired) return;
    wired = true;
    btn.addEventListener('click', verifyCode);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') verifyCode(); });
  }

  // Decide whether to show the gate for this signed-in user.
  function evaluate(user) {
    // Fast path: this device already cleared the gate for this account — no read.
    if (localStorage.getItem(LS_VERIFIED) === 'true') { hideGate(); return; }

    attemptsRef = db.doc('access_attempts/' + user.uid);
    attemptsRef.get().then(function (doc) {
      var d = doc.exists ? doc.data() : {};
      state = {
        failedCount: d.failedCount || 0,
        verified:    !!d.verified,
        locked:      !!d.locked || (d.failedCount || 0) >= ACCESS_MAX_ATTEMPTS,
        wrongCodes:  Array.isArray(d.wrongCodes) ? d.wrongCodes : [],
        firstSeenAt: d.firstSeenAt || null
      };

      // Already verified on the server (e.g. cleared on another device).
      if (state.verified) { markVerifiedLocally(); hideGate(); return; }

      wireOnce();
      renderPrompt();
      showGate();
      getAccessCode();                 // warm the cache while they type

      if (state.locked) { renderLocked(); return; }

      // Optional deep-link: ?code=XYZ auto-submits — but never on a locked account.
      var params = new URLSearchParams(window.location.search);
      var qcode = params.get('code');
      if (qcode) { input.value = qcode; verifyCode(); }
    }).catch(function () {
      // If the attempt doc can't be read, fail OPEN to the prompt rather than
      // trapping a legitimate user. The correct code still gates entry.
      state = { failedCount: 0, verified: false, locked: false, wrongCodes: [], firstSeenAt: null };
      wireOnce();
      renderPrompt();
      showGate();
      getAccessCode();
    });
  }

  // Own auth observer — fully decoupled from app.js. Firebase supports many.
  auth.onAuthStateChanged(function (user) {
    if (!user) { hideGate(); return; }   // logged out → the login overlay owns the screen
    evaluate(user);
  });
})();
