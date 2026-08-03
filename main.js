const { app, BrowserWindow, ipcMain, Menu, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { shouldShowReleaseNotes, isLegacyKairosElectronEntry } = require('./lib/update-policy');

const DEFAULT_ASSISTANT_API_URL = 'https://kairos-ai.kairos-17184.workers.dev';

// Per-reminder runtime state: { [id]: { lastFiredAt, lastFiredDay } }
const reminderState = {};

function getDataDir() { return app.getPath('userData'); }
function remindersFile() { return path.join(getDataDir(), 'reminders.json'); }
function winPosFile()    { return path.join(getDataDir(), 'window-pos.json'); }
function installationIdFile() { return path.join(getDataDir(), 'installation-id.txt'); }
function ownerTokenFile() { return path.join(getDataDir(), 'owner-token.txt'); }
function assistantConfigFile() { return path.join(getDataDir(), 'assistant-config.json'); }
function updateStateFile() { return path.join(getDataDir(), 'update-state.json'); }

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
let assistantWindow = null;
let updatesWindow = null;
let downloadedUpdate = null;
let currentCanvasSize = 120;
let _resizeGuard = false;

function getOrCreateInstallationId() {
  const file = installationIdFile();
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[A-Za-z0-9-]{8,128}$/.test(existing)) return existing;
  } catch (_) {}
  const id = crypto.randomUUID();
  fs.writeFileSync(file, id, 'utf8');
  return id;
}

function getAssistantConfig() {
  const stored = loadJSON(assistantConfigFile(), {});
  return {
    apiUrl: process.env.KAIROS_API_URL || stored.apiUrl || DEFAULT_ASSISTANT_API_URL,
    installationId: getOrCreateInstallationId(),
    ownerToken: (() => {
      try { return fs.readFileSync(ownerTokenFile(), 'utf8').trim(); } catch (_) { return ''; }
    })(),
  };
}

function createMainWindow() {
  const pos = loadJSON(winPosFile(), { x: 80, y: 80, canvasSize: 120 });
  const cs = pos.canvasSize || 120;
  currentCanvasSize = cs;

  mainWindow = new BrowserWindow({
    width:    cs * 2 + 34,
    height:   cs + 32 + 300,
    minWidth: cs * 2 + 34,
    maxWidth: cs * 2 + 34,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Watchdog: restore correct size if OS/DWM changes it unexpectedly.
  // Guard prevents feedback loop: our own setSize call would trigger another resize event.
  mainWindow.on('resize', () => {
    if (!mainWindow || _resizeGuard) return;
    const [w, h] = mainWindow.getSize();
    const expectedW = currentCanvasSize * 2 + 34;
    const expectedH = currentCanvasSize + 32 + 300;
    if (w !== expectedW || h !== expectedH) {
      _resizeGuard = true;
      mainWindow.setSize(expectedW, expectedH);
      setTimeout(() => { _resizeGuard = false; }, 100);
    }
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.showInactive());

  // Re-assert always-on-top every 2s — Windows DWM can silently drop z-order on frameless windows
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'floating');
    }
  }, 2000);

  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    const saved = loadJSON(winPosFile(), { canvasSize: 120 });
    saveJSON(winPosFile(), { x, y, canvasSize: saved.canvasSize || 120 });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function getReleaseNotes(version = app.getVersion()) {
  const releases = loadJSON(path.join(__dirname, 'updates', 'releases.json'), {});
  return releases[version] || { title: `Kairos ${version}`, items: [] };
}

function openUpdatesWindow(mode = 'whats-new', updateInfo = null) {
  if (updatesWindow) { updatesWindow.focus(); return; }
  updatesWindow = new BrowserWindow({
    width: 460,
    height: 520,
    title: mode === 'ready' ? 'Kairos — Обновление готово' : 'Kairos — Что нового',
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0e0e1a',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  updatesWindow.menuBarVisible = false;
  updatesWindow.loadFile(path.join(__dirname, 'updates', 'updates.html'));
  updatesWindow.webContents.once('did-finish-load', () => {
    const version = updateInfo?.version || app.getVersion();
    updatesWindow?.webContents.send('updates-data', {
      mode,
      version,
      notes: getReleaseNotes(version),
    });
  });
  updatesWindow.on('closed', () => { updatesWindow = null; });
}

function maybeShowReleaseNotes() {
  const state = loadJSON(updateStateFile(), {});
  if (shouldShowReleaseNotes(app.getVersion(), state.lastSeenVersion)) openUpdatesWindow('whats-new');
}

function cleanupLegacyElectronAutostart() {
  if (process.platform !== 'win32') return;
  const runKey = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
  execFile('reg.exe', ['query', runKey, '/v', 'Electron'], { windowsHide: true }, (error, stdout) => {
    if (error || !isLegacyKairosElectronEntry('Electron', stdout)) return;
    execFile('reg.exe', ['delete', runKey, '/v', 'Electron', '/f'], { windowsHide: true }, () => {});
  });
}

function configureUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', info => {
    downloadedUpdate = info;
    openUpdatesWindow('ready', info);
  });
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 30000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
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

