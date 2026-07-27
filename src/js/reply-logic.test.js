// reply-logic.test.js — unit tests for the pure reply size-budget guard.
const test = require('node:test');
const assert = require('node:assert');
const Reply = require('./reply-logic.js');

test('byteLength counts UTF-8 bytes, not characters', () => {
  assert.strictEqual(Reply.byteLength('abc'), 3);
  assert.strictEqual(Reply.byteLength('中文'), 6);   // 3 bytes per CJK char
  assert.strictEqual(Reply.byteLength('a中b'), 5);
  assert.strictEqual(Reply.byteLength(''), 0);
  assert.strictEqual(Reply.byteLength(null), 0);
  assert.strictEqual(Reply.byteLength(undefined), 0);
});

test('docByteSize is the UTF-8 length of the JSON form', () => {
  assert.strictEqual(Reply.docByteSize({ a: 1 }), Reply.byteLength('{"a":1}'));
  assert.strictEqual(Reply.docByteSize({ t: '中' }), Reply.byteLength('{"t":"中"}'));
});

test('wouldExceedBudget compares projected size, strictly greater-than', () => {
  const doc = { image: 'IMG'.repeat(100) };          // bubble's own inline image
  const replies = [{ id: 'r1', text: 'hello' }];
  const exact = Reply.docByteSize(Object.assign({}, doc, { replies }));
  assert.strictEqual(Reply.wouldExceedBudget(doc, replies, exact), false);      // == budget is allowed
  assert.strictEqual(Reply.wouldExceedBudget(doc, replies, exact - 1), true);   // one byte over is refused
});

test("the parent bubble's own image counts against the budget", () => {
  // Zero replies, but the bubble's image alone already blows a tiny budget.
  assert.strictEqual(Reply.wouldExceedBudget({ image: 'x'.repeat(500) }, [], 400), true);
  assert.strictEqual(Reply.wouldExceedBudget({ image: 'x'.repeat(500) }, [], 5000), false);
});

test('the candidate array replaces the doc\'s existing replies field', () => {
  // A huge EXISTING replies field must not be double-counted — it is the array
  // being replaced, so only the (empty) candidate should count here.
  const docWithBigThread = { replies: [{ image: 'B'.repeat(10000) }] };
  assert.strictEqual(Reply.wouldExceedBudget(docWithBigThread, [], 500), false);
});

test('null / empty inputs are safe and stay under budget', () => {
  assert.strictEqual(Reply.wouldExceedBudget(null, null, 100), false);
  assert.strictEqual(Reply.wouldExceedBudget(undefined, undefined, 100), false);
});

test('default budget: a ~1MB inline image reply overflows, a text reply does not', () => {
  const bigImageReply = [{ id: 'g', ts: 1, image: 'd'.repeat(1024 * 1024) }];
  assert.strictEqual(Reply.wouldExceedBudget({}, bigImageReply), true);
  assert.strictEqual(Reply.wouldExceedBudget({}, [{ id: 't', ts: 1, text: 'hi' }]), false);
  assert.ok(Reply.ANSWER_DOC_BYTE_BUDGET < 1048576); // stays under Firestore's 1 MiB cap
});
