# Pet World — Implementation Plan

Spec: `docs/superpowers/specs/2026-07-01-multiplayer-pet-world-design.md`

Build order groups tasks so each group leaves the app in a working state. Pure logic is
TDD'd with `node:test`; rendering/networking is verified manually.

## Group 0 — Blockers & scaffolding
- [ ] Fix `databaseURL` in `src/js/firebase-config.js` to the correct regional RTDB URL
      (Singapore / `asia-southeast1`); add a clear comment that it must match the Console.
- [ ] Create `games/world/` tree, `world.html` (mirror room.html SDK includes + init), `css/world.css`.
- [ ] Add `world: ['worldEntry']` to `feature-flags.js` MAP.
- [ ] `world-config.js` — data-driven: scene list, action registry, chat filter list, caps,
      sync constants (throttle Hz, epsilon, TTL, cap, interp buffer).

## Group 1 — Foundation (solo, no network)
- [ ] Shared pet-render availability on the world page (reuse draw fns without room bootstrap).
- [ ] `world-core.js` — state `W`, RAF loop, scene dispatch, resize, spawn.
- [ ] `world-input.js` — WASD + joystick + action buttons → vector/events. **TDD** vector math.
- [ ] Movement + walkable-bounds clamp. **TDD** clamp.
- [ ] One scene background (`world-scene-pool.js`) so movement is visible.

## Group 2 — Netcode (see other players)
- [ ] `world-net.js` — `firebase.database()`, player node write (throttled), `onValue` on
      current shard, `onDisconnect().remove()`, TTL despawn. **TDD** should-write throttle,
      interpolation lerp, shard assignment.
- [ ] `world-actors.js` — draw self + remotes (depth sort), interpolation, remote action
      playback, name-tag DOM pool.
- [ ] `database.rules.json` — `world` subtree rules (own-uid write, x/y bounds, chat caps).

## Group 3 — Content
- [ ] `world-scene-egypt.js`, `world-scene-grassland.js` backgrounds + bounds + props.
- [ ] `world-actions.js` — scene-themed + per-pet signature transforms; extend action vocab.
      **TDD** action-registry lookups.
- [ ] Pet picker (all 7 + colors) → updates state + synced node.
- [ ] `world-outfit.js` — wardrobe picker; `outfit` synced + persisted to `rooms/{uid}`.

## Group 4 — Social
- [ ] `world-emote.js` — emotes + pet-to-pet play (proximity).
- [ ] `world-chat.js` — speech bubbles, input, filter + rate limit + length cap, report/block.
      **TDD** length/rate-limit/filter.
- [ ] Firestore rule for `moderation_reports`; report writes; admin.html queue view (minimal).

## Group 5 — Polish & wire-up
- [ ] Mobile controls polish (joystick + buttons responsive).
- [ ] Capacity/sharding tuning; cull/perf pass.
- [ ] Portal entry from room/outside → `world.html?scene=pool` (gated by `world` flag).
- [ ] Run all `node:test`; smoke-load `world.html` for console errors.

## Verification
- `node --test games/world/js/*.test.js` (all pure-logic tests pass).
- Load `world.html` in a browser: no console errors, scene renders, movement works,
  joystick/keys work. (Live multiplayer requires the corrected `databaseURL`.)
