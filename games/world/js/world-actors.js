/* ════════════════════════════════════════════════════════════════
   world-actors.js — the "actors" draw pass: self + every remote player on the
   scene canvas, depth-sorted, with the reused pet art + accessory renderer +
   world action animations, plus DOM name-tags above each head (clickable on
   remotes for play/report/block).
   ════════════════════════════════════════════════════════════════ */
const WorldActors = (function () {
  let tagLayer = null;
  let onTagClick = function () {};
  let getBubble = function () { return null; };
  const tags = {}; // uid → { root, name, bubble }

  function ensureTag(uid, isSelf) {
    if (tags[uid]) return tags[uid];
    const root = document.createElement('div');
    root.className = 'world-nametag' + (isSelf ? ' self' : '');
    const bubble = document.createElement('div');
    bubble.className = 'world-bubble';
    bubble.style.display = 'none';
    const name = document.createElement('div');
    name.className = 'world-name';
    root.appendChild(bubble);
    root.appendChild(name);
    if (!isSelf) {
      name.style.cursor = 'pointer';
      name.addEventListener('click', () => onTagClick(uid, root));
    }
    tagLayer.appendChild(root);
    tags[uid] = { root: root, name: name, bubble: bubble };
    return tags[uid];
  }

  function drawActor(ctx, W, H, t, a, scene) {
    const px = a.x * W, py = a.y * H;
    const ds = depthScale(a.y);
    const size = PET_SIZES[a.pet] || 64;

    // Resolve action + progress; expire finished actions.
    let action = a.action || null, ap = 0;
    if (action) {
      const dur = worldActionDuration(action);
      let dt = t - (a.actionTs || 0);
      if (dt < 0) dt = 0; // tolerate tiny clock/offset jitter → play from the start rather than skip
      if (dt < dur) ap = dt / dur; else action = null;
    }
    const moving = !!a.moving;
    const legPhase = moving ? t / 100 : 0;
    const idleSeed = a.uid ? a.uid.charCodeAt(0) : 0;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(a.facing > 0 ? ds : -ds, ds);
    const bob = moving ? Math.sin(t / 100) * 1.6 : Math.sin(t / 800 + idleSeed) * 1.0;
    ctx.translate(0, bob);
    if (action) applyWorldActionTransform(ctx, action, ap, size, t);
    // Accessory back layer (cape/wings) → pet body → accessory front layer.
    if (a.outfit) { try { drawPetAccessory(ctx, a.pet, a.outfit, size, 'back'); } catch (e) {} }
    worldDrawPet(ctx, a.pet, size, legPhase, moving, action, ap, t, a.color);
    if (a.outfit) { try { drawPetAccessory(ctx, a.pet, a.outfit, size, 'front'); } catch (e) {} }
    ctx.restore();

    if (action) drawWorldActionEffect(ctx, px, py, size, ds, action, ap, t, scene.fx);
  }

  function positionTag(a, W, H) {
    const tag = ensureTag(a.uid, a.isSelf);
    tag.name.textContent = a.name || 'Pet';
    const bub = getBubble(a.uid);
    if (bub) { tag.bubble.textContent = bub; tag.bubble.style.display = 'block'; }
    else tag.bubble.style.display = 'none';
    const ds = depthScale(a.y);
    const size = PET_SIZES[a.pet] || 64;
    const px = a.x * W;
    const py = a.y * H - size * ds * 0.95;
    tag.root.style.transform = 'translate(-50%,-100%) translate(' + px + 'px,' + py + 'px)';
  }

  // Main entry: called each frame after the scene background is drawn.
  function render(ctx, W, H, t, me, remotes, scene) {
    const list = [];
    list.push({
      uid: me.uid, isSelf: true, x: me.x, y: me.y, facing: me.facing, pet: me.pet,
      color: me.color, outfit: me.outfit, action: me.action, actionTs: me.actionTs,
      name: me.name, moving: me.moving,
    });
    Object.keys(remotes).forEach(k => {
      const rr = remotes[k];
      list.push({
        uid: k, isSelf: false, x: rr.x, y: rr.y, facing: rr.facing, pet: rr.pet,
        color: rr.color, outfit: rr.outfit, action: rr.action, actionTs: rr.actionTs,
        name: rr.name, moving: Math.hypot(rr.targetX - rr.x, rr.targetY - rr.y) > 0.0025,
      });
    });
    // Painter's algorithm: farther (smaller y, higher up) drawn first.
    list.sort((a, b) => a.y - b.y);

    const seen = {};
    for (const a of list) { drawActor(ctx, W, H, t, a, scene); positionTag(a, W, H); seen[a.uid] = true; }
    // Retire name-tags for actors who left.
    Object.keys(tags).forEach(uid => { if (!seen[uid]) { tags[uid].root.remove(); delete tags[uid]; } });
  }

  function init(opts) {
    tagLayer = opts.tagLayer;
    onTagClick = opts.onTagClick || onTagClick;
    getBubble = opts.getBubble || getBubble;
  }
  function clearTags() { Object.keys(tags).forEach(uid => { tags[uid].root.remove(); delete tags[uid]; }); }

  return { init, render, clearTags };
})();
