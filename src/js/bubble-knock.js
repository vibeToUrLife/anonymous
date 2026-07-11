/**
 * bubble-knock.js — Knock on a bubble & ambient touch ripples.
 *
 * KNOCK: long-press any message bubble on the board and it wobbles with a
 * ripple ring on the screen of everyone online — an anonymous, lighter-than-a-
 * reaction way to say "I saw this". The event travels through the same tiny
 * coalesced board_reactions/live doc as floating reactions (LiveFx.send from
 * live-reactions.js), anchored to the bubble's data-id so it lands on the
 * right bubble whatever each screen's layout is.
 *
 * RIPPLES: a tap on empty board space shows a faint expanding ring for
 * everyone (viewport-percentage position, throttled to one broadcast per
 * BoardLive.RIPPLE_MIN_GAP_MS). Pure ambience — it makes "👀 N online" feel
 * alive.
 *
 * Both are free (no coins) and touch-first: long-press works with any
 * pointer, and knocks buzz the phone lightly where the Vibration API exists.
 * The `knock` feature flag (app_state/features) kills both at event time.
 *
 * Exposes window.BubbleKnock.play(event) — live-reactions.js hands received
 * knock/ripple events here. Depends on BoardLive; sends via window.LiveFx.
 */
(function () {
  'use strict';

  const L = (typeof BoardLive !== 'undefined') ? BoardLive : null;
  if (!L) return;

  const wrap = document.getElementById('bubbleWrap');

  function knockDisabled() {
    return window.FEATURES && window.FEATURES.knock === false;
  }

  /* ── Local FX ────────────────────────────────────────────── */

  function knockFx(bubbleId) {
    if (!wrap) return;
    const el = wrap.querySelector('.bubble[data-id="' + CSS.escape(String(bubbleId)) + '"]');
    if (!el) return;                     // bubble expired / not rendered here
    // Wobble via the Web Animations API on the independent rotate/scale
    // properties: it composes with the bubble's transform-based bobbing
    // animation instead of replacing it (a CSS class would clobber it).
    if (el.animate && !document.body.classList.contains('no-animations')) {
      try {
        el.animate([
          { rotate: '0deg',    scale: '1' },
          { rotate: '-4deg',   scale: '1.05', offset: 0.15 },
          { rotate: '3.5deg',  offset: 0.35 },
          { rotate: '-2.5deg', offset: 0.55 },
          { rotate: '1.6deg',  offset: 0.75 },
          { rotate: '0deg',    scale: '1' }
        ], { duration: 700, easing: 'ease-out' });
      } catch (_) {}
    }
    const ring = document.createElement('div');
    ring.className = 'knock-ring';
    el.appendChild(ring);
    setTimeout(() => ring.remove(), 750);
  }

  // px, not vw/vh: iOS Safari's dynamic toolbar makes 100vh ≠ innerHeight, so
  // viewport units would land ripples visibly below the finger.
  function rippleFx(xPx, yPx, mine) {
    const r = document.createElement('div');
    r.className = 'ambient-ripple' + (mine ? ' mine' : '');
    r.style.left = xPx + 'px';
    r.style.top = yPx + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 1100);
  }

  // Receiver hook for live-reactions.js.
  window.BubbleKnock = {
    play: function (e) {
      if (knockDisabled()) return;
      const kind = L.classifyLiveEvent(e);
      if (kind === 'knock') knockFx(e.k);
      else if (kind === 'ripple') {
        rippleFx(e.rp[0] / 100 * window.innerWidth,
                 e.rp[1] / 100 * window.innerHeight, false);
      }
    }
  };

  if (!wrap) return;                     // FX-only on pages without the board

  /* ── Long-press detection (delegated, pointer-agnostic) ──── */
  let pressTimer = null;
  let pressTarget = null;                // the .bubble being held
  let startX = 0, startY = 0;
  let suppressClick = false;             // a fired knock must not also click
  let lastRippleAt = 0;

  function clearPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (pressTarget) pressTarget.classList.remove('knock-hold');
    pressTarget = null;
  }

  function send(fields) {
    if (window.LiveFx && typeof window.LiveFx.send === 'function') window.LiveFx.send(fields);
  }

  wrap.addEventListener('pointerdown', (e) => {
    // A new gesture starts: any leftover suppression belonged to the previous
    // one (its synthesized click — if the browser made one at all — has
    // already been dispatched). A timer here would either eat this gesture's
    // legitimate tap or expire while the old finger was still down.
    suppressClick = false;
    if (knockDisabled() || !e.isPrimary) return;
    const bubble = e.target && e.target.closest && e.target.closest('.bubble');
    if (!bubble || !bubble.dataset.id) return;
    // Holds that start on controls (reply button, poll options, reactions,
    // links, images…) belong to those controls.
    if (e.target.closest('button, a, input, textarea, select, img, .poll-option')) return;
    startX = e.clientX; startY = e.clientY;
    pressTarget = bubble;
    // While held: no text selection / iOS callout under the finger, so the
    // knock isn't buried beneath the OS long-press UI.
    bubble.classList.add('knock-hold');
    pressTimer = setTimeout(() => {
      const id = bubble.dataset.id;
      pressTimer = null;
      suppressClick = true;                          // eat this gesture's click
      knockFx(id);                                   // instant local feedback
      if (navigator.vibrate) { try { navigator.vibrate(25); } catch (_) {} }
      send({ k: String(id) });
    }, L.KNOCK_LONG_PRESS_MS);
  });

  // Android fires contextmenu at ~500ms — right after the knock. Keep the
  // system menu out of an armed or just-fired knock gesture.
  wrap.addEventListener('contextmenu', (e) => {
    if (pressTimer || pressTarget || suppressClick) e.preventDefault();
  });

  wrap.addEventListener('pointermove', (e) => {
    if (!pressTimer || !e.isPrimary) return;
    if (Math.abs(e.clientX - startX) > L.KNOCK_MOVE_TOL_PX ||
        Math.abs(e.clientY - startY) > L.KNOCK_MOVE_TOL_PX) clearPress();
  });
  wrap.addEventListener('pointerup', clearPress);
  wrap.addEventListener('pointercancel', clearPress);
  // capture: catches scrolling inside any container, not just the window.
  window.addEventListener('scroll', clearPress, { passive: true, capture: true });

  // A long-press that fired must not fall through as a click (image lightbox,
  // reply toggle…). Capture phase so we beat every bubble-level handler.
  wrap.addEventListener('click', (e) => {
    if (!suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
    suppressClick = false;
  }, true);

  /* ── Ambient ripples on empty board space ────────────────── */
  wrap.addEventListener('click', (e) => {
    if (knockDisabled() || suppressClick) return;
    if (e.target.closest('.bubble, button, a, input, textarea, select')) return;
    const now = Date.now();
    rippleFx(e.clientX, e.clientY, true);            // always echo locally
    if (now - lastRippleAt < L.RIPPLE_MIN_GAP_MS) return;
    lastRippleAt = now;
    send({
      rp: [Math.round((e.clientX / Math.max(1, window.innerWidth)) * 100),
           Math.round((e.clientY / Math.max(1, window.innerHeight)) * 100)]
    });
  });
})();
