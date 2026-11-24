const { calendarDayDistance } = require('./subscriptions');

const RUSSIAN_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

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
  const iso = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(value);
  const numeric = /^(\d{1,2})\.(\d{1,2})\.(20\d{2})$/.exec(value);
  const written = /^(\d{1,2})\s+([а-я]+)\s+(20\d{2})$/i.exec(value);
  const month = written ? RUSSIAN_MONTHS.indexOf(written[2].toLowerCase()) + 1 : 0;
  const parts = iso ? iso.slice(1) : numeric ? [numeric[3], numeric[2], numeric[1]]
    : month ? [written[3], month, written[1]] : null;
  if (!parts) return null;

  const date = parts.map(part => String(part).padStart(2, '0')).join('-');
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function parseWeecerePaymentDate(pageText) {
  const lines = String(pageText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    const labelled = /^(?:оплачен\s+до|следующая\s+оплата)(?=$|\s|[:—–-])[\s:—–-]*(.*)$/i.exec(line);
    if (labelled) return parseDate(labelled[1] || lines[index + 1] || '');
  }
  return null;
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
