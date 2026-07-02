/* ════════════════════════════════════════════════════════════════
   world-actions.js — the World's own action vocabulary: emotes, per-scene
   themed actions, and per-pet signature moves. Two entry points, mirroring
   the room's pattern but self-contained:
     applyWorldActionTransform(ctx, action, ap, s, t)  — mutates ctx BEFORE the
        pet body is drawn (called in the pet's local, depth-scaled space).
     drawWorldActionEffect(ctx, px, py, size, ds, action, ap, t, sceneFx) — draws
        particles / floating emoji AFTER the body (absolute pixel space).
   `ap` is action progress 0→1; `s`/`size` is the pet's BASE size.
   ════════════════════════════════════════════════════════════════ */

// Action metadata. kind drives how the effect renders; emoji shows on buttons
// and (for emotes) floats above the head; dur is the play length in ms.
const WORLD_ACTIONS = {
  // ── Emotes (any scene) ──
  wave:    { kind: 'emote', emoji: '👋', dur: 1000, label: 'Wave' },
  heart:   { kind: 'emote', emoji: '❤️', dur: 1100, label: 'Love' },
  laugh:   { kind: 'emote', emoji: '😆', dur: 1000, label: 'Laugh' },
  dance:   { kind: 'emote', emoji: '🎵', dur: 1400, label: 'Dance' },
  cry:     { kind: 'emote', emoji: '😢', dur: 1200, label: 'Cry' },
  sparkle: { kind: 'emote', emoji: '✨', dur: 1000, label: 'Sparkle' },
  // ── Social (reciprocal — matched across clients in world-core) ──
  highfive: { kind: 'social', emoji: '✋', dur: 4000, label: 'High-five' },
  // ── Scene-themed ──
  splash:  { kind: 'scene', emoji: '💦', dur: 850, label: 'Splash' },
  dive:    { kind: 'scene', emoji: '🤿', dur: 900, label: 'Dive' },
  float:   { kind: 'scene', emoji: '🛟', dur: 1400, label: 'Float' },
  bow:     { kind: 'scene', emoji: '🙇', dur: 1000, label: 'Bow' },
  digSand: { kind: 'scene', emoji: '🏖️', dur: 1100, label: 'Dig' },
  roll:    { kind: 'scene', emoji: '🌀', dur: 850, label: 'Roll' },
  pounce:  { kind: 'scene', emoji: '🐾', dur: 800, label: 'Pounce' },
  // ── Per-pet signatures ──
  sig_pounce:   { kind: 'signature', emoji: '⭐', dur: 950, label: 'Signature' },
  sig_spin:     { kind: 'signature', emoji: '⭐', dur: 900, label: 'Signature' },
  sig_bighop:   { kind: 'signature', emoji: '⭐', dur: 1000, label: 'Signature' },
  sig_wiggle:   { kind: 'signature', emoji: '⭐', dur: 950, label: 'Signature' },
  sig_backflip: { kind: 'signature', emoji: '⭐', dur: 1000, label: 'Signature' },
  sig_tumble:   { kind: 'signature', emoji: '⭐', dur: 1000, label: 'Signature' },
  sig_flap:     { kind: 'signature', emoji: '⭐', dur: 950, label: 'Signature' },
};

function worldActionDuration(action) {
  const m = WORLD_ACTIONS[action];
  return m ? m.dur : 900;
}

// Scene-flavoured particle presets for action effects.
const WORLD_SCENE_FX = {
  water: { colors: ['#8fd8ff', '#bff0ff', '#5cc0ff'] },
  sand:  { colors: ['#e8cf9a', '#d8b878', '#f0e0b8'] },
  petal: { emoji: '🌸', colors: ['#ffd1e8', '#a8e6a1', '#ffe3f0'] },
};

