/* ════════════════════════════════════════════════════════════════
   world-outfit.js — in-world wardrobe. Reuses the shared accessory catalog +
   renderer. Basic (shop) accessories are free to wear in the World; rare
   gacha-only pieces require that you actually own them (from rooms/{uid}).
   Equipping calls back to world-core, which syncs + persists the choice.
   ════════════════════════════════════════════════════════════════ */
const WorldOutfit = (function () {
  let db = null, uid = null, panelEl = null, onChange = function () {};
  let owned = new Set();
  let lastRendered = null; // remember the equipped id so a reward re-render keeps the highlight

  async function loadOwned() {
    if (!db || !uid) return;
    try {
      const d = await db.collection('rooms').doc(uid).get();
      if (d.exists) owned = new Set(d.data().ownedAccessories || []);
    } catch (e) { /* offline → basics only */ }
  }

  // Wearable in the World = every basic accessory + any gacha piece you own.
  function available() {
    return PET_ACCESSORIES.filter(a => !a.gachaOnly || owned.has(a.id));
  }

  function render(outfit) {
    if (!panelEl) return;
    lastRendered = outfit;
    const items = available();
    panelEl.innerHTML =
      '<div class="world-wardrobe-grid">' +
        '<button class="world-wd-item' + (!outfit ? ' active' : '') + '" data-acc="">' +
          '<span class="world-wd-emoji">🚫</span><span class="world-wd-name">None</span></button>' +
        items.map(a =>
          '<button class="world-wd-item' + (a.id === outfit ? ' active' : '') + '" data-acc="' + a.id + '">' +
            '<span class="world-wd-emoji">' + a.emoji + '</span><span class="world-wd-name">' + a.name + '</span></button>'
        ).join('') +
      '</div>';
    panelEl.querySelectorAll('.world-wd-item').forEach(btn =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.acc || null;
        onChange(id);
        render(id);
      }));
  }

  // Grant a random not-yet-owned gacha accessory (the Daily Sparkle Hunt reward).
  // arrayUnions it into rooms/{uid}.ownedAccessories — the wardrobe gates on
  // exactly that array — and re-renders so it shows up immediately. Returns the
  // granted accessory { id, name, emoji }, or null if the player owns them all.
  function grantRandomGacha() {
    const locked = PET_ACCESSORIES.filter(a => a.gachaOnly && !owned.has(a.id));
    if (!locked.length) return null;
    const a = locked[Math.floor(Math.random() * locked.length)];
    owned.add(a.id);
    if (db && uid) {
      db.collection('rooms').doc(uid).set(
        { ownedAccessories: firebase.firestore.FieldValue.arrayUnion(a.id) }, { merge: true }
      ).catch(function () {});
    }
    render(lastRendered);
    return a;
  }

  function init(opts) { db = opts.db; uid = opts.uid; panelEl = opts.panelEl; onChange = opts.onChange || onChange; }
  return { init, loadOwned, render, grantRandomGacha };
})();
