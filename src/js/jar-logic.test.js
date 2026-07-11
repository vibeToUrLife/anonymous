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

test('merge unions by id, keeps newest save, sorts newest-first, caps', () => {
  const cloud = [{ id: 'a', at: 10 }, { id: 'b', at: 20 }];
  const local = [{ id: 'b', at: 25 }, { id: 'c', at: 30 }];   // b saved later locally
  const m = Jar.merge(cloud, local);
  assert.deepStrictEqual(m.map(e => e.id), ['c', 'b', 'a']);  // by at desc
  assert.strictEqual(m.find(e => e.id === 'b').at, 25);        // newer copy wins
  // cap keeps the newest
  const many = [];
  for (let i = 0; i < 80; i++) many.push({ id: 'n' + i, at: i });
  const capped = Jar.merge(many, [], 60);
  assert.strictEqual(capped.length, 60);
  assert.strictEqual(capped[0].id, 'n79');
  assert.ok(!capped.some(e => e.id === 'n0'));
  // junk-safe
  assert.deepStrictEqual(Jar.merge(null, null), []);
  assert.deepStrictEqual(Jar.merge([{ noId: 1 }], 'x').length, 0);
});

test('relTime buckets from 刚刚 to a M/D date', () => {
  const now = 1_000_000_000_000;
  assert.strictEqual(Jar.relTime(now - 5_000, now), '刚刚');
  assert.strictEqual(Jar.relTime(now - 3 * 60000, now), '3分钟前');
  assert.strictEqual(Jar.relTime(now - 5 * 3600000, now), '5小时前');
  assert.strictEqual(Jar.relTime(now - 30 * 3600000, now), '昨天');
  assert.strictEqual(Jar.relTime(now - 4 * 86400000, now), '4天前');
  assert.strictEqual(Jar.relTime(now + 999, now), '刚刚');       // clock skew → clamp
  assert.match(Jar.relTime(now - 40 * 86400000, now), /^\d+\/\d+$/);
});

test('hashId is stable and non-negative', () => {
  assert.strictEqual(Jar.hashId('abc'), Jar.hashId('abc'));
  assert.notStrictEqual(Jar.hashId('abc'), Jar.hashId('abd'));
  assert.ok(Jar.hashId('') >= 0 && Number.isInteger(Jar.hashId('')));
  assert.ok(Jar.hashId(null) >= 0);
});