// Mutate ctx to animate the pet body for `action` at progress `ap`.
function applyWorldActionTransform(ctx, action, ap, s, t) {
  const up = Math.sin(ap * Math.PI); // 0→1→0 arc, handy for jumps/pulses
  switch (action) {
    // Emotes
    case 'wave':    ctx.rotate(Math.sin(ap * Math.PI * 6) * 0.12); break;
    case 'heart':   ctx.translate(0, -up * 0.12 * s); ctx.scale(1 + up * 0.05, 1 + up * 0.05); break;
    case 'laugh':   ctx.rotate(Math.sin(ap * Math.PI * 10) * 0.06); ctx.translate(0, -Math.abs(Math.sin(ap * Math.PI * 4)) * 0.04 * s); break;
    case 'dance':   ctx.rotate(Math.sin(ap * Math.PI * 4) * 0.18); ctx.translate(Math.sin(ap * Math.PI * 4) * 0.06 * s, 0); break;
    case 'cry':     ctx.translate(0, up * 0.05 * s); ctx.scale(1, 1 - up * 0.06); break;
    case 'sparkle': ctx.scale(1 + up * 0.08, 1 + up * 0.08); break;
    // Social
    case 'highfive': { // rear back with a paw held high, bouncing gently while waiting
      const in_ = Math.min(1, ap / 0.12), bounce = Math.sin(t / 150) * 0.025;
      ctx.rotate(-0.16 * in_);
      ctx.translate(0, (-0.05 * in_ + bounce) * s);
      ctx.scale(1, 1 + 0.04 * in_);
      break; }
    // Scene-themed
    case 'splash':  ctx.translate(0, -up * 0.18 * s); ctx.scale(1 + 0.05 * up, 1 - 0.05 * up); break;
    case 'dive':    ctx.rotate(ap * Math.PI * 0.6); ctx.scale(1 - ap * 0.2, 1 - ap * 0.2); ctx.translate(0, ap * 0.1 * s); break;
    case 'float':   ctx.rotate(Math.sin(t / 300) * 0.05); ctx.translate(0, Math.sin(t / 300) * 0.03 * s); break;
    case 'bow':     ctx.rotate(up * 0.5); ctx.translate(0, up * 0.04 * s); break;
    case 'digSand': ctx.translate(0, Math.abs(Math.sin(ap * Math.PI * 5)) * 0.05 * s); ctx.rotate(Math.sin(ap * Math.PI * 5) * 0.05); break;
    case 'roll':    ctx.rotate(ap * Math.PI * 2); break;
    case 'pounce':  ctx.translate(0, -up * 0.22 * s); ctx.rotate(-up * 0.15); break;
    // ── Signatures (one characterful move per pet: anticipation → action → land) ──
    case 'sig_pounce': { // cat: crouch, then a forward pouncing leap with a twist
      if (ap < 0.22) { const a = ap / 0.22; ctx.scale(1 + 0.14 * a, 1 - 0.16 * a); ctx.translate(0, 0.06 * a * s); }
      else { const a = (ap - 0.22) / 0.78, arc = Math.sin(a * Math.PI); ctx.translate((a - 0.15) * 0.14 * s, -arc * 0.30 * s); ctx.rotate(-arc * 0.4); ctx.scale(1 + 0.05 * arc, 1 - 0.03 * arc); }
      break; }
    case 'sig_spin': { // dog: two excited tail-chasing spins with a happy bob
      ctx.rotate(ap * Math.PI * 4); const b = Math.abs(Math.sin(ap * Math.PI * 2)); ctx.translate(0, -b * 0.07 * s); ctx.scale(1 + 0.05 * b, 1 - 0.05 * b);
      break; }
    case 'sig_bighop': { // bunny: a bouncy triple binky with mid-air ear flicks
      const hops = Math.abs(Math.sin(ap * Math.PI * 3)); ctx.translate(0, -hops * 0.28 * s); ctx.scale(1 - 0.09 * hops, 1 + 0.13 * hops); ctx.rotate(Math.sin(ap * Math.PI * 6) * 0.13);
      break; }
    case 'sig_wiggle': { // hamster: fast happy shimmy + a puffed-cheek pulse
      ctx.rotate(Math.sin(ap * Math.PI * 12) * 0.17); const puff = Math.sin(ap * Math.PI); ctx.scale(1 + 0.11 * puff, 1 + 0.06 * puff); ctx.translate(0, -Math.abs(Math.sin(ap * Math.PI * 4)) * 0.05 * s);
      break; }
    case 'sig_backflip': { // fox: a crouch then a clean arcing backflip
      if (ap < 0.18) { const a = ap / 0.18; ctx.scale(1 + 0.09 * a, 1 - 0.11 * a); ctx.translate(0, 0.05 * a * s); }
      else { const a = (ap - 0.18) / 0.82, arc = Math.sin(a * Math.PI); ctx.translate(-0.05 * s, -arc * 0.34 * s); ctx.rotate(-a * Math.PI * 2); }
      break; }
    case 'sig_tumble': { // panda: a rolling forward tumble that travels + bounces
      ctx.rotate(ap * Math.PI * 2); const arc = Math.sin(ap * Math.PI); ctx.translate((ap - 0.5) * 0.16 * s, -arc * 0.13 * s);
      break; }
    case 'sig_flap': { // goose: a flappy hover — rise on beating wings, then settle
      const rise = Math.sin(ap * Math.PI), beat = Math.sin(ap * Math.PI * 8); ctx.translate(beat * 0.02 * s, -rise * 0.22 * s); ctx.rotate(beat * 0.11); ctx.scale(1, 1 + 0.05 * beat);
      break; }
    default: break;
  }
}

