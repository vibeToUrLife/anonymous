# Clay "Bubble Pop" Redesign — Plan 1: Foundation + Home Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the corkboard skin with the token-driven Clay "Bubble Pop" identity across the entire home page (`index.html` + `src/`), with light/dark, accessibility, and every feature intact.

**Architecture:** A single source-of-truth token stylesheet (`src/css/theme.css`) + a clay component stylesheet (`src/css/components.css`) drive all surfaces via CSS custom properties. A tiny `src/js/theme.js` controls `data-theme` on `<html>`. Each home surface is migrated to clay one task at a time; each surface's old `!important` corkboard rules are deleted as it is converted, so there is never a fully-broken intermediate. The ~780-line inline corkboard `<style>` block in `index.html` is emptied by the final task.

**Tech Stack:** Vanilla HTML/CSS/JS, CSS custom properties, Google Fonts (Baloo 2 / Inter / Noto Sans SC), Node `node:test` for the one piece of testable JS logic.

**Reference mockups (canonical visual values):** `.superpowers/mockups/02-clay-system.html` (board light+dark, components, glass modal), `.superpowers/mockups/01-directions.html`. **Spec:** `docs/superpowers/specs/2026-06-12-clay-redesign-design.md`.

**Scope of this plan:** Foundation (P0) + the whole of `index.html` (P1 board + P2 chrome + P3 secondary surfaces). Out of scope (later plans): games hub bento (P4), individual games (P5), My Room (P6).

**Commits:** Project rule says *do not direct-commit*. Each task ends with a **staged checkpoint** (`git add`) and a suggested message; **leave the actual `git commit` to the user** unless they say otherwise. The implementer should pause at each checkpoint, not commit automatically.

**Transitional note:** Until P2/P3 tasks run, opening the sidebar or a not-yet-migrated modal shows functional-but-unconverted styling. The main board view is fully clay after the P1 tasks.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/css/theme.css` | Tokens (light+dark), fonts, base resets, focus, reduced-motion | **Create** |
| `src/css/components.css` | Clay component classes built only from tokens | **Create** |
| `src/js/theme.js` | `data-theme` control + pure helpers | **Create** |
| `src/js/theme.test.js` | Unit test for theme helpers | **Create** |
| `index.html` | Link new CSS/JS; pre-paint `data-theme`; per-surface markup/class updates; empty the inline corkboard `<style>` | **Modify** |
| `src/css/style.css` | Base layout; strip corkboard-specific rules, consume tokens | **Modify** |
| `src/css/interactive.css` | Coin center / gacha / live features styling → tokens | **Modify** |

---

## Task 1: Token foundation — `src/css/theme.css`

**Files:**
- Create: `src/css/theme.css`

- [ ] **Step 1: Create the file with the full token system**

```css
/* theme.css — Clay "Bubble Pop" design tokens. SINGLE SOURCE OF TRUTH.
   Light = :root (default). Dark = [data-theme="dark"] on <html>.
   Components must reference var(--token) only — never raw hex. */
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');

