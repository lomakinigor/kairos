const { ipcRenderer } = require('electron');

// === Constants ===
const WORK_SECS  = 45 * 60;
const BREAK_SECS =  3 * 60;

// === State ===
let timerSecs   = WORK_SECS;
let isBreak     = false;
let pulse       = 0;
let pulseDir    = 1;
let lastTick    = Date.now();
let canvasSize  = 120;
let mouseIgnored = true; // tracks current setIgnoreMouseEvents state

// === DOM ===
const clockCtx  = document.getElementById('clockCanvas').getContext('2d');
const timerCtx  = document.getElementById('timerCanvas').getContext('2d');
const widget    = document.getElementById('widget');
const modeLabel = document.getElementById('modeLabel');

// === Notification panels ===
const NOTIF_EXTRA = 44;
let _notifId = 0;
const _notifTimers = {};

function showNotif(message) {
  const id = ++_notifId;

  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.id = 'np-' + id;

  const content = document.createElement('div');
  content.className = 'notif-content';

  const msg = document.createElement('span');
  msg.className = 'notif-msg';
  msg.textContent = message;

  const btn = document.createElement('button');
  btn.className = 'notif-close';
  btn.textContent = '✕';
  btn.addEventListener('click', () => hideNotif(id));

  content.appendChild(msg);
  content.appendChild(btn);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'notif-progress-wrap';
  const bar = document.createElement('div');
  bar.className = 'notif-progress';
  progressWrap.appendChild(bar);

  panel.appendChild(content);
  panel.appendChild(progressWrap);
  document.getElementById('notif-container').appendChild(panel);

  bar.style.transition = 'none';
  bar.style.width = '100%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = 'width 180s linear';
    bar.style.width = '0%';
  }));

  _notifTimers[id] = setTimeout(() => hideNotif(id), 180000);
  _updateNotifHeight();
}

function hideNotif(id) {
  clearTimeout(_notifTimers[id]);
  delete _notifTimers[id];
  const el = document.getElementById('np-' + id);
  if (el) el.remove();
  _updateNotifHeight();
}

function _updateNotifHeight() {
  const count = document.getElementById('notif-container').children.length;
  ipcRenderer.send('set-window-height-extra', count * NOTIF_EXTRA);
}

// === Audio ===
let audioCtx;
function getAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playChime(type) {
  const ctx = getAudio();
  const t = ctx.currentTime;
  const tones = type === 'break'
    ? [{ f: 880, t: t,        d: 1.4 }, { f: 660, t: t + 0.45, d: 1.4 }]
    : [{ f: 660, t: t,        d: 1.0 }];

  tones.forEach(({ f, t: start, d }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.32, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + d);
    osc.start(start);
    osc.stop(start + d);
  });
}

// === Resize ===
function resizeCanvases(size) {
  clockCtx.canvas.width  = size;
  clockCtx.canvas.height = size;
  timerCtx.canvas.width  = size;
  timerCtx.canvas.height = size;
}

// === Drawing helpers ===
function drawHand(ctx, cx, cy, angle, len, width, color) {
  const a = angle - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawFace(ctx, cx, cy, r, glowing) {
  // Optional outer glow ring
  if (glowing) {
    const grd = ctx.createRadialGradient(cx, cy, r - 6, cx, cy, r + 14);
    grd.addColorStop(0, `rgba(255,145,28,${pulse * 0.55})`);
    grd.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }

  // Face fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(11, 11, 20, 0.96)';
  ctx.fill();

  // Rim
  ctx.strokeStyle = glowing
    ? `rgba(255,155,45,${0.25 + pulse * 0.65})`
    : 'rgba(255,255,255,0.22)';
  ctx.lineWidth = glowing ? 1.5 : 1;
  ctx.stroke();

  // Hour ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const major = i % 3 === 0;
    const len   = major ? 8 : 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    ctx.lineTo(cx + Math.cos(a) * (r - 3 - len), cy + Math.sin(a) * (r - 3 - len));
    ctx.strokeStyle = glowing
      ? `rgba(255,185,80,${0.35 + pulse * 0.4})`
      : (major ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)');
    ctx.lineWidth = major ? 2 : 1;
    ctx.stroke();
  }
}

// === Clock dial ===
function drawClock(ctx, size) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 5;
  ctx.clearRect(0, 0, size, size);

  drawFace(ctx, cx, cy, r, isBreak);

  const now = new Date();
  const h = now.getHours() % 12 + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const m = now.getMinutes() + now.getSeconds() / 60;
  const s = now.getSeconds() + now.getMilliseconds() / 1000;

  const handColor = isBreak ? `rgba(255,220,155,0.96)` : 'rgba(255,255,255,1.0)';
  const secColor  = isBreak ? `rgba(255,115,35,0.9)`   : '#ff3344';

  drawHand(ctx, cx, cy, (h / 12) * Math.PI * 2, r * 0.52, 2.5, handColor);
  drawHand(ctx, cx, cy, (m / 60) * Math.PI * 2, r * 0.75, 1.8, handColor);
  drawHand(ctx, cx, cy, (s / 60) * Math.PI * 2, r * 0.86, 1,   secColor);

  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = secColor;
  ctx.fill();
}

