# Whole-App Redesign — Clay "Bubble Pop" Design System

**Date:** 2026-06-12
**Status:** Approved (design direction), pending implementation plan
**Scope:** Entire app — home board, shared chrome, games hub, every mini-game, and My Room
**Mockups:** `.superpowers/mockups/01-directions.html`, `.superpowers/mockups/02-clay-system.html`

---

## 1. Goal

Replace the current "corkboard / paper-note" skin with a **fresh, modern, claymorphism-led identity** ("Bubble Pop") applied consistently across the whole app, while **keeping every existing feature and all data behavior unchanged**.

The corkboard look is currently enforced by a ~780-line inline `<style>` block of `!important` overrides in `index.html`, plus per-surface CSS in `src/css/` and `games/`. The redesign replaces that with a **token-driven theme** (CSS custom properties) so light/dark and cross-surface consistency "just work" and there are no hardcoded per-screen colors.

### Success criteria
- One coherent clay visual language across home, games, and room.
- Real **WCAG AA** contrast (≥4.5:1 body text, ≥3:1 large/UI) in **both** light and dark.
- A genuine dark mode (not inverted) that still reads as clay.
- Bilingual (English + 中文) renders in one type family.
- No feature removed; no Firestore schema or read/write pattern changed.
- Paid cosmetics (note frames, name colors, titles) still override base styles.

### Non-goals
- No new features, no gameplay changes, no copy rewrites.
- No backend / Firestore rule changes (this is presentation only).
- No framework migration — stays vanilla HTML/CSS/JS.

---

## 2. Design System (tokens)

All values live as CSS custom properties in a new shared stylesheet (see §3). Components reference tokens only — **no raw hex in component rules.**

### 2.1 Color — Light (`:root`, default)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAF3EA` | page background (warm cream) |
| `--surface` | `#FFFFFF` | raised cards/notes |
| `--sunken` | `#F1E8DC` | inset fields/wells |
| `--ink` | `#34271C` | primary text (≈11:1 on surface) |
| `--ink-soft` | `#6B5847` | secondary text (≈5.3:1) |
| `--ink-faint` | `#9B8A78` | meta/timestamps (large/secondary only) |
| `--border` | `rgba(154,52,18,.12)` | hairlines |
| `--primary` | `#F97316` | brand orange (fills/accents) |
| `--primary-deep` | `#EA580C` | orange when carrying text (≥4.5:1 on white) |
| `--primary-tint` | `#FFF1E6` | selected/active wash |
| `--accent` | `#2563EB` | links, secondary CTA (≈5.2:1) |
| `--accent-soft` | `#EAF1FF` | accent wash |
| `--good/-warn/-bad` | `#16A34A / #D97706 / #DC2626` | semantic |

### 2.2 Color — Dark (`[data-theme="dark"]`)
| Token | Value |
|---|---|
| `--bg` | `#1B140E` (warm cocoa) |
| `--surface` | `#2A201A` (lifted) |
| `--sunken` | `#211913` |
| `--ink` | `#F1E8DD` |
| `--ink-soft` | `#C3B3A2` |
| `--ink-faint` | `#8C7C6C` |
| `--border` | `rgba(255,228,194,.10)` |
| `--primary` | `#FB923C` |
| `--primary-deep` | `#FDBA74` (text-bearing on dark) |
| `--accent` | `#60A5FA` |
| `--primary-tint` | `rgba(251,146,60,.16)` |
| `--accent-soft` | `rgba(96,165,250,.16)` |

### 2.3 Typography
- **Display/headings/buttons:** `Baloo 2` (rounded, friendly) — weights 600/700/800.
- **Body/UI:** `Inter` — 400/500/600.
- **CJK:** `Noto Sans SC` in every stack so 中文 matches Latin weight/rhythm.
- Stack: `'Baloo 2','Noto Sans SC',system-ui,sans-serif` (headings); `'Inter','Noto Sans SC',system-ui,sans-serif` (body).
- Loaded via Google Fonts with `display=swap`; only required weights; preconnect.
- **Type scale:** 11 · 12.5 · 14(base) · 16 · 19 · 24 · 30. Line-height 1.5–1.6 body, 1.2 headings.
- Tabular figures for counts/timers/coins.

