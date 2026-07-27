# 🫧 Anonymous Bubble Answers

> A playful, real-time **anonymous bubble board** — drop a thought, watch it float, and share a cozy little world with everyone else who's online.
>
> 一个好玩的实时**匿名泡泡留言板**：发一条留言，看它飘起来，和此刻在线的每个人一起摸鱼。

Anonymous Bubble Answers is a browser-based social playground. At its heart is a live board where short messages float up as "bubbles," but it has grown into a whole cozy space full of mini-games, a coin economy, pets, drawing tools, and daily surprises — all rendered in a soft, tactile **Clay "Bubble Pop"** design language with full light/dark theming.

---

## ✨ Highlights

### 🫧 The Bubble Board
The home page (`index.html`) is a live, shared board where everyone's messages drift on screen.

- **Text, image & poll bubbles** — post a thought, attach an image, or launch a quick poll (📊).
- **Live presence** — see how many people are online right now and when someone else is typing.
- **泡泡罐 · Bubble Jar** — catch a bubble you love before it drifts away and re-read it later; your jar follows you across devices.
- **Knock & ripples** — long-press a bubble to send an anonymous "I saw this" wobble to everyone online.
- **Live reactions** — full-screen hearts, rain, and fireworks that everyone sees at once.
- **GIF search & favorites** — find the perfect GIF and keep a shelf of your go-to ones.
- **便利贴 · Upcoming Events** — pin sticky notes for events the group is looking forward to.

### 🎨 Draw together
- **涂鸦墙 · Graffiti Wall** — a shared drawing layer living behind the board; everyone's strokes appear live.
- **涂鸦 · Doodle Pad** — sketch on a canvas and post it straight to the board as an image bubble.

### 💰 金币乐园 · Coin Economy
Earn and spend coins across a set of playful sinks:

- **商店 · Shop** — buy & equip bubble cosmetics (name colors, frames, badges, titles).
- **扭蛋 · Gacha** — a lucky-draw machine for random cosmetics.
- **老虎机 · Slot Machine** — try your luck.
- **Boost** — pin your bubble to the top of the board.
- **Coin Rush** — a daily timed coin event.
- **富豪榜 · Rich List** and **摸鱼榜 · Idle-Time Leaderboard** — rankings by coins and by active "摸鱼" (chill) time.

### 🕹️ Mini-Games
A whole arcade lives under `games/`:

| Game | | Game | |
|------|---|------|---|
| 2048 | 🔢 | Block Blast | 🧱 |
| 中国象棋 · Chinese Chess | ♟️ | Snake · 贪吃蛇 | 🐍 |
| Tetris · 俄罗斯方块 | 🟦 | Flappy | 🐤 |
| 钓鱼 · Fishing | 🎣 | Subway Dash | 🚇 |
| Toto | 🎯 | 全站赛马 · Horse Race | 🏇 |

The **Horse Race** doubles as a group decision-maker: write 2–12 options and everyone online watches the same broadcast-style race play out.

### 🏡 Spaces & Worlds
- **房间 · Room** — decorate your own space and keep pets fed (with an auto-feeder that catches up while you're away).
- **Farm & Aquarium** — grow a little farm and stock an aquarium.
- **Multiplayer Pet World** — a shared world you can invite others into.
- Share any of these to the board so friends can visit or join.

### 🎁 Daily delights
- **正能量 · Daily Quote** — one uplifting quote a day, the same for everyone.
- **脑筋急转弯 · Daily Riddle** — a daily brain teaser.
- **成语接龙 · Chengyu Chain** — a shared daily idiom chain with answer leaderboards.
- **🔥 Campfire** — a pixel-art diorama where every online visitor becomes a little villager you can walk around, with a sky and weather that follow the local clock.

---

## 🧱 Tech Stack

- **Vanilla front end** — plain HTML, CSS, and JavaScript. No framework, no build step.
- **Firebase** — [Cloud Firestore](https://firebase.google.com/docs/firestore) and the [Realtime Database](https://firebase.google.com/docs/database) power live sync (bubbles, presence, strokes, races), with Firebase Authentication for lightweight sign-in.
- **Clay "Bubble Pop" design system** — a token-driven CSS component library (`src/css/`) with cohesive light & dark themes.
- **Node's built-in test runner** — pure game/board logic is unit-tested with `node:test`.

---

## 🚀 Getting Started

The app is a static site — any static file server works.

```bash
# Clone the repo
git clone https://github.com/vibetourlife/anonymous.git
cd anonymous

# Option A — serve with Python
python3 -m http.server 5501

# Option B — serve with Node
npx serve .
```

Then open <http://localhost:5501> in your browser.

> 💡 **VS Code users:** the repo is preconfigured for the *Live Server* extension on port **5501** (`.vscode/settings.json`) — just click **Go Live**.

### Connecting Firebase

Live features (the shared board, presence, coins, worlds) talk to Firebase. Point the app at your own Firebase project by setting the project config in:

```
src/js/firebase-config.js
```

Enable **Firestore**, the **Realtime Database**, and **Authentication** in your Firebase console, and you're ready to go.

---

## 🧪 Running Tests

Pure logic modules (board updates, graffiti-wall packing, coin rush schedule, jar logic, replies, theming) ship with unit tests using Node's built-in runner:

```bash
node --test src/js/*.test.js
```

All tests should pass (63 and counting 🟢).

---

## 📁 Repository Layout

```
anonymous/
├── index.html            # 🫧 The main bubble board (home page)
├── admin.html            # Admin dashboard (economy tuning, feature switches)
├── favicon.svg
├── src/
│   ├── css/              # Clay "Bubble Pop" design system + themes
│   │   ├── style.css
│   │   ├── components.css
│   │   ├── interactive.css
│   │   └── theme.css
│   └── js/               # Board, coins, games logic, widgets (+ *.test.js)
│       ├── app.js            # Board bootstrap & Firebase wiring
│       ├── bubble-jar.js     # 泡泡罐
│       ├── graffiti-wall.js  # 涂鸦墙
│       ├── coin-center.js    # 金币乐园 (shop / gacha / slots)
│       ├── horse-race.js     # 赛马
│       ├── campfire.js       # 🔥 pixel diorama
│       └── … many more feature modules
├── games/                # 🕹️ Mini-games
│   ├── 2048.html         block-blast.html  chinese-chess.html
│   ├── snake.html        tetris.html       flappy.html
│   ├── fishing.html      subway-dash.html  toto.html
│   ├── pets/             # Pet behaviours (cat, dog, panda, …)
│   ├── room/             # 房间
│   └── world/            # Multiplayer Pet World
├── whats-new/            # 📰 "有什么更新了" changelog pages
├── docs/                 # Design specs & implementation plans
└── server.js             # Optional standalone Express prototype
```

---

## 📐 Project Conventions

A few house rules keep the codebase friendly to work in:

- **Organize by folder.** When code grows, split it out into the right folder instead of letting a single file balloon.
- **Comment the non-obvious.** Keep the code readable — add comments wherever the intent isn't immediately clear.
- **No hardcoded values.** Prefer config and tokens over magic numbers and strings sprinkled through the code.
- **Keep it maintainable.** Small, focused modules with pure logic separated from UI (which is exactly what the `*.test.js` files cover).

---

## 📰 What's New

Recent changes are written up as friendly, illustrated pages under [`whats-new/`](whats-new/) (a.k.a. **"有什么更新了"**), linked from the board.

---

## 📄 License

No license file is currently included in this repository. Please contact the maintainers before reusing the code.
