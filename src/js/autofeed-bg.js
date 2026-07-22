/* ============================================================
   Auto-Feeder — background catch-up for the MAIN app.

   The Room's Auto-Feeder (🤖) only charged coins when you opened
   the Room page: an offline catch-up on load plus a live tick
   while the page stayed open. So if you never went to the Room,
   nothing was deducted and your pets weren't fed until you did.

   This module runs the SAME offline catch-up from the main app
   (index.html) so pets stay fed — and coins are deducted — in the
   background, whenever you're anywhere in the app. No need to open
   the Room for the Auto-Feeder to work.

   It reuses the pure logic in games/room/js/room-autofeed.js
   (planOfflineAutoFeed / bestCoinsPerPoint) and mirrors the Room's
   decay model exactly, so a Room-open right after a background run
   sees decay≈0 and never double-charges. Every write goes through a
   Firestore transaction so it composes safely with the coin-center's
   coin transactions and any open Room tab — concurrent earnings or
   pet edits are never clobbered (the transaction retries instead).

   Requires: Firebase initialized (app.js) and room-autofeed.js,
   both loaded before this script.
   ============================================================ */
(function () {
  // Bail out cleanly if a dependency is missing (e.g. loaded on a page
  // without Firebase or the pure logic module).
  if (typeof firebase === 'undefined' || typeof firebase.firestore !== 'function') return;
  if (typeof planOfflineAutoFeed !== 'function' || typeof bestCoinsPerPoint !== 'function') return;

  var db = firebase.firestore();
  var auth = firebase.auth();

  // ── Economy constants — mirror games/room/js/room-base.js ──
  // Same price table the Room shop uses. We derive the most cost-efficient
  // rate at runtime (bestCoinsPerPoint) rather than hardcoding a coin/point
  // number, so a future price rebalance stays correct on its own.
  // KEEP IN SYNC with room-base.js FOODS/DRINKS (cost/restore only).
  var FOODS = [
    { cost: 30, restore: 10 }, { cost: 50, restore: 20 }, { cost: 80, restore: 30 },
    { cost: 120, restore: 45 }, { cost: 200, restore: 70 }, { cost: 300, restore: 100 }
  ];
  var DRINKS = [
    { cost: 20, restore: 15 }, { cost: 50, restore: 25 }, { cost: 80, restore: 35 },
    { cost: 120, restore: 50 }, { cost: 180, restore: 70 }, { cost: 280, restore: 100 }
  ];
  var FOOD_RATE = bestCoinsPerPoint(FOODS);    // 2.5   coins/point (Apple)
  var DRINK_RATE = bestCoinsPerPoint(DRINKS);  // 1.333 coins/point (Water)

  var DECAY_MS = 10 * 60 * 1000;          // hunger/thirst lose 1% per 10 min (matches the Room)
  var TICK_MS = 10 * 60 * 1000;           // re-check about once per decay cycle
  var AUTOFEED_TARGET = 100;              // refill stats back up to this
  var STARVE_AFFECTION_LOSS = 2;          // affection lost per starved cycle (matches room-base.js)
  var COIN_HISTORY_MAX = 100;             // trim cap (matches room-state.js)
  var COIN_REASON = 'Auto-feeder 🤖';     // same reason string the Room logs, so history groups together

  var _timer = null;
  var _announced = false;   // show the "while you were away" toast at most once per sign-in

  // One catch-up pass for `uid`. Reads the room doc, and if the Auto-Feeder is
  // owned + ON and time has elapsed, tops every pet up (spending coins) exactly
  // as the Room would on load. Returns coins spent (0 if it did nothing).
  async function runCatchup(uid, announce) {
    if (window.SITE_MAINTENANCE) return;   // don't write during maintenance
    var spent = 0;
    try {
      spent = await db.runTransaction(async function (tx) {
        var ref = db.collection('rooms').doc(uid);
        var snap = await tx.get(ref);
        if (!snap.exists) return 0;
        var d = snap.data() || {};
        // Only act when the device is owned AND switched on — otherwise the
        // room is untouched and behaves exactly as before.
        if (!d.autoFeeder || !d.autoFeedOn) return 0;
        var pets = Array.isArray(d.pets) ? d.pets : [];
        if (!pets.length) return 0;
        var lastUpdate = d.updatedAt || Date.now();
        var decay = Math.floor((Date.now() - lastUpdate) / DECAY_MS);
        if (decay <= 0) return 0;   // no whole cycle elapsed → nothing to do yet

        var coins = d.coins || 0;
        var plan = planOfflineAutoFeed({
          pets: pets.map(function (p) {
            return {
              hunger: p.hunger != null ? p.hunger : 100,
              thirst: p.thirst != null ? p.thirst : 100,
              affection: p.affection != null ? p.affection : 0
            };
          }),
          coins: coins,
          decay: decay,
          foodRate: FOOD_RATE,
          drinkRate: DRINK_RATE,
          target: AUTOFEED_TARGET,
          starveLoss: STARVE_AFFECTION_LOSS
        });

        // Preserve every other pet field (name, type, layer, position…); only
        // the three stats change.
        var newPets = pets.map(function (p, i) {
          var np = Object.assign({}, p);
          np.hunger = plan.pets[i].hunger;
          np.thirst = plan.pets[i].thirst;
          np.affection = plan.pets[i].affection;
          return np;
        });

        var s = plan.coinsSpent;
        var newCoins = Math.max(0, coins - s);
        // Always advance updatedAt so these decay cycles are marked consumed —
        // even when broke (spent 0, pets took normal decay). This is what stops
        // a later Room-open from charging for the same time again.
        var patch = { pets: newPets, updatedAt: Date.now() };
        if (s > 0) {
          patch.coins = newCoins;
          var hist = Array.isArray(d.coinHistory) ? d.coinHistory.slice() : [];
          hist.push({ t: Date.now(), d: -s, r: COIN_REASON, b: Math.floor(newCoins) });
          if (hist.length > COIN_HISTORY_MAX) hist.splice(0, hist.length - COIN_HISTORY_MAX);
          patch.coinHistory = hist;
        }
        tx.set(ref, patch, { merge: true });
        return s;
      });
    } catch (e) {
      // Transient (offline / transaction contention) — the next tick retries.
      return;
    }

    if (spent > 0 && announce && !_announced && typeof showToast === 'function') {
      _announced = true;
      showToast('🤖 自动喂食器在后台喂了宠物，花费 ' + spent + ' 金币', 'success');
    }
  }

  function start(uid) {
    stop();
    // Initial catch-up shortly after sign-in (let the login writes settle so we
    // don't contend with them), then re-check about once per decay cycle while
    // the tab is visible.
    setTimeout(function () {
      if (auth.currentUser && auth.currentUser.uid === uid) runCatchup(uid, true);
    }, 4000);
    _timer = setInterval(function () {
      if (document.hidden) return;   // skip while hidden to save Firestore reads
      if (!auth.currentUser || auth.currentUser.uid !== uid) return;
      runCatchup(uid, false);
    }, TICK_MS);
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  auth.onAuthStateChanged(function (user) {
    _announced = false;
    if (user) start(user.uid);
    else stop();
  });

  // Returning to the tab after a while — top up promptly (silent; the one-time
  // toast already fired this session).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var u = auth.currentUser;
    if (u) runCatchup(u.uid, false);
  });
})();
