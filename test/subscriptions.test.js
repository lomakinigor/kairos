const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeAccount,
  findSubscriptionsByAccount,
  addBillingPeriod,
  applyPayment,
  applyGiftPeriod,
  dueReminderDays,
  reminderKey,
  sortSubscriptionsByNextPayment,
} = require('../lib/subscriptions');

test('normalizes account labels and finds an exact account without changing list order', () => {
  const subscriptions = [
    { id: '1', accountLabel: ' personal@example.com ' },
    { id: '2', accountLabel: 'WORK@example.com' },
  ];

  assert.equal(normalizeAccount('  Work@Example.Com  '), 'work@example.com');
  assert.deepEqual(findSubscriptionsByAccount(subscriptions, 'work@example.com').map(item => item.id), ['2']);
});

test('returns every duplicate account instead of choosing one arbitrarily', () => {
  const subscriptions = [
    { id: '1', accountLabel: 'same@example.com' },
    { id: '2', accountLabel: ' SAME@example.com ' },
  ];

  assert.deepEqual(findSubscriptionsByAccount(subscriptions, 'same@example.com').map(item => item.id), ['1', '2']);
});

test('calculates monthly and yearly periods at calendar boundaries', () => {
  assert.equal(addBillingPeriod('2026-01-31', 'month'), '2026-02-28');
  assert.equal(addBillingPeriod('2024-02-29', 'year'), '2025-02-28');
  assert.equal(addBillingPeriod('2026-05-15', 'year'), '2027-05-15');
});

test('records the last payment and moves the next payment date', () => {
  const updated = applyPayment({ id: 'chatgpt', nextPaymentDate: '2026-09-27' }, {
    paidAt: '2026-09-27',
    paymentMethod: 'Карта •• 1234',
    period: 'month',
  });

  assert.equal(updated.nextPaymentDate, '2026-10-27');
  assert.deepEqual(updated.lastPayment, {
    paidAt: '2026-09-27',
    paidThrough: '2026-10-27',
    paymentMethod: 'Карта •• 1234',
  });
});

test('accepts a custom paid-through date only after the payment date', () => {
  const updated = applyPayment({ id: 'custom' }, {
    paidAt: '2026-09-27',
    paymentMethod: 'СБП',
    period: 'custom',
    paidThrough: '2026-11-11',
  });

  assert.equal(updated.nextPaymentDate, '2026-11-11');
  assert.throws(() => applyPayment({ id: 'custom' }, {
    paidAt: '2026-09-27', paymentMethod: 'СБП', period: 'custom', paidThrough: '2026-09-27',
  }), /позже даты оплаты/);
});

test('gift period shifts the next payment without overwriting the last paid card', () => {
  const original = {
    id: 'gift',
    nextPaymentDate: '2026-10-27',
    lastPayment: { paidAt: '2026-09-27', paidThrough: '2026-10-27', paymentMethod: 'Карта •• 1234' },
  };
  const updated = applyGiftPeriod(original, '2026-11-27');

  assert.equal(updated.nextPaymentDate, '2026-11-27');
  assert.equal(updated.accessUntil, '2026-11-27');
  assert.deepEqual(updated.lastPayment, original.lastPayment);
  assert.throws(() => applyGiftPeriod(original, '2026-10-27'), /позже текущей даты/);
});

test('selects only 7, 3 and 1 day notification thresholds for active subscriptions', () => {
  const subscription = { id: 'chatgpt', status: 'active', remindersEnabled: true, nextPaymentDate: '2026-10-27' };
  assert.equal(dueReminderDays(subscription, '2026-10-20'), 7);
  assert.equal(dueReminderDays(subscription, '2026-10-24'), 3);
  assert.equal(dueReminderDays(subscription, '2026-10-26'), 1);
  assert.equal(dueReminderDays(subscription, '2026-10-25'), null);
  assert.equal(dueReminderDays({ ...subscription, status: 'cancelled' }, '2026-10-26'), null);
  assert.equal(reminderKey('chatgpt', '2026-10-27', 3), 'chatgpt:2026-10-27:3');
});

test('sorts overdue active subscriptions first, then nearest payment date', () => {
  const sorted = sortSubscriptionsByNextPayment([
    { id: 'future', status: 'active', nextPaymentDate: '2026-10-30' },
    { id: 'cancelled', status: 'cancelled', nextPaymentDate: '2026-09-01' },
    { id: 'overdue', status: 'active', nextPaymentDate: '2026-09-20' },
    { id: 'soon', status: 'active', nextPaymentDate: '2026-09-28' },
  ], '2026-09-27');

  assert.deepEqual(sorted.map(item => item.id), ['overdue', 'soon', 'future', 'cancelled']);
});

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('subscription window exposes the approved clipboard and payment workflow', () => {
  const html = fs.readFileSync(path.join(root, 'subscriptions', 'subscriptions.html'), 'utf8');
  assert.match(html, /id="pasteAccount"/);
  assert.match(html, /id="addSubscription"/);
  assert.match(html, /id="currentSubscription"/);
  assert.match(html, /id="subscriptionForm"/);
  assert.match(html, /id="paymentForm"/);
  assert.match(html, /id="giftForm"/);
  assert.match(html, /id="subscriptionList"/);
});

test('main process opens subscriptions and owns their local persistence and reminder scheduler', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(main, /function subscriptionsFile\(\)/);
  assert.match(main, /function openSubscriptions\(\)/);
  assert.match(main, /Подписки/);
  assert.match(main, /get-subscriptions/);
  assert.match(main, /save-subscriptions/);
  assert.match(main, /checkSubscriptionReminders/);
  assert.match(main, /getHours\(\) !== 11/);
});

test('subscription inputs use the standard editing context menu and window is not always on top', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const windowBlock = main.slice(main.indexOf('function openSubscriptions()'), main.indexOf('function openAssistant()'));
  assert.match(windowBlock, /subscriptionsWindow\.webContents\.on\('context-menu'/);
  assert.match(windowBlock, /role: 'paste'/);
  assert.doesNotMatch(windowBlock, /alwaysOnTop/);
});