:root{
  /* type families + scale */
  --font-display:'Baloo 2','Noto Sans SC',system-ui,sans-serif;
  --font-body:'Inter','Noto Sans SC',system-ui,sans-serif;
  --fs-xs:11px; --fs-sm:12.5px; --fs-base:14px; --fs-md:16px; --fs-lg:19px; --fs-xl:24px; --fs-2xl:30px;
  /* radius / spacing / motion */
  --r-sm:12px; --r:18px; --r-lg:24px; --pill:999px;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-6:24px; --sp-8:32px;
  --dur:200ms; --ease:cubic-bezier(.2,.8,.2,1);
  /* semantic */
  --good:#16a34a; --warn:#d97706; --bad:#dc2626;
  /* brand */
  --primary:#f97316; --primary-deep:#ea580c; --on-primary:#ffffff; --accent:#2563eb;
  /* LIGHT surfaces + ink */
  --bg:#faf3ea; --surface:#ffffff; --sunken:#f1e8dc;
  --ink:#34271c; --ink-soft:#6b5847; --ink-faint:#9b8a78;
  --border:rgba(154,52,18,.12);
  --primary-tint:#fff1e6; --accent-soft:#eaf1ff;
  /* clay elevation (light) */
  --clay-up:7px 7px 18px rgba(154,52,18,.13),-6px -6px 14px #ffffff;
  --clay-up-sm:5px 5px 12px rgba(154,52,18,.12),-4px -4px 10px #ffffff;
  --clay-in:inset 3px 3px 7px rgba(154,52,18,.11),inset -2px -2px 5px #ffffff;
  --acc-shadow:5px 5px 14px rgba(249,115,22,.4),inset 1px 1px 2px rgba(255,255,255,.5);
  /* glass (overlays only) */
  --glass-bg:rgba(255,255,255,.14); --glass-border:rgba(255,255,255,.3); --glass-blur:20px;
  --scrim:rgba(28,18,8,.55);
}
[data-theme="dark"]{
  --primary:#fb923c; --primary-deep:#fdba74; --accent:#60a5fa;
  --bg:#1b140e; --surface:#2a201a; --sunken:#211913;
  --ink:#f1e8dd; --ink-soft:#c3b3a2; --ink-faint:#8c7c6c;
  --border:rgba(255,228,194,.10);
  --primary-tint:rgba(251,146,60,.16); --accent-soft:rgba(96,165,250,.16);
  --clay-up:6px 6px 16px rgba(0,0,0,.5),-4px -4px 12px rgba(255,255,255,.04),inset 0 1px 0 rgba(255,255,255,.05);
  --clay-up-sm:4px 4px 11px rgba(0,0,0,.45),-3px -3px 9px rgba(255,255,255,.035),inset 0 1px 0 rgba(255,255,255,.05);
  --clay-in:inset 3px 3px 8px rgba(0,0,0,.5),inset -1px -1px 3px rgba(255,255,255,.04);
  --acc-shadow:4px 4px 14px rgba(0,0,0,.5),inset 1px 1px 2px rgba(255,255,255,.18);
  --glass-bg:rgba(40,30,22,.55); --glass-border:rgba(255,255,255,.14); --scrim:rgba(10,6,3,.62);
}

/* base */
html{ -webkit-text-size-adjust:100%; }
body{ background:var(--bg); color:var(--ink); font-family:var(--font-body); font-size:var(--fs-base); line-height:1.55; -webkit-font-smoothing:antialiased; }
h1,h2,h3,h4{ font-family:var(--font-display); }

/* a11y: always-visible keyboard focus */
:focus-visible{ outline:3px solid var(--accent); outline-offset:2px; border-radius:4px; }

/* a11y: respect reduced motion */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{ animation-duration:.001ms !important; animation-iteration-count:1 !important;
    transition-duration:.001ms !important; scroll-behavior:auto !important; }
}
```

- [ ] **Step 2: Verify token values against the spec**

Open `docs/superpowers/specs/2026-06-12-clay-redesign-design.md` §2 and confirm every token value matches. Confirm the dark block only overrides surfaces/ink/brand/elevation/glass (not type/spacing).
Expected: exact match.

- [ ] **Step 3: Stage checkpoint**

```bash
git add src/css/theme.css
# suggested commit (leave to user): "feat(design): add Clay token foundation theme.css"
```

---

## Task 2: Theme control module — `src/js/theme.js` (+ test)

**Files:**
- Create: `src/js/theme.js`
- Test: `src/js/theme.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/js/theme.test.js
const test = require('node:test');
const assert = require('node:assert');
const T = require('./theme.js');

