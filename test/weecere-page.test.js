const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { loadWeecerePage, readWeecerePaymentDate, waitForWeecerePaymentDate } = require('../lib/weecere-page');

const serverUrl = 'https://weecere.com/account/vds/125823/info';

test('reads the payment date from the authenticated VDS page', async () => {
  const page = {
    getURL: () => serverUrl,
    executeJavaScript: async () => 'статус\nВключен\nоплачен до\n24 декабря 2026',
  };
  assert.equal(await readWeecerePaymentDate(page), '2026-12-24');
});

test('does not inspect login or unrelated pages', async () => {
  let reads = 0;
  const page = {
    getURL: () => 'https://weecere.com/login',
    executeJavaScript: async () => { reads++; return 'оплачен до\n24 декабря 2026'; },
  };
  assert.equal(await readWeecerePaymentDate(page), null);
  assert.equal(reads, 0);
});

test('waits for asynchronous payment data and stops on timeout', async () => {
  let reads = 0;
  const page = {
    getURL: () => serverUrl,
    executeJavaScript: async () => ++reads < 3 ? 'Загрузка' : 'оплачен до\n24 декабря 2026',
  };
  assert.equal(await waitForWeecerePaymentDate(page, 100, 1), '2026-12-24');
  assert.equal(reads, 3);

  const empty = { getURL: () => serverUrl, executeJavaScript: async () => 'Загрузка' };
  assert.equal(await waitForWeecerePaymentDate(empty, 5, 1), null);
});

test('waits through an aborted intermediate navigation to the final page', async () => {
  const webContents = new EventEmitter();
  const window = {
    webContents,
    loadURL: () => {
      setImmediate(() => {
        webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', serverUrl, true);
        webContents.emit('did-finish-load');
      });
      return Promise.reject(new Error('ERR_ABORTED'));
    },
  };
  await loadWeecerePage(window, serverUrl, 100);
});

test('rejects a real main-frame network failure and timeout', async () => {
  const webContents = new EventEmitter();
  const failed = {
    webContents,
    loadURL: () => {
      setImmediate(() => webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', serverUrl, true));
      return new Promise(() => {});
    },
  };
  await assert.rejects(loadWeecerePage(failed, serverUrl, 100), { code: 'network' });
  await assert.rejects(loadWeecerePage({ webContents: new EventEmitter(), loadURL: () => new Promise(() => {}) }, serverUrl, 5), { code: 'timeout' });
});
