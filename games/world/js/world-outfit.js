/* ════════════════════════════════════════════════════════════════
   world-outfit.js — in-world wardrobe. Reuses the shared accessory catalog +
   renderer. Basic (shop) accessories are free to wear in the World; rare
   gacha-only pieces require that you actually own them (from rooms/{uid}).
   Equipping calls back to world-core, which syncs + persists the choice.
   ════════════════════════════════════════════════════════════════ */
const WorldOutfit = (function () {
  let db = null, uid = null, panelEl = null, onChange = function () {};
  let owned = new Set();
  let lastOutfit = null;   // what the wardrobe last painted (langchange repaint)

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
    lastOutfit = outfit;
    const items = available();
    panelEl.innerHTML =
      '<div class="world-wardrobe-grid">' +
        '<button class="world-wd-item' + (!outfit ? ' active' : '') + '" data-acc="">' +
          '<span class="world-wd-emoji">🚫</span><span class="world-wd-name">' + T('None') + '</span></button>' +
        items.map(a =>
          '<button class="world-wd-item' + (a.id === outfit ? ' active' : '') + '" data-acc="' + a.id + '">' +
            '<span class="world-wd-emoji">' + a.emoji + '</span><span class="world-wd-name">' + T(a.name) + '</span></button>'
        ).join('') +
      '</div>';
    panelEl.querySelectorAll('.world-wd-item').forEach(btn =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.acc || null;
        onChange(id);
        render(id);
      }));
  }

  // The wardrobe paints its item names ONCE (built as innerHTML, so i18n-ui.js
  // never sweeps them), so repaint the panel when the reader switches language.
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('langchange', function () {
    try { if (panelEl && panelEl.innerHTML) render(lastOutfit); } catch (e) {}
  });

  function init(opts) { db = opts.db; uid = opts.uid; panelEl = opts.panelEl; onChange = opts.onChange || onChange; }
  return { init, loadOwned, render };
})();
