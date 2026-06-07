/**
 * coin-spend-logic.js — Pure catalogs + logic for the board's coin sinks:
 *   1. Bubble cosmetics shop (name colours, frames, badges, titles)
 *   2. Lucky Draw 扭蛋机 (gacha) — random cosmetics by rarity
 *   3. Slot machine 老虎机 — bet coins, paytable has a built-in house edge
 *   4. Boost / pin — pay coins to pin a bubble to the top for a while
 *
 * No DOM/Firebase here — coin-center.js does the UI + Firestore transactions.
 * All prices/odds live here so the economy is easy to tune in one place.
 */
(function (global) {
  'use strict';

  const CoinSpend = {};

  /* ─────────────────────────────────────────────────────────────
     Cosmetics catalog (shared by the shop AND the gacha pool)
     type: 'color' | 'frame' | 'badge' | 'title'
     val : color → hex (or 'rainbow'); frame → frame id; badge → emoji; title → text
     rarity: 'N' | 'R' | 'SR' | 'SSR'
     ───────────────────────────────────────────────────────────── */
  CoinSpend.COSMETICS = [
    // Name colours
    { id: 'c_blue',   type: 'color', name: '海洋蓝',   val: '#3b82f6',  price: 12000,  rarity: 'R'   },
    { id: 'c_mint',   type: 'color', name: '薄荷绿',   val: '#34d399',  price: 12000,  rarity: 'R'   },
    { id: 'c_pink',   type: 'color', name: '樱花粉',   val: '#ff8aab',  price: 12000,  rarity: 'R'   },
    { id: 'c_purple', type: 'color', name: '暗夜紫',   val: '#a855f7',  price: 12000,  rarity: 'R'   },
    { id: 'c_red',    type: 'color', name: '烈焰红',   val: '#ef4444',  price: 30000,  rarity: 'SR'  },
    { id: 'c_gold',   type: 'color', name: '鎏金',     val: '#f5b301',  price: 30000,  rarity: 'SR'  },
    { id: 'c_rainbow',type: 'color', name: '七彩流光', val: 'rainbow',  price: 100000, rarity: 'SSR' },
    // Bubble frames
    { id: 'f_simple', type: 'frame', name: '简约边框', val: 'simple',   price: 15000,  rarity: 'R'   },
    { id: 'f_gold',   type: 'frame', name: '黄金边框', val: 'gold',     price: 35000,  rarity: 'SR'  },
    { id: 'f_neon',   type: 'frame', name: '霓虹边框', val: 'neon',     price: 35000,  rarity: 'SR'  },
    { id: 'f_star',   type: 'frame', name: '星光边框', val: 'star',     price: 90000,  rarity: 'SSR' },
    // Badges (shown before the name)
    { id: 'b_star',   type: 'badge', name: '小星星',   val: '⭐',       price: 5000,   rarity: 'N'   },
    { id: 'b_fire',   type: 'badge', name: '火焰',     val: '🔥',       price: 15000,  rarity: 'R'   },
    { id: 'b_gem',    type: 'badge', name: '钻石',     val: '💎',       price: 40000,  rarity: 'SR'  },
    { id: 'b_crown',  type: 'badge', name: '皇冠',     val: '👑',       price: 100000, rarity: 'SSR' },
    // Titles (shown after the name)
    { id: 't_rookie', type: 'title', name: '称号·新人', val: '新人',     price: 5000,   rarity: 'N'   },
    { id: 't_vip',    type: 'title', name: '称号·VIP',  val: 'VIP',      price: 15000,  rarity: 'R'   },
    { id: 't_boss',   type: 'title', name: '称号·大佬', val: '大佬',     price: 45000,  rarity: 'SR'  },
    { id: 't_legend', type: 'title', name: '称号·传奇', val: '传奇',     price: 90000,  rarity: 'SSR' },
    { id: 't_hidden', type: 'title', name: '称号·隐藏BOSS', val: '隐藏BOSS', price: 150000, rarity: 'SSR' }
  ];

  CoinSpend.RARITY_NAMES = { N: '普通', R: '稀有', SR: '史诗', SSR: '传说' };
  CoinSpend.COS_TYPES = ['color', 'frame', 'badge', 'title'];
  CoinSpend.COS_TYPE_NAMES = { color: '名字颜色', frame: '气泡边框', badge: '徽章', title: '称号' };

  CoinSpend.getCosmetic = function (id) {
    return CoinSpend.COSMETICS.find(function (c) { return c.id === id; }) || null;
  };
  CoinSpend.byType = function (type) {
    return CoinSpend.COSMETICS.filter(function (c) { return c.type === type; });
  };

  /** Resolve an {color,frame,badge,title} id map into a renderable {c,f,b,t}
   *  snapshot of values (stored on each posted answer so viewers can render it
   *  without the catalog). */
  CoinSpend.resolveEquip = function (equip) {
    equip = equip || {};
    const out = {};
    const col = CoinSpend.getCosmetic(equip.color);  if (col) out.c = col.val;
    const fr  = CoinSpend.getCosmetic(equip.frame);  if (fr)  out.f = fr.val;
    const bd  = CoinSpend.getCosmetic(equip.badge);  if (bd)  out.b = bd.val;
    const ti  = CoinSpend.getCosmetic(equip.title);  if (ti)  out.t = ti.val;
    return out;
  };

  /* ─────────────────────────────────────────────────────────────
     Gacha (Lucky Draw 扭蛋机)
     ───────────────────────────────────────────────────────────── */
  CoinSpend.GACHA = {
    pullCost: 800,        // single pull
    tenCost: 7200,        // 10-pull (one free)
    dupRefund: 100,       // refunded coins when you draw a duplicate
    odds: [               // checked in order; must sum to 1
      { rarity: 'SSR', p: 0.02 },
      { rarity: 'SR',  p: 0.08 },
      { rarity: 'R',   p: 0.30 },
      { rarity: 'N',   p: 0.60 }
    ]
  };

  /** Per-item drop chance for the prize-pool view: tier odds split evenly among
   *  the items in that tier. Returns [{id,name,type,val,rarity,percent}]. */
  CoinSpend.gachaItemOdds = function () {
    const counts = {};
    CoinSpend.COSMETICS.forEach(function (c) { counts[c.rarity] = (counts[c.rarity] || 0) + 1; });
    const tierP = {};
    CoinSpend.GACHA.odds.forEach(function (o) { tierP[o.rarity] = o.p; });
    return CoinSpend.COSMETICS.map(function (c) {
      const p = (tierP[c.rarity] || 0) / (counts[c.rarity] || 1);
      return { id: c.id, name: c.name, type: c.type, val: c.val, rarity: c.rarity, percent: p * 100 };
    });
  };

  /** Roll one cosmetic using an injectable rng (0..1). */
  CoinSpend.gachaRoll = function (rng) {
    const r = rng();
    let acc = 0, tier = 'N';
    for (let i = 0; i < CoinSpend.GACHA.odds.length; i++) {
      acc += CoinSpend.GACHA.odds[i].p;
      if (r < acc) { tier = CoinSpend.GACHA.odds[i].rarity; break; }
    }
    const pool = CoinSpend.COSMETICS.filter(function (c) { return c.rarity === tier; });
    const list = pool.length ? pool : CoinSpend.COSMETICS;
    return list[Math.floor(rng() * list.length)];
  };

  CoinSpend.gachaCost = function (pulls) { return pulls >= 10 ? CoinSpend.GACHA.tenCost : CoinSpend.GACHA.pullCost; };

  /* ─────────────────────────────────────────────────────────────
     Slot machine 老虎机 — paytable tuned so expected return < 1 bet
     (the house edge is what actually drains coins over time).
     ───────────────────────────────────────────────────────────── */
  CoinSpend.SLOT_SYMBOLS = [
    { s: '🍒', w: 9 },
    { s: '🍋', w: 9 },
    { s: '🍊', w: 8 },
    { s: '🔔', w: 6 },
    { s: '⭐', w: 3 },
    { s: '7️⃣', w: 1 }
  ];
  CoinSpend.SLOT_BETS = [50, 100, 500];
  // Multiplier for three-of-a-kind; two cherries pays a small consolation.
  // Tuned harder: rarer ⭐/7️⃣ + smaller fruit payouts → ~54% RTP (≈46% house edge).
  CoinSpend.SLOT_PAYOUTS = { '7️⃣': 150, '⭐': 30, '🔔': 12, '🍊': 5, '🍋': 4, '🍒': 4 };
  CoinSpend.SLOT_TWO_CHERRY = 2;

  CoinSpend._pickWeighted = function (rng, list) {
    let total = 0; for (let i = 0; i < list.length; i++) total += list[i].w;
    let r = rng() * total;
    for (let i = 0; i < list.length; i++) { r -= list[i].w; if (r < 0) return list[i].s; }
    return list[list.length - 1].s;
  };

  /** Spin three reels with an injectable rng. */
  CoinSpend.slotSpin = function (rng) {
    return [
      CoinSpend._pickWeighted(rng, CoinSpend.SLOT_SYMBOLS),
      CoinSpend._pickWeighted(rng, CoinSpend.SLOT_SYMBOLS),
      CoinSpend._pickWeighted(rng, CoinSpend.SLOT_SYMBOLS)
    ];
  };

  /** Coins won for a spin (0 = lose). */
  CoinSpend.slotPayout = function (symbols, bet) {
    const a = symbols[0], b = symbols[1], c = symbols[2];
    if (a === b && b === c) return bet * (CoinSpend.SLOT_PAYOUTS[a] || 5);
    let cherries = 0;
    for (let i = 0; i < symbols.length; i++) if (symbols[i] === '🍒') cherries++;
    if (cherries === 2) return bet * CoinSpend.SLOT_TWO_CHERRY;
    return 0;
  };

  /* ─────────────────────────────────────────────────────────────
     Boost / pin a bubble to the top
     ───────────────────────────────────────────────────────────── */
  CoinSpend.BOOST_OPTIONS = [
    { hours: 1,  price: 100,  label: '1 小时' },
    { hours: 6,  price: 500,  label: '6 小时' },
    { hours: 24, price: 1500, label: '24 小时' }
  ];

  /* ── Shared helpers ── */
  CoinSpend.canAfford = function (coins, price) { return (coins || 0) >= price; };

  // Export for browser + Node/CommonJS.
  if (typeof module !== 'undefined' && module.exports) module.exports = CoinSpend;
  global.CoinSpend = CoinSpend;
})(typeof window !== 'undefined' ? window : globalThis);