// Draw the action's particles / floating emoji in absolute pixel space.
function drawWorldActionEffect(ctx, px, py, size, ds, action, ap, t, sceneFx) {
  const meta = WORLD_ACTIONS[action];
  if (!meta) return;

  if (meta.kind === 'emote') {
    // A single emoji rising and fading above the head.
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - ap);
    ctx.font = ((size * ds * 0.7) | 0) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.emoji, px, py - size * ds * 0.75 - ap * size * ds * 0.6);
    ctx.restore();
    return;
  }

  if (meta.kind === 'social') {
    // A held emoji that bobs above the head for the whole offer (an invitation,
    // not a one-shot), fading out over the last stretch if nobody responds.
    ctx.save();
    ctx.globalAlpha = ap > 0.75 ? (1 - ap) / 0.25 : 1;
    ctx.font = ((size * ds * 0.55) | 0) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.emoji, px, py - size * ds * 1.0 + Math.sin(t / 150) * size * ds * 0.05);
    ctx.restore();
    return;
  }

  // Scene + signature actions kick up a flavoured burst at the feet.
  const pal = WORLD_SCENE_FX[sceneFx] || WORLD_SCENE_FX.petal;
  const footY = py + 0.30 * size * ds;
  const n = 9;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - ap);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ap * 2.4;
    const r = ap * size * ds * 0.75;
    const x = px + Math.cos(a) * r;
    const y = footY - Math.abs(Math.sin(a)) * r * 0.5 - ap * size * ds * 0.25;
    if (pal.emoji) {
      ctx.font = ((size * ds * 0.26) | 0) + 'px serif';
      ctx.textAlign = 'center';
      ctx.fillText(pal.emoji, x, y);
    } else {
      ctx.fillStyle = pal.colors[i % pal.colors.length];
      ctx.beginPath();
      ctx.arc(x, y, size * ds * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Signatures add a star pop for extra flair.
  if (meta.kind === 'signature') {
    ctx.globalAlpha = Math.max(0, 1 - ap) * 0.9;
    ctx.font = ((size * ds * 0.5) | 0) + 'px serif';
    ctx.textAlign = 'center';
    ctx.fillText('⭐', px, py - size * ds * 0.7 - ap * size * ds * 0.3);
  }
  ctx.restore();
}

// Celebration for a MATCHED high-five, drawn at the pair's midpoint (absolute
// pixels, depth-scaled like the pets). p is progress 0→1 over WORLD_HIGHFIVE.burstMs.
function drawWorldHighfiveBurst(ctx, px, py, ds, p) {
  const n = 10, r = ds * (14 + p * 70);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = ((ds * (16 + p * 10)) | 0) + 'px serif';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + p * 1.2;
    ctx.fillText(i % 2 ? '❤️' : '⭐',
      px + Math.cos(a) * r,
      py + Math.sin(a) * r * 0.55 - p * ds * 26);
  }
  ctx.font = ((ds * (24 + p * 14)) | 0) + 'px serif';
  ctx.fillText('🤝', px, py - p * ds * 38);
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WORLD_ACTIONS, worldActionDuration };
}
