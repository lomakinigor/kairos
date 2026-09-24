function parseIsoDate(value, label = 'Дата') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} должна быть в формате ГГГГ-ММ-ДД`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} некорректна`);
  }
  return date;
}

function formatIsoDate(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

function compareIsoDates(left, right) {
  return parseIsoDate(left).getTime() - parseIsoDate(right).getTime();
}

function normalizeAccount(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function findSubscriptionsByAccount(subscriptions, accountLabel) {
  const target = normalizeAccount(accountLabel);
  if (!target) return [];
  return subscriptions.filter(subscription => normalizeAccount(subscription.accountLabel) === target);
}

function addBillingPeriod(startDate, period) {
  const start = parseIsoDate(startDate, 'Дата оплаты');
  const monthsToAdd = period === 'month' ? 1 : period === 'year' ? 12 : null;
  if (!monthsToAdd) throw new Error('Неизвестный период оплаты');

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const targetMonthIndex = month + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatIsoDate(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))));
}

function applyPayment(subscription, { paidAt, paymentMethod, period, paidThrough }) {
  parseIsoDate(paidAt, 'Дата оплаты');
  const trimmedMethod = String(paymentMethod || '').trim();
  if (!trimmedMethod) throw new Error('Укажите способ оплаты');

  let resolvedPaidThrough;
  if (period === 'custom') {
    parseIsoDate(paidThrough, 'Дата окончания доступа');
    if (compareIsoDates(paidThrough, paidAt) <= 0) {
      throw new Error('Дата окончания доступа должна быть позже даты оплаты');
    }
    resolvedPaidThrough = paidThrough;
  } else {
    resolvedPaidThrough = addBillingPeriod(paidAt, period);
  }

  return {
    ...subscription,
    status: 'active',
    nextPaymentDate: resolvedPaidThrough,
    accessUntil: resolvedPaidThrough,
    lastPayment: { paidAt, paidThrough: resolvedPaidThrough, paymentMethod: trimmedMethod },
  };
}

function applyGiftPeriod(subscription, accessUntil) {
  parseIsoDate(accessUntil, 'Дата окончания подарочного периода');
  if (!subscription.nextPaymentDate) throw new Error('У подписки не указана следующая дата платежа');
  if (compareIsoDates(accessUntil, subscription.nextPaymentDate) <= 0) {
    throw new Error('Подарочный период должен быть позже текущей даты платежа');
  }
  return { ...subscription, accessUntil, nextPaymentDate: accessUntil };
}

function calendarDayDistance(fromDate, toDate) {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function dueReminderDays(subscription, today) {
  if (!subscription || subscription.status === 'cancelled' || subscription.remindersEnabled === false || !subscription.nextPaymentDate) {
    return null;
  }
  const days = calendarDayDistance(today, subscription.nextPaymentDate);
  return [7, 3, 1].includes(days) ? days : null;
}

function reminderKey(subscriptionId, nextPaymentDate, daysBefore) {
  return `${subscriptionId}:${nextPaymentDate}:${daysBefore}`;
}

function sortSubscriptionsByNextPayment(subscriptions, today) {
  return [...subscriptions].sort((left, right) => {
    const leftCancelled = left.status === 'cancelled';
    const rightCancelled = right.status === 'cancelled';
    if (leftCancelled !== rightCancelled) return leftCancelled ? 1 : -1;
    const leftDate = left.nextPaymentDate || '9999-12-31';
    const rightDate = right.nextPaymentDate || '9999-12-31';
    const leftOverdue = !leftCancelled && compareIsoDates(leftDate, today) < 0;
    const rightOverdue = !rightCancelled && compareIsoDates(rightDate, today) < 0;
    if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
    return compareIsoDates(leftDate, rightDate);
  });
}

module.exports = {
  normalizeAccount,
  findSubscriptionsByAccount,
  addBillingPeriod,
  applyPayment,
  applyGiftPeriod,
  dueReminderDays,
  reminderKey,
  sortSubscriptionsByNextPayment,
};
