# Pet World — Multiplayer Multi-Scene Social Space (Design Spec)

**Date:** 2026-07-01
**Status:** Approved design → implementation
**Feature flag:** `world` (Firestore `app_state/features.world`)

---

## 1. Summary

A new **multiplayer social world**: a separate page (`games/world/world.html`) where a
player picks any of the 7 pet types, moves it around themed **scenes** (pool, Egypt,
grassland) with **WASD or an on-screen joystick**, and sees **other real players** moving
live in the same scene with their **name above their head**. Players can **emote**, do
**pet-to-pet play** when near each other, and **chat** (moderated). Each scene grants
themed **actions** plus a per-pet **signature move**. Players can **change their outfit**,
which everyone else sees.

The world reuses the existing procedural pet renderer, accessory renderer, identity, and
the Firebase Realtime Database (RTDB) pattern already used by Coin Rush. The single-player
`room.html` is untouched.

### Decided scope (V1)
- 3 scenes: **pool, Egypt, grassland**.
- Pick & switch **any of the 7 pets** (ownership does not restrict the world).
- **WASD (desktop) + virtual joystick / action buttons (mobile)**.
- **Live multiplayer**: see others move; **name tags** above heads.
- **Interactions**: emotes/reactions **+** pet-to-pet play **+** filtered free-text chat.
- **Actions**: 2–3 scene-themed actions per scene **+** a per-pet signature move per scene.
- **Outfits**: single accessory slot, synced so others see it.
- **Capacity**: sharded instances per scene, soft cap ~20–25.
- **Chat safety**: filtered free-text + rate limit + length cap + report/block → moderation queue.

---

## 2. Architecture

### 2.1 Page & module layout

New page `games/world/world.html`, built like `room.html`: plain `<script defer>` tags with
`?v=` cache-bust, global namespace (no bundler/ES modules). It mirrors the Firebase SDK
`<script>` includes and `initializeApp` bootstrap of `room.html`.

```
games/world/
  world.html
  css/world.css
  js/
    world-core.js       Bootstrap, RAF loop, global state, scene registry dispatch, resize.
    world-config.js     Data-driven config: scene defs, action registry, chat filter list,
                        caps, sync constants. (NO hardcoded values scattered in logic.)
    world-input.js      WASD + virtual joystick + action buttons -> input vector & action events.
    world-net.js        RTDB: presence, position sync (throttled), interpolation buffers,
                        onDisconnect, shard assignment, chat channel, report writes.
    world-actors.js     Draw self + all remote avatars (reuses pet-render), depth sort,
                        remote action playback, name-tag DOM overlay pool.
    world-scene-pool.js     Background draw + walkable bounds + props for the pool scene.
    world-scene-egypt.js    Background draw + walkable bounds + props for the Egypt scene.
    world-scene-grassland.js Background draw + walkable bounds + props for the grassland scene.
    world-actions.js    Scene-themed + per-pet signature action transforms (extends the
                        existing applyActionTransform vocabulary).
    world-chat.js       Chat UI (speech bubbles + input), moderation filter, rate limit,
                        report/block.
    world-outfit.js     In-world wardrobe picker (reuses PET_ACCESSORIES + drawPetAccessory).
    world-emote.js      Emote/reaction UI + pet-to-pet play trigger + proximity check.
```

**Shared pet-render extraction.** The world reuses `drawPetCanvas` / per-pet draw fns /
`drawPetAccessory` / `applyActionTransform` / `drawActionEffect` / `getPetPalette` /
`PET_SIZES` / `PET_ACCESSORIES`. To avoid pulling room bootstrap side-effects into the world
page, the pure render functions are loaded as shared scripts. If any of them read room
globals, they are hardened to accept explicit args or guard on `typeof`. Preferred: the pet
draw core is available to both pages without triggering room state initialization. This is a
small, healthy refactor scoped to what the world needs — not a rewrite.

### 2.2 Render pipeline (per frame, per scene)