### 2.4 Elevation (clay shadow system)
| Token | Light | Dark |
|---|---|---|
| `--clay-up` | `7px 7px 18px rgba(154,52,18,.13), -6px -6px 14px #fff` | `6px 6px 16px rgba(0,0,0,.5), -4px -4px 12px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.05)` |
| `--clay-up-sm` | smaller variant | smaller variant |
| `--clay-in` | `inset 3px 3px 7px rgba(154,52,18,.11), inset -2px -2px 5px #fff` | `inset 3px 3px 8px rgba(0,0,0,.5), inset -1px -1px 3px rgba(255,255,255,.04)` |
| `--acc-shadow` | accent button glow + inner highlight | dark-tuned equivalent |

Dark mode replaces the white highlight with a subtle top rim so cards still read as soft 3D rather than flat.

### 2.5 Radius / spacing / motion
- Radii: `--r-sm:12px` · `--r:18px` · `--r-lg:24px` · `--pill:999px`.
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 rhythm.
- Motion: `--dur:200ms` micro, `--ease:cubic-bezier(.2,.8,.2,1)`; press → scale(.97); enter ease-out, exit ~70% duration. All gated by `prefers-reduced-motion`.

### 2.6 Glass (overlays only)
`--glass-bg: rgba(255,255,255,.14)` (light) / `rgba(40,30,22,.55)` (dark); `--glass-blur: 20px`; `--glass-border: rgba(255,255,255,.3)/.14`; scrim `rgba(28,18,8,.55)`. Used for modals/sheets/pickers/dialogs — **not** for content cards (perf + contrast). Provide a non-blur fallback for unsupported browsers.

---

## 3. Token architecture & file organization

Respecting the project rule (categorize files, keep them small, no hardcoded values):

- **`src/css/theme.css`** *(new)* — the single source of truth: `:root` light tokens, `[data-theme="dark"]` overrides, font `@import`/face, and base element resets. Loaded first on every page (home + games + room).
- **`src/css/components.css`** *(new)* — clay component classes built only from tokens: `.btn` variants, `.card/.note`, `.pill/.chip`, `.field`, `.toggle`, `.modal/.glass`, `.dock`, `.bento`, `.sidebar`, `.live-bar`, etc. Replaces scattered ad-hoc rules.
- **`index.html`** — delete the ~780-line inline corkboard `<style>` override block; keep only truly page-specific tweaks (small), referencing tokens. Markup updated for the dock and any structural tweaks.
- **`src/css/style.css` / `interactive.css`** — refactored to consume tokens; corkboard-specific rules removed. Keep file boundaries; split further if a file grows too large.
- **`games/theme.css`** — imports/echoes the same tokens so every game inherits the palette; per-game files keep only board/canvas specifics.
- **`games/room/css/room.css`** — re-skinned to tokens.
- **Theme switching:** `data-theme` attribute on `<html>` (replacing the `body.light-theme` class scheme). The existing pre-paint inline script is updated to set `data-theme` from `localStorage` before first paint (no flash). The Settings toggle writes the attribute + `localStorage`. A back-compat shim keeps any JS that reads the old class working, or those references are updated.

**Cosmetics preservation:** paid cosmetic selectors (`.cos-frame-*`, `.cos-name-rainbow`, `.cos-title`, gold/neon/star frames) keep their specificity/cascade win over base note styles. The token refactor must not raise base specificity above them. This is an explicit test target.

---

## 4. Component specifications

| Component | Today | Clay redesign |
|---|---|---|
| Buttons | wood/gold pills, many `!important` | `.btn` `prim` (orange gradient + accent shadow) / `sec` (clay raised) / `ghost` / `danger`; press-scale; one CTA per surface |
| Answer notes (bubbles) | pinned paper, push-pin bg, rotation | clay raised card, soft radius, tinted avatar chip, ink text; rotation removed for legibility; cosmetics still win |
| Replies / nested | kraft tints | token tints, accent reply link, clear nesting border |
| Reaction pills / add | ink-on-paper chips | clay `.pill`, `.on` = primary-tint; `＋` add affordance |
| Composer / inputs | wood strip + cream field | `.field` inset clay; attach/gif/poll as clay icon buttons; gradient send |
| Toggles / selects / font-size | slider | clay track + accent-on; selected = accent ring |
| Live bar | wood strip | clay raised bar; green presence dot; reaction strip; Playground / 金币乐园 chips |
| Daily quote + comments | kraft card | clay card, orange label, comment thread in tokens |
| Sidebar ("What to Eat?") | wood panel | clay panel; countdown, food spinner, vote list, room link, games — all tokenized; off-canvas on mobile, can dock on ≥1024px |
| Settings & all modals | wood/kraft boxes | frosted **glass** sheet + clay controls; strong scrim; escape/close affordances |
| FABs (riddle/mood/feedback) | 3 stacked floating buttons | one **clay dock** (bottom-right), primary = feedback, expands riddle/mood; fewer floating elements |
| Games hub | vertical list of cards in sidebar | **bento grid**: featured My Room + 金币乐园, then uniform tiles; coin balance chip |
| Gates (access + login) | paper-on-cork | clay card on warm bg; Google button intact |
| Coin center / gacha / slots | dark panels | clay panels + glass overlay; rarity accents via tokens |
| Poll creator / GIF picker / lightbox / celebration / what's-new | mixed | tokenized clay/glass; lightbox stays dark neutral |
| Walking pet | orange cat SVG | kept as-is (mascot); minor re-tint only if needed |
| Mini-games (canvas) | per-game themes ("Midnight" etc.) | shared token chrome (frames, HUD, buttons, modals); canvas palettes harmonized to clay where cheap, gameplay untouched |
| My Room | own theme | clay chrome + tokenized panels; pet/plant art untouched |

