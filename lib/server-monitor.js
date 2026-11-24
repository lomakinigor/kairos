const { calendarDayDistance } = require('./subscriptions');

function isWeecereServerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'weecere.com'
      && /^\/account\/vds\/\d+\/info\/?$/.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function parseDate(value) {
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = value.match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
  return ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : null;
}

function parseWeecerePaymentDate(pageText) {
  const lines = String(pageText || '').split(/\r?\n/);
  const labelled = lines.find(line => /(?:оплачен\s+до|следующ(?:ая|ий)\s+оплат)/i.test(line));
  return labelled ? parseDate(labelled) : null;
}

function getServerMonitorStatus(subscription, today) {
  if (!subscription?.monitor?.enabled) return { tone: 'hidden', blink: false, daysUntil: null };
  if (subscription.monitor.status && subscription.monitor.status !== 'ok') {
    return { tone: 'gray', blink: false, daysUntil: null };
  }
  if (!subscription.nextPaymentDate) return { tone: 'gray', blink: false, daysUntil: null };

  const daysUntil = calendarDayDistance(today, subscription.nextPaymentDate);
  if (daysUntil <= 1) return { tone: 'red', blink: true, daysUntil };
  if (daysUntil <= 2) return { tone: 'red', blink: false, daysUntil };
  if (daysUntil <= 7) return { tone: 'yellow', blink: false, daysUntil };
  return { tone: 'green', blink: false, daysUntil };
}

module.exports = { getServerMonitorStatus, isWeecereServerUrl, parseWeecerePaymentDate };
