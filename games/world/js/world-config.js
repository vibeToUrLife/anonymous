/* ════════════════════════════════════════════════════════════════
   world-config.js — all tunable World data in one place (project rule:
   no hardcoded magic numbers scattered through logic). Scenes, action
   registry mapping, chat limits + word list, sync/cost constants,
   capacity cap, and key bindings.
   ════════════════════════════════════════════════════════════════ */

// ── Realtime sync / cost control ──────────────────────────────────
const WORLD_SYNC = {
  minIntervalMs: 200,   // ≤5 Hz position writes
  epsilon:       0.006, // min normalized move worth broadcasting
  ttlMs:         30000, // despawn a remote whose last update is older than this
  heartbeatMs:   20000, // re-touch our node while idle so we don't self-despawn
  interpFactor:  0.22,  // per-frame lerp toward a remote's last-synced position
  moveSpeed:     0.16,  // normalized units / second (walk speed)
};

// Per-scene soft cap; a full shard spills into the next instance.
const WORLD_SHARD_CAP = 22;

// ── Scenes ────────────────────────────────────────────────────────
// bounds/spawn are normalized 0–1. `draw` lives in world-scene-<id>.js and
// registers into window.WORLD_SCENE_DRAW[id]. `themed` are this scene's action ids.
const WORLD_SCENES = [
  {
    id: 'pool', name: 'Splash Pool', emoji: '🏊', sky: ['#7fd4ff', '#bff0ff'],
    bounds: { minX: 0.10, minY: 0.56, maxX: 0.90, maxY: 0.90 },
    spawn:  { x: 0.50, y: 0.74 },
    themed: ['splash', 'dive', 'float'],
    fx: 'water',
  },
  {
    id: 'egypt', name: 'Desert of Egypt', emoji: '🐫', sky: ['#ffd98a', '#ffe9c2'],
    bounds: { minX: 0.08, minY: 0.58, maxX: 0.92, maxY: 0.92 },
    spawn:  { x: 0.32, y: 0.80 },
    themed: ['bow', 'digSand'],
    fx: 'sand',
  },
  {
    id: 'grassland', name: 'Green Grassland', emoji: '🌿', sky: ['#a8e6a1', '#d7f5cf'],
    bounds: { minX: 0.06, minY: 0.52, maxX: 0.94, maxY: 0.93 },
    spawn:  { x: 0.50, y: 0.80 },
    themed: ['roll', 'pounce'],
    fx: 'petal',
  },
];

function worldSceneById(id) { return WORLD_SCENES.find(s => s.id === id) || WORLD_SCENES[0]; }

// ── Actions ───────────────────────────────────────────────────────
// Emotes usable in any scene (float an emoji + a little body motion).
const WORLD_EMOTES = ['wave', 'heart', 'laugh', 'dance', 'cry', 'sparkle'];

// Each pet's signature move. The move is the pet's own "personality"; the World
// flavours its particle EFFECT by the current scene (splash/sand/petals), so a
// pet's signature reads differently in each place — a unique action per scene.
const PET_SIGNATURE = {
  cat: 'sig_pounce', dog: 'sig_spin', bunny: 'sig_bighop', hamster: 'sig_wiggle',
  fox: 'sig_backflip', panda: 'sig_tumble', goose: 'sig_flap',
};
function signatureFor(petType) { return PET_SIGNATURE[petType] || 'sig_spin'; }

// Distance (normalized) within which two pets can do a reciprocal play action.
const WORLD_PLAY_RADIUS = 0.12;

// Reciprocal high-five (the Q "Play" verb). The offer pose lasts
// WORLD_ACTIONS.highfive.dur (4000ms); windowMs — the max gap between the two
// offers that still counts as a match — is deliberately SHORTER by a network-
// latency margin, so an answer accepted on the responder's screen always
// arrives before the offer expires on the offerer's screen (a last-instant
// answer would otherwise celebrate on one side only). burstMs is how long the
// shared celebration plays at the pair's midpoint.
const WORLD_HIGHFIVE = { actionId: 'highfive', windowMs: 3400, burstMs: 1100 };

