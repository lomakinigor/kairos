const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getServerMonitorStatus,
  isWeecereServerUrl,
  parseWeecerePaymentDate,
} = require('../lib/server-monitor');

const server = { serviceName: 'VDS Weecere', monitor: { enabled: true, url: 'https://weecere.com/account/vds/125823/info' } };

test('maps server payment dates to the approved colours and blinking state', () => {
  assert.deepEqual(getServerMonitorStatus({ ...server, nextPaymentDate: '2026-12-10' }, '2026-12-01'), { tone: 'green', blink: false, daysUntil: 9 });
  assert.deepEqual(getServerMonitorStatus({ ...server, nextPaymentDate: '2026-12-08' }, '2026-12-01'), { tone: 'yellow', blink: false, daysUntil: 7 });
  assert.deepEqual(getServerMonitorStatus({ ...server, nextPaymentDate: '2026-12-03' }, '2026-12-01'), { tone: 'red', blink: false, daysUntil: 2 });
  assert.deepEqual(getServerMonitorStatus({ ...server, nextPaymentDate: '2026-12-02' }, '2026-12-01'), { tone: 'red', blink: true, daysUntil: 1 });
  assert.deepEqual(getServerMonitorStatus({ ...server, nextPaymentDate: '2026-12-01' }, '2026-12-01'), { tone: 'red', blink: true, daysUntil: 0 });
  assert.deepEqual(getServerMonitorStatus({ ...server, nextPaymentDate: '2026-11-30' }, '2026-12-01'), { tone: 'red', blink: true, daysUntil: -1 });
});

test('keeps an unverified server neutral instead of showing a paid status', () => {
  assert.deepEqual(getServerMonitorStatus({ ...server, monitor: { ...server.monitor, status: 'auth-required' }, nextPaymentDate: '2026-12-10' }, '2026-12-01'), { tone: 'gray', blink: false, daysUntil: null });
  assert.deepEqual(getServerMonitorStatus({ ...server, monitor: { enabled: false }, nextPaymentDate: '2026-12-10' }, '2026-12-01'), { tone: 'hidden', blink: false, daysUntil: null });
});

test('accepts only the Weecere server page and parses labelled billing dates', () => {
  assert.equal(isWeecereServerUrl('https://weecere.com/account/vds/125823/info?'), true);
  assert.equal(isWeecereServerUrl('https://weecere.com.evil.example/account/vds/125823/info'), false);
  assert.equal(parseWeecerePaymentDate('Статус: активен\nОплачен до: 15.12.2026'), '2026-12-15');
  assert.equal(parseWeecerePaymentDate('Следующая оплата — 2026-12-15'), '2026-12-15');
  assert.equal(parseWeecerePaymentDate('Последний вход: 15.12.2026'), null);
});

test('reads the Russian date below the paid-through label on the Weecere server page', () => {
  const page = 'ИНФОРМАЦИЯ\nстатус\nВключен\nоплачен до\n24 декабря 2026\nПродлить';
  const date = parseWeecerePaymentDate(page);
  assert.equal(date, '2026-12-24');
  assert.equal(getServerMonitorStatus({ ...server, nextPaymentDate: date }, '2026-11-24').tone, 'green');
  assert.equal(parseWeecerePaymentDate('оплачен до: 1\u00a0января\u00a02027'), '2027-01-01');
});

test('rejects invalid dates and dates belonging to the next field', () => {
  assert.equal(parseWeecerePaymentDate('оплачен до\n31 февраля 2026'), null);
  assert.equal(parseWeecerePaymentDate('оплачен до: 2026-02-31'), null);
  assert.equal(parseWeecerePaymentDate('оплачен до\nПоследняя оплата: 24 декабря 2026'), null);
});

test('widget and main process expose the Weecere monitor workflow', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'renderer', 'style.css'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const subscriptionsHtml = fs.readFileSync(path.join(root, 'subscriptions', 'subscriptions.html'), 'utf8');
  const subscriptionsApp = fs.readFileSync(path.join(root, 'subscriptions', 'subscriptions.js'), 'utf8');

  assert.match(html, /id="server-monitor"/);
  assert.match(css, /\.server-monitor\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(app, /server-monitor-updated/);
  assert.match(main, /function refreshWeecereMonitor/);
  assert.match(main, /persist:weecere/);
  assert.match(main, /6 \* 60 \* 60 \* 1000/);
  assert.match(subscriptionsHtml, /id="monitorUrl"/);
  assert.match(subscriptionsHtml, /id="monitorEnabled"/);
  assert.match(subscriptionsApp, /open-weecere-login/);
});