test('resolveTheme defaults to light for null/unknown', () => {
  assert.strictEqual(T.resolveTheme(null), 'light');
  assert.strictEqual(T.resolveTheme('light'), 'light');
  assert.strictEqual(T.resolveTheme('banana'), 'light');
});
test('resolveTheme honors dark', () => {
  assert.strictEqual(T.resolveTheme('dark'), 'dark');
});
test('nextTheme flips', () => {
  assert.strictEqual(T.nextTheme('light'), 'dark');
  assert.strictEqual(T.nextTheme('dark'), 'light');
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `node --test src/js/theme.test.js`
Expected: FAIL — `Cannot find module './theme.js'`.

- [ ] **Step 3: Implement `src/js/theme.js`**

```js
/* theme.js — light/dark control for the Clay design system.
   Pure helpers (resolveTheme/nextTheme) are unit-tested; DOM/localStorage
   wiring runs only in the browser. Dual-export: CommonJS for tests + window global. */
(function (root) {
  'use strict';
  var STORAGE_KEY = 'theme'; // stored value: 'dark' | 'light'

  function resolveTheme(stored) { return stored === 'dark' ? 'dark' : 'light'; } // default light
  function nextTheme(current) { return current === 'dark' ? 'light' : 'dark'; }

  var api = { resolveTheme: resolveTheme, nextTheme: nextTheme, STORAGE_KEY: STORAGE_KEY };

  if (typeof document !== 'undefined') {
    function apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      // Back-compat: legacy CSS/JS keyed on body.light-theme (removed by Task 16).
      if (document.body) document.body.classList.toggle('light-theme', theme === 'light');
    }
    function getStored() { try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } }
    function setTheme(theme) { try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {} apply(theme); }
    api.apply = apply;
    api.getTheme = function () { return resolveTheme(getStored()); };
    api.setTheme = setTheme;
    api.toggle = function () { setTheme(nextTheme(api.getTheme())); };
    api.init = function () { apply(api.getTheme()); };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Theme = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test; verify it passes**

Run: `node --test src/js/theme.test.js`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 5: Stage checkpoint**

```bash
git add src/js/theme.js src/js/theme.test.js
# suggested: "feat(design): add theme.js data-theme controller + tests"
```

---

## Task 3: Component library — `src/css/components.css`

Port the clay component classes from `.superpowers/mockups/02-clay-system.html` (canonical values), generalized to tokens. These classes are consumed by later tasks.

**Files:**
- Create: `src/css/components.css`

- [ ] **Step 1: Create `components.css` with the core classes**

Port these class groups from mockup 02's `<style>` (swap any literal hex for the matching `var(--token)`; the mockup already uses the token names inside `.theme`):
- **Buttons:** `.btn`, `.btn--primary` (gradient `--primary`→deep + `--acc-shadow`), `.btn--secondary` (`--surface` + `--clay-up-sm`), `.btn--ghost`, `.btn--danger` (text `--bad`). Press: `:active{ transform:scale(.97); }`. `:disabled{ opacity:.5; cursor:not-allowed; }`.
- **Surfaces:** `.clay-card` (`--surface` + `--clay-up` + `--r`), `.clay-card--sm`, `.clay-inset` (`--sunken` + `--clay-in`).
- **Field:** `.clay-field` (input/textarea: `--surface`, `--clay-in`, radius `14px`, `color:var(--ink)`; placeholder `--ink-faint`). Min-height 44px for touch.
- **Pills/chips:** `.pill` (`--bg` + `--clay-up-sm`), `.pill--on` (`--primary-tint` + `--primary-deep`), `.chip`, `.chip--accent` (gradient + `--acc-shadow`).
- **Toggle:** `.clay-toggle` track (`--sunken` + `--clay-in`), `.clay-toggle--on` (gradient + `--acc-shadow`), knob `i`, 44px+ hit area.
- **Avatar:** `.ava` (`--primary-tint`), `.ava--accent` (`--accent-soft`), variants for green/pink tints.
- **Dock:** `.clay-dock`, `.clay-dock__btn`, `.clay-dock__btn--main`.
- **Glass overlay:** `.glass-sheet` (`background:var(--glass-bg)`, `backdrop-filter:blur(var(--glass-blur))`, `border:1px solid var(--glass-border)`), `.scrim` (`background:var(--scrim)`), with `@supports not (backdrop-filter:blur(1px)){ .glass-sheet{ background:var(--surface); } }` fallback.
- **Bento (for later P4 but define now):** `.bento`, `.tile`, `.tile--feat`, `.tile--wide`.

All interactive classes get `cursor:pointer` and a `transition:transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease)`.

- [ ] **Step 2: Sanity-check in isolation**

Temporarily open mockup 02 in the browser; confirm the ported classes visually match (buttons, pills, toggle, field, glass modal) in both `.light` and `.dark`.
Expected: visual parity with the mockup.

- [ ] **Step 3: Stage checkpoint**

```bash
git add src/css/components.css
# suggested: "feat(design): add clay components.css"
```

---

## Task 4: Wire foundation into `index.html`

**Files:**
- Modify: `index.html` (head links + pre-paint script + settings theme toggle wiring)

- [ ] **Step 1: Add stylesheet links + font preconnect in `<head>`**

After the existing `interactive.css` link (around `index.html:9`), add:

```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="./src/css/theme.css">
  <link rel="stylesheet" href="./src/css/components.css">
```

- [ ] **Step 2: Replace the pre-paint theme script**

Replace the body-start script at `index.html:789`:

```html
  <script>if(localStorage.getItem('theme')!=='dark')document.body.classList.add('light-theme');</script>
```
with a `data-theme` pre-paint (keeps legacy class during transition):

```html
  <script>(function(){try{var t=localStorage.getItem('theme')==='dark'?'dark':'light';document.documentElement.setAttribute('data-theme',t);if(t==='light')document.body&&document.body.classList.add('light-theme');}catch(e){}})();</script>
```

- [ ] **Step 3: Load `theme.js` and wire the settings toggle**

Add `<script src="./src/js/theme.js"></script>` with the other `src/js` scripts (near `index.html:1307`). Find the existing `themeToggle` handler in `src/js/app.js` (search `themeToggle`) and route it through `Theme`: on change, `Theme.toggle()` (or `Theme.setTheme(checked?'dark':'light')`), and initialize the checkbox state from `Theme.getTheme()`. Call `Theme.init()` on load. Keep any existing board re-theme side-effects.

- [ ] **Step 4: Verify**

Open `index.html` in the browser. Toggle Dark/Light in Settings.
Expected: `<html data-theme>` flips; choice persists on reload; no flash of wrong theme. Board still renders (old corkboard CSS still active — that's fine here).

- [ ] **Step 5: Stage checkpoint**

```bash
git add index.html src/js/app.js
# suggested: "feat(design): wire theme.css/components.css + data-theme switching"
```

---

## Task 5: Page background + hero

**Files:**
- Modify: `index.html` (inline `<style>` body bg rules ~412-433; hero `.page-title*` ~334-359, 432-448; markup ~1061-1077)

- [ ] **Step 1: Remove the corkboard body background**

Delete the `body{...}` and `body.light-theme{...}` corkboard background blocks (`index.html:412-431`) and the two `.page-subtitle` color overrides (432-433). `theme.css` `body` now supplies `--bg`.

- [ ] **Step 2: Restyle the hero**

Replace the paper-note `.page-title` rules (`index.html:334-359`) so the title uses `font-family:var(--font-display); font-weight:800; color:var(--ink); font-size:var(--fs-2xl);` with no rotation, no paper background, no push-pin pseudo-element. `.page-subtitle{ color:var(--ink-faint); font-size:var(--fs-sm); }`. Remove the logo recolor overrides at 446-448 (logo keeps its SVG; optionally retint `.logo-body`/`.logo-dot` to `--primary`/`--surface` via a small rule).

- [ ] **Step 3: Verify**

Reload. Hero is a clean Baloo 2 wordmark on cream (light) / cocoa (dark); subtitle quiet. No rotated paper, no pin.
Expected: matches mockup 02 §1 header.

- [ ] **Step 4: Stage checkpoint**

```bash
git add index.html
# suggested: "feat(design): clay page background + hero"
```

---

## Task 6: Live bar + chips + daily quote

**Files:**
- Modify: `index.html` (inline rules: live bar 607; daily-quote 69-112, 593-604; quote-comments 114-196; markup 1081-1116)

- [ ] **Step 1: Restyle the live bar**

Replace the `.live-bar` wood rule (`index.html:607`) and any `.live-presence`/`.live-typing` color overrides (754-764) with the clay bar from components/mockup: `.live-bar{ background:var(--surface); box-shadow:var(--clay-up-sm); border-radius:var(--r); color:var(--ink); }`. Presence count uses `color:var(--primary-deep)`. The `.pg-toggle`/`#coinCenterBtn` become `.chip`/`.chip--accent`.

- [ ] **Step 2: Restyle the daily quote + comments**

Replace the kraft `.daily-quote-banner` rules (69-112, 593-604) with `.clay-card`: `background:var(--surface); box-shadow:var(--clay-up); border-radius:var(--r);` (remove the `::before` purple wash and rotation). `.daily-quote-label{ color:var(--primary-deep); }` `.daily-quote-text{ color:var(--ink); }`. Re-token the `.qc-*` comment classes (114-196): inputs → `.clay-field`, send → `.btn--primary`, items → `--sunken`/`--ink-soft`, names → `--primary-deep`.

- [ ] **Step 3: Verify (light + dark)**

Reload, toggle theme. Live bar + quote + comment thread are clay in both modes; presence/label accents readable (≥4.5:1).
Expected: matches mockup 02 §1.

- [ ] **Step 4: Stage checkpoint**

```bash
git add index.html
# suggested: "feat(design): clay live bar, chips, daily quote + comments"
```

---

## Task 7: Answer notes (bubbles), replies & reactions — **preserve cosmetics**

**Files:**
- Modify: `index.html` (inline `.bubble*` block 450-595; reactions/replies within)

- [ ] **Step 1: Replace the paper-note bubble styling**

Replace the `.bubble` corkboard rules (450-595, including the dark-kraft `body:not(.light-theme)` block) with clay-card notes driven by tokens:

```css
.bubble{ background:var(--surface); color:var(--ink); border-radius:var(--r);
  box-shadow:var(--clay-up); padding:14px 15px; border:1px solid var(--border); }
.bubble:hover{ transform:translateY(-2px); box-shadow:var(--clay-up); }
```
Remove: push-pin radial background, `padding-top:30px`, the `rotate()` transforms, the `.c0..c15` paper/pin pairs, and the speech-tail hiding hacks (no longer needed). Re-token footer/reply/reaction/HP/poll-in-note classes to `--ink-soft`/`--primary-tint`/`--accent` (mirror the mockup `.note`/`.rp`/`.rep`). Reactions: `.reaction-btn`→`.pill`, `.reaction-btn.reacted`→`.pill--on`.

- [ ] **Step 2: Keep paid cosmetics winning (regression guard)**

In the browser, render a note whose markup includes a cosmetic class (`cos-frame-simple`, `cos-frame-gold`/neon/star, `cos-name-rainbow`, `cos-title`). Confirm the cosmetic frame/name/title still overrides the base `.bubble`. If the new base rule out-specifies a cosmetic, lower base specificity (single class, no `!important`) until the cosmetic wins.
Expected: cosmetic frames/names/titles visually intact.

- [ ] **Step 3: Verify (light + dark)**

Post test notes (EN + 中文), add reactions, open a reply thread.
Expected: clay notes, tinted avatar chips, readable ink, accent reply link; matches mockup 02 §1; no text rotation/clipping.

- [ ] **Step 4: Stage checkpoint**

```bash
git add index.html
# suggested: "feat(design): clay answer notes, replies, reactions (cosmetics preserved)"
```

---

## Task 8: Composer / input area

**Files:**
- Modify: `index.html` (inline `.input-area*` 608-613; markup 1182-1193)

- [ ] **Step 1: Restyle the composer**

Replace the wood `.input-area` rules (608-613) with: bar `background:var(--bg)`, textarea → `.clay-field`, `.attach-btn`/`.gif-btn`/`.poll-btn` → clay icon buttons (`--surface` + `--clay-up-sm`, icon color `--primary`), `#sendBtn` → `.btn--primary`. Remove the dark-mode textarea override (now token-driven). Replace the 📷/GIF/📊 emoji/text triggers with inline SVG icons per the no-emoji-as-structural-icons rule (keep `aria-label`s).

- [ ] **Step 2: Verify (light + dark, mobile width)**

At 375px width: composer fits, no horizontal scroll, send is one primary CTA, fields ≥44px tall.
Expected: matches mockup 02 §1 composer.

- [ ] **Step 3: Stage checkpoint**

```bash
git add index.html
# suggested: "feat(design): clay composer with SVG action icons"
```

---

## Task 9: Sidebar panel (countdown · food/vote · room · games list)

**Files:**
- Modify: `index.html` (inline sidebar rules 11-44, 626-658; markup 923-1059), `src/css/style.css` (base `.sidebar` layout)

- [ ] **Step 1: Restyle the sidebar shell + sections**

Replace the wood `.sidebar` rules (626-658) and the light-theme sidebar overrides (11-44) with: `.sidebar{ background:var(--surface); border-right:1px solid var(--border); color:var(--ink); }`. Section headings `--primary-deep`; collapse toggles → `.clay-inset` bars; countdown display/inputs → `.clay-field`/`.clay-inset`; food input → `.clay-field`, add/spin buttons → `.btn--primary`/`.btn--secondary`; vote items → `.clay-card--sm`; `.game-card` links → `.clay-card--sm` rows with tinted emoji avatars. Remove `#miniGamesBody` cork texture (366-370).

- [ ] **Step 2: Verify (light + dark, mobile + ≥1024px)**

Open the sidebar (☰). All controls clay & readable in both themes; off-canvas slide works; no clipped text.
Expected: cohesive clay panel.

- [ ] **Step 3: Stage checkpoint**

```bash
git add index.html src/css/style.css
# suggested: "feat(design): clay sidebar (countdown, food/vote, games list)"
```

---

## Task 10: Settings modal → frosted glass

**Files:**
- Modify: `index.html` (inline modal rules 667-784; settings markup 830-917)

- [ ] **Step 1: Restyle settings as a glass sheet**

Replace the wood/kraft `.settings-box` + `.settings-overlay` rules (715-784, 717-720) with `.glass-sheet` + `.scrim`. Inner controls: rows → token surfaces, toggles → `.clay-toggle`, font-size `.settings-select` buttons → `.btn--secondary`/active `.btn--primary`, name input → `.clay-field`, cache/close → `.btn--secondary`, logout → `.btn--danger`. Ensure the modal animates from center (scale+fade) and has a visible close + Esc handling.

- [ ] **Step 2: Verify (light + dark)**

Open Settings over the board; background is blurred & dimmed; controls readable; toggles reflect state; Close + Esc work.
Expected: matches mockup 02 §4.

- [ ] **Step 3: Stage checkpoint**

```bash
git add index.html
# suggested: "feat(design): glass settings modal + clay controls"
```

---

## Task 11: Access gate + login gate

**Files:**
- Modify: `index.html` (inline `.access-gate*` 198-235, `.login-box`/`.access-gate-box` 615-624; markup 791-815)

- [ ] **Step 1: Restyle both gates**

Replace the paper `.login-box`/`.access-gate-box` rules (615-624) with `.clay-card` on a `--bg` page; the access-gate full-screen background uses `--bg` (not the dark gradient at 202). Inputs → `.clay-field`, enter button → `.btn--primary`. Keep the Google sign-in button's brand SVG and proportions unchanged.

- [ ] **Step 2: Verify (light + dark)**

Clear `localStorage` access flag; reload. Access gate then login gate both render as clay cards; Google button intact; code entry + sign-in still function.
Expected: matches the clay card language; auth unaffected.

- [ ] **Step 3: Stage checkpoint**

```bash
git add index.html
# suggested: "feat(design): clay access + login gates"
```

---

## Task 12: FAB dock (consolidate riddle / mood / feedback)

**Files:**
- Modify: `index.html` (inline `.feedback-fab` 46-67, 661-665; markup 1228-1253), `src/js` if any FAB positioning logic exists (search `feedback-fab`, `riddle-fab`, `mood-fab`)

- [ ] **Step 1: Build the dock**

Wrap the three FAB triggers (`feedbackFab`, `riddleFab`, `moodFab`) in a `.clay-dock` (bottom-right, safe-area padded). Feedback = `.clay-dock__btn--main`; riddle + mood = `.clay-dock__btn`. Remove the individual `position:fixed; bottom:…` offsets (46-67, 661-665) — the dock owns layout. Keep each button's existing click handler/`href`/`aria-label`.

- [ ] **Step 2: Verify (mobile + desktop)**

At 375px and 1440px: dock sits bottom-right, doesn't overlap the composer or board content, all three actions work, targets ≥44px.
Expected: matches mockup 02 §1 dock; fewer floating elements.

- [ ] **Step 3: Stage checkpoint**

```bash
git add index.html
# suggested: "feat(design): consolidate FABs into clay dock"
```

---

## Task 13: Secondary overlays — poll creator, GIF picker, lightbox, celebration, what's-new

**Files:**
- Modify: `index.html` (inline rules: poll 35-44/707-784; gif picker 707-784; what's-new 237-326; markup 1195-1289), `src/css/interactive.css` if related selectors live there (search each class)

- [ ] **Step 1: Re-token each overlay**

- **Poll creator** (`.poll-creator*`): `.glass-sheet`/`.clay-card`; question/option inputs → `.clay-field`; add-option → `.btn--secondary`; submit → `.btn--primary`; close → clay icon button.
- **GIF picker** (`.gif-picker*`): same shell; search input → `.clay-field`; grid unchanged.
- **Lightbox** (`.lightbox*`): keep neutral dark scrim (image viewer); just token the close button + hint.
- **Celebration overlay**: token text/buttons (`.btn--primary` dismiss); keep confetti.
- **What's New** (`.whats-new-*`): `.glass-sheet`; badge → `--primary` gradient; list items → token surfaces; close → `.btn--primary`. Also re-token the dev `.wn-editor-*` controls (297-326) to `.clay-field`/`.btn--primary`.

- [ ] **Step 2: Verify (light + dark)**

Open each overlay (poll, GIF, lightbox, what's-new; trigger celebration if feasible). Each is clay/glass, readable, dismissible.
Expected: consistent with the modal language.

- [ ] **Step 3: Stage checkpoint**

```bash
git add index.html src/css/interactive.css
# suggested: "feat(design): clay/glass secondary overlays"
```

---

## Task 14: Coin center / gacha / slots + riddle + mood panels

**Files:**
- Modify: `index.html` (inline `.cc-*`, `.riddle-*`, `.mood-*`, `.pg-*`, `.spin-*` rules across 667-784, 1231-1301), `src/css/interactive.css` (coin center / playground styles — search `cc-`, `pg-`, `mood-`, `riddle-`)

- [ ] **Step 1: Re-token the coin sinks + side panels**

Locate the coin-center/gacha/slot styles (`.cc-card`, `.cc-tab`, `.cc-btn`, `.cc-item`, `.cc-pull`, `.cc-lb-row`, `.cc-fortune-card`, `.pg-*`, `.spin-result-*`), the riddle card (`.riddle-*`), and the mood panel (`.mood-*`). Replace wood/kraft panel rules with `.glass-sheet`/`.clay-card`; tabs/buttons → `.btn--secondary`/active `.btn--primary`; rarity accents via `--primary`/`--accent`/`--warn`; inputs → `.clay-field`. Keep all gacha/slot/odds logic untouched.

- [ ] **Step 2: Verify (light + dark)**

Open 金币乐园 (coin center), play the riddle, open mood. Panels clay/glass, coins/odds readable, interactions work.
Expected: cohesive; no logic change.

- [ ] **Step 3: Stage checkpoint**

```bash
git add index.html src/css/interactive.css
# suggested: "feat(design): clay coin center, gacha, riddle, mood"
```

---

## Task 15: Strip remaining corkboard rules from `style.css` / `interactive.css`

**Files:**
- Modify: `src/css/style.css`, `src/css/interactive.css`

- [ ] **Step 1: Remove dead corkboard rules, consume tokens**

Search both files for corkboard/wood/kraft/paper artifacts (hardcoded `#5b4026`, `#43301c`, `#fdf0c4`, `cork`, `paper`, `wood`, `walnut`, etc.) that are now superseded. Replace surviving structural rules' hardcoded colors with the matching `var(--token)`. Do **not** alter layout geometry — only color/shadow/background tokens.

- [ ] **Step 2: Verify**

Full board reload (light + dark). Nothing reverts to wood/paper; no missing styles.
Expected: fully tokenized.

- [ ] **Step 3: Stage checkpoint**

```bash
git add src/css/style.css src/css/interactive.css
# suggested: "refactor(design): tokenize style.css/interactive.css, drop corkboard rules"
```

---

## Task 16: Empty the inline corkboard `<style>` block + full home-page QA

**Files:**
- Modify: `index.html` (the inline `<style>` at `index.html:10-785`)

- [ ] **Step 1: Remove now-dead inline rules**

Every surface is migrated, so delete the remaining corkboard rules from the inline `<style>` (10-785). Keep only genuinely page-specific rules that reference tokens (should be near-empty). Verify nothing still depends on `body.light-theme` selectors; if something does, port it to `[data-theme]`/tokens. Then remove the legacy `light-theme` class sync from `theme.js` `apply()` and the pre-paint script.

- [ ] **Step 2: QA pass — run this checklist**

- [ ] **Contrast:** sample body text, secondary text, accents on `--surface` and `--bg` in **both** themes → ≥4.5:1 (≥3:1 large/UI). Use browser devtools contrast checker.
- [ ] **Dark parity:** every surface from Tasks 5–14 looks intentional in dark (no flat/invisible cards, no leftover light-only borders).
- [ ] **Cosmetics:** paid frames/names/titles still win on notes.
- [ ] **Reduced motion:** OS reduce-motion on → no press-scale/float/parallax.
- [ ] **Responsive:** 375 / 768 / 1024 / 1440 — no horizontal scroll; sidebar, dock, composer, modals all usable; bento (if shown) reflows.
- [ ] **Keyboard:** Tab through composer, dock, sidebar, settings — visible focus, logical order; modals trap focus + Esc closes.
- [ ] **Touch targets:** buttons/toggles/dock/icon-buttons ≥44px.
- [ ] **Behavior intact:** post answer, react, reply, poll, spin food, countdown, coin center, riddle, mood, theme toggle, sign-out — all functional.

- [ ] **Step 3: Fix anything the checklist surfaced, then stage checkpoint**

```bash
git add index.html src/js/theme.js
# suggested: "refactor(design): remove inline corkboard block; home page fully clay"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §2 tokens → Task 1; §2.3 fonts → Task 1; §3 architecture/files → Tasks 1–4,15,16; §4 components → Tasks 3,5–14; §5 IA (dock/sidebar/hero) → Tasks 5,9,12 (bento hub is Plan 2); §6 a11y/responsive → Tasks 1,8,16; §7 phases P0–P3 → all tasks (P4–P7 are later plans); §3 cosmetics-win → Task 7,16; §9 no-Firestore → no data tasks present (correct).
- **Placeholder scan:** restyle tasks reference exact files/line ranges + the canonical mockup for values; no "TBD"/"add error handling"/"similar to" placeholders.
- **Type consistency:** `Theme.resolveTheme/nextTheme/getTheme/setTheme/toggle/init/apply` used consistently across Tasks 2 and 4; class names (`.btn--primary`, `.clay-field`, `.glass-sheet`, `.clay-dock`, `.pill--on`) consistent across Tasks 3–14.
- **Note:** line numbers reference `index.html` as of 2026-06-12; the implementer should confirm by searching the named selector if an edit doesn't match (markup shifts as earlier tasks edit the file).
