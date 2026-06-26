/* ════════════════════════════════════════════════════════════════
   economy-config.js — live economy tuning.
   ----------------------------------------------------------------
   Applies admin overrides from app_state/economy ON TOP of the
   built-in defaults in coin-spend-logic.js. Anything not set in
   Firestore keeps its hardcoded default, so a missing/partial config
   can never break the economy. Edited from admin → Economy tab.
   Loads AFTER coin-spend-logic.js (needs window.CoinSpend).
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function num(v) { return typeof v === 'number' && isFinite(v); }

  function apply(cfg) {
    var CS = window.CoinSpend;
    if (!cfg || !CS) return;

    if (cfg.gacha) {
      if (num(cfg.gacha.pullCost))  CS.GACHA.pullCost  = cfg.gacha.pullCost;
      if (num(cfg.gacha.tenCost))   CS.GACHA.tenCost   = cfg.gacha.tenCost;
      if (num(cfg.gacha.dupRefund)) CS.GACHA.dupRefund = cfg.gacha.dupRefund;
      var o = cfg.gacha.odds;
      if (o && ['SSR', 'SR', 'R', 'N'].every(function (k) { return num(o[k]); })) {
        CS.GACHA.odds = [
          { rarity: 'SSR', p: o.SSR }, { rarity: 'SR', p: o.SR },
          { rarity: 'R', p: o.R }, { rarity: 'N', p: o.N }
        ];
      }
    }
    if (cfg.slot) {
      if (Array.isArray(cfg.slot.bets) && cfg.slot.bets.length && cfg.slot.bets.every(num)) CS.SLOT_BETS = cfg.slot.bets.slice(0, 3);
      if (num(cfg.slot.twoCherry)) CS.SLOT_TWO_CHERRY = cfg.slot.twoCherry;
    }
    if (cfg.fortune && num(cfg.fortune.cost)) CS.FORTUNE_COST = cfg.fortune.cost;
  }

  function load() {
    try {
      firebase.firestore().doc('app_state/economy').get()
        .then(function (s) { apply(s.exists ? s.data() : null); })
        .catch(function () {});
    } catch (e) {}
  }

  if (window.firebase && firebase.apps && firebase.apps.length) load();
  else {
    var t = 0, iv = setInterval(function () {
      if (window.firebase && firebase.apps && firebase.apps.length) { clearInterval(iv); load(); }
      else if (++t > 100) clearInterval(iv);
    }, 100);
  }
})();