---

## 5. Layout / IA changes

1. **FAB dock** — consolidate riddle 🧠 / mood 😊 / feedback 💬 into one dock; reduces floating clutter and overlap with the composer.
2. **Bento games hub** — replaces the long scroll list; featured tiles for My Room and 金币乐园; scales cleanly and reads as a "hub."
3. **Sidebar reorg** — clear sections (Countdown · Food & Vote · Room · Games); on ≥1024px it may dock persistently, off-canvas below.
4. **Hero refinement** — logo + wordmark in Baloo 2; subtitle as quiet meta; remove the rotated paper title.
5. **Consistent chrome** — same top bar, dock, and modal language on every page so games/room feel part of one app.

---

## 6. Accessibility & responsiveness

- Contrast verified per token pair (tables in §2) for light **and** dark.
- Visible focus rings (2–3px accent) on all interactive elements; keyboard order matches visual order; icon-only buttons get `aria-label`.
- Touch targets ≥44×44 (hit-area expansion where the glyph is smaller); ≥8px spacing.
- `prefers-reduced-motion`: disable press-scale, float-in, parallax, decorative motion.
- Breakpoints 375 / 768 / 1024 / 1440; mobile-first; no horizontal scroll; bento reflows (4→2→1); `min-h-dvh` over `100vh`; safe-area padding for dock/composer.
- Color never the sole signal (semantic states pair icon/text).

---

## 7. Rollout phases (each independently shippable)

- **P0 — Foundation:** `theme.css` + `components.css`, fonts, `data-theme` switching + pre-paint, contrast verification. No visual regressions expected beyond intended.
- **P1 — Home board core:** hero, live bar, daily quote, notes/replies/reactions, composer. Remove inline corkboard block.
- **P2 — Shared chrome:** sidebar, settings (glass), access/login gates, dock (FAB consolidation), toasts.
- **P3 — Home secondary surfaces:** poll creator, GIF picker, lightbox, coin center/gacha/slots, riddle, mood, celebration, what's-new.
- **P4 — Games hub + games/theme.css:** bento hub; token adoption across `games/theme.css`.
- **P5 — Individual games:** apply chrome/tokens to each game (2048, block-blast, snake, tetris, flappy, fishing, toto, subway, chinese-chess, feedback) — gameplay untouched.
- **P6 — My Room:** `room.html`, `room.css`, render chrome.
- **P7 — QA pass:** contrast, reduced-motion, responsive, dark-mode parity, cosmetics-still-win, cross-browser (incl. backdrop-filter fallback).

---

## 8. Risks & mitigations
- **Removing the inline override block may regress edge cases** → do it within P1 with before/after visual checks per surface; keep a git checkpoint.
- **`backdrop-filter` perf / support** → glass only on overlays; solid fallback via `@supports`.
- **Paid cosmetics must keep winning** → explicit specificity test in P1/P7.
- **Per-game bespoke themes** → P5 limits scope to chrome + cheap palette harmonization; no gameplay/canvas-logic changes.
- **Bilingual line metrics** → Noto Sans SC paired at matching weights; verify long 中文 strings don't break cards.

---

## 9. Data / Firestore
Presentation-only change. **No** schema, security-rule, or read/write changes. Per project rule, if any incidental data touch appears during implementation, `firestore.rules` will be updated and reads/writes kept minimal — but none is anticipated.
