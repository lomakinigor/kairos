const test = require('node:test');
const assert = require('node:assert/strict');

const { detectDirection, validateAssistantInput } = require('../lib/language');

test('detects Russian text and translates to English', () => {
  assert.deepEqual(detectDirection('Привет, how are you?'), {
    source: 'ru',
    target: 'en',
    label: 'Русский → Английский',
  });
});

test('detects English text and translates to Russian', () => {
  assert.deepEqual(detectDirection('Deploy the application'), {
    source: 'en',
    target: 'ru',
    label: 'Английский → Русский',
  });
});

test('rejects text without Russian or English letters', () => {
  assert.throws(() => detectDirection('123 — !!!'), /Введите текст/);
});

test('validates assistant mode and text length', () => {
  assert.equal(validateAssistantInput('translate', ' hello '), 'hello');
  assert.throws(() => validateAssistantInput('unknown', 'hello'), /режим/);
  assert.throws(() => validateAssistantInput('term', ' '.repeat(10)), /Введите текст/);
  assert.throws(() => validateAssistantInput('term', 'x'.repeat(4001)), /4 000/);
});
