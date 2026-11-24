const { isWeecereServerUrl, parseWeecerePaymentDate } = require('./server-monitor');

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

module.exports = { readWeecerePaymentDate, waitForWeecerePaymentDate };