function openAssistant() {
  if (assistantWindow) { assistantWindow.focus(); return; }
  assistantWindow = new BrowserWindow({
    width: 520,
    height: 600,
    minWidth: 520,
    minHeight: 600,
    title: 'Kairos Assistant',
    resizable: false,
    backgroundColor: '#0e0e1a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  assistantWindow.menuBarVisible = false;
  assistantWindow.loadFile(path.join(__dirname, 'assistant', 'assistant.html'));
  assistantWindow.on('closed', () => { assistantWindow = null; });
}

app.setAppUserModelId('com.kairos.widget');
cleanupLegacyElectronAutostart();
if (app.isPackaged) {
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: ['--autostart'] });
} else {
  app.setLoginItemSettings({ openAtLogin: false });
}

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
    configureUpdater();
    setTimeout(maybeShowReleaseNotes, 1200);
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
  currentCanvasSize = canvasSize;
  const w = canvasSize * 2 + 34;
  const h = canvasSize + 32 + 300;
  mainWindow.setMinimumSize(w, canvasSize + 32);
  mainWindow.setMaximumSize(w, h);
  mainWindow.setSize(w, h);
  const [x, y] = mainWindow.getPosition();
  saveJSON(winPosFile(), { x, y, canvasSize });
});

ipcMain.on('show-context-menu', (event) => {
  const menu = Menu.buildFromTemplate([
    { label: 'Переводчик и IT-помощник', click: openAssistant },
    { label: 'Настройки напоминаний', click: openSettings },
    { type: 'separator' },
    { label: 'Выйти', click: () => app.quit() },
  ]);
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('get-app-version', (event) => { event.returnValue = app.getVersion(); });

ipcMain.on('updates-action', (_, action) => {
  if (action === 'install' && downloadedUpdate) {
    autoUpdater.quitAndInstall(false, true);
    return;
  }
  if (action === 'acknowledge') {
    saveJSON(updateStateFile(), { lastSeenVersion: app.getVersion() });
  }
  updatesWindow?.close();
});

ipcMain.on('assistant-init', (event) => {
  const config = getAssistantConfig();
  event.sender.send('assistant-ready', {
    configured: Boolean(config.apiUrl),
    unlimited: Boolean(config.ownerToken),
    remaining: config.ownerToken ? null : 5,
  });
});

ipcMain.on('assistant-request', async (event, { requestId, mode, text }) => {
  const config = getAssistantConfig();
  if (!config.apiUrl) {
    event.sender.send('assistant-response', {
      requestId,
      ok: false,
      message: 'AI-сервис не настроен. Укажите адрес backend в assistant-config.json.',
    });
    return;
  }

  try {
    const response = await fetch(`${config.apiUrl.replace(/\/$/, '')}/v1/assistant`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'content-type': 'application/json',
        ...(config.ownerToken ? { 'x-kairos-owner': config.ownerToken } : {}),
      },
      body: JSON.stringify({ mode, text, installationId: config.installationId }),
    });
    const payload = await response.json().catch(() => ({}));
    event.sender.send('assistant-response', {
      requestId,
      ok: response.ok,
      result: payload.result,
      remaining: payload.remaining,
      unlimited: payload.unlimited,
      message: payload.message || (response.ok ? '' : 'AI-сервис временно недоступен'),
    });
  } catch (_) {
    event.sender.send('assistant-response', {
      requestId,
      ok: false,
      message: 'Не удалось подключиться к AI-сервису. Проверьте интернет-соединение.',
    });
  }
});
