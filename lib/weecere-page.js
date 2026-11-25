const { isWeecereServerUrl, parseWeecerePaymentDate } = require('./server-monitor');

function loadWeecerePage(window, url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const webContents = window.webContents;
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      webContents.removeListener('did-finish-load', onLoaded);
      webContents.removeListener('did-fail-load', onFailed);
      if (error) reject(error);
      else resolve();
    };
    const onLoaded = () => finish();
    const onFailed = (_event, code, _description, _url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      const error = new Error('network');
      error.code = 'network';
      finish(error);
    };
    const timeout = setTimeout(() => {
      const error = new Error('timeout');
      error.code = 'timeout';
      finish(error);
    }, timeoutMs);
    webContents.on('did-finish-load', onLoaded);
    webContents.on('did-fail-load', onFailed);
    Promise.resolve().then(() => window.loadURL(url)).catch(error => {
      if (String(error?.message).includes('ERR_ABORTED')) return;
      const failure = new Error('network');
      failure.code = 'network';
      finish(failure);
    });
  });
}

async function readWeecerePaymentDate(webContents) {
  if (!isWeecereServerUrl(webContents.getURL())) return null;
  const text = await webContents.executeJavaScript('document.body ? document.body.innerText : ""');
  return parseWeecerePaymentDate(text);
}

async function waitForWeecerePaymentDate(webContents, timeoutMs = 15000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const date = await readWeecerePaymentDate(webContents);
      if (date) return date;
    } catch (_) {
      // Navigation may replace the page while its content is being read.
    }
    if (Date.now() >= deadline) return null;
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, deadline - Date.now())));
  } while (true);
}

module.exports = { loadWeecerePage, readWeecerePaymentDate, waitForWeecerePaymentDate };