// ── Daily Sparkle Hunt ──────────────────────────────────────────────
// Hidden collectibles: `perScene` per scene, placed deterministically per day so
// every client sees the same spots with zero networking, yet each player
// collects their own set. They stay invisible until the player is within
// revealRadius (a hot/cold search) and are collected by walking within
// collectRadius. tzOffsetMin sets the local day boundary (480 = UTC+8) so the
// hunt resets at local midnight.
// `reward` coins are credited (atomic increment on rooms/{uid}.coins) when the
// whole day's hunt is completed.
const WORLD_SPARKLES = { perScene: 3, collectRadius: 0.055, revealRadius: 0.22, margin: 0.06, tzOffsetMin: 480, reward: 500 };

// ── Reactive scenes ─────────────────────────────────────────────────
// The world reacts to pets as they MOVE (no buttons): ambient contact marks
// under every pet + props that respond when a pet walks into them. `contact` is
// the touch radius (normalized). Each prop has a `react` style:
//   bump  — springs away in the push direction, then settles (palm/bush/…)
//   sink  — presses down while a pet stands on it, ripples (lily pads)
//   bloom — opens/scales up while a pet is near, then closes (flowers)
// Everything is drawn/animated by world-reactive.js from the already-synced
// positions, so every client renders identical reactions with zero networking.
// `critters` are ambient creatures that flee an approaching pet and drift back
// (world-critters.js) — also purely local from the synced pet positions.
const WORLD_REACTIVE = {
  contact: 0.07,
  props: {
    pool: [
      { type: 'lilypad',  react: 'sink',  x: 0.45, y: 0.82 },
      { type: 'lilypad',  react: 'sink',  x: 0.80, y: 0.86 },
    ],
    egypt: [
      { type: 'palm',     react: 'bump',  x: 0.80, y: 0.66 },
      { type: 'cactus',   react: 'bump',  x: 0.18, y: 0.72 },
    ],
    grassland: [
      { type: 'bush',     react: 'bump',  x: 0.30, y: 0.72 },
      { type: 'mushroom', react: 'bump',  x: 0.70, y: 0.66 },
      { type: 'flower',   react: 'bloom', x: 0.52, y: 0.84 },
      { type: 'flower',   react: 'bloom', x: 0.14, y: 0.86 },
    ],
  },
  critters: {
    pool:      { type: 'fish',      count: 4, fleeRadius: 0.16, margin: 0.08 },
    egypt:     { type: 'lizard',    count: 3, fleeRadius: 0.15, margin: 0.08 },
    grassland: { type: 'butterfly', count: 5, fleeRadius: 0.18, margin: 0.08 },
  },
};

// ── Shared kickable floaties (the pool's toys) ──────────────────────
// Each floaty in `items` is shared by everyone in a pool shard. It is NOT synced
// per-frame: each kick writes ONE snapshot (start pos, unit direction, speed,
// server ts) to world/scenes/pool/{shard}/balls/{id}, and every client renders
// the floaty as a deterministic function of that snapshot + the server clock
// (world-logic ballState), so all screens agree and settle on the same spot. A
// pet kicks by walking into a resting floaty (mobile-first: no button). The
// physics fields are shared by every floaty; `friction` is the exponential decay
// k, so roll distance ≈ kickSpeed / friction. Homes are near-centre so a kick has
// a full roll of open water to travel (an off-centre home just bounces off the
// wall). If RTDB is unavailable a floaty still rolls locally (solo fallback).
const WORLD_BALLS = {
  contact: 0.075,    // touch radius to trigger a kick (generous for touch)
  kickSpeed: 0.95,   // initial speed (normalized units/sec)
  friction: 2.6,     // exponential decay; roll distance ≈ kickSpeed/friction ≈ 0.37
  restEps: 0.03,     // speed below which a floaty is "at rest" and re-kickable
  cooldownMs: 220,   // min gap between one player's kicks (dedupe double-writes)
  items: [
    { id: 'beach', scene: 'pool', type: 'beachball', home: { x: 0.40, y: 0.72 }, radius: 0.028 },
    { id: 'ring',  scene: 'pool', type: 'ring',      home: { x: 0.64, y: 0.68 }, radius: 0.032 },
  ],
};

