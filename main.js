const { app, BrowserWindow, ipcMain, Menu, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Per-reminder runtime state: { [id]: { lastFiredAt, lastFiredDay } }
const reminderState = {};

function getDataDir() { return app.getPath('userData'); }
function remindersFile() { return path.join(getDataDir(), 'reminders.json'); }
function winPosFile()    { return path.join(getDataDir(), 'window-pos.json'); }

const DEFAULT_REMINDERS = [
  { id: 1,              type: 'time',     time: '15:00',       message: 'Лучшее время для пробежки! 🏃', enabled: true },
  { id: 2,              type: 'interval', intervalMinutes: 60, message: 'Три глотка воды',               enabled: true },
];

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  return fallback;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// === Reminder engine (runs in main process — not throttled by OS) ===
function fireMain(message) {
  if (Notification.isSupported()) new Notification({ title: 'Kairos', body: message }).show();
  if (mainWindow) mainWindow.webContents.send('reminder-fired', message);
}

function checkRemindersMain() {
  const reminders = loadJSON(remindersFile(), DEFAULT_REMINDERS);
  const now = new Date();
  const nowMs = now.getTime();
  const minuteKey = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
  const todayStr = now.toDateString();

  reminders.forEach(r => {
    if (!r.enabled) return;
    if (!reminderState[r.id]) reminderState[r.id] = {};
    const st = reminderState[r.id];

    if (r.type === 'time') {
      if (minuteKey === r.time && st.lastFiredDay !== todayStr) {
        st.lastFiredDay = todayStr;
        fireMain(r.message);
      }
    } else if (r.type === 'once') {
      if (!r._fired && minuteKey === r.time) {
        r._fired = true;
        saveJSON(remindersFile(), reminders);
        if (mainWindow) mainWindow.webContents.send('reminders-updated');
        fireMain(r.message);
      }
    } else if (r.type === 'interval') {
      if (st.lastFiredAt === undefined) {
        st.lastFiredAt = nowMs;
        return;
      }
      if (nowMs - st.lastFiredAt >= r.intervalMinutes * 60000) {
        st.lastFiredAt = nowMs;
        fireMain(r.message);
      }
    }
  });
}

let mainWindow = null;
let settingsWindow = null;

function createMainWindow() {
  const pos = loadJSON(winPosFile(), { x: 80, y: 80, canvasSize: 120 });
  const cs = pos.canvasSize || 120;

  mainWindow = new BrowserWindow({
    width:  cs * 2 + 34,
    height: cs + 32,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  // Transparent areas pass through to OS; renderer toggles this when cursor enters widget
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    const saved = loadJSON(winPosFile(), { canvasSize: 120 });
    saveJSON(winPosFile(), { x, y, canvasSize: saved.canvasSize || 120 });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 580,
    title: 'Kairos — Напоминания',
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0f0f18',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  settingsWindow.menuBarVisible = false;
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

app.setAppUserModelId('com.kairos.widget');
app.setLoginItemSettings({
  openAtLogin: true,
  path: process.execPath,
  args: process.defaultApp ? [path.resolve(process.argv[1])] : [],
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) mainWindow.focus();
  });

  app.whenReady().then(() => {
    createMainWindow();
    setInterval(checkRemindersMain, 20000);
    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// IPC
ipcMain.on('move-window', (_, { dx, dy }) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + dx, y + dy);
});

ipcMain.on('show-notification', (_, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
});

ipcMain.on('get-reminders', (event) => {
  event.returnValue = loadJSON(remindersFile(), DEFAULT_REMINDERS);
});

ipcMain.on('save-reminders', (_, reminders) => {
  saveJSON(remindersFile(), reminders);
  for (const k in reminderState) delete reminderState[k]; // reset all interval timers
  if (mainWindow) mainWindow.webContents.send('reminders-updated');
});

ipcMain.on('get-reminder-state', (event) => { event.returnValue = reminderState; });

ipcMain.on('set-ignore-mouse', (_, ignore) => {
  if (mainWindow) mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('get-canvas-size', (event) => {
  const pos = loadJSON(winPosFile(), { canvasSize: 120 });
  event.returnValue = pos.canvasSize || 120;
});

ipcMain.on('resize-window', (_, { canvasSize }) => {
  if (!mainWindow) return;
  mainWindow.setSize(canvasSize * 2 + 34, canvasSize + 32);
  const [x, y] = mainWindow.getPosition();
  saveJSON(winPosFile(), { x, y, canvasSize });
});

ipcMain.on('set-window-height-extra', (_, extra) => {
  if (!mainWindow) return;
  const pos = loadJSON(winPosFile(), { canvasSize: 120 });
  const cs = pos.canvasSize || 120;
  mainWindow.setSize(cs * 2 + 34, cs + 32 + extra);
});

ipcMain.on('show-context-menu', (event) => {
  const menu = Menu.buildFromTemplate([
    { label: 'Настройки напоминаний', click: openSettings },
    { type: 'separator' },
    { label: 'Выйти', click: () => app.quit() },
  ]);
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('get-app-version', (event) => { event.returnValue = app.getVersion(); });