```
clear canvas
drawSceneBackground(ctx, scene, W, H, time)     // static/animated themed background + props
sort actors by y (painter's algorithm for depth)
for each actor (self + remotes):
    project normalized (x,y) -> pixel (px,py); depthScale from y
    ctx.save(); ctx.translate(px,py); ctx.scale(±depthScale, depthScale)
    bob/tilt; applyActionTransform(action, ap); drawPetCanvas(...); drawPetAccessory(...);
    drawActionEffect(...); ctx.restore()
position name-tag DOM divs from projected coords (reused div pool)
draw local UI overlays (joystick, action buttons, chat) — DOM, not canvas
```

Coordinates are **normalized 0–1** (matches farm/aquarium). Depth-scale (smaller when higher
on screen) reuses the existing pet perspective.

### 2.3 State

`world-core.js` owns a single `W` (world state) object:
```
W = {
  scene: 'pool', shard: 0,
  me: { uid, name, pet, color, outfit, x, y, facing, action, actionUntil, vx, vy },
  remotes: { [uid]: { name, pet, color, outfit, x, y, targetX, targetY, facing,
                      action, actionUntil, lastTs } },
  chat: [ {uid,name,text,ts} ],   // limitToLast(N)
  blocked: Set<uid>,              // local block list (localStorage)
}
```

---

## 3. Multiplayer netcode

### 3.1 Transport
Firebase **Realtime Database** (compat SDK, `firebase.database()`), mirroring the working
idiom in `src/js/coin-rush.js`. **Blocker:** `firebase-config.js` `databaseURL` is a Console
URL placeholder — it is replaced with the correct regional `databaseURL`
(`https://nymous-4bce7-default-rtdb.<region>.firebasedatabase.app` — verify exact value in
Firebase Console; the existing code comment notes the DB is in Singapore / `asia-southeast1`).

### 3.2 Data model (RTDB)
```
world/
  scenes/
    {sceneId}/                       // 'pool' | 'egypt' | 'grassland'
      {shardId}/                     // 0,1,2… (sharding for capacity)
        players/
          {uid}: { name, pet, color, outfit, x, y, facing,
                   action, actionTs, ts }     // onDisconnect().remove()
        chat/
          {pushId}: { uid, name, text, ts }   // read via limitToLast(N)
moderation_reports/                  // Firestore, not RTDB (see 3.6)
```

### 3.3 Write throttling (cost control — project rule)
- Position writes **≤ 5 Hz** and **only on meaningful change**: moved > epsilon, or
  `facing`/`action` changed. Standing still ⇒ **no writes**.
- Coalesce: one `.update()` per tick with the changed fields + `ts`.
- Emotes/actions ride the same node (`action` + `actionTs`), fire-and-forget.
- Chat writes are user-initiated only, rate-limited client-side (see 5.3) and rules-limited.

### 3.4 Reads
- Subscribe (`onValue`) to **only the current `{sceneId}/{shardId}/players`** node; detach on
  leave/scene-change/shard-change.
- Chat: `.limitToLast(N)` (e.g. 30) on the current shard's `chat` node.
- Never subscribe to all scenes/shards at once.

### 3.5 Presence, interpolation, sharding
- **Presence/despawn:** `onDisconnect().remove()` on the player node; plus a client TTL
  filter (ignore/despawn remotes whose `ts` is older than ~30 s) as a backstop.
- **Interpolation:** remotes store `{x,y}` as `targetX/targetY`; each frame lerp current
  toward target (buffer ~120 ms) so 5 Hz looks smooth. Snap on large deltas (scene change).
- **Sharding:** on entering a scene, read shard player-counts; join the **first shard under
  the soft cap** (~20–25); if all full, create the next shard index. Deterministic,
  transaction-guarded count check to avoid overfilling. Each shard is an isolated instance
  (bounded render + read/write cost).

### 3.6 Security rules
- **RTDB (`database.rules.json`)** — new `world` subtree:
  - `world/scenes/{scene}/{shard}/players/{uid}`: `.write` only if `auth.uid == $uid`;
    validate `x`,`y` are numbers in `[0,1]`; `name` string length-capped; `pet` in the known
    set; `action` string; no economy fields.
  - `world/scenes/{scene}/{shard}/chat/{id}`: `.write` requires `auth != null`, `uid ==
    auth.uid`, `text` string length ≤ cap.
  - `.read`: `auth != null`.
