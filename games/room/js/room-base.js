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
    ];

    const PLANTS = [
      { id: 'seedling', emoji: '🌱', name: 'Seedling',    cost: 200,  coinRate: 1 },
      { id: 'cactus',   emoji: '🌵', name: 'Cactus',      cost: 300,  coinRate: 2 },
      { id: 'tulip',    emoji: '🌷', name: 'Tulip',       cost: 400,  coinRate: 3 },
      { id: 'sunflower',emoji: '🌻', name: 'Sunflower',   cost: 600,  coinRate: 4 },
      { id: 'tree',     emoji: '🌳', name: 'Tree',        cost: 1000, coinRate: 6 },
      { id: 'cherry',   emoji: '🌸', name: 'Cherry Tree', cost: 1500, coinRate: 10 },
    ];

    // Maximum offline coin generation time for plants (2 hours in ms)
    const PLANT_OFFLINE_CAP_MS = 2 * 60 * 60 * 1000;
    // Only show the "while you were away" coin collect modal after ≥1h away
    const PLANT_OFFLINE_MODAL_MS = 60 * 60 * 1000;

    const PET_SIZES = {
      cat: 72, dog: 80, bunny: 64, hamster: 58, fox: 76, panda: 86, goose: 74
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
    };

    function getPetPalette(type, colorKey) {
      const colors = PET_COLORS[type];
      if (!colors) return null;
      return colors.find(c => c.key === colorKey) || colors[0];
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
    // Base meat from butchering, by tier (the animal's level adds more — see _meatYield).
    const FARM_MEAT_YIELD = { goose: 1, pig: 2, cow: 3, horse: 4 };

    // Crops grown in garden plots — each yields a sellable product that also
    // feeds the workshop (wheat → Bakery, carrot → Cake Oven, corn → Bakery).
    const FARM_CROPS = [
      { id: 'wheat',  emoji: '🌾', name: 'Wheat',  seedCost: 10, growMs: 60 * 60 * 1000,  yield: { product: 'wheat', qty: 1 } },
      { id: 'carrot', emoji: '🥕', name: 'Carrot', seedCost: 25, growMs: 90 * 60 * 1000,  yield: { product: 'carrot', qty: 1 } },
      { id: 'corn',   emoji: '🌽', name: 'Corn',   seedCost: 50, growMs: 120 * 60 * 1000, yield: { product: 'corn', qty: 1 } },
    ];
    const FARM_PLOT_MAX = 20;      // most garden plots you can own
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
    const FARM_MAX_ANIMALS = 20;                   // total animals on the farm, any mix
    const FARM_DROP_CAP = 3;                       // (legacy) max uncollected drops per animal
    const FARM_PRODUCE_CAP = 20;                   // max uncollected produce per ANIMAL TYPE — production pauses at this until you collect
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