// ── Notes Board ─────────────────────────────────────────────────────
// Each scene has a community notice board. Walk up to it and a prompt appears
// ("press Enter to write a note" on desktop, a tappable ✍️ button on mobile);
// your note then pins right where you're standing, next to the board. Notes STAY
// (unlike a chat bubble) and later visitors discover them hot/cold: a folded-note
// card fades in as you wander near (`discoverRadius`), then blooms open into a
// readable bubble once you're close (`revealRadius`). Text runs through the SAME
// moderation as chat (maxLen + WORLD_CHAT.banned). Persisted per scene-shard at
// world/scenes/{scene}/{shard}/notes/{id}; `historyLimit` (RTDB limitToLast) ages
// the oldest notes out. If RTDB is unavailable / the rule isn't deployed, a pin
// still shows locally (solo fallback). `boards` is the board spot per scene and
// `boardRadius` is how near you must be to write.
const WORLD_NOTES = {
  maxLen: 80,             // a pinned line is shorter than a chat message
  discoverRadius: 0.30,   // the folded-note card starts fading in within this range
  revealRadius: 0.16,     // the message blooms open within this range (saturates to opaque well before the centre)
  historyLimit: 20,       // RTDB limitToLast(N) — old notes gently age out
  cooldownMs: 4000,       // min gap between one player's pins (anti-spam)
  boardRadius: 0.19,      // how near the board you must be to write / be prompted
  boards: {               // the notice-board spot in each scene (normalized, inside bounds)
    pool:      { x: 0.20, y: 0.62 },
    egypt:     { x: 0.17, y: 0.66 },
    grassland: { x: 0.17, y: 0.60 },
  },
};

// ── Chat ──────────────────────────────────────────────────────────
const WORLD_CHAT = {
  maxLen: 100,
  rateWindowMs: 10000,
  rateMax: 5,          // ≤5 messages / 10s
  bubbleMs: 5000,      // speech-bubble lifetime
  historyLimit: 30,    // RTDB limitToLast(N)
  // Starter blocklist — the admin can expand this. Kept small & config-driven so
  // moderation logic (world-moderation.js) stays data-free. NOTE: matching is
  // substring-on-normalized (to defeat "b a d" evasions), so avoid short tokens
  // that collide with clean words (e.g. 'sex'→Essex, 'rape'→grape) — keep entries
  // specific.
  banned: [
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'piss', 'cunt',
    'slut', 'whore', 'nigger', 'faggot', 'retard', 'porn',
  ],
};

// ── Key bindings (desktop) ────────────────────────────────────────
// Movement is polled from held keys; actions fire on keydown.
const WORLD_KEYS = {
  up:    ['w', 'arrowup'],
  down:  ['s', 'arrowdown'],
  left:  ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
};
// keydown key (lowercase) → an action intent resolved against the current scene.
const WORLD_ACTION_KEYS = {
  ' ':     { kind: 'scene',     index: 0 }, // Space → primary scene action
  'e':     { kind: 'scene',     index: 1 }, // E → secondary scene action
  'f':     { kind: 'signature', index: 0 }, // F → this pet's signature move
  'q':     { kind: 'play',      index: 0 }, // Q → play with the nearest pet
  '1':     { kind: 'emote',     index: 0 },
  '2':     { kind: 'emote',     index: 1 },
  '3':     { kind: 'emote',     index: 2 },
  '4':     { kind: 'emote',     index: 3 },
  '5':     { kind: 'emote',     index: 4 },
  '6':     { kind: 'emote',     index: 5 },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WORLD_SYNC, WORLD_SHARD_CAP, WORLD_SCENES, worldSceneById, WORLD_EMOTES,
    PET_SIGNATURE, signatureFor, WORLD_PLAY_RADIUS, WORLD_HIGHFIVE, WORLD_SPARKLES, WORLD_REACTIVE, WORLD_BALLS, WORLD_NOTES, WORLD_CHAT, WORLD_KEYS, WORLD_ACTION_KEYS,
  };
}
