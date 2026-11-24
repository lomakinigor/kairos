const test = require('node:test');
const assert = require('node:assert/strict');
const { readWeecerePaymentDate, waitForWeecerePaymentDate } = require('../lib/weecere-page');

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
