// jar-logic.test.js — unit tests for the pure bubble-jar logic.
const test = require('node:test');
const assert = require('node:assert');
const Jar = require('./jar-logic.js');

test('snapshot captures text messages and truncates', () => {
  const e = Jar.snapshot({ id: 'x1', text: '  hello\n world  ', name: 'Ann', ts: 5 }, 99);
  assert.deepStrictEqual(e, { id: 'x1', t: 'hello world', n: 'Ann', ts: 5, at: 99 });
  const long = Jar.snapshot({ id: 'x2', text: 'a'.repeat(500) }, 0);
  assert.strictEqual(long.t.length, 200);
});

test('snapshot handles polls, images and empties', () => {
  assert.strictEqual(Jar.snapshot({ id: 'p', type: 'poll', text: '午饭吃什么' }, 0).t, '📊 午饭吃什么');
  assert.strictEqual(Jar.snapshot({ id: 'i', image: 'data:...' }, 0).t, '🖼️ 图片留言');
  assert.strictEqual(Jar.snapshot({ id: 'e' }, 0).t, '💬');
  assert.strictEqual(Jar.snapshot(null, 0), null);
  assert.strictEqual(Jar.snapshot({ text: 'no id' }, 0), null);
});

test('add: newest first, dedupes by id, caps the jar', () => {
  let r = Jar.add([], { id: 'a', t: '1' });
  r = Jar.add(r.list, { id: 'b', t: '2' });
  assert.deepStrictEqual(r.list.map(e => e.id), ['b', 'a']);
  const dup = Jar.add(r.list, { id: 'a', t: 'again' });
  assert.strictEqual(dup.added, false);
  assert.strictEqual(dup.reason, 'dup');
  assert.strictEqual(dup.list.length, 2);
  // cap
  let list = [];
  for (let i = 0; i < 70; i++) list = Jar.add(list, { id: 'n' + i, t: String(i) }).list;
  assert.strictEqual(list.length, Jar.CAP);
  assert.strictEqual(list[0].id, 'n69');                 // newest kept
  assert.ok(!list.some(e => e.id === 'n0'));             // oldest dropped
  // junk inputs
  assert.strictEqual(Jar.add('junk', { id: 'z' }).added, true);
  assert.strictEqual(Jar.add([], null).added, false);
});

test('remove filters by id and tolerates junk', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  assert.deepStrictEqual(Jar.remove(list, 'a').map(e => e.id), ['b']);
  assert.deepStrictEqual(Jar.remove(list, 'zz').map(e => e.id), ['a', 'b']);
  assert.deepStrictEqual(Jar.remove('junk', 'a'), []);
});
