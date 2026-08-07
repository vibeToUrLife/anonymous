/* node --test tomjerry-sleep.test.js — Tom's and Jerry's sleeping cells.

   Both used to fake sleep the way the path-drawn pets do: tilt the body over
   and squash it flat. Their sheets now carry a real drawing of it, which puts
   three things at risk that nothing else would catch.

   The sheet and the code have to agree about how many cells there are. A blit
   whose source rectangle runs off the right edge of an image draws NOTHING and
   reports nothing, so a sheet one cell short is an invisible Tom, not an error.

   The pose has to be decided in one place. room-accessories.js asks the module
   which pose is showing so it knows where the head is; if the draw call worked
   it out separately the two would drift and a hat would hang in the air over a
   sleeping cat.

   And the sleeping cell has to be reached by sleeping. 'nap' and 'sleep' are
   separate actions in room-pets.js and both mean lying down. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;

// Width and height straight out of the PNG's IHDR, so the test measures the
// shipped file rather than a number copied out of it.
function pngSize(file) {
  const d = fs.readFileSync(path.join(DIR, 'img', file));
  assert.ok(d.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    file + ' is not a PNG');
  return { w: d.readUInt32BE(16), h: d.readUInt32BE(20) };
}

function petSandbox(file, sheet, src) {
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, URL,
    document: { currentScript: { src: src || ('https://example.test/games/pets/' + file + '?v=cb148') } },
  };
  sandbox.Image = function () {
    const im = { _src: '', naturalWidth: 0, naturalHeight: 0 };
    Object.defineProperty(im, 'src', {
      get() { return im._src; },
      set(v) { im._src = v; im.naturalWidth = sheet.w; im.naturalHeight = sheet.h; },
    });
    return im;
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), sandbox);
  return sandbox;
}

// A context that records the source rectangle of every blit.
function recCtx() {
  const c = { draws: [] };
  c.drawImage = (img, sx, sy, sw, sh, dx, dy, dw, dh) =>
    c.draws.push({ sx, sy, sw, sh, dx, dy, dw, dh });
  return c;
}

const PETS = [
  { file: 'tom.js', png: 'tom.png', up: 'TOM', draw: 'drawTomPet', pose: 'tomPose' },
  { file: 'jerry.js', png: 'jerry.png', up: 'JERRY', draw: 'drawJerryPet', pose: 'jerryPose' },
];

for (const p of PETS) {
  const size = pngSize(p.png);
  const sb = petSandbox(p.file, size);
  const evalIn = (expr) => vm.runInContext(expr, sb);
  const cellW = evalIn(p.up + '_CELL_W');
  const cellH = evalIn(p.up + '_CELL_H');
  const sleepCell = evalIn(p.up + '_POSE_CELL').sleep;

  test(p.png + ' holds every cell the code asks for', () => {
    assert.equal(size.h, cellH, 'the sheet is one row, so its height IS the cell height');
    assert.equal(size.w % cellW, 0,
      size.w + ' does not divide into ' + cellW + 'px cells');
    const cells = size.w / cellW;
    assert.ok(sleepCell < cells,
      'sleep is cell ' + sleepCell + ' but the sheet only holds ' + cells);
    // Cell 0 stands, 1..4 walk, 5 sleeps: the sleeping cell is the last one.
    assert.equal(cells, sleepCell + 1, 'a cell was packed that nothing draws');
  });

  test(p.file + ': sleep and nap both reach the sleeping pose', () => {
    for (const action of ['sleep', 'nap']) {
      assert.equal(sb[p.pose](false, action), 'sleep', action + ' should lie down');
    }
    assert.equal(sb[p.pose](false, null), 'front');
    assert.equal(sb[p.pose](false, 'yawn'), 'front', 'a yawn is not a nap');
  });

  /* Moving wins over the action on purpose: a pet that is still walking has to
     keep its legs going, whatever it means to do when it arrives. */
  test(p.file + ': walking beats whatever it was about to do', () => {
    assert.equal(sb[p.pose](true, 'sleep'), 'walk');
    assert.equal(sb[p.pose](true, null), 'walk');
  });

  test(p.file + ': the draw picks the cell its own pose names', () => {
    const ctx = recCtx();
    sb[p.draw](ctx, 40, 0, false, 100, 'sleep', 0.5, 0, null, null);
    assert.equal(ctx.draws.length, 1, 'nothing was drawn at all');
    assert.equal(ctx.draws[0].sx, sleepCell * cellW, 'blitted the wrong cell');
    assert.equal(ctx.draws[0].sw, cellW);
    // The whole source rectangle has to be inside the image: a blit that runs
    // off the edge draws nothing and says nothing.
    assert.ok(ctx.draws[0].sx + ctx.draws[0].sw <= size.w, 'the cell runs off the sheet');
  });

  test(p.file + ': standing and sleeping are drawn the same size', () => {
    const stand = recCtx(), sleep = recCtx();
    sb[p.draw](stand, 40, 0, false, 100, null, 0, 0, null, null);
    sb[p.draw](sleep, 40, 0, false, 100, 'sleep', 0.5, 0, null, null);
    assert.equal(sleep.draws[0].dw, stand.draws[0].dw, 'the pet changes width lying down');
    assert.equal(sleep.draws[0].dh, stand.draws[0].dh, 'the pet changes height lying down');
    // Every cell stands on the cell's own floor, so the bottom edge never moves.
    assert.equal(sleep.draws[0].dy + sleep.draws[0].dh,
      stand.draws[0].dy + stand.draws[0].dh, 'the feet move between poses');
  });

  /* Re-packing a sheet keeps its filename, so the image has to ride the
     script's cache-buster. Without it a browser holding the five-cell sheet
     pairs it with six-cell code and the sleeping pose blits off the edge. */
  test(p.file + ': the sheet rides the script\'s cache-buster', () => {
    assert.ok(evalIn(p.up + '_SRC').endsWith('/img/' + p.png + '?v=cb148'),
      'sheet URL was ' + evalIn(p.up + '_SRC'));
  });
}

// index.html and the two preview pages load these with no query at all.
test('a script loaded without a version still resolves its sheet', () => {
  const sb = petSandbox('tom.js', pngSize('tom.png'), 'https://example.test/games/pets/tom.js');
  assert.ok(vm.runInContext('TOM_SRC', sb).endsWith('/img/tom.png'),
    'a bare script tag should not append a stray "?"');
});
