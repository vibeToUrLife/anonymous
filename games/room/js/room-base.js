    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Enable Firestore offline persistence (IndexedDB cache) so reloads paint
    // from the local cache instantly instead of waiting on a cold network read.
    // Must run before any other Firestore call (the first read is in initRoom).
    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence unavailable: multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not supported in this browser');
      }
    });

    /* ── Auth gate ── */
    const loginOverlay = document.getElementById('loginOverlay');

    // Handle redirect result (fallback — fires on page load after redirect sign-in)
    auth.getRedirectResult().catch((err) => {
      if (err.code) {
        document.getElementById('loginError').textContent = 'Login failed: ' + (err.message || 'Unknown');
      }
    });

    const provider = new firebase.auth.GoogleAuthProvider();

    document.getElementById('googleLoginBtn').addEventListener('click', async () => {
      const btn = document.getElementById('googleLoginBtn');
      btn.disabled = true;
      document.getElementById('loginError').textContent = '';
      try {
        // Always try popup first — works on both desktop and mobile (opens new tab).
        // signInWithRedirect is broken on most mobile browsers due to
        // third-party cookie blocking in Safari/Chrome.
        await auth.signInWithPopup(provider);
      } catch (err) {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
          try { await auth.signInWithRedirect(provider); } catch (e) {
            document.getElementById('loginError').textContent = 'Login failed: ' + (e.message || 'Unknown');
          }
        } else if (err.code !== 'auth/popup-closed-by-user') {
          document.getElementById('loginError').textContent = 'Login failed: ' + (err.message || 'Unknown');
        }
      } finally { btn.disabled = false; }
    });

    let currentUid = null;
    let currentUser = null;
    let viewingUid = null; // for visit mode

    /* ── Settings modal ── */
    const settingsOverlay = document.getElementById('settingsOverlay');

    document.getElementById('settingsBtn').addEventListener('click', () => {
      settingsOverlay.classList.remove('hidden');
    });

    document.getElementById('settingsCloseBtn').addEventListener('click', () => {
      settingsOverlay.classList.add('hidden');
    });

    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
    });

    document.getElementById('settingsLogoutBtn').addEventListener('click', async () => {
      settingsOverlay.classList.add('hidden');
      try { await auth.signOut(); } catch (e) { console.error('Logout error:', e); }
    });

    auth.onAuthStateChanged((user) => {
      if (window.SITE_MAINTENANCE) return; // Maintenance mode: don't load the room (saves Firestore reads)
      loginOverlay.classList.remove('loading');
      if (user) {
        loginOverlay.classList.add('hidden');
        currentUid = user.uid;
        currentUser = user;
        viewingUid = user.uid;
        // Update localStorage with current user's name so it stays in sync
        const customName = localStorage.getItem('flappy_custom_name_' + user.uid);
        const displayName = customName || user.displayName || user.email?.split('@')[0] || 'Anonymous';
        localStorage.setItem('flappy_name', displayName);
        initRoom();
      } else {
        loginOverlay.classList.remove('hidden');
      }
    });

    /* ═══════════════════════════════
       Data definitions
       ═══════════════════════════════ */
    const PETS = [
      { id: 'cat',    emoji: '🐱', name: 'Cat',       cost: 500 },
      { id: 'dog',    emoji: '🐶', name: 'Dog',       cost: 500 },
      { id: 'bunny',  emoji: '🐰', name: 'Bunny',     cost: 800 },
      { id: 'hamster',emoji: '🐹', name: 'Hamster',   cost: 800 },
      { id: 'fox',    emoji: '🦊', name: 'Fox',       cost: 1200 },
      { id: 'panda',  emoji: '🐼', name: 'Panda',     cost: 2000 },
      { id: 'goose',  emoji: '🦢', name: 'Goose',     cost: 1500 },
      { id: 'tom',    emoji: '🐈', name: 'Tom',       cost: 10000 },
      { id: 'jerry',  emoji: '🐭', name: 'Jerry',     cost: 10000 },
      { id: 'capybara', emoji: '🦫', name: 'Capybara', cost: 20000 },
    ];

    const PLANTS = [
      { id: 'seedling', emoji: '🌱', name: 'Seedling',    cost: 200,  coinRate: 1 },
      { id: 'cactus',   emoji: '🌵', name: 'Cactus',      cost: 300,  coinRate: 2 },
      { id: 'tulip',    emoji: '🌷', name: 'Tulip',       cost: 400,  coinRate: 3 },
      { id: 'sunflower',emoji: '🌻', name: 'Sunflower',   cost: 600,  coinRate: 4 },
      { id: 'tree',     emoji: '🌳', name: 'Tree',        cost: 1000, coinRate: 6 },
      { id: 'cherry',   emoji: '🌸', name: 'Cherry Tree', cost: 1500, coinRate: 10 },
    ];

    /* ── Crisp canvases ──
       A canvas whose buffer is sized in CSS pixels gets stretched to the screen
       by the browser, so on a phone or on Windows display scaling EVERYTHING
       drawn on it goes soft. Flat blocks of colour hide it; a pet or an animal —
       a picture, with a face — does not.
       fitCanvas puts the buffer in DEVICE pixels and pre-scales the context, so
       every caller carries on drawing in CSS pixels and only the sharpness
       changes. Offscreen caches that are blitted back need the same treatment,
       or the cached half of a scene ends up softer than the live half: bake them
       at canvasDpr() too and blit with an explicit CSS-size destination rect.
       Capped at 3 — past that the buffer costs more memory than the eye collects. */
    function canvasDpr() { return Math.min(window.devicePixelRatio || 1, 3); }
    // `minScale` keeps a canvas that was already deliberately over-sampled from
    // getting SOFTER on a 1x screen than it is today.
    function fitCanvas(cvs, cssW, cssH, minScale) {
      const dpr = Math.max(canvasDpr(), minScale || 0);
      const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
      if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
      // Sizing a canvas resets its transform, so this has to be re-applied. Doing
      // it unconditionally is also what makes fitCanvas safe to call every frame.
      cvs.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Maximum offline coin generation time for plants (2 hours in ms)
    const PLANT_OFFLINE_CAP_MS = 2 * 60 * 60 * 1000;
    // Only show the "while you were away" coin collect modal after ≥1h away
    const PLANT_OFFLINE_MODAL_MS = 60 * 60 * 1000;

    const PET_SIZES = {
      cat: 72, dog: 80, bunny: 64, hamster: 58, fox: 76, panda: 86, goose: 74,
      tom: 92, jerry: 64, capybara: 88
    };

    const PET_COLORS = {
      cat: [
        { key: 'gray',    name: 'Gray',    body: '#9E9E9E', stripe: '#616161', inner: '#F8BBD0', bellyLight: '#E0E0E0', nose: '#FF80AB', tongue: '#FAA0A0' },
        { key: 'orange',  name: 'Orange',  body: '#E69A47', stripe: '#9C4A1F', inner: '#FDE1B3', bellyLight: '#F8C98A', nose: '#F27C7C', tongue: '#FAA0A0' },
        { key: 'black',   name: 'Black',   body: '#444444', stripe: '#222222', inner: '#aa6666', bellyLight: '#555555', nose: '#e07070', tongue: '#e08080' },
        { key: 'white',   name: 'White',   body: '#f0f0f0', stripe: '#cccccc', inner: '#ffb6c1', bellyLight: '#ffffff', nose: '#F27C7C', tongue: '#FAA0A0' },
        { key: 'siamese', name: 'Siamese', body: '#f0e6d0', stripe: '#a08060', inner: '#ffb6c1', bellyLight: '#f5efe0', nose: '#F27C7C', tongue: '#FAA0A0' },
      ],
      dog: [
        { key: 'brown',  name: 'Brown',  body: '#b87333', light: '#d4a574', ear: '#8B5E3C', collar: '#d22222' },
        { key: 'golden', name: 'Golden', body: '#d4a030', light: '#f0d090', ear: '#b08828', collar: '#2266dd' },
        { key: 'black',  name: 'Black',  body: '#333333', light: '#555555', ear: '#222222', collar: '#dd2222' },
        { key: 'white',  name: 'White',  body: '#f0f0f0', light: '#ffffff', ear: '#dddddd', collar: '#dd2222' },
        { key: 'husky',  name: 'Husky',  body: '#777777', light: '#f0f0f0', ear: '#555555', collar: '#2266dd' },
      ],
      bunny: [
        { key: 'white', name: 'White', body: '#f0f0f0', pink: '#ffb6c1', tail: '#ffffff', tailShade: '#eeeeee' },
        { key: 'brown', name: 'Brown', body: '#b87333', pink: '#d4a574', tail: '#d4a574', tailShade: '#a56228' },
        { key: 'gray',  name: 'Gray',  body: '#999999', pink: '#cccccc', tail: '#bbbbbb', tailShade: '#888888' },
        { key: 'black', name: 'Black', body: '#333333', pink: '#666666', tail: '#444444', tailShade: '#333333' },
        { key: 'cream', name: 'Cream', body: '#f5e6d0', pink: '#ffb6c1', tail: '#fff5e6', tailShade: '#e8d5c0' },
      ],
      hamster: [
        { key: 'orange', name: 'Orange', body: '#f5c38a', cheek: '#ffe0b2', tummy: '#fff5e6', ear: '#dda070' },
        { key: 'brown',  name: 'Brown',  body: '#a0724a', cheek: '#d4a574', tummy: '#e8c8a0', ear: '#8a5c3a' },
        { key: 'white',  name: 'White',  body: '#f0f0f0', cheek: '#ffffff', tummy: '#ffffff', ear: '#dddddd' },
        { key: 'gray',   name: 'Gray',   body: '#999999', cheek: '#bbbbbb', tummy: '#cccccc', ear: '#777777' },
        { key: 'golden', name: 'Golden', body: '#d4a030', cheek: '#f0d090', tummy: '#f5e8c0', ear: '#b08828' },
      ],
      goose: [
        { key: 'white',  name: 'White',  body: '#f7f7f7', wing: '#e2e2e2', beak: '#f2a13c', leg: '#e08a2c' },
        { key: 'gray',   name: 'Gray',   body: '#b8bcc2', wing: '#9aa0a8', beak: '#3a3a3a', leg: '#d08a2c' },
        { key: 'brown',  name: 'Brown',  body: '#c8a878', wing: '#a8884e', beak: '#3a3a3a', leg: '#caa040' },
        { key: 'swan',   name: 'Swan',   body: '#ffffff', wing: '#f0f0f0', beak: '#e8682c', leg: '#2a2a2a' },
      ],
      fox: [
        { key: 'red',    name: 'Red',    body: '#e0702e', belly: '#fff3e0', ear: '#43382f', leg: '#3c322b' },
        { key: 'arctic', name: 'Arctic', body: '#e9edf1', belly: '#ffffff', ear: '#aab2bb', leg: '#9aa3ad' },
        { key: 'silver', name: 'Silver', body: '#5c6066', belly: '#d6dbe0', ear: '#242628', leg: '#26282b' },
        { key: 'cross',  name: 'Cross',  body: '#5a4636', belly: '#dcc6a0', ear: '#241c15', leg: '#201a14' },
        { key: 'fennec', name: 'Fennec', body: '#e8c98a', belly: '#fff6e6', ear: '#b9925c', leg: '#a87f4e' },
      ],
      panda: [
        // Color = the panda's skin/fur (body + head). Markings stay black so it still reads as a panda.
        { key: 'classic', name: 'Classic',  body: '#ffffff', patch: '#333333' },
        { key: 'brown',   name: 'Brown',    body: '#c8975c', patch: '#333333' },
        { key: 'pink',    name: 'Pink',     body: '#f7a8c4', patch: '#333333' },
        { key: 'blue',    name: 'Sky Blue', body: '#8fb6ef', patch: '#333333' },
        { key: 'mint',    name: 'Mint',     body: '#8ed9b2', patch: '#333333' },
      ],
      jerry: [
        { key: 'ochre',   name: 'Ochre',   body: '#c8893f', belly: '#f4e0b8', inner: '#eab595', tail: '#b87c34' },
        { key: 'brown',   name: 'Brown',   body: '#9c6b42', belly: '#e7cca7', inner: '#e2a887', tail: '#8a5c38' },
        { key: 'grey',    name: 'Grey',    body: '#9aa0a6', belly: '#e5e7eb', inner: '#e2b0b0', tail: '#8f959b' },
        { key: 'white',   name: 'White',   body: '#e6e0d4', belly: '#fbf7ee', inner: '#f0c4b2', tail: '#d8d2c6' },
      ],
      // No tom or capybara entry on purpose: those two are drawn from artwork
      // (games/pets/img/*.png) rather than canvas paths, so they ship in a
      // single coat. The status bar hides the colour dots when a type has no
      // palette, which is exactly what we want here.
    };

    function getPetPalette(type, colorKey) {
      const colors = PET_COLORS[type];
      if (!colors) return null;
      return colors.find(c => c.key === colorKey) || colors[0];
    }

    /* What to print for a pet, in the reader's language.

       pet.name is user data — the player may have typed it — so it can never be
       fed to T() blindly. But a pet nobody has renamed doesn't hold a name the
       player chose: adoption seeds it with the catalog's English name, and the
       old save format did the same. So "the name still equals the catalog name"
       is exactly what "un-renamed" means here, and only then is it safe to look
       it up. A player who genuinely types "Cat" gets 猫, which is the same thing
       they asked for. */
    function petDisplayName(pet) {
      if (!pet) return '';
      const def = PETS.find(p => p.id === pet.type);
      if (!pet.name || (def && pet.name === def.name)) return T(def ? def.name : pet.type);
      return pet.name;
    }

    // True while the pet still carries its catalog name, i.e. the player has
    // not named it. The rename box uses this to stay empty instead of offering
    // an English word for them to edit.
    function petIsUnnamed(pet) {
      if (!pet || !pet.name) return true;
      const def = PETS.find(p => p.id === pet.type);
      return !!def && pet.name === def.name;
    }

    const FOODS = [
      { id: 'cookie',   emoji: '🍪', name: 'Cookie',   cost: 30,  restore: 10 },
      { id: 'apple',    emoji: '🍎', name: 'Apple',     cost: 50,  restore: 20 },
      { id: 'fish',     emoji: '🐟', name: 'Fish',      cost: 80,  restore: 30 },
      { id: 'meat',     emoji: '🍖', name: 'Meat',      cost: 120, restore: 45 },
      { id: 'cake',     emoji: '🎂', name: 'Cake',      cost: 200, restore: 70 },
      { id: 'feast',    emoji: '🍱', name: 'Feast Box', cost: 300, restore: 100 },
    ];

    const TOYS = [
      { id: 'ball',    emoji: '⚽', name: 'Ball',       cost: 40,  affection: 10 },
      { id: 'doll',    emoji: '🧸', name: 'Doll',       cost: 80,  affection: 20 },
      { id: 'stick',   emoji: '🪵', name: 'Stick',      cost: 60,  affection: 15 },
      { id: 'feather', emoji: '🪶', name: 'Feather',    cost: 100, affection: 25 },
      { id: 'yarn',    emoji: '🧶', name: 'Yarn Ball',  cost: 150, affection: 35 },
      { id: 'frisbee', emoji: '🥏', name: 'Frisbee',    cost: 250, affection: 50 },
      { id: 'bell',    emoji: '🔔', name: 'Jingle Bell', cost: 400, affection: 75 },
      { id: 'puzzle',  emoji: '🧩', name: 'Puzzle Toy',  cost: 600, affection: 110 },
      { id: 'kite',    emoji: '🪁', name: 'Kite',        cost: 850, affection: 160 },
      { id: 'wand',    emoji: '🪄', name: 'Magic Wand',  cost: 1200, affection: 240 },
    ];

    const DRINKS = [
      { id: 'water',  emoji: '💧', name: 'Water',  cost: 20,  restore: 15 },
      { id: 'milk',   emoji: '🥛', name: 'Milk',   cost: 50,  restore: 25 },
      { id: 'cola',   emoji: '🥤', name: 'Cola',   cost: 80,  restore: 35 },
      { id: 'juice',  emoji: '🧃', name: 'Juice',  cost: 120, restore: 50 },
      { id: 'tea',    emoji: '🍵', name: 'Tea',     cost: 180, restore: 70 },
      { id: 'boba',   emoji: '🧋', name: 'Boba',   cost: 280, restore: 100 },
    ];

    // Auto-Feeder: one-time purchase that keeps all pets' hunger & thirst topped up.
    const AUTO_FEEDER_COST = 2500;
    const AUTOFEED_THRESHOLD = 50;  // refill a stat when it drops to/below this
    const AUTOFEED_TARGET = 100;    // refill back up to this

    // Farm: outside area with animals that produce coin drops. All animals eat
    // from one shared food trough (refilled with coins) — fed animals get happier
    // and produce faster, an empty trough makes happiness decay (no starvation death).
    const FARM_ANIMALS = [
      { id: 'goose', emoji: '🦆', name: 'Goose', cost: 500,  drop: { id: 'egg',       emoji: '🥚', name: 'Egg',       coins: 15  } },
      { id: 'pig',   emoji: '🐷', name: 'Pig',   cost: 1500, drop: { id: 'truffle',   emoji: '🍄', name: 'Truffle',   coins: 40  } },
      { id: 'cow',   emoji: '🐄', name: 'Cow',   cost: 3000, drop: { id: 'milk',      emoji: '🥛', name: 'Milk',      coins: 75  } },
      { id: 'horse', emoji: '🐎', name: 'Horse', cost: 6000, drop: { id: 'horseshoe', emoji: '🧲', name: 'Horseshoe', coins: 140 } },
    ];
    // Animals level up by total drops collected from them; higher level = faster
    // production (see room-farm.js planFarmTick / animalLevel).
    const FARM_LEVELS = [0, 10, 30, 70, 150];   // collected thresholds → Lv1..Lv5
    const FARM_LEVEL_SPEEDUP = 0.10;            // +10% production speed per level above 1
    const FARM_EXPAND_COSTS = [5000, 15000, 40000, 90000];  // +10 animal cap & a bigger pasture per expansion
    /* Land opened up either side of the farm, once that pasture line is finished.
       One plot per side, bought separately, and the farm itself never moves — the
       new ground is added OUTSIDE it. The cost is for the next plot whichever side
       it is, and is deliberately steeper than any rung of the pasture above: this
       is what there is left to spend coins on once the pasture is maxed. */
    const FARM_LAND_COSTS = [50000, 120000];    // 1st plot, then the 2nd — either side
    const FARM_LAND_STEP = 0.5;                 // how wide one plot is, in window widths
    const FARM_AUTOCOLLECT_COST = 4000;         // one-time: auto-collects produce into stock

    // Coat variants: each new animal is the common variant unless it rolls the
    // rare one (FARM_RARE_CHANCE). The first entry per type is the default (no
    // palette → drawer uses its built-in colours); rare entries override colours.
    // Non-animal sellable products (crops + processed goods). Animal drops keep
    // their price on FARM_ANIMALS[].drop; the farm view merges both into one
    // product registry for selling / orders / processing.
    const FARM_PRODUCTS = {
      carrot:  { emoji: '🥕', name: 'Carrot',  coins: 35 },
      corn:    { emoji: '🌽', name: 'Corn',    coins: 70 },
      meat:    { emoji: '🥩', name: 'Meat',    coins: 45 },   // from butchering an animal
      // Workshop goods (each machine can make a few of these — all sellable)
      cheese:  { emoji: '🧀', name: 'Cheese',  coins: 200 },
      yogurt:  { emoji: '🍦', name: 'Yogurt',  coins: 95 },
      butter:  { emoji: '🧈', name: 'Butter',  coins: 150 },
      bread:   { emoji: '🍞', name: 'Bread',   coins: 110 },
      cookie:  { emoji: '🍪', name: 'Cookie',  coins: 95 },
      pie:     { emoji: '🥧', name: 'Pie',     coins: 200 },
      cake:    { emoji: '🍰', name: 'Cake',    coins: 260 },
      carrotcake: { emoji: '🧁', name: 'Carrot Cake', coins: 220 },
      pancake: { emoji: '🥞', name: 'Pancake', coins: 160 },
      sausage:  { emoji: '🌭', name: 'Sausage',  coins: 130 },
      bacon:    { emoji: '🥓', name: 'Bacon',    coins: 180 },
      ham:      { emoji: '🍖', name: 'Ham',      coins: 240 },
      tools:    { emoji: '🔧', name: 'Tools',    coins: 170 },   // Forge: from horseshoes
      bell:     { emoji: '🔔', name: 'Bell',     coins: 360 },   // Forge: from horseshoes
      wheat:    { emoji: '🌾', name: 'Wheat',    coins: 20 },    // crop — Bakery ingredient
      baguette: { emoji: '🥖', name: 'Baguette', coins: 170 },   // Bakery: from wheat
      pizza:    { emoji: '🍕', name: 'Pizza',          coins: 150 },   // Bakery: from truffle
      risotto:  { emoji: '🍚', name: 'Truffle Risotto', coins: 290 },  // Bakery: from truffle
    };
    /* Tier-2 aged goods. Deliberately NOT in FARM_PRODUCTS: three existing paths
       (sellFarmProduct, sellAllFarm, the plane's wanted list) sell everything
       they can find at list price, and all three read farmStock/FARM_PRODUCTS.
       Keeping the aged goods in their own registry and their own inventory
       (roomData.farmAged) makes selling them anywhere but the tier-2 buyer
       structurally impossible instead of something three call sites remember. */
    const FARM_AGED = {
      agedcheese:  { emoji: '🧀', name: 'Aged Cheese',     coins: 600 },
      culturedbutter: { emoji: '🧈', name: 'Cultured Butter', coins: 450 },
      curedsausage: { emoji: '🌭', name: 'Cured Sausage',  coins: 400 },
      smokedbacon: { emoji: '🥓', name: 'Smoked Bacon',    coins: 540 },
      agedham:     { emoji: '🍖', name: 'Aged Ham',        coins: 720 },
    };
    // Base meat from butchering, by tier (the animal's level adds more — see _meatYield).
    const FARM_MEAT_YIELD = { goose: 1, pig: 2, cow: 3, horse: 4 };

    // Crops grown in garden plots — each yields a sellable product that also
    // feeds the workshop (wheat → Bakery, carrot → Cake Oven, corn → Bakery).
    const FARM_CROPS = [
      { id: 'wheat',  emoji: '🌾', name: 'Wheat',  seedCost: 10, growMs: 60 * 60 * 1000,  yield: { product: 'wheat', qty: 1 } },
      { id: 'carrot', emoji: '🥕', name: 'Carrot', seedCost: 25, growMs: 90 * 60 * 1000,  yield: { product: 'carrot', qty: 1 } },
      { id: 'corn',   emoji: '🌽', name: 'Corn',   seedCost: 50, growMs: 120 * 60 * 1000, yield: { product: 'corn', qty: 1 } },
    ];
    // Garden beds per row (a "row" is the bulk plant/harvest unit). The bed
    // hit-test is a nearest-bed partition, so a bed's tap tolerance is half the
    // column spacing — 44px targets need 44px spacing, and ten columns need
    // 440px of stage that a phone hasn't got. Narrow stages get eight.
    const FARM_PER_ROW = 10;
    const FARM_PER_ROW_NARROW = 8;
    const FARM_NARROW_W = 600;     // stage width below which the narrow layout applies
    const FARM_PLOT_MAX = 30;      // most garden plots you can own
    const FARM_PLOT_COST = 300;    // coins per added plot

    const FARM_ORDER_COUNT = 3;          // daily delivery orders
    const FARM_ORDER_MARKUP = 1.5;       // reward = raw product value × this …
    const FARM_ORDER_BONUS = 25;         // … plus this flat bonus per order
    // Products eligible for orders (kept to obtainable mid-tier goods).
    const FARM_ORDER_PRODUCTS = ['egg', 'truffle', 'milk', 'carrot', 'corn', 'wheat'];

    // Processing machines: one-time buy, then turn raw produce into pricier goods
    // over a timer (one job at a time). `in` maps product id → qty consumed.
    // Each machine can make a few products — you pick one per slot ("Make" → choose).
    const M = 60 * 1000;
    const FARM_MACHINES = [
      { id: 'dairy', emoji: '🧀', name: 'Dairy', cost: 2000, recipes: [
        { in: { milk: 1 }, out: { id: 'cheese', qty: 1 }, timeMs: 30 * M },
        { in: { milk: 1 }, out: { id: 'yogurt', qty: 1 }, timeMs: 25 * M },
        { in: { milk: 2 }, out: { id: 'butter', qty: 1 }, timeMs: 45 * M },
      ] },
      { id: 'bakery', emoji: '🍞', name: 'Bakery', cost: 2500, recipes: [
        { in: { corn: 1 },  out: { id: 'bread',    qty: 1 }, timeMs: 30 * M },
        { in: { corn: 1 },  out: { id: 'cookie',   qty: 1 }, timeMs: 25 * M },
        { in: { corn: 2 },  out: { id: 'pie',      qty: 1 }, timeMs: 45 * M },
        { in: { wheat: 2 }, out: { id: 'baguette', qty: 1 }, timeMs: 35 * M },
        { in: { truffle: 1 }, out: { id: 'pizza',   qty: 1 }, timeMs: 30 * M },   // mushroom → pizza
        { in: { truffle: 2 }, out: { id: 'risotto', qty: 1 }, timeMs: 45 * M },   // mushroom → risotto
      ] },
      { id: 'oven', emoji: '🍰', name: 'Cake Oven', cost: 5000, recipes: [
        { in: { egg: 2, milk: 1 }, out: { id: 'cake',    qty: 1 }, timeMs: 60 * M },
        { in: { egg: 1, corn: 1 }, out: { id: 'pancake', qty: 1 }, timeMs: 35 * M },
        { in: { carrot: 2 },       out: { id: 'carrotcake', qty: 1 }, timeMs: 45 * M },  // carrot cake
      ] },
      { id: 'butcher', emoji: '🔪', name: 'Butcher', cost: 2500, recipes: [
        { in: { meat: 1 }, out: { id: 'sausage', qty: 1 }, timeMs: 20 * M },
        { in: { meat: 1 }, out: { id: 'bacon',   qty: 1 }, timeMs: 30 * M },
        { in: { meat: 2 }, out: { id: 'ham',     qty: 1 }, timeMs: 40 * M },
      ] },
      { id: 'forge', emoji: '🔨', name: 'Forge', cost: 3000, recipes: [   // turns horseshoes into goods
        { in: { horseshoe: 1 }, out: { id: 'tools', qty: 1 }, timeMs: 30 * M },
        { in: { horseshoe: 2 }, out: { id: 'bell',  qty: 1 }, timeMs: 50 * M },
      ] },
    ];
    // Each built machine runs jobs in parallel slots. Building gives 1 slot; buy
    // more (each makes a product independently) up to the max.
    const FARM_SLOT_COST = 10000;  // coins to open one more production slot
    const FARM_MAX_SLOTS = 4;      // most slots a single machine can have

    /* Ageing factories — the right plot's tier-2 layer. Same shape as
       FARM_MACHINES (id/cost/recipes) so _machineState, startMachineSlot and
       collectMachineSlot drive both lists; a `store` field says which inventory
       the output lands in. Only dairy and meat age: bread and cake want to be
       fresh, and metal doesn't age at all — which is what makes the Dairy and
       the Butcher, the two cheapest machines, matter late.
       The first factory comes with the plot; the other two are unlocked by
       tapping them on the land. Timers are in HOURS against the machines'
       20–60 minutes, so the two tiers are clearly separate layers. */
    const HR = 60 * 60 * 1000;   // not `H` — the farm view uses W/H for canvas size
    const FARM_AGERS = [
      { id: 'cheesecave', emoji: '🛖', name: 'Cheese Cave', cost: 0, free: true, recipes: [
        { in: { cheese: 1 }, out: { id: 'agedcheese', qty: 1 }, timeMs: 4 * HR },
        { in: { butter: 1 }, out: { id: 'culturedbutter', qty: 1 }, timeMs: 3 * HR },
      ] },
      { id: 'smokehouse', emoji: '🔥', name: 'Smokehouse', cost: 60000, recipes: [
        { in: { sausage: 1 }, out: { id: 'curedsausage', qty: 1 }, timeMs: 3 * HR },
        { in: { bacon: 1 },   out: { id: 'smokedbacon',  qty: 1 }, timeMs: 4 * HR },
      ] },
      { id: 'hamcellar', emoji: '🍖', name: 'Ham Cellar', cost: 120000, recipes: [
        { in: { ham: 1 }, out: { id: 'agedham', qty: 1 }, timeMs: 5 * HR },
      ] },
    ];
    const FARM_AGER_SLOT_COST = 15000;   // above the machines' 10000 — a late-game sink
    /* The tier-2 buyer runs the plane's mechanic, one tier up: a set it wants
       this visit, then it shuts and reopens with a different set. It replaced a
       flat "20 items a day" quota, which braked the economy but said nothing —
       a list you can read, plan around and see coming does the same job and is
       something to come back FOR.

       A DAY between visits, against the plane's four hours, because tier 2 is
       measured in hours: a factory slot turns over every 3-5h, so a faster cycle
       would keep asking for goods the plot cannot have finished yet. The
       quantities are scaled to match — three kinds of up to eight each is about
       the same daily throughput as the quota it replaces, but shaped. */
    const FARM_BUYER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // shut this long after it is cleared out
    const FARM_BUYER_WANT_COUNT = 3;                    // how many aged kinds it takes per visit
    const FARM_BUYER_MAX_QTY = 8;                       // most of each kind (quota 1..this)

    /* Compost yard — the left plot. Three bins stand on the plot from the day it
       is bought; the first is unlocked, the other two are tapped to unlock.
       The FILL RATE never changes, only the cap does (10 per unlocked bin), so
       the unlocks buy patience — how long you can leave it — not speed. At 59
       animals one bin caps in ~2h and three in ~6.4h. Bins stop filling when
       full, so the cap is also the offline cap: no separate banking rule. */
    const FARM_COMPOST_PER_ANIMAL_HR = 0.08;   // fertilizer per animal per hour
    const FARM_COMPOST_PER_BIN = 10;           // cap added by each unlocked bin
    const FARM_COMPOST_BINS_MAX = 3;
    const FARM_COMPOST_BIN_COSTS = [0, 25000, 50000];   // bin 1 comes with the plot
    const FARM_FERT_MULT = 2;                  // a fertilised bed yields this many times

    // Travelling merchant cart: parks on the farm and WAITS until you sell to it,
    // then leaves for a cooldown before returning with a fresh wanted-list. Selling
    // happens only at the cart, and only for the items it wants that visit.
    const FARM_CART_COOLDOWN_MS = 4 * 60 * 60 * 1000; // after a sale, gone this long
    const FARM_CART_WANT_COUNT = 3;                   // how many product types it buys per visit
    const FARM_CART_MAX_QTY = 4;                      // most of each item it will buy (quota 1..this)

    const FARM_RARE_CHANCE = 0.15;
    const FARM_RGB_CHANCE = 0.03;   // very rare rainbow coat — cosmetic jackpot
    // Per animal: [0] common, [1] rare, [2] rgb (rainbow). The rgb pal sets a
    // vivid base colour; the farm renderer also hue-rotates rgb animals over time
    // for an animated rainbow shimmer (purely cosmetic — same value as any other).
    const FARM_VARIANTS = {
      goose: [ { id: 'white',   name: 'White',   rare: false }, { id: 'golden', name: 'Golden', rare: true, pal: { body: '#f3d676', wing: '#e6c45a', beak: '#e08a2c', leg: '#d8842c' } }, { id: 'rgb', name: 'RGB', rgb: true, pal: { body: '#6ad9ff', wing: '#ff7ae0', beak: '#ffd23d', leg: '#ff8a5c' } } ],
      pig:   [ { id: 'pink',    name: 'Pink',    rare: false }, { id: 'golden', name: 'Golden', rare: true, pal: { coat: '#f0cf8a', ear: '#e0b96a' } }, { id: 'rgb', name: 'RGB', rgb: true, pal: { coat: '#c77aff', ear: '#7ad6ff' } } ],
      cow:   [ { id: 'classic', name: 'Classic', rare: false }, { id: 'brown',  name: 'Brown',  rare: true, pal: { coat: '#e8c89a', light: '#d8b681', patch: '#6b4a2e' } }, { id: 'rgb', name: 'RGB', rgb: true, pal: { coat: '#8ad6ff', light: '#ffd6f5', patch: '#7a4fff' } } ],
      horse: [ { id: 'bay',     name: 'Bay',     rare: false }, { id: 'black',  name: 'Black',  rare: true, pal: { coat: '#4a3f3a', mane: '#241f1b' } }, { id: 'rgb', name: 'RGB', rgb: true, pal: { coat: '#9b7afc', mane: '#ff5db1' } } ],
    };
    /* ── Farm social layer ──
       Visitors can't touch another player's farm directly (that would be a
       griefing hole). They drop an item into the owner's inbox
       (rooms/{uid}/farm_inbox) and the owner claims the batch on their next
       visit — so every write to farm data is still made by its owner.
       "Once a day per farm" is enforced by the SERVER: the inbox doc id carries
       the day and the sender, and the rules allow create but never update. */
    const FARM_CHEER_COIN = 20;        // coins the owner gets per cheer claimed …
    const FARM_CHEER_DAILY_CAP = 10;   // … for at most this many cheers per DAY (extras still count for popularity)
    const FARM_HELP_REWARD = 30;       // coins a visitor earns per helpful action …
    const FARM_HELP_DAILY_CAP = 5;     // … for their first N actions each day (beyond that, helping still works, it just stops paying)
    const FARM_WATER_MS = 10 * 60 * 1000;  // 💧 one watering takes this much off every growing crop
    const FARM_FEED_UNITS = 5;             // 🌾 units a scoop of feed adds to the trough
    const FARM_GIFT_MAX_QTY = 5;           // most of one product a visitor may gift per farm per day
    const FARM_INBOX_MAX = 60;             // most inbox items read (and claimed) at once
    const FARM_ROOMS_SCAN = 50;            // rooms pulled for the visit list + both weekly boards
    const FARM_VISIT_MAX = 20;             // farms actually listed in the Visit tab
    const FARM_WEEK_PRIZES = [3000, 2000, 1000];  // 🥇🥈🥉 paid on EACH weekly board at settlement
    const FARM_WEEK_BOARD_N = 10;          // rows shown per board

    /* ── Farm automation & storage ──
       Late-game coin sinks. The cold store fixes an offline window shorter than
       a night's sleep; the feeder retires the chore the trough had become. */
    const FARM_AUTOFEED_COST = 8000;       // one-time: the trough refills itself from your coins …
    const FARM_AUTOFEED_AT = 0.30;         // … whenever it falls to/below this share of capacity
    const FARM_COLD_STEP_MS = 3 * 60 * 60 * 1000;        // +offline banking per cold-store level
    const FARM_COLD_COSTS = [8000, 25000, 60000];        // 3h → 6h → 9h → 12h

    const FARM_MAX_ANIMALS = 20;                   // total animals on the farm, any mix
    const FARM_DROP_CAP = 3;                       // (legacy) max uncollected drops per animal
    // Production is UNCAPPED: an animal never downs tools because nobody came to
    // collect. A catch-up is bounded by TIME (FARM_OFFLINE_CAP_MS + cold store),
    // which is the limit players can actually reason about.
    const FARM_OFFLINE_CAP_MS = 3 * 60 * 60 * 1000;  // offline (not in farm): animals bank up to 3h of produce, then wait for a collect
    const FARM_OFFLINE_MODAL_MS = 60 * 60 * 1000;    // only show the "while you were away" collect modal after ≥1h away

    // ── Aquarium (idle coins + themes) ──
    const AQUARIUM_IDLE_RATES = { common: 3, rare: 9, epic: 18, legendary: 36 }; // coins/hr per placed fish (3× base); junk earns 0
    const AQUARIUM_OFFLINE_CAP_MS = 3 * 60 * 60 * 1000;   // bank up to 3h of idle coins while away
    const AQUARIUM_OFFLINE_MODAL_MS = 60 * 60 * 1000;     // ≥1h away → show the "while you were away" collect modal
    const AQUARIUM_FRENZY_COOLDOWN_MS = 5 * 60 * 1000;   // Feeding Frenzy: 5-min cooldown
    const AQUARIUM_FRENZY_MS = 15000;                    // Feeding Frenzy round length (ms)
    const AQUARIUM_BUBBLE_MS = 20000;                    // Bubble Pop round length (ms)
    const AQUARIUM_RACE_STAKES = [10, 50, 100];          // Fish Race bet options

    /* ── Aquarium equipment ──
       Three devices standing in the tank, bought by tapping them. Index 0 of
       every table is the UNBOUGHT behaviour, so a player who buys nothing gets
       exactly the tank that existed before any of this.

       The filter is the one that matters: a full tank idles at 207🪙/hr and used
       to stop banking after three hours, so a work day earned what a nap earned.
       The light is a flat multiplier on idle earnings only — never on mini-game
       payouts, which already out-earn the tank tenfold. The pump buys extra
       plays of the two games that are capped at once a day, where the ceiling is
       a hard count that cannot be ground. */
    const AQUARIUM_EQUIP_MAX = 3;
    const AQUARIUM_FILTER_CAPS_MS = [3, 6, 12, 24].map(function (h) { return h * 60 * 60 * 1000; });
    const AQUARIUM_FILTER_COSTS = [0, 1500, 5000, 15000];
    const AQUARIUM_LIGHT_MULT   = [1, 1.15, 1.3, 1.5];
    const AQUARIUM_LIGHT_COSTS  = [0, 2000, 6000, 18000];
    const AQUARIUM_PUMP_COSTS   = [0, 800, 3000, 9000];
    // One list so the tank, the hit-test and the buy box all walk the same three.
    const AQUARIUM_EQUIP = [
      { id: 'filter', field: 'aquariumFilter', emoji: '🫙', name: 'Filter',
        blurb: 'Banks what your fish earn while you are away.', costs: AQUARIUM_FILTER_COSTS },
      { id: 'light',  field: 'aquariumLight',  emoji: '💡', name: 'Light',
        blurb: 'Warmer water, busier fish — they earn faster.', costs: AQUARIUM_LIGHT_COSTS },
      { id: 'pump',   field: 'aquariumPump',   emoji: '🔋', name: 'Pump',
        blurb: 'More oxygen, more play in them.', costs: AQUARIUM_PUMP_COSTS },
    ];
    const AQUARIUM_THEMES = [
      { id: 'tropical', name: '🏝️ Tropical',   grad: ['#1a3a5c', '#15406a', '#0a1e38'], caustic: '100,200,255' },
      { id: 'abyss',    name: '🌑 Deep Abyss',  grad: ['#0a2230', '#06303a', '#02141c'], caustic: '70,170,180' },
      { id: 'sunset',   name: '🌅 Sunset Reef',  grad: ['#3a2350', '#5a2a4a', '#231229'], caustic: '255,150,120' },
      { id: 'moonlit',  name: '🌙 Moonlit',     grad: ['#243150', '#33406a', '#141a2e'], caustic: '150,175,225' },
    ];
    const FARM_CYCLE_SLOW_MS = 6 * 60 * 60 * 1000; // production cycle at happiness 0
    const FARM_CYCLE_FAST_MS = 2 * 60 * 60 * 1000; // production cycle at happiness 100
    const FARM_START_HAPPINESS = 60;               // happiness of a newly bought animal
    const FARM_FOOD_MAX = 100;                     // base trough capacity (units)
    const FARM_FOOD_COST = 5;                      // coins per food unit on refill
    const FARM_TROUGH_STEP = 60;                   // +capacity per trough upgrade
    const FARM_TROUGH_COSTS = [3000, 8000, 18000]; // upgrade cost per level (max 3 → +180)
    const FARM_FOOD_PER_DAY = 18;                  // units each animal eats/day — total drain scales with herd size (more animals → trough empties faster)
    const FARM_HAPPY_GAIN_PER_DAY = 25;            // happiness gained per fed day
    const FARM_HAPPY_DECAY_PER_DAY = 25;           // happiness lost per hungry (empty-trough) day

    // Farm decorations — bought from the farm panel, draggable on the pasture.
    const FARM_DECORS = [
      { id: 'fd_log',       emoji: '🪵', name: 'Log',       cost: 100, scale: 1 },
      { id: 'fd_sunflower', emoji: '🌻', name: 'Sunflower', cost: 150, scale: 1.1 },
      { id: 'fd_hay',       emoji: '🌾', name: 'Hay Bale',  cost: 200, scale: 1 },
      { id: 'fd_pumpkin',   emoji: '🎃', name: 'Pumpkin',   cost: 250, scale: 0.9 },
      { id: 'fd_coop',      emoji: '🛖', name: 'Coop',      cost: 600, scale: 1.7 },
    ];

    /* ── Farm skins ──
       A late-game coin sink that changes how the farm LOOKS, not how it plays:
       buy a skin once, then switch between the ones you own for free — the same
       shape as decorations, and priced into the ladder the cold store and the
       auto-feeder already occupy (8000 / 25000 / 60000).

       A skin repaints only what the farm itself draws: the pasture grass, its
       mown stripes, the crop soil, its furrows, and the two rolling hills. The
       SKY is deliberately left out — room-layers.js paints it for the room's
       Outside View too, and the sun and moon already arc by real clock time, so
       a "sunset" sky at 10am would be a lie in both places.

       `meadow` is the farm exactly as it looks today, colour for colour. That
       is the point: a player who never buys a skin must not see a single pixel
       change. Every value below was lifted from drawFarmCanvas() and
       _drawRollingHills() rather than re-picked by eye. */
    const FARM_THEMES = [
      {
        id: 'meadow', emoji: '🌤️', name: 'Green Pasture', cost: 0, blurb: 'the farm you know',
        day: {
          grass: ['#9ed26b', '#79c052', '#5ba23c'],
          deck: { dark: '#5a3d1f', light: '#7a5530', top: [138, 99, 56], bottom: [96, 65, 34],
                  grain: '48,30,12', seam: '38,24,10', lit: '255,226,178', knot: '40,24,8' },
          hillFar: '#7cc25a', hillNear: '#66ad46',
          penTint: 'rgba(150,200,90,0.14)', groundShadow: 'rgba(30,62,20,.24)',
          groundFx: [{ kind: 'tuft', count: 90, color: '92,168,62', size: 7,
                       bloom: '255,255,255', bloom2: '255,226,120', bloomCore: 'rgba(255,214,90,0.95)' }],
          leaf: '#3f9a30', leafLight: 'rgba(152,226,112,0.68)', leafMid: 'rgba(92,190,70,0.24)', leafDapple: 'rgba(195,242,155,0.6)',
          sky: null, weather: null,
        },
        night: {
          grass: ['#22432b', '#1a3622', '#13291a'],
          deck: { dark: '#2b1d0e', light: '#3b2916', top: [66, 47, 26], bottom: [44, 30, 16],
                  grain: '18,10,4', seam: '14,8,3', lit: '180,150,110', knot: '16,9,3' },
          hillFar: '#1a3a18', hillNear: '#1e4a1a',
          penTint: 'rgba(80,120,60,0.16)',
          groundFx: [{ kind: 'tuft', count: 70, color: '38,80,44', size: 7, alpha: 0.7,
                       bloom: '190,210,190', bloom2: '210,205,160', bloomCore: 'rgba(190,175,110,0.7)' }],
          leaf: '#185016', leafLight: 'rgba(95,175,85,0.55)', leafMid: 'rgba(40,110,40,0.18)', leafDapple: 'rgba(120,200,110,0.4)',
          sky: null, weather: null,
        },
      },
      {
        id: 'harvest', emoji: '🌾', name: 'Golden Harvest', cost: 3000, blurb: 'amber fields · autumn trees',
        day: {
          grass: ['#e0a83a', '#c98c22', '#a86f14'],
          deck: { dark: '#6b4622', light: '#96683a', top: [166, 118, 64], bottom: [116, 78, 40],
                  grain: '62,38,12', seam: '48,28,8', lit: '255,232,178', knot: '52,30,8' },
          hillFar: '#c98f36', hillNear: '#a97420',
          penTint: 'rgba(210,160,60,0.16)', groundShadow: 'rgba(70,40,0,.26)',
          groundFx: [{ kind: 'tuft', count: 90, color: '168,120,26', size: 7.5,
                       bloom: '255,246,196', bloom2: '236,196,90', bloomCore: 'rgba(180,120,20,0.9)' }],
          leaf: '#b5651f', leafLight: 'rgba(255,190,90,0.70)', leafMid: 'rgba(190,110,30,0.26)', leafDapple: 'rgba(255,225,150,0.62)',
          sky: 'rgba(255,150,50,0.26)',
          weather: { kind: 'mote', count: 30, color: '255,214,120', size: 2.6, speed: 12, sway: 30, alpha: 0.50 },
        },
        night: {
          grass: ['#3a2a10', '#2c200c', '#1f1608'],
          deck: { dark: '#2a1c0b', light: '#3a2712', top: [64, 44, 22], bottom: [42, 28, 14],
                  grain: '16,9,3', seam: '12,7,2', lit: '176,146,104', knot: '14,8,2' },
          hillFar: '#2a1d0c', hillNear: '#352612',
          penTint: 'rgba(110,80,25,0.18)',
          groundFx: [{ kind: 'tuft', count: 70, color: '78,58,20', size: 7.5, alpha: 0.7,
                       bloom: '190,170,120', bloom2: '160,140,95', bloomCore: 'rgba(140,110,50,0.7)' }],
          leaf: '#4a2c0e', leafLight: 'rgba(170,120,50,0.48)', leafMid: 'rgba(90,58,18,0.20)', leafDapple: 'rgba(210,170,100,0.36)',
          sky: 'rgba(150,90,30,0.18)',
          weather: { kind: 'mote', count: 22, color: '220,180,110', size: 2.2, speed: 10, sway: 26, alpha: 0.28 },
        },
      },
      {
        id: 'winter', emoji: '❄️', name: 'Winter Farm', cost: 8000, blurb: 'a snowfield · frozen ground',
        day: {
          grass: ['#fbfeff', '#e2eefb', '#bfd6ec'],
          deck: { dark: '#5c5b55', light: '#7d7a70', top: [142, 138, 128], bottom: [98, 95, 88],
                  grain: '52,52,50', seam: '42,44,46', lit: '245,250,255', knot: '44,44,42' },
          hillFar: '#f2f8fd', hillNear: '#d6e5f2',
          penTint: 'rgba(150,195,235,0.20)', groundShadow: 'rgba(90,120,150,.22)',
          groundFx: [{ kind: 'tuft', count: 55, color: '122,150,132', size: 6, alpha: 0.75,
                       bloom: '255,255,255', bloom2: '214,234,250', bloomAt: 0.8, bloomCore: 'rgba(255,255,255,0.9)' }],
          leaf: '#33586b', leafLight: 'rgba(255,255,255,0.85)', leafMid: 'rgba(150,190,215,0.28)', leafDapple: 'rgba(255,255,255,0.95)',
          sky: 'rgba(150,195,240,0.30)',
          roofSnow: 'rgba(250,253,255,0.95)', groundProp: 'snowman', propSnow: '#f7fbff', propShade: 'rgba(158,182,206,0.55)',
          treeShape: 'conifer', conifer: '#2f6b3c', coniferDark: 'rgba(8,40,20,0.20)', coniferSnow: 'rgba(252,254,255,0.92)',
          coniferTrunk: '#5a3f28', star: '#ffd24a', baubles: ['#e05a4a', '#f0c04a', '#5aa8e0', '#c86ad0'],
          weather: { kind: 'snow', count: 70, color: '255,255,255', size: 3.0, speed: 30, sway: 24, alpha: 0.95 },
        },
        night: {
          grass: ['#8fa4bd', '#6f8098', '#4f5d73'],
          deck: { dark: '#2e3138', light: '#3f434c', top: [72, 76, 84], bottom: [48, 51, 58],
                  grain: '20,22,26', seam: '16,18,22', lit: '170,190,210', knot: '18,20,24' },
          hillFar: '#8ea4bd', hillNear: '#6d7f98',
          penTint: 'rgba(70,95,125,0.18)',
          groundFx: [{ kind: 'tuft', count: 45, color: '70,92,110', size: 6, alpha: 0.6,
                       bloom: '215,235,250', bloomAt: 0.82, bloomCore: 'rgba(230,242,255,0.7)' }],
          leaf: '#1d3441', leafLight: 'rgba(200,225,245,0.55)', leafMid: 'rgba(70,105,135,0.22)', leafDapple: 'rgba(235,245,255,0.70)',
          sky: 'rgba(90,130,180,0.20)',
          roofSnow: 'rgba(206,224,244,0.85)', groundProp: 'snowman', propSnow: '#c9d9ec', propShade: 'rgba(70,92,118,0.6)',
          treeShape: 'conifer', conifer: '#173b28', coniferDark: 'rgba(0,0,0,0.26)', coniferSnow: 'rgba(210,228,246,0.78)',
          coniferTrunk: '#2e2116', star: '#ffdc72', baubles: ['#e0705f', '#ffd980', '#7cc0ee', '#d68ade'],
          weather: { kind: 'snow', count: 52, color: '235,245,255', size: 2.8, speed: 27, sway: 22, alpha: 0.70 },
        },
      },
      {
        id: 'sakura', emoji: '🌸', name: 'Blossom Season', cost: 15000, blurb: 'petal carpet · blossom branch',
        day: {
          // The ground is a carpet of fallen petals, so it is the PALEST surface
          // on the stage. That is what keeps the falling petals readable on top
          // of it: they are white and deep pink, i.e. lighter and darker than
          // what they land against, rather than the same pink twice.
          grass: ['#fff0f6', '#fbc0d8', '#e58cb6'],
          deck: { dark: '#7a5548', light: '#a0776a', top: [178, 138, 124], bottom: [124, 92, 82],
                  grain: '76,48,40', seam: '60,36,30', lit: '255,232,240', knot: '64,38,32' },
          hillFar: '#ffc3dc', hillNear: '#f79ec4',
          penTint: 'rgba(255,160,200,0.18)', groundShadow: 'rgba(120,60,90,.20)',
          groundFx: [{ kind: 'petal', count: 150, color: '255,255,255', color2: '255,138,182', size: 3.4, alpha: 0.85 },
                     { kind: 'tuft', count: 80, color: '150,190,120', size: 7,
                       bloom: '255,255,255', bloom2: '255,150,195', bloomCore: 'rgba(255,206,110,0.95)' }],
          leaf: '#ff7fb0', leafLight: 'rgba(255,236,245,0.85)', leafMid: 'rgba(255,130,185,0.32)', leafDapple: 'rgba(255,255,255,0.92)',
          sky: 'rgba(255,168,208,0.30)',
          cloud: 'rgba(255,228,240,0.95)',
          skyFx: 'blossom-branch', branch: '#7a5240', blossom: '#ff8fbb', blossomAlt: '#ffffff', blossomCore: 'rgba(255,206,110,0.95)',
          weather: { kind: 'petal', count: 64, color: '255,255,255', color2: '255,120,170', size: 4.4, speed: 18, sway: 46, alpha: 0.92 },
        },
        night: {
          // 夜樱. The carpet dims but stays unmistakably pink — a night farm
          // that went grey would throw away the thing that was paid for.
          grass: ['#6b4a5e', '#4b3243', '#332030'],
          deck: { dark: '#3a2a2a', light: '#4d3838', top: [86, 64, 62], bottom: [58, 42, 40],
                  grain: '24,15,14', seam: '18,11,10', lit: '200,170,180', knot: '20,13,12' },
          hillFar: '#6d4560', hillNear: '#7d5070',
          penTint: 'rgba(130,80,110,0.18)',
          groundFx: [{ kind: 'petal', count: 110, color: '235,220,232', color2: '198,116,158', size: 3.2, alpha: 0.55 },
                     { kind: 'tuft', count: 60, color: '92,110,88', size: 7, alpha: 0.7,
                       bloom: '235,220,232', bloom2: '210,150,180', bloomCore: 'rgba(220,180,110,0.8)' }],
          leaf: '#a35b87', leafLight: 'rgba(245,205,230,0.60)', leafMid: 'rgba(165,100,145,0.26)', leafDapple: 'rgba(255,240,250,0.68)',
          sky: 'rgba(175,105,160,0.22)',
          cloud: 'rgba(210,165,200,0.75)',
          skyFx: 'blossom-branch', branch: '#3f2a24', blossom: '#e08ab4', blossomAlt: '#f6e6f0', blossomCore: 'rgba(230,180,110,0.85)',
          weather: { kind: 'petal', count: 44, color: '245,235,245', color2: '230,140,180', size: 4.0, speed: 16, sway: 42, alpha: 0.62 },
        },
      },
    ];

    const AFFECTION_MILESTONES = [
      { min: 0,    title: 'Stranger',      reward: 0 },
      { min: 50,   title: 'Acquaintance',  reward: 20 },
      { min: 150,  title: 'Friend',        reward: 50 },
      { min: 300,  title: 'Good Friend',   reward: 100 },
      { min: 500,  title: 'Best Friend',   reward: 200 },
      { min: 800,  title: 'Soul Mate',     reward: 350 },
      { min: 1200, title: 'Inseparable',   reward: 500 },
      { min: 2000, title: 'Legendary Bond', reward: 800 },
      { min: 3000, title: 'Eternal Companion', reward: 1200 },
      { min: 4500, title: 'Heart Guardian',    reward: 1800 },
      { min: 6500, title: 'Mythic Bond',        reward: 2600 },
      { min: 9000, title: 'Divine Connection',  reward: 4000 },
    ];

    // Affection points lost per 10-min decay cycle while a pet is starving (hunger = 0)
    const STARVE_AFFECTION_LOSS = 2;

    function getAffectionTitle(aff) {
      for (let i = AFFECTION_MILESTONES.length - 1; i >= 0; i--) {
        if (aff >= AFFECTION_MILESTONES[i].min) return AFFECTION_MILESTONES[i];
      }
      return AFFECTION_MILESTONES[0];
    }

    const DECORATIONS = [
      // Wall decorations  (defaultX/Y are normalized 0-1)
      { id: 'clock',        emoji: '🕐', name: 'Wall Clock',     cost: 150,  category: 'wall',  dx: 0.09,  dy: 0.15 },
      { id: 'shelf',        emoji: '📚', name: 'Book Shelf',     cost: 300,  category: 'wall',  dx: 0.82,  dy: 0.28 },
      { id: 'hangplant',    emoji: '🌿', name: 'Hanging Plant',  cost: 200,  category: 'wall',  dx: 0.32,  dy: 0.05 },
      { id: 'stringlights', emoji: '💡', name: 'String Lights',  cost: 400,  category: 'wall',  dx: 0.50,  dy: 0.02 },
      { id: 'banner',       emoji: '🎏', name: 'Wall Banner',    cost: 250,  category: 'wall',  dx: 0.64,  dy: 0.06 },
      { id: 'photo',        emoji: '🖼️', name: 'Photo Frame',    cost: 180,  category: 'wall',  dx: 0.40,  dy: 0.20 },
      { id: 'mirror',       emoji: '🪞', name: 'Wall Mirror',    cost: 350,  category: 'wall',  dx: 0.70,  dy: 0.18 },
      { id: 'antlers',      emoji: '🦌', name: 'Antler Mount',   cost: 500,  category: 'wall',  dx: 0.50,  dy: 0.12 },
      { id: 'neon',         emoji: '✨', name: 'Neon Sign',      cost: 600,  category: 'wall',  dx: 0.50,  dy: 0.25 },
      { id: 'poster',       emoji: '🎨', name: 'Art Poster',     cost: 120,  category: 'wall',  dx: 0.25,  dy: 0.22 },
      { id: 'dartboard',    emoji: '🎯', name: 'Dart Board',     cost: 280,  category: 'wall',  dx: 0.88,  dy: 0.20 },
      { id: 'wreath',       emoji: '💐', name: 'Flower Wreath',  cost: 220,  category: 'wall',  dx: 0.15,  dy: 0.10 },
      { id: 'tapestry',     emoji: '🧶', name: 'Tapestry',       cost: 450,  category: 'wall',  dx: 0.50,  dy: 0.16 },
      { id: 'sconce',       emoji: '🕯️', name: 'Wall Sconce',    cost: 380,  category: 'wall',  dx: 0.86,  dy: 0.14 },
      { id: 'map',          emoji: '🗺️', name: 'World Map',      cost: 320,  category: 'wall',  dx: 0.35,  dy: 0.14 },
      { id: 'cuckoo',       emoji: '🐦', name: 'Cuckoo Clock',   cost: 450,  category: 'wall',  dx: 0.12,  dy: 0.18 },
      { id: 'macrame',      emoji: '🪢', name: 'Macramé',         cost: 280,  category: 'wall',  dx: 0.28,  dy: 0.08 },
      { id: 'thermometer',  emoji: '🌡️', name: 'Thermometer',    cost: 100,  category: 'wall',  dx: 0.92,  dy: 0.15 },
      { id: 'plate',        emoji: '🍽️', name: 'Decor Plate',    cost: 160,  category: 'wall',  dx: 0.78,  dy: 0.12 },
      { id: 'butterfly',    emoji: '🦋', name: 'Butterfly Frame', cost: 240,  category: 'wall',  dx: 0.55,  dy: 0.18 },
      { id: 'medal',        emoji: '🏅', name: 'Medal Display',  cost: 320,  category: 'wall',  dx: 0.42,  dy: 0.10 },
      { id: 'lantern',      emoji: '🏮', name: 'Paper Lantern',  cost: 280,  category: 'wall',  dx: 0.68,  dy: 0.05 },
      { id: 'dreamcatcher', emoji: '🪶', name: 'Dreamcatcher',   cost: 360,  category: 'wall',  dx: 0.20,  dy: 0.06 },
      { id: 'speaker',      emoji: '🔊', name: 'Wall Speaker',   cost: 420,  category: 'wall',  dx: 0.90,  dy: 0.08 },
      { id: 'mask',         emoji: '🎭', name: 'Theater Masks',  cost: 380,  category: 'wall',  dx: 0.60,  dy: 0.14 },
      { id: 'calendar',     emoji: '📅', name: 'Wall Calendar',  cost: 100,  category: 'wall',  dx: 0.05,  dy: 0.22 },
      { id: 'katana',       emoji: '⚔️', name: 'Crossed Swords', cost: 650,  category: 'wall',  dx: 0.50,  dy: 0.08 },
      { id: 'diploma',      emoji: '📜', name: 'Diploma',        cost: 200,  category: 'wall',  dx: 0.35,  dy: 0.25 },
      // Floor decorations
      { id: 'floorlamp',    emoji: '🪔', name: 'Floor Lamp',     cost: 350,  category: 'floor', dx: 0.78,  dy: 0.88 },
      { id: 'sidetable',    emoji: '🪑', name: 'Side Table',     cost: 200,  category: 'floor', dx: 0.08,  dy: 0.80 },
      { id: 'cushion',      emoji: '🛋️', name: 'Floor Cushion',  cost: 100,  category: 'floor', dx: 0.58,  dy: 0.86 },
      { id: 'toybox',       emoji: '🧸', name: 'Toy Box',        cost: 250,  category: 'floor', dx: 0.22,  dy: 0.84 },
      { id: 'bookcase',     emoji: '📖', name: 'Bookcase',       cost: 500,  category: 'floor', dx: 0.88,  dy: 0.88 },
      { id: 'aquarium',     emoji: '🐠', name: 'Fish Tank',      cost: 800,  category: 'floor', dx: 0.92,  dy: 0.80 },
      { id: 'guitar',       emoji: '🎸', name: 'Guitar Stand',   cost: 400,  category: 'floor', dx: 0.05,  dy: 0.88 },
      { id: 'globe',        emoji: '🌍', name: 'Globe',          cost: 350,  category: 'floor', dx: 0.15,  dy: 0.78 },
      { id: 'trashcan',     emoji: '🗑️', name: 'Trash Can',      cost: 80,   category: 'floor', dx: 0.95,  dy: 0.92 },
      { id: 'fan',          emoji: '🌀', name: 'Standing Fan',   cost: 300,  category: 'floor', dx: 0.72,  dy: 0.85 },
      { id: 'beanpillow',   emoji: '🫘', name: 'Bean Bag',       cost: 450,  category: 'floor', dx: 0.42,  dy: 0.90 },
      { id: 'tv',           emoji: '📺', name: 'Retro TV',       cost: 600,  category: 'floor', dx: 0.50,  dy: 0.80 },
      { id: 'piano',        emoji: '🎹', name: 'Upright Piano',  cost: 700,  category: 'floor', dx: 0.30,  dy: 0.82 },
      { id: 'telescope',    emoji: '🔭', name: 'Telescope',      cost: 550,  category: 'floor', dx: 0.60,  dy: 0.85 },
      { id: 'cactus',       emoji: '🌵', name: 'Potted Cactus',  cost: 180,  category: 'floor', dx: 0.18,  dy: 0.88 },
      { id: 'candles',      emoji: '🕯️', name: 'Candle Set',     cost: 220,  category: 'floor', dx: 0.14,  dy: 0.76 },
      { id: 'skateboard',   emoji: '🛹', name: 'Skateboard',     cost: 260,  category: 'floor', dx: 0.35,  dy: 0.94 },
      { id: 'vinylplayer',  emoji: '💿', name: 'Vinyl Player',   cost: 550,  category: 'floor', dx: 0.10,  dy: 0.84 },
      { id: 'umbrella',     emoji: '☂️', name: 'Umbrella Stand',  cost: 190,  category: 'floor', dx: 0.94,  dy: 0.86 },
      { id: 'terrarium',    emoji: '🪴', name: 'Terrarium',      cost: 420,  category: 'floor', dx: 0.48,  dy: 0.78 },
      { id: 'coffeemaker',  emoji: '☕', name: 'Coffee Maker',   cost: 350,  category: 'floor', dx: 0.82,  dy: 0.76 },
      { id: 'gaming',       emoji: '🎮', name: 'Game Console',   cost: 600,  category: 'floor', dx: 0.55,  dy: 0.82 },
      { id: 'camera',       emoji: '📷', name: 'Camera Tripod',  cost: 480,  category: 'floor', dx: 0.68,  dy: 0.88 },
      { id: 'fountain',     emoji: '⛲', name: 'Mini Fountain',  cost: 750,  category: 'floor', dx: 0.40,  dy: 0.84 },
      { id: 'chessset',     emoji: '♟️', name: 'Chess Set',       cost: 320,  category: 'floor', dx: 0.25,  dy: 0.90 },
      { id: 'bonsai',       emoji: '🌳', name: 'Bonsai Tree',    cost: 500,  category: 'floor', dx: 0.75,  dy: 0.78 },
      { id: 'speaker2',     emoji: '🎵', name: 'Bluetooth Speaker', cost: 380, category: 'floor', dx: 0.62, dy: 0.92 },
      { id: 'shoe_rack',    emoji: '👟', name: 'Shoe Rack',      cost: 200,  category: 'floor', dx: 0.02,  dy: 0.92 },
      { id: 'xmastree',     emoji: '🎄', name: 'Christmas Tree', cost: 800,  category: 'floor', dx: 0.20,  dy: 0.78 },
      { id: 'rocket',       emoji: '🚀', name: 'Model Rocket',   cost: 450,  category: 'floor', dx: 0.88,  dy: 0.82 },
      { id: 'minifridge',   emoji: '🧊', name: 'Mini Fridge',    cost: 500,  category: 'floor', dx: 0.96,  dy: 0.78 },
      // Rug styles (only one active at a time)
      { id: 'rug_blue',     emoji: '🔵', name: 'Blue Rug',       cost: 200,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_green',    emoji: '🟢', name: 'Green Rug',      cost: 200,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_pink',     emoji: '🩷', name: 'Pink Rug',       cost: 200,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_star',     emoji: '⭐', name: 'Star Rug',       cost: 350,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_rainbow',  emoji: '🌈', name: 'Rainbow Rug',    cost: 400,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_cream',    emoji: '🤍', name: 'Cream Rug',      cost: 250,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_persian',  emoji: '🟤', name: 'Persian Rug',    cost: 500,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_zebra',    emoji: '🦓', name: 'Zebra Rug',      cost: 450,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_red',      emoji: '🔴', name: 'Red Rug',        cost: 200,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_purple',   emoji: '🟣', name: 'Purple Rug',     cost: 300,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_checker',  emoji: '🏁', name: 'Checker Rug',    cost: 450,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_ocean',    emoji: '🌊', name: 'Ocean Rug',      cost: 350,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_forest',   emoji: '🌲', name: 'Forest Rug',     cost: 300,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_gold',     emoji: '🟡', name: 'Gold Rug',       cost: 500,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_galaxy',   emoji: '🌌', name: 'Galaxy Rug',     cost: 600,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      { id: 'rug_heart',    emoji: '❤️', name: 'Heart Rug',       cost: 350,  category: 'rug',   dx: 0.38,  dy: 0.82 },
      // Unlock-only: granted when a pet type's 九宫格 collection is completed. Not buyable.
      { id: 'decor_cat_throne',        emoji: '👑', name: 'Royal Cat Throne',    cost: 0, category: 'floor', dx: 0.30, dy: 0.82, unlockOnly: true },
      { id: 'decor_dog_doghouse',      emoji: '🏠', name: 'Champion Doghouse',   cost: 0, category: 'floor', dx: 0.70, dy: 0.82, unlockOnly: true },
      { id: 'decor_bunny_garden',      emoji: '🌻', name: 'Bunny Garden',        cost: 0, category: 'floor', dx: 0.20, dy: 0.86, unlockOnly: true },
      { id: 'decor_hamster_playground',emoji: '🎡', name: 'Hamster Playground',  cost: 0, category: 'floor', dx: 0.55, dy: 0.84, unlockOnly: true },
      { id: 'decor_fox_den',           emoji: '🏕️', name: 'Mystic Fox Den',      cost: 0, category: 'floor', dx: 0.78, dy: 0.80, unlockOnly: true },
      { id: 'decor_panda_garden',      emoji: '🎋', name: 'Bamboo Garden',       cost: 0, category: 'floor', dx: 0.40, dy: 0.80, unlockOnly: true },
      { id: 'decor_goose_pond',        emoji: '⛲', name: 'Goose Pond',          cost: 0, category: 'floor', dx: 0.62, dy: 0.88, unlockOnly: true },
      { id: 'decor_tom_armchair',      emoji: '🛋️', name: "Tom's Armchair",      cost: 0, category: 'floor', dx: 0.28, dy: 0.82, unlockOnly: true },
      { id: 'decor_jerry_mousehole',   emoji: '🧀', name: "Jerry's Cheese Wedge", cost: 0, category: 'floor', dx: 0.66, dy: 0.84, unlockOnly: true },
      { id: 'decor_capybara_onsen',    emoji: '♨️', name: 'Hot Spring',          cost: 0, category: 'floor', dx: 0.52, dy: 0.86, unlockOnly: true },
    ];

    const WALL_PATTERNS = [
      { id: 'wall_default',  emoji: '🏠', name: 'Default (Plain)',  cost: 0 },
      { id: 'wall_brick',    emoji: '🧱', name: 'Brick Wall',       cost: 300 },
      { id: 'wall_wood',     emoji: '🪵', name: 'Wood Panel',       cost: 400 },
      { id: 'wall_stripe',   emoji: '📏', name: 'Striped',          cost: 350 },
      { id: 'wall_dots',     emoji: '⚪', name: 'Polka Dots',       cost: 300 },
      { id: 'wall_diamond',  emoji: '💠', name: 'Diamond',          cost: 500 },
      { id: 'wall_pastel',   emoji: '🌸', name: 'Pastel Pink',      cost: 400 },
      { id: 'wall_mint',     emoji: '🍃', name: 'Mint Green',       cost: 400 },
      { id: 'wall_navy',     emoji: '🌊', name: 'Navy Blue',        cost: 450 },
      { id: 'wall_sunset',   emoji: '🌅', name: 'Sunset Gradient',  cost: 600 },
      { id: 'wall_marble',   emoji: '🪨', name: 'Marble',           cost: 700 },
      { id: 'wall_lavender', emoji: '💜', name: 'Lavender',         cost: 400 },
      { id: 'wall_forest',   emoji: '🌲', name: 'Forest Green',     cost: 450 },
      { id: 'wall_galaxy',   emoji: '🌌', name: 'Galaxy',           cost: 800 },
      { id: 'wall_bamboo',   emoji: '🎋', name: 'Bamboo',           cost: 500 },
      { id: 'wall_cherry',   emoji: '🌸', name: 'Cherry Blossom',   cost: 550 },
    ];

    const WINDOWS = [
      { id: 'win_none',      emoji: '❌', name: 'No Window',       cost: 0 },
      { id: 'win_classic',   emoji: '🪟', name: 'Classic Window',  cost: 0 },
      { id: 'win_large',     emoji: '🏔️', name: 'Large Window',    cost: 500 },
      { id: 'win_round',     emoji: '⭕', name: 'Round Window',    cost: 400 },
      { id: 'win_arch',      emoji: '🕌', name: 'Arch Window',     cost: 600 },
      { id: 'win_double',    emoji: '🪟🪟', name: 'Double Window', cost: 800 },
      { id: 'win_skylight',  emoji: '☀️', name: 'Skylight',        cost: 700 },
      { id: 'win_stained',   emoji: '🎨', name: 'Stained Glass',   cost: 900 },
      { id: 'win_porthole',  emoji: '🚢', name: 'Porthole',        cost: 350 },
    ];

    const FLOOR_PATTERNS = [
      { id: 'floor_wood',   emoji: '🪵', name: 'Wood Planks',    cost: 0 },
      { id: 'floor_tile',   emoji: '◻️', name: 'Checker Tile',   cost: 300 },
      { id: 'floor_marble', emoji: '🪨', name: 'Marble Floor',   cost: 500 },
      { id: 'floor_carpet', emoji: '🟥', name: 'Red Carpet',     cost: 350 },
      { id: 'floor_stone',  emoji: '⬜', name: 'Stone Slabs',    cost: 400 },
      { id: 'floor_grass',  emoji: '🌿', name: 'Grass Lawn',     cost: 450 },
      { id: 'floor_sand',   emoji: '🏖️', name: 'Beach Sand',     cost: 400 },
      { id: 'floor_galaxy', emoji: '🌌', name: 'Galaxy Floor',   cost: 800 },
      { id: 'floor_lava',   emoji: '🌋', name: 'Lava Rock',      cost: 700 },
      { id: 'floor_ice',    emoji: '🧊', name: 'Ice Floor',      cost: 600 },
    ];

    const PLANT_LEVELS = [
      { level: 1,  label: 'Seed' },
      { level: 2,  label: 'Cracking',    cost: 30 },
      { level: 3,  label: 'Rooting',     cost: 50 },
      { level: 4,  label: 'Sprouting',   cost: 80 },
      { level: 5,  label: 'Cotyledon',   cost: 100 },
      { level: 6,  label: 'First Leaf',  cost: 130 },
      { level: 7,  label: 'Two Leaves',  cost: 160 },
      { level: 8,  label: 'Growing',     cost: 200 },
      { level: 9,  label: 'Leafy',       cost: 250 },
      { level: 10, label: 'Strong',      cost: 300 },
      { level: 11, label: 'Branching',   cost: 350 },
      { level: 12, label: 'Spreading',   cost: 400 },
      { level: 13, label: 'Veined',      cost: 460 },
      { level: 14, label: 'Lush',        cost: 520 },
      { level: 15, label: 'Budding',     cost: 580 },
      { level: 16, label: 'Pre-bloom',   cost: 650 },
      { level: 17, label: 'Bud Color',   cost: 720 },
      { level: 18, label: 'Opening',     cost: 800 },
      { level: 19, label: 'Flowering',   cost: 880 },
      { level: 20, label: 'Full Bloom',  cost: 970 },
      { level: 21, label: 'Multi-bloom', cost: 1060 },
      { level: 22, label: 'Abundant',    cost: 1160 },
      { level: 23, label: 'Radiant',     cost: 1260 },
      { level: 24, label: 'Vivid',       cost: 1370 },
      { level: 25, label: 'Flourishing', cost: 1500 },
      { level: 26, label: 'Graceful',    cost: 1650 },
      { level: 27, label: 'Fruitful',    cost: 1800 },
      { level: 28, label: 'Golden',      cost: 2000 },
      { level: 29, label: 'Majestic',    cost: 2200 },
      { level: 30, label: 'Max ★',       cost: 2500 },
    ];

    // Cheapest plant cost used as base for scaling
    const BASE_PLANT_COST = PLANTS.reduce((m, p) => Math.min(m, p.cost), Infinity);

    function getPlantCostMultiplier(plantId) {
      const p = PLANTS.find(x => x.id === plantId);
      return p ? p.cost / BASE_PLANT_COST : 1;
    }

    function getPlantUpgradeCost(plantId, level) {
      const next = PLANT_LEVELS[level];
      if (!next) return null;
      return Math.round(next.cost * getPlantCostMultiplier(plantId));
    }

    function getTotalPlantInvestment(plantId, currentLevel) {
      let total = 0;
      for (let i = 1; i < currentLevel; i++) {
        total += getPlantUpgradeCost(plantId, i) || 0;
      }
      return total;
    }

    function getInheritedLevel(newPlantId, totalInvestment) {
      let spent = 0;
      for (let lvl = 1; lvl < PLANT_LEVELS.length; lvl++) {
        const cost = getPlantUpgradeCost(newPlantId, lvl);
        if (cost === null || spent + cost > totalInvestment) return lvl;
        spent += cost;
      }
      return PLANT_LEVELS.length;
    }

    /* ═══════════════════════════════
       Pet Accessories
       ═══════════════════════════════ */
    const PET_ACCESSORIES = [
      { id: 'acc_tophat',    emoji: '🎩', name: 'Top Hat',       draw: 'tophat' },
      { id: 'acc_crown',     emoji: '👑', name: 'Crown',         draw: 'crown' },
      { id: 'acc_glasses',   emoji: '🕶️', name: 'Sunglasses',    draw: 'glasses' },
      { id: 'acc_bow',       emoji: '🎀', name: 'Bow',           draw: 'bow' },
      { id: 'acc_scarf',     emoji: '🧣', name: 'Scarf',         draw: 'scarf' },
      { id: 'acc_flower',    emoji: '🌸', name: 'Flower',        draw: 'flower' },
      { id: 'acc_bandana',   emoji: '🏴', name: 'Bandana',       draw: 'bandana' },
      { id: 'acc_monocle',   emoji: '🧐', name: 'Monocle',       draw: 'monocle' },
      { id: 'acc_halo',      emoji: '😇', name: 'Halo',          draw: 'halo' },
      { id: 'acc_wizard',    emoji: '🧙', name: 'Wizard Hat',    draw: 'wizard',    gachaOnly: true },
      { id: 'acc_partyhat',  emoji: '🥳', name: 'Party Hat',     draw: 'partyhat',  gachaOnly: true },
      { id: 'acc_heartglass',emoji: '💕', name: 'Heart Glasses', draw: 'heartglass',gachaOnly: true },
      { id: 'acc_devil',     emoji: '😈', name: 'Devil Horns',   draw: 'devil',     gachaOnly: true },
      { id: 'acc_wings',     emoji: '🕊️', name: 'Angel Wings',   draw: 'wings',     gachaOnly: true },
      { id: 'acc_cape',      emoji: '🦸', name: 'Cape',          draw: 'cape',      gachaOnly: true },
      { id: 'acc_ninja',     emoji: '👤', name: 'Ninja Mask',    draw: 'ninja',     gachaOnly: true },
      { id: 'acc_pirate',    emoji: '🏴‍☠️', name: 'Pirate Patch',  draw: 'pirate',    gachaOnly: true },
      { id: 'acc_tiara',     emoji: '👸', name: 'Tiara',         draw: 'tiara',     gachaOnly: true },
      { id: 'acc_starbadge', emoji: '⭐', name: 'Star Badge',    draw: 'starbadge', gachaOnly: true },
    ];

    /* ═══════════════════════════════
       Daily Login Rewards
       ═══════════════════════════════ */
    const DAILY_REWARDS = [
      { day: 1, coins: 10,  label: 'Day 1' },
      { day: 2, coins: 20,  label: 'Day 2' },
      { day: 3, coins: 35,  label: 'Day 3' },
      { day: 4, coins: 50,  label: 'Day 4' },
      { day: 5, coins: 75,  label: 'Day 5' },
      { day: 6, coins: 100, label: 'Day 6' },
      { day: 7, coins: 200, label: 'Day 7 🎉' },
    ];

    /* ═══════════════════════════════
       Achievements
       ═══════════════════════════════ */
    const ACHIEVEMENTS = [
      { id: 'ach_first_pet',     icon: '🐾', name: 'First Friend',       desc: 'Buy your first pet',          check: (d) => (d.pets || []).length >= 1 },
      { id: 'ach_two_pets',      icon: '🐾🐾', name: 'Dynamic Duo',     desc: 'Own 2 pets',                  check: (d) => (d.pets || []).length >= 2 },
      { id: 'ach_all_pets',      icon: '🏆', name: 'Pet Collector',      desc: 'Own all 6 types',             check: (d) => new Set((d.pets || []).map(p => p.type)).size >= 6 },
      { id: 'ach_first_plant',   icon: '🌱', name: 'Green Thumb',        desc: 'Buy your first plant',        check: (d) => d.ownedPlants.length >= 1 },
      { id: 'ach_plant_max',     icon: '🌳', name: 'Master Gardener',    desc: 'Reach plant level 30',        check: (d) => Object.values(d.plantLevels).some(l => l >= 30) },
      { id: 'ach_coins_1k',      icon: '💰', name: 'Piggy Bank',         desc: 'Accumulate 1,000 coins',      check: (d) => d.coins >= 1000 },
      { id: 'ach_coins_10k',     icon: '💎', name: 'Rich Room',          desc: 'Accumulate 10,000 coins',     check: (d) => d.coins >= 10000 },
      { id: 'ach_decor_5',       icon: '🎨', name: 'Decorator',          desc: 'Own 5 decorations',           check: (d) => d.ownedDecors.length >= 5 },
      { id: 'ach_decor_15',      icon: '🏡', name: 'Interior Designer',  desc: 'Own 15 decorations',          check: (d) => d.ownedDecors.length >= 15 },
      { id: 'ach_streak_7',      icon: '🔥', name: 'Dedicated',          desc: '7-day login streak',          check: (d) => (d.loginStreak || 0) >= 7 },
      { id: 'ach_best_friend',   icon: '❤️', name: 'Best Friend',        desc: 'Reach Best Friend with a pet',check: (d) => (d.pets || []).some(p => (p.affection || 0) >= 500) },
      { id: 'ach_legendary',     icon: '⭐', name: 'Legendary Bond',     desc: 'Reach Legendary Bond (2000)', check: (d) => (d.pets || []).some(p => (p.affection || 0) >= 2000) },
      { id: 'ach_acc_3',         icon: '🎩', name: 'Fashionista',        desc: 'Own 3 accessories',           check: (d) => (d.ownedAccessories || []).length >= 3 },
      { id: 'ach_gacha_5',       icon: '🎰', name: 'Lucky Player',       desc: 'Pull gacha 5 times',          check: (d) => (d.gachaPulls || 0) >= 5 },
      { id: 'ach_gift_given',    icon: '🎁', name: 'Generous',           desc: 'Send a gift to someone',      check: (d) => (d.giftsGiven || 0) >= 1 },
      { id: 'ach_farm_first',    icon: '🚜', name: 'Farmer',             desc: 'Buy your first farm animal',  check: (d) => (d.farmAnimals || []).length >= 1 },
      { id: 'ach_farm_all',      icon: '🐄', name: 'Full Barn',          desc: 'Own all 4 farm animals',      check: (d) => new Set((d.farmAnimals || []).map(a => a.type)).size >= 4 },
      { id: 'ach_farm_100',      icon: '🥚', name: 'Harvest Hand',       desc: 'Collect 100 produce',         check: (d) => (d.farmTotalCollected || 0) >= 100 },
      { id: 'ach_farm_1k',       icon: '🌾', name: 'Master Farmer',      desc: 'Collect 1,000 produce',       check: (d) => (d.farmTotalCollected || 0) >= 1000 },
      { id: 'ach_farm_lv5',      icon: '⭐', name: 'Prize Livestock',    desc: 'Raise a farm animal to Lv5',  check: (d) => (d.farmAnimals || []).some(a => animalLevel(a.collected, FARM_LEVELS) >= 5) },
      { id: 'ach_farm_expand',   icon: '🏞️', name: 'Land Baron',         desc: 'Expand your farm',            check: (d) => (d.farmCapLevel || 0) >= 1 },
      { id: 'ach_aqua_first',  icon: '🐠', name: 'First Fish',     desc: 'Place your first fish in the aquarium', check: (d) => (d.aquariumFish || []).length >= 1 },
      { id: 'ach_aqua_common', icon: '🐟', name: 'Reef Regular',   desc: 'Place every common fish',  check: (d) => FISH_TYPES.filter(f => f.rarity === 'common').every(f => (d.aquariumFish || []).includes(f.name)) },
      { id: 'ach_aqua_rare',   icon: '🐡', name: 'Deep Sea Diver', desc: 'Place every rare fish',    check: (d) => FISH_TYPES.filter(f => f.rarity === 'rare').every(f => (d.aquariumFish || []).includes(f.name)) },
      { id: 'ach_aqua_epic',   icon: '🦈', name: 'Apex Tank',      desc: 'Place every epic fish',    check: (d) => FISH_TYPES.filter(f => f.rarity === 'epic').every(f => (d.aquariumFish || []).includes(f.name)) },
      { id: 'ach_aqua_legend', icon: '🐉', name: 'Legend Keeper',  desc: 'Place every legendary fish', check: (d) => FISH_TYPES.filter(f => f.rarity === 'legendary').every(f => (d.aquariumFish || []).includes(f.name)) },
      { id: 'ach_aqua_100',    icon: '🏆', name: 'Aquarist 100%',  desc: 'Place every catchable fish', check: (d) => FISH_TYPES.filter(f => f.rarity !== 'junk').every(f => (d.aquariumFish || []).includes(f.name)) },
    ];

    /* ═══════════════════════════════
       Gacha Pool
       ═══════════════════════════════ */
    const GACHA_COST = 200;
    const GACHA_POOL = [
      // Coin prizes
      { id: 'gacha_50coins',  emoji: '💰', name: '50 Coins',       rarity: 'common',    weight: 25, type: 'coins', amount: 50 },
      { id: 'gacha_100coins', emoji: '💰', name: '100 Coins',      rarity: 'uncommon',  weight: 12, type: 'coins', amount: 100 },
      { id: 'gacha_200coins', emoji: '💰', name: '200 Coins',      rarity: 'rare',      weight: 5,  type: 'coins', amount: 200 },
      { id: 'gacha_500coins', emoji: '💰', name: '500 Coins',      rarity: 'epic',      weight: 2,  type: 'coins', amount: 500 },
      // Common Accessories
      { id: 'acc_bow',        emoji: '🎀', name: 'Bow',            rarity: 'common',    weight: 8,  type: 'accessory' },
      { id: 'acc_flower',     emoji: '🌸', name: 'Flower',         rarity: 'common',    weight: 8,  type: 'accessory' },
      { id: 'acc_bandana',    emoji: '🏴', name: 'Bandana',        rarity: 'common',    weight: 8,  type: 'accessory' },
      // Uncommon Accessories
      { id: 'acc_glasses',    emoji: '🕶️', name: 'Sunglasses',     rarity: 'uncommon',  weight: 5,  type: 'accessory' },
      { id: 'acc_scarf',      emoji: '🧣', name: 'Scarf',          rarity: 'uncommon',  weight: 5,  type: 'accessory' },
      { id: 'acc_tophat',     emoji: '🎩', name: 'Top Hat',        rarity: 'uncommon',  weight: 5,  type: 'accessory' },
      { id: 'acc_partyhat',   emoji: '🥳', name: 'Party Hat',      rarity: 'uncommon',  weight: 5,  type: 'accessory' },
      // Rare Accessories
      { id: 'acc_halo',       emoji: '😇', name: 'Halo',           rarity: 'rare',      weight: 3,  type: 'accessory' },
      { id: 'acc_monocle',    emoji: '🧐', name: 'Monocle',        rarity: 'rare',      weight: 3,  type: 'accessory' },
      { id: 'acc_heartglass', emoji: '💕', name: 'Heart Glasses',  rarity: 'rare',      weight: 3,  type: 'accessory' },
      { id: 'acc_wizard',     emoji: '🧙', name: 'Wizard Hat',     rarity: 'rare',      weight: 3,  type: 'accessory' },
      { id: 'acc_devil',      emoji: '😈', name: 'Devil Horns',    rarity: 'rare',      weight: 3,  type: 'accessory' },
      // Epic Accessories
      { id: 'acc_crown',      emoji: '👑', name: 'Crown',          rarity: 'epic',      weight: 1.5, type: 'accessory' },
      { id: 'acc_ninja',      emoji: '👤', name: 'Ninja Mask',     rarity: 'epic',      weight: 1.5, type: 'accessory' },
      { id: 'acc_pirate',     emoji: '🏴‍☠️', name: 'Pirate Patch',   rarity: 'epic',      weight: 1.5, type: 'accessory' },
      { id: 'acc_cape',       emoji: '🦸', name: 'Cape',           rarity: 'epic',      weight: 1.5, type: 'accessory' },
      { id: 'acc_starbadge',  emoji: '⭐', name: 'Star Badge',     rarity: 'epic',      weight: 1.5, type: 'accessory' },
      // Legendary Accessories
      { id: 'acc_tiara',      emoji: '👸', name: 'Tiara',          rarity: 'legendary', weight: 0.5, type: 'accessory' },
      { id: 'acc_wings',      emoji: '🕊️', name: 'Angel Wings',    rarity: 'legendary', weight: 0.5, type: 'accessory' },
    ];

    /* ═══════════════════════════════
       Jukebox Tracks (Web Audio API tone-generated)
       ═══════════════════════════════ */
    const JUKEBOX_TRACKS = [
      { id: 'jb_lofi',     name: '🎵 Lo-fi Chill',     bpm: 75,  key: 'C',  style: 'lofi' },
      { id: 'jb_jazz',     name: '🎷 Smooth Jazz',      bpm: 105, key: 'Eb', style: 'jazz' },
      { id: 'jb_rain',     name: '🌧️ Rain Ambience',    bpm: 0,   key: '-',  style: 'rain' },
      { id: 'jb_retro',    name: '🎮 8-bit Retro',      bpm: 130, key: 'G',  style: 'retro' },
      { id: 'jb_forest',   name: '🌲 Forest Sounds',    bpm: 0,   key: '-',  style: 'forest' },
      { id: 'jb_piano',    name: '🎹 Soft Piano',       bpm: 68,  key: 'F',  style: 'piano' },
      { id: 'jb_ocean',    name: '🌊 Ocean Waves',      bpm: 0,   key: '-',  style: 'ocean' },
      { id: 'jb_lullaby',  name: '🌙 Lullaby',          bpm: 60,  key: 'D',  style: 'lullaby' },
      { id: 'jb_cafe',     name: '☕ Café Bossa',        bpm: 115, key: 'A',  style: 'bossa' },
      { id: 'jb_space',    name: '🚀 Space Ambient',    bpm: 0,   key: '-',  style: 'space' },
      { id: 'jb_music_box',name: '🎠 Music Box',        bpm: 90,  key: 'G',  style: 'musicbox' },
    ];

    /* ═══════════════════════════════
       Guestbook Stickers
       ═══════════════════════════════ */
    const GB_STICKERS = ['❤️','⭐','🎉','🔥','😊','👋','🌈','🎵','✨','💎','🐾','🌸'];

    /* ═══════════════════════════════
       Leaderboard Games
       ═══════════════════════════════ */
    const LB_GAMES = [
      { id: 'flappy',   name: '🐦 Flappy',   key: 'flappy_scores' },
      { id: 'snake',    name: '🐍 Snake',     key: 'snake_scores' },
      { id: 'tetris',   name: '🧱 Tetris',    key: 'tetris_scores' },
      { id: '2048',     name: '🔢 2048',      key: '2048_scores' },
      { id: 'blast',    name: '💥 Block Blast',key: 'blast_scores' },
    ];