- **Firestore rules** — `moderation_reports/{id}` writable by authed users (create only, own
  `reporterUid`), readable only by admins (mirrors existing admin patterns); outfit/pet
  persistence continues to use existing `rooms/{uid}` rules.

### 3.7 Identity
Reuse `getPlayerName()` + Firebase Auth `uid` (anonymous auth as the rest of the app uses).
No new login. Name tag text = display name.

---

## 4. Movement, pets & actions

### 4.1 Input (`world-input.js`)
- Desktop: **WASD** (and arrow keys) → 8-direction input vector; keys `1`–`5` / `J`/`K` etc.
  trigger emote & scene actions (configurable in `world-config.js`).
- Mobile/touch: on-screen **virtual joystick** (drag within a base circle → vector) + a small
  cluster of **action buttons** (emote, scene action, chat). Detected via pointer/touch.
- Output: a normalized movement vector + discrete action events. Pure vector math is unit-
  tested.

### 4.2 Movement
- `me.x/y += vector * speed * dt`, clamped to the current scene's **walkable bounds**
  (per-scene, from `world-config.js`). `facing = vx>0`. `legPhase` advances while moving.
- Reuses the existing pet bob/tilt/depth pipeline.

### 4.3 Pet picker
- A picker lists all 7 pets (+ color options via `getPetPalette` colorKeys). Selecting updates
  `me.pet`/`me.color` and the synced node immediately.

### 4.4 Actions (data-driven registry)
`world-config.js` defines:
```
WORLD_ACTIONS = {
  emote: { wave, heart, laugh, … },              // global, any scene
  scene: {
    pool:      ['splash','dive','float'],
    egypt:     ['bow','digSand'],
    grassland: ['roll','pounce'],
  },
  signature: {                                    // per-pet per-scene signature move
    pool:      { cat:'catPoolX', dog:'dogPoolY', … },
    egypt:     { … }, grassland: { … },
  },
}
```
Each action id maps to a transform in `world-actions.js`, extending the existing
`applyActionTransform` vocabulary (and optionally `drawActionEffect` for particles). Actions
are triggered locally (key/button), broadcast via `action`+`actionTs`, and played on remotes.

> **Effort note:** scene-themed actions ≈ 6–9 transforms; per-pet signatures ≈ 21 (7 pets ×
> 3 scenes). V1 ships the registry + a solid parameterized set of signatures; fully bespoke
> hand-tuning of all 21 is an ongoing art task tracked separately.

### 4.5 Scenes
Each `world-scene-*.js` exports `{ draw(ctx,W,H,t), bounds, spawn, props }`:
- **pool:** water, tiles, loungers, umbrellas; walkable = pool deck + shallow water.
- **egypt:** pyramids, sand dunes, palms, obelisks; walkable = sand.
- **grassland:** rolling hills, grass tufts, flowers, sky; walkable = field.
Procedural canvas art in the existing claymorphism style, ~200 LOC each.

---

## 5. Interactions

### 5.1 Emotes (`world-emote.js`)
Key/button → an emote action broadcast on the player node; renders above the pet, auto-expires
via `actionUntil`. Fire-and-forget (feels instant at 5 Hz).

### 5.2 Pet-to-pet play
When `me` is within a proximity radius of another actor and triggers "play", both play a
reciprocal animation (nuzzle/chase/dance). Each side triggers locally + broadcasts its own
action; proximity-gated. Cozy/visual — no authoritative handshake.

### 5.3 Chat + moderation (`world-chat.js`)
- **UI:** speech bubble above the sender's pet (auto-expire) + a compact recent-messages log.
- **Send path (all enforced client-side, chat write also rules-limited):**
  1. **Length cap** (e.g. ≤ 100 chars).
  2. **Rate limit** (e.g. ≤ 5 messages / 10 s, sliding window).
  3. **Profanity/blocklist filter** — config-driven word list in `world-config.js` (NOT
     hardcoded in logic); blocked words rejected or masked before send.
- **Receive path:** filter again on display (defense in depth); hide messages from **locally
  blocked** uids.
