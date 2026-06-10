# Minigame Theme Redesign

> **Update (2026-06-10, later):** After trying the light "Sunset Cozy" palette,
> the direction was changed to **"Midnight" — a modern dark theme** (sleek
> charcoal `#171B22→#0E1117`, elevated `#1B212B` cards, near-white text, warm
> coral accent, gold coins, Space Grotesk display font). The token system below
> made this a one-file flip in `games/theme.css` (same token names, dark values)
> plus a small sweep replacing hardcoded light literals (`#fff` button hovers →
> `--g-card-hover`, white inputs → dark, cream canvas pause-overlays → dark
> scrim + light text). The structure/approach in this doc still applies; only
> the palette values changed.

## Original direction — "Sunset Cozy" (superseded)

**Date:** 2026-06-10
**Goal:** Replace the generic "AI purple" look across all minigames with a warm,
cozy, friendly identity that suits this casual social arcade (pets, farm, coins,
riddles).

## Problem

Every game page reused the same dark template: a purple/navy gradient
(`#0f0c29 → #302b63 → #24243e`), frosted-glass white-alpha panels, and a gold
accent. It's the textbook AI-generated dark theme and reads as templated.

## Direction (chosen by user): Sunset Cozy (light, warm)

A daytime peach→coral sky with pillowy cream cards and warm-brown text. Friendly,
cozy mobile-game energy. Coins stay gold (they're core to the game).

### Color tokens (`games/theme.css`)

| Token | Value | Use |
|---|---|---|
| `--g-bg` | `linear-gradient(160deg,#FFE7D3,#FFB8A0,#FF8FB1)` | page background |
| `--g-card` | `#FFF6EC` | panels / cards (cream) |
| `--g-board` | `#FBE6D4` | game board tray |
| `--g-ink` | `#3A2A2A` | primary text (warm brown) |
| `--g-ink-soft` | `#8A6F63` | labels |
| `--g-ink-faint` | `#B59C90` | faint captions |
| `--g-border` | `rgba(58,42,42,.10)` | hairlines |
| `--g-hover` | `rgba(58,42,42,.06)` | hover fills |
| `--g-accent` | `#FF7A5C` | coral — primary buttons/highlights |
| `--g-accent-2` | `#F2A154` | warm orange |
| `--g-title-grad` | `linear-gradient(90deg,#FF7A5C,#E8853A)` | title / score text (readable on light) |
| `--g-coin` | `#F7C97E` | coin gold |
| `--g-coin-ink` | `#D98A2B` | coin numbers (readable on cream) |
| `--g-scrim` | `rgba(255,231,211,.88)` | light frosted overlay |
| `--g-shadow` | `0 10px 30px rgba(214,120,90,.18)` | soft warm drop |
| `--g-danger` | `#E2553F` | sign-out / end-game |

### Type
- **Display:** `Fredoka` (rounded, friendly) for titles & scores, via Google Fonts; system fallback.
- **Body:** system stack (`Segoe UI`/`Nunito`) for legibility incl. CJK.

### Signature
Pillowy cream cards with a soft warm drop-shadow + thin coral top-edge highlight
("sun-warmed paper"). Bold there; quiet everywhere else.

## Scope & approach

- **Reskin shared chrome only:** background, header/title, score bar, back &
  settings buttons, settings/game-over/login/chess-invite modals, generic buttons,
  panels.
- **Keep gameplay-functional colors** (2048 tile ramp, tetris/snake/block piece
  colors, fishing/farm art). The 2048 cream/orange tiles already suit the theme.
- **Centralize the palette** in `games/theme.css` (`:root` tokens). Each page links
  it and references the tokens, so future re-theming is one file.
- **Execution:** pilot `2048.html` → user review → roll out to the other 10 pages
  (`snake, tetris, block-blast, fishing, flappy, subway-dash, toto, chinese-chess,
  feedback`, and `room/css/room.css`).

## Files touched

- NEW `games/theme.css`
- `games/{2048,snake,tetris,block-blast,fishing,flappy,subway-dash,toto,chinese-chess,feedback}.html`
- `games/room/css/room.css`
