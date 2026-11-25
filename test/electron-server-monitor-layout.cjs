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
    const dials = [...document.querySelectorAll('canvas')];
    return [50, 120, 260].map(size => {
      document.documentElement.style.setProperty('--widget-scale', Math.max(0.65, Math.min(1.75, size / 120)));
      for (const dial of dials) dial.width = dial.height = size;
      row.hidden = true;
      const base = widget.getBoundingClientRect();
      row.hidden = false;
      row.className = 'server-monitor gray';
      const grayLightWidth = light.getBoundingClientRect().width;
      row.className = 'server-monitor green';
      const circle = light.getBoundingClientRect();
      const after = widget.getBoundingClientRect();
      const leftDial = dials[0].getBoundingClientRect();
      const rightDial = dials[1].getBoundingClientRect();
      const style = getComputedStyle(row);
      return {
        size, baseWidth: base.width, baseHeight: base.height,
        width: after.width, height: after.height,
        grayLightWidth, greenLightWidth: circle.width,
        centered: Math.abs((circle.left + circle.right) / 2 - (after.left + after.right) / 2) < 1,
        betweenDials: circle.left > leftDial.left && circle.right < rightDial.right,
        noBar: style.position === 'absolute' && style.backgroundColor === 'rgba(0, 0, 0, 0)',
        noCaption: !row.querySelector('#server-monitor-label'),
      };
    });
  }).toString() + ')()');

  for (const result of sizes) {
    const { size, baseWidth, baseHeight, width, height, centered, betweenDials, noBar, noCaption, grayLightWidth, greenLightWidth } = result;
    assert.equal(width, baseWidth, JSON.stringify(result));
    assert.equal(height, baseHeight, JSON.stringify(result));
    assert.ok(Math.abs(greenLightWidth / grayLightWidth - 2.5) < 0.01, JSON.stringify(result));
    assert.ok(centered && betweenDials && noBar && noCaption, JSON.stringify(result));
  }
  console.log('Centered Weecere circle verified at canvas sizes 50, 120 and 260.');
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
