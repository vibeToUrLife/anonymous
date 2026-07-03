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
const WORLD_SPARKLES = { perScene: 3, collectRadius: 0.055, revealRadius: 0.22, margin: 0.06, tzOffsetMin: 480 };

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
    PET_SIGNATURE, signatureFor, WORLD_PLAY_RADIUS, WORLD_HIGHFIVE, WORLD_SPARKLES, WORLD_CHAT, WORLD_KEYS, WORLD_ACTION_KEYS,
  };
}
