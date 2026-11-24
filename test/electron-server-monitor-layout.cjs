const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kairos-layout-'));
app.setPath('userData', profile);

app.whenReady().then(async () => {
  const renderer = path.join(__dirname, '..', 'renderer');
  const css = fs.readFileSync(path.join(renderer, 'style.css'), 'utf8');
  const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8')
    .replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
    .replace('<script src="app.js"></script>', '');
  const window = new BrowserWindow({ show: false, width: 1000, height: 600 });
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  const sizes = await window.webContents.executeJavaScript('(' + (() => {
    const widget = document.querySelector('#widget');
    const row = document.querySelector('#server-monitor');
    const light = document.querySelector('.server-monitor-light');
    const label = document.querySelector('#server-monitor-label');
    const dials = [...document.querySelectorAll('canvas')];
    return [50, 120, 260].map(size => {
      for (const dial of dials) dial.width = dial.height = size;
      row.hidden = true;
      const baseWidth = widget.offsetWidth;
      row.hidden = false;
      row.className = 'server-monitor gray';
      const grayLightWidth = light.getBoundingClientRect().width;
      row.className = 'server-monitor green';
      const greenLightWidth = light.getBoundingClientRect().width;
      label.textContent = 'Сервер US · не удалось проверить оплату';
      const normalWidth = widget.offsetWidth;
      label.textContent = 'Очень длинное название сервера '.repeat(20);
      return {
        size, baseWidth, normalWidth, grayLightWidth, greenLightWidth,
        longWidth: widget.offsetWidth,
        belowDials: row.getBoundingClientRect().top >= dials[0].getBoundingClientRect().bottom,
        textClipped: label.scrollWidth > label.clientWidth && getComputedStyle(label).textOverflow === 'ellipsis',
      };
    });
  }).toString() + ')()');

  for (const result of sizes) {
    const { size, baseWidth, normalWidth, longWidth, belowDials, textClipped, grayLightWidth, greenLightWidth } = result;
    assert.equal(normalWidth, baseWidth, JSON.stringify(result));
    assert.ok(Math.abs(greenLightWidth / grayLightWidth - 2.5) < 0.01, JSON.stringify(result));
    assert.equal(longWidth, baseWidth, 'Long label expanded widget at canvas size ' + size);
    assert.ok(belowDials && textClipped, JSON.stringify(result));
  }
  console.log('Weecere layout verified at canvas sizes 50, 120 and 260.');
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
