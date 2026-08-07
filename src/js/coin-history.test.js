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

/* ── Coalescing: a source that trickles rather than fires ──
   Coin Rush banks every few seconds for the length of a rush. A row per flush
   would be unreadable AND destructive — MAX rows of "Coin Rush +2" push every
   other entry in the account's history out behind them. */

test('repeat payouts from the same source fold into one row', () => {
  let rows = [];
  for (let i = 0; i < 20; i++) {
    rows = CoinHistory.append(rows, 2, 'Coin Rush', 100 + (i + 1) * 2, { coalesceMs: 60000 });
  }
  assert.equal(rows.length, 1, 'a rush filed ' + rows.length + ' rows and buried the rest of the log');
  assert.equal(rows[0].d, 40, 'the folded row must carry the whole session');
  assert.equal(rows[0].b, 140, 'the balance shown is the one the last payout left behind');
});

test('a different reason is never folded in', () => {
  let rows = CoinHistory.append([], 2, 'Coin Rush', 102, { coalesceMs: 60000 });
  rows = CoinHistory.append(rows, 1000, 'Coin Rush — #1', 1102, { coalesceMs: 60000 });
  assert.equal(rows.length, 2, 'the placing bonus is an event, not part of the trickle');
});

test('a payout past the window opens a new row', () => {
  const old = [{ t: Date.now() - 120000, d: 2, r: 'Coin Rush', b: 102 }];
  const rows = CoinHistory.append(old, 2, 'Coin Rush', 104, { coalesceMs: 60000 });
  assert.equal(rows.length, 2, "yesterday's rush must not absorb today's");
});

test('folding leaves the caller\'s rows untouched', () => {
  const rows = [{ t: Date.now(), d: 2, r: 'Coin Rush', b: 102 }];
  CoinHistory.append(rows, 2, 'Coin Rush', 104, { coalesceMs: 60000 });
  assert.equal(rows[0].d, 2,
    'the row was edited in place — a transaction that retries would fold twice');
});

test('without coalesceMs every payout is its own row', () => {
  let rows = CoinHistory.append([], 5, 'Fishing', 105);
  rows = CoinHistory.append(rows, 5, 'Fishing', 110);
  assert.equal(rows.length, 2, 'coalescing must be opt-in — two games are two rows');
});

/* ── label(): three game pages carry no i18n at all ── */

test('label falls back to the English source when the page has no i18n', () => {
  const had = 'T' in globalThis, prev = globalThis.T;
  delete globalThis.T;
  try {
    assert.equal(CoinHistory.label('🎣 Fishing'), '🎣 Fishing',
      'a bare T() on fishing/subway-dash/chinese-chess throws mid-transaction');
  } finally { if (had) globalThis.T = prev; }
});

test('label translates when the page does have i18n', () => {
  const had = 'T' in globalThis, prev = globalThis.T;
  globalThis.T = (s) => (s === '🐍 Snake' ? '🐍 贪吃蛇' : s);
  try {
    assert.equal(CoinHistory.label('🐍 Snake'), '🐍 贪吃蛇');
  } finally { if (had) globalThis.T = prev; else delete globalThis.T; }
});
