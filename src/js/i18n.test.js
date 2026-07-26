/* node --test i18n.test.js — the lookup, interpolation and language switch. */
const test = require('node:test');
const assert = require('node:assert');
const I = require('./i18n.js');

// Each test registers what it needs; the dictionary is shared, so keys are
// namespaced by what they say rather than reset between tests.
I.register('zh', {
  'Bigger pasture': '更大的牧场',
  'Harvested {n} beds': '收获了 {n} 块地',
  'Harvested 1 bed': '收获了 1 块地',
  'Hello {name}, you have {n} coins': '{name}，你有 {n} 金币',
});

function withLang(code, fn) {
  const was = I.getLang();
  I.setLang(code, { silent: true });
  try { return fn(); } finally { I.setLang(was, { silent: true }); }
}

/* ── the lookup ── */

test('English is the key, so English needs no dictionary', () => {
  withLang('en', () => {
    assert.equal(I.t('Bigger pasture'), 'Bigger pasture');
    assert.equal(I.t('Something nobody ever translated'), 'Something nobody ever translated');
  });
});

test('a registered language returns its entry', () => {
  withLang('zh', () => assert.equal(I.t('Bigger pasture'), '更大的牧场'));
});

test('an untranslated string falls back to readable English, not a bare key', () => {
  withLang('zh', () => assert.equal(I.t('A string with no zh entry'), 'A string with no zh entry'));
});

test('t copes with null and empty input', () => {
  assert.equal(I.t(null), '');
  assert.equal(I.t(undefined), '');
  assert.equal(I.t(''), '');
});

/* ── interpolation ── */

test('interpolation fills {name} placeholders in both languages', () => {
  withLang('en', () => assert.equal(I.t('Harvested {n} beds', { n: 7 }), 'Harvested 7 beds'));
  withLang('zh', () => assert.equal(I.t('Harvested {n} beds', { n: 7 }), '收获了 7 块地'));
});

test('interpolation handles several placeholders and reorders with the language', () => {
  const vars = { name: 'Ming', n: 500 };
  withLang('en', () => assert.equal(I.t('Hello {name}, you have {n} coins', vars), 'Hello Ming, you have 500 coins'));
  withLang('zh', () => assert.equal(I.t('Hello {name}, you have {n} coins', vars), 'Ming，你有 500 金币'));
});

test('a missing value leaves the placeholder visible rather than printing undefined', () => {
  withLang('en', () => assert.equal(I.t('Harvested {n} beds', {}), 'Harvested {n} beds'));
  withLang('en', () => assert.equal(I.t('Harvested {n} beds'), 'Harvested {n} beds'));
});

test('interpolation accepts 0 and empty string as real values', () => {
  withLang('en', () => assert.equal(I.t('Harvested {n} beds', { n: 0 }), 'Harvested 0 beds'));
  withLang('en', () => assert.equal(I.t('Harvested {n} beds', { n: '' }), 'Harvested  beds'));
});

/* ── plurals ── */

test('plural picks the English form at the call site', () => {
  withLang('en', () => {
    assert.equal(I.plural(1, 'Harvested 1 bed', 'Harvested {n} beds'), 'Harvested 1 bed');
    assert.equal(I.plural(3, 'Harvested 1 bed', 'Harvested {n} beds'), 'Harvested 3 beds');
    assert.equal(I.plural(0, 'Harvested 1 bed', 'Harvested {n} beds'), 'Harvested 0 beds');
  });
});

test('Chinese ignores the plural distinction, as it should', () => {
  withLang('zh', () => {
    assert.equal(I.plural(1, 'Harvested 1 bed', 'Harvested {n} beds'), '收获了 1 块地');
    assert.equal(I.plural(3, 'Harvested 1 bed', 'Harvested {n} beds'), '收获了 3 块地');
  });
});

/* ── switching ── */

test('setLang only accepts a language this build speaks', () => {
  withLang('en', () => {
    assert.equal(I.setLang('klingon', { silent: true }), 'en', 'unknown code must not take effect');
    assert.equal(I.getLang(), 'en');
    assert.equal(I.setLang('zh', { silent: true }), 'zh');
    assert.equal(I.getLang(), 'zh');
  });
});

test('register merges into a language without dropping what is already there', () => {
  I.register('zh', { 'First key': '第一' });
  I.register('zh', { 'Second key': '第二' });
  withLang('zh', () => {
    assert.equal(I.t('First key'), '第一');
    assert.equal(I.t('Second key'), '第二');
  });
});

test('register on an unknown language creates it rather than throwing', () => {
  I.register('ja', { 'Bigger pasture': 'ばくじょう' });
  assert.equal(I._dicts.ja['Bigger pasture'], 'ばくじょう');
  // …but it is still not selectable, since the UI only offers what it speaks.
  assert.deepEqual(I.langs(), ['en', 'zh']);
});

test('register tolerates being handed nothing', () => {
  assert.doesNotThrow(() => I.register('zh', null));
  assert.doesNotThrow(() => I.register('zh', undefined));
});

test('langs and label describe the menu', () => {
  assert.deepEqual(I.langs(), ['en', 'zh']);
  assert.equal(I.label('zh'), '中文');
  assert.equal(I.label('en'), 'English');
  // langs() hands out a copy — a caller sorting it must not reorder the menu.
  const l = I.langs(); l.reverse();
  assert.deepEqual(I.langs(), ['en', 'zh']);
});
