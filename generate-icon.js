const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile(path.join(__dirname, 'generate-icon.html'));
});

ipcMain.on('icon-ready', async (_, dataUrl) => {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const pngBuffer = Buffer.from(base64, 'base64');
  const pngPath = path.join(__dirname, 'assets', 'icon-src.png');
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');

  fs.writeFileSync(pngPath, pngBuffer);
  console.log('PNG saved:', pngPath);

  const { default: pngToIco } = await import('png-to-ico');
  const icoBuffer = await pngToIco([pngPath]);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('ICO saved:', icoPath);

  app.quit();
});