// === Timer dial ===
function drawTimer(ctx, size) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 5;
  const total    = isBreak ? BREAK_SECS : 60 * 60;
  const progress = timerSecs / total; // 60-min clock scale: 45min=¾, 0=empty

  ctx.clearRect(0, 0, size, size);
  drawFace(ctx, cx, cy, r, isBreak);

  // Progress arc (clockwise from top)
  const hue = isBreak ? null : Math.round(progress * 110 + 10); // 10=red → 120=green
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.strokeStyle = isBreak
    ? `rgba(255,160,50,${0.45 + pulse * 0.50})`
    : `hsl(${hue}, 75%, 58%)`;
  ctx.lineWidth = 4;
  ctx.lineCap = 'butt';
  ctx.stroke();

  // Time label
  const mm = String(Math.floor(timerSecs / 60)).padStart(2, '0');
  const ss = String(timerSecs % 60).padStart(2, '0');
  ctx.font = `bold ${Math.round(size * 0.155)}px 'Consolas','SF Mono',monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isBreak
    ? `rgba(255,215,105,${0.75 + pulse * 0.25})`
    : 'rgba(235,235,255,0.88)';
  ctx.fillText(`${mm}:${ss}`, cx, cy);
}

// === Timer tick (called every second) ===
function tick() {
  timerSecs = Math.max(0, timerSecs - 1);

  if (timerSecs === 0) {
    if (!isBreak) {
      isBreak = true;
      timerSecs = BREAK_SECS;
      modeLabel.textContent = 'Перерыв';
      playChime('break');
      ipcRenderer.send('show-notification', {
        title: 'Kairos — Перерыв!',
        body: 'Встань, потянись, подвигайся 3 минуты 🤸',
      });
    } else {
      isBreak = false;
      timerSecs = WORK_SECS;
      modeLabel.textContent = 'Работа';
      playChime('work');
    }
  }
}

// === Pulse ===
function updatePulse() {
  if (isBreak) {
    pulse += 0.022 * pulseDir;
    if (pulse >= 1) { pulse = 1; pulseDir = -1; }
    else if (pulse <= 0) { pulse = 0; pulseDir = 1; }
    widget.classList.add('pulse');
  } else {
    pulse = 0;
    pulseDir = 1;
    widget.classList.remove('pulse');
  }
}

// === Reminders fired by main process ===
ipcRenderer.on('reminder-fired', (_, message) => {
  playChime('break');
  showNotif(message);
});

// === RAF loop ===
function frame() {
  const now = Date.now();
  if (now - lastTick >= 1000) {
    lastTick += 1000;
    tick();
  }
  updatePulse();
  drawClock(clockCtx, canvasSize);
  drawTimer(timerCtx, canvasSize);
  requestAnimationFrame(frame);
}

// === Drag ===
let dragging = false, dragX = 0, dragY = 0;

document.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (e.target.closest('.notif-panel')) return;
  dragging = true;
  dragX = e.screenX;
  dragY = e.screenY;
});
document.addEventListener('mousemove', e => {
  // Fix transparent-window mouse capture: only grab events over visible widget elements
  if (!dragging) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overWidget = el && el !== document.body && el !== document.documentElement;
    const shouldIgnore = !overWidget;
    if (shouldIgnore !== mouseIgnored) {
      mouseIgnored = shouldIgnore;
      ipcRenderer.send('set-ignore-mouse', shouldIgnore);
    }
  }

  if (!dragging) return;
  ipcRenderer.send('move-window', { dx: e.screenX - dragX, dy: e.screenY - dragY });
  dragX = e.screenX;
  dragY = e.screenY;
});
document.addEventListener('mouseup', () => { dragging = false; });

// === Resize via scroll wheel ===
document.addEventListener('wheel', e => {
  e.preventDefault();
  const step = e.deltaY > 0 ? -6 : 6;
  canvasSize = Math.max(80, Math.min(260, canvasSize + step));
  resizeCanvases(canvasSize);
  ipcRenderer.send('resize-window', { canvasSize });
}, { passive: false });
document.addEventListener('contextmenu', e => {
  e.preventDefault();
  ipcRenderer.send('show-context-menu');
});

// === Init ===
canvasSize = ipcRenderer.sendSync('get-canvas-size');
resizeCanvases(canvasSize);
requestAnimationFrame(frame);
