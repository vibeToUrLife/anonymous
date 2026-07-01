/* node --test world-moderation.test.js — unit tests for chat safety logic. */
const test = require('node:test');
const assert = require('node:assert');
const M = require('./world-moderation.js');

const BANNED = ['badword', 'nasty'];
const OPTS = { maxLen: 100, banned: BANNED };

test('moderateMessage trims, collapses whitespace, accepts clean text', () => {
  const r = M.moderateMessage('  hello    world  ', OPTS);
  assert.equal(r.ok, true);
  assert.equal(r.text, 'hello world');
});

test('moderateMessage rejects empty / whitespace-only', () => {
  assert.equal(M.moderateMessage('    ', OPTS).ok, false);
  assert.equal(M.moderateMessage('', OPTS).reason, 'empty');
});

test('moderateMessage enforces the length cap', () => {
  const long = 'a'.repeat(250);
  const r = M.moderateMessage(long, OPTS);
  assert.equal(r.text.length, 100);
});

test('moderateMessage blocks profanity, including spaced-out evasions', () => {
  assert.equal(M.moderateMessage('you are a badword', OPTS).ok, false);
  assert.equal(M.moderateMessage('b a d w o r d', OPTS).ok, false);
  assert.equal(M.moderateMessage('BadWord!!', OPTS).reason, 'blocked');
});

test('isProfane is false for clean text', () => {
  assert.equal(M.isProfane('a nice friendly hello', BANNED), false);
});

test('maskProfanity stars out banned words on the receive path', () => {
  assert.equal(M.maskProfanity('what a nasty day', BANNED), 'what a ***** day');
});

test('rateAllow permits up to N in the window then blocks', () => {
  let hist = [];
  let r;
  for (let i = 0; i < 5; i++) {
    r = M.rateAllow(hist, 1000 + i, 10000, 5);
    assert.equal(r.allowed, true);
    hist = r.history;
  }
  r = M.rateAllow(hist, 1006, 10000, 5);
  assert.equal(r.allowed, false, '6th message inside window is blocked');
});

test('rateAllow prunes old timestamps so sending resumes later', () => {
  const hist = [1, 2, 3, 4, 5];
  const r = M.rateAllow(hist, 20000, 10000, 5); // all old → pruned away
  assert.equal(r.allowed, true);
  assert.equal(r.history.length, 1);
});
