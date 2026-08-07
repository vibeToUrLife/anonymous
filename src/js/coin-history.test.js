/* node --test coin-history.test.js — the shared coin-log row.

   Reported as: the daily riddle pays 100 coins and nothing shows up in the
   history ("脑经急转弯收益也被吃掉了"). Its transaction wrote the balance and
   the day it was claimed, and nothing else — the coins arrived unexplained,
   which reads as a glitch whatever the balance says.

   These cover the append itself: the row's shape, the rolling cap, and the two
   things a Firestore transaction needs from it — tolerating a document that has
   no log yet, and not mutating the rows it was handed (a transaction that
   retries re-runs the body against a fresh read, and must not be carrying the
   previous attempt's row). */
const test = require('node:test');
const assert = require('node:assert');
const CoinHistory = require('./coin-history.js');

test('a row records the delta, the reason and the balance it left behind', () => {
  const out = CoinHistory.append([], 100, 'Daily riddle', 600);
  assert.equal(out.length, 1);
  assert.equal(out[0].d, 100);
  assert.equal(out[0].r, 'Daily riddle');
  assert.equal(out[0].b, 600);
  assert.ok(out[0].t > 0, 'a row with no timestamp cannot be shown in order');
});

test('a document with no log yet gets one', () => {
  // Firestore hands back undefined for a field that was never written, and an
  // account that predates the log has exactly that.
  assert.equal(CoinHistory.append(undefined, 100, 'Daily riddle', 100).length, 1);
  assert.equal(CoinHistory.append(null, 100, 'Daily riddle', 100).length, 1);
  assert.equal(CoinHistory.append('not an array', 100, 'Daily riddle', 100).length, 1);
});

test('the rows handed in are not mutated', () => {
  const rows = [{ t: 1, d: 5, r: 'x', b: 5 }];
  const out = CoinHistory.append(rows, 100, 'Daily riddle', 105);
  assert.equal(rows.length, 1,
    'the input grew — a transaction that retries would re-append onto its own ' +
    'previous attempt and log the same reward twice');
  assert.equal(out.length, 2);
  assert.equal(out[0], rows[0], 'the rows already in the document are kept as they were');
});

test('the log keeps the newest rows and drops the tail', () => {
  const rows = [];
  for (let i = 0; i < CoinHistory.MAX; i++) rows.push({ t: i, d: 1, r: 'r' + i, b: i });
  const out = CoinHistory.append(rows, 100, 'Daily riddle', 999);
  assert.equal(out.length, CoinHistory.MAX, 'the log grows without bound and bloats the room document');
  assert.equal(out[out.length - 1].r, 'Daily riddle', 'the newest row is at the end');
  assert.equal(out[0].r, 'r1', 'the oldest row should be the one dropped');
});

test('an over-long log is trimmed even when nothing is appended', () => {
  const rows = [];
  for (let i = 0; i < CoinHistory.MAX + 10; i++) rows.push({ t: i, d: 1, r: 'r' + i, b: i });
  assert.equal(CoinHistory.append(rows, 0, 'free', 0).length, CoinHistory.MAX);
});

test('a zero delta is not worth a row', () => {
  // Dev accounts are charged nothing; a free action is not history.
  assert.deepEqual(CoinHistory.append([], 0, 'Shop (dev)', 500), []);
});

test('a fractional delta is rounded, and the balance floored', () => {
  const out = CoinHistory.append([], 12.4, 'Plant income', 512.9);
  assert.equal(out[0].d, 12);
  assert.equal(out[0].b, 512);
});