- **Report/block:** each remote actor/message has a report action → writes a
  `moderation_reports` doc (Firestore: reporterUid, targetUid, sceneId, text, ts) for review
  in `admin.html`; **block** hides that uid's messages + avatar locally (persisted in
  localStorage).

---

## 6. Outfits, name tags

### 6.1 Outfits (`world-outfit.js`)
- Wardrobe picker lists owned accessories (`PET_ACCESSORIES` catalog, ownership from the
  existing `rooms/{uid}` data). Equipping sets `me.outfit` (accessory id), synced to the
  player node so **others see it** via `drawPetAccessory` in the actor pass, and persisted to
  `rooms/{uid}` (Firestore) so it sticks. **V1 = single slot** (matches current data). Multi-
  slot (hat+glasses+cape) is a later `accessory`→`accessories[]` change.

### 6.2 Name tags (`world-actors.js`)
- DOM overlay `<div>` per visible actor, positioned each frame from the avatar's projected
  pixel coords (crisp CJK via existing Noto Sans SC + emoji). Reused from a div pool to avoid
  DOM churn. Shows display name (self highlighted).

---

## 7. Cross-cutting

- **Feature flag:** add `world: ['worldEntry']` to `feature-flags.js` MAP so the portal/entry
  can be hidden (kill-switch / dark launch).
- **Navigation:** a **portal** entry point from the existing room/outside view opens
  `world.html?scene=pool` (deep-linkable to a scene).
- **Rules updated both sides:** `database.rules.json` (RTDB world subtree) **and** Firestore
  rules (moderation reports); reads/writes optimized (scene/shard-scoped subscribe, write-on-
  delta, `limitToLast` chat).
- **No hardcoding:** scenes, actions, chat filter, caps, sync constants all live in
  `world-config.js` / per-scene modules.
- **Comments:** non-obvious logic (interpolation, sharding, throttle, filter) is commented.
- **Testing (`node:test`):** pure logic only — movement clamp, input vector, position-throttle
  (write-on-delta), interpolation lerp, shard assignment, chat length/rate-limit, profanity
  filter, action-registry lookups. Modules expose these via a `typeof module` export guard so
  node can `require` them while the browser uses the global. Rendering verified manually.
- **Performance:** per-shard actor cap (~20–25), cull off-screen actors, simplify far/small
  avatars, reuse name-tag DOM pool, single RAF.

### Build order (internal; V1 ships all)
1. **Foundation** — fix `databaseURL`; `world.html` + core + one scene + solo movement + input.
2. **Netcode** — RTDB sync, presence/onDisconnect, remote actors + interpolation, name tags,
   sharding, security rules. *(Now you see other players.)*
3. **Content** — 3 scene backgrounds, scene actions, per-pet signatures, pet picker, outfit picker.
4. **Social** — emotes, pet-play, chat + moderation.
5. **Polish** — mobile controls, capacity tuning, perf pass, feature-flag wiring, portal.

---

## 8. Risks

1. **Animation/art volume** (~30 actions + 3 scene backgrounds) is the dominant effort; V1
   ships a solid parameterized signature set, not 21 fully bespoke animations.
2. **Chat moderation** is a real safety surface for a young audience — filter + rate limit +
   report/block + moderation queue.
3. **Firebase cost** — mitigated by ≤5 Hz write-on-delta, scene/shard-scoped reads, chat
   `limitToLast`, and idle = zero writes.
4. **Shared pet-render extraction** must not drag in room bootstrap side-effects.
5. **`databaseURL` correctness** — must be verified in the Firebase Console (also unblocks
   Coin Rush robbing).
6. **Mobile perf** with many procedural avatars — per-shard cap + culling.
7. **Client-authoritative positions** — acceptable for a cozy world; rules clamp ranges and
   forbid economy writes.

---

## 9. Out of scope (V1)
- Multi-slot outfits (hat+glasses+cape simultaneously).
- Trading/gifting/economy transactions between players in the world.
- Voice; friend lists; private rooms/instances by invite.
- Server-authoritative simulation / anti-cheat beyond rule validation.
- Fully bespoke per-pet-per-scene animation art (framework + parameterized set ships; bespoke
  polish is a follow-up art track).
