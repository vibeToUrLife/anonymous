// theme.test.js — unit tests for the pure theme helpers.
const test = require('node:test');
const assert = require('node:assert');
const T = require('./theme.js');

test('resolveTheme defaults to light for null/unknown', () => {
  assert.strictEqual(T.resolveTheme(null), 'light');
  assert.strictEqual(T.resolveTheme('light'), 'light');
  assert.strictEqual(T.resolveTheme('banana'), 'light');
});
test('resolveTheme honors dark', () => {
  assert.strictEqual(T.resolveTheme('dark'), 'dark');
});
test('nextTheme flips', () => {
  assert.strictEqual(T.nextTheme('light'), 'dark');
  assert.strictEqual(T.nextTheme('dark'), 'light');
});
