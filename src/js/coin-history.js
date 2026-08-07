/* ════════════════════════════════════════════════════════════════
   coin-history.js — one row in the shared coin log.
   ----------------------------------------------------------------
   One balance is shared by the board, the room, the farm, the shop
   and every mini-game, and `rooms/{uid}.coinHistory` is the single
   readable log of how it moved. Whatever moves the balance owes the
   log a row in the SAME transaction, or the coins arrive with no
   explanation and read as a glitch — reported as "收益被吃掉了,
   history 没有看到有" for the daily riddle, whose reward wrote the
   balance and nothing else.

   Pure: takes the rows a document already holds and returns the rows
   it should hold next. No DOM, no Firebase — the caller folds the
   result into its own write so the coins and their explanation land
   together or not at all.

   Row shape (matches the room and the coin panel, which both render
   this same array):
     { t: epoch-ms, d: signed delta, r: short reason, b: balance after }

   Runs as a browser global. Also loads under Node for tests.
   ════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CoinHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // Rolling window. The log lives inside the room document, which Firestore
  // caps at 1 MiB and every reader of the room downloads whole, so it keeps the
  // most recent rows and drops the tail rather than growing forever.
  var MAX = 100;

  /**
   * append(rows, delta, reason, newBalance, opts) → a NEW array, oldest → newest.
   *
   * `rows` is whatever the document holds — an array, or missing/garbage on a
   * document written before the log existed, which reads as empty. The input is
   * never mutated: callers hand us a value straight out of a transaction read,
   * and a transaction that retries must start from the same rows it did before.
   *
   * A zero delta gets no row (dev accounts spend nothing, and a no-op purchase
   * is not history), but the trimmed array still comes back so a caller can use
   * the result unconditionally.
   *
   * opts.coalesceMs — for a source that pays out in a steady trickle rather than
   * in events. Coin Rush banks every few seconds for the length of a rush; a row
   * apiece would be both unreadable and destructive, since MAX rows of "Coin
   * Rush +2" would push every other row in the log out behind them. With this
   * set, a payout lands on the newest row instead of after it when that row has
   * the same reason and is younger than coalesceMs — so a whole session reads as
   * one line that grows, and each write still persists it (close the tab
   * mid-rush and what was banked is already logged).
   */
  function append(rows, delta, reason, newBalance, opts) {
    var out = Array.isArray(rows) ? rows.slice() : [];
    delta = Math.round(delta || 0);
    reason = String(reason || 'Coins');
    var coalesceMs = (opts && opts.coalesceMs) || 0;
    if (delta !== 0) {
      var last = out.length ? out[out.length - 1] : null;
      if (coalesceMs && last && last.r === reason && (Date.now() - (last.t || 0)) <= coalesceMs) {
        // Replaced, not edited in place: `rows` belongs to the caller's read.
        out[out.length - 1] = {
          t: Date.now(),
          d: Math.round(last.d || 0) + delta,
          r: reason,
          b: Math.floor(newBalance || 0)
        };
      } else {
        out.push({
          t: Date.now(),
          d: delta,
          r: reason,
          b: Math.floor(newBalance || 0)
        });
      }
    }
    if (out.length > MAX) out = out.slice(out.length - MAX);
    return out;
  }

  /**
   * label(text) → the reason string, translated when the page has i18n.
   *
   * The row is STORED, and it is written from a dozen pages that don't all carry
   * a dictionary — fishing, subway-dash and chinese-chess load no i18n at all,
   * so a bare T(…) there is a ReferenceError in the middle of a coin
   * transaction. This keeps the call site identical everywhere and falls back to
   * the English source, which is what an untranslated key renders as anyway.
   */
  function label(text) {
    var g = (typeof globalThis !== 'undefined') ? globalThis : null;
    var t = g && g.T;
    return (typeof t === 'function') ? t(text) : text;
  }

  return { MAX: MAX, append: append, label: label };
});
