/* ════════════════════════════════════════════════════════════════
   world-input.js — movement + action input for desktop AND touch.
   Desktop: WASD/arrows (held → move vector), keys for actions (world-config
   WORLD_ACTION_KEYS). Touch: an on-screen virtual joystick + action buttons.
   Emits abstract action intents {kind,index}; world-core resolves them to a
   concrete action id (scene/emote/signature depend on scene + pet).
   ════════════════════════════════════════════════════════════════ */
const WorldInput = (function () {
  const held = {};            // keyboard: key(lowercase) → held?
  let joyVec = { x: 0, y: 0 };// touch joystick vector (-1..1)
  let touchMode = false;      // true once a touch/pointer joystick is used
  let onAction = function () {};

  function isTyping() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }
  function isMoveKey(k) {
    return WORLD_KEYS.up.includes(k) || WORLD_KEYS.down.includes(k) ||
           WORLD_KEYS.left.includes(k) || WORLD_KEYS.right.includes(k);
  }

  // Current normalized move vector (keyboard OR joystick).
  function getMoveVector() {
    if (touchMode && (joyVec.x || joyVec.y)) return normalizeVector(joyVec.x, joyVec.y);
    let dx = 0, dy = 0;
    for (const k in held) {
      if (!held[k]) continue;
      if (WORLD_KEYS.up.includes(k)) dy -= 1;
      if (WORLD_KEYS.down.includes(k)) dy += 1;
      if (WORLD_KEYS.left.includes(k)) dx -= 1;
      if (WORLD_KEYS.right.includes(k)) dx += 1;
    }
    return normalizeVector(dx, dy);
  }

  function onKeyDown(e) {
    if (isTyping()) return;
    // OS key auto-repeat: movement uses the `held` map (set on the first press),
    // and actions must not re-fire — each re-trigger resets actionTs, which would
    // force an RTDB write per repeat and restart the animation on every client.
    if (e.repeat) { e.preventDefault(); return; }
    const k = (e.key || '').toLowerCase();
    if (isMoveKey(k)) { held[k] = true; e.preventDefault(); return; }
    const intent = WORLD_ACTION_KEYS[k];
    if (intent) { onAction(intent); e.preventDefault(); }
  }
  function onKeyUp(e) {
    const k = (e.key || '').toLowerCase();
    if (held[k]) { held[k] = false; e.preventDefault(); }
  }

  // ── Virtual joystick (touch/pointer) ──
  function initJoystick(baseEl) {
    if (!baseEl) return;
    let knob = baseEl.querySelector('.world-joy-knob');
    if (!knob) { knob = document.createElement('div'); knob.className = 'world-joy-knob'; baseEl.appendChild(knob); }
    let active = false, cx = 0, cy = 0, radius = 1;

    function start(clientX, clientY) {
      touchMode = true; active = true;
      const r = baseEl.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; radius = r.width / 2;
      move(clientX, clientY);
    }
    function move(clientX, clientY) {
      if (!active) return;
      let dx = clientX - cx, dy = clientY - cy;
      const mag = Math.hypot(dx, dy);
      if (mag > radius) { dx = dx / mag * radius; dy = dy / mag * radius; }
      joyVec = { x: dx / radius, y: dy / radius };
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
    function end() { active = false; joyVec = { x: 0, y: 0 }; knob.style.transform = 'translate(0,0)'; }

    baseEl.addEventListener('pointerdown', e => { baseEl.setPointerCapture(e.pointerId); start(e.clientX, e.clientY); e.preventDefault(); });
    baseEl.addEventListener('pointermove', e => { move(e.clientX, e.clientY); });
    baseEl.addEventListener('pointerup', end);
    baseEl.addEventListener('pointercancel', end);
  }

  // ── On-screen action buttons (rebuilt per scene, since themed actions differ) ──
  function buildActionButtons(container, sceneId) {
    if (!container) return;
    const scene = worldSceneById(sceneId);
    container.innerHTML = '';

    function addBtn(emoji, label, cls, handler) {
      const b = document.createElement('button');
      b.className = 'world-abtn' + (cls ? ' ' + cls : '');
      b.innerHTML = '<span class="world-abtn-emoji">' + emoji + '</span>';
      b.title = label; b.setAttribute('aria-label', label);
      b.addEventListener('click', e => { e.preventDefault(); handler(); });
      container.appendChild(b);
      return b;
    }

    // Scene-themed actions
    scene.themed.forEach((a, i) => {
      const m = WORLD_ACTIONS[a];
      addBtn(m ? m.emoji : '❓', m ? m.label : a, 'scene', () => onAction({ kind: 'scene', index: i }));
    });
    // Signature move
    addBtn('⭐', 'Signature move', 'sig', () => onAction({ kind: 'signature', index: 0 }));
    // High-five a nearby pet (the reciprocal "play" verb)
    addBtn('🤝', 'High-five a nearby pet', 'play', () => onAction({ kind: 'play', index: 0 }));

    // Emote tray (popover of the 6 emotes). Appended to the container as a SIBLING
    // of the toggle button — nesting it inside the button is invalid HTML and makes
    // the emote click bubble to the toggle, immediately re-opening the tray.
    const tray = document.createElement('div');
    tray.className = 'world-emote-tray';
    tray.style.display = 'none';
    WORLD_EMOTES.forEach((a, i) => {
      const m = WORLD_ACTIONS[a];
      const b = document.createElement('button');
      b.className = 'world-emote-btn'; b.textContent = m ? m.emoji : '❓'; b.title = m ? m.label : a;
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); onAction({ kind: 'emote', index: i }); tray.style.display = 'none'; });
      tray.appendChild(b);
    });
    addBtn('😊', 'Emotes', 'emote', () => {
      tray.style.display = tray.style.display === 'none' ? 'flex' : 'none';
    });
    container.appendChild(tray);
  }

  function init(opts) {
    onAction = opts.onAction || onAction;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => { for (const k in held) held[k] = false; });
    initJoystick(opts.joystickEl);
    // Reveal touch controls on first touch device interaction.
    window.addEventListener('touchstart', function once() {
      document.body.classList.add('world-touch');
      window.removeEventListener('touchstart', once);
    }, { passive: true });
  }

  return { init, getMoveVector, buildActionButtons, isTyping };
})();
