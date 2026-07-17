const { ipcRenderer } = require('electron');

let items = ipcRenderer.sendSync('get-reminders');
let addType = 'time';

function nextFireTime(id, intervalMinutes) {
  const state = ipcRenderer.sendSync('get-reminder-state');
  const st = state[id];
  const intervalMs = intervalMinutes * 60000;
  const base = (st && st.lastFiredAt !== undefined) ? st.lastFiredAt : Date.now();
  const elapsed = (Date.now() - base) % intervalMs;
  const next = new Date(Date.now() + intervalMs - elapsed);
  return next.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function render() {
  const list = document.getElementById('list');
  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = '<div class="empty">Нет напоминаний</div>';
    return;
  }

  items.forEach((r, i) => {
    let labelMain, labelSub = '', spanClass = 'time', fired = false;
    if (r.type === 'interval') {
      const h = Math.floor(r.intervalMinutes / 60);
      const m = r.intervalMinutes % 60;
      labelMain = '↻ ' + (h > 0 && m > 0 ? `${h}ч ${m}м` : h > 0 ? `${h}ч` : `${m}м`);
      labelSub  = `<span class="next-time">след. ${nextFireTime(r.id, r.intervalMinutes)}</span>`;
      spanClass = 'interval-lbl';
    } else if (r.type === 'once') {
      labelMain = r.time;
      fired = !!r._fired;
      labelSub = fired
        ? '<span class="fired-badge">✓ выполнено</span>'
        : '<span class="once-badge">разовое</span>';
    } else {
      labelMain = r.time;
    }
    const div = document.createElement('div');
    div.className = 'item' + (fired ? ' fired' : '');
    div.innerHTML = `
      <input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="toggle(${i})">
      <span class="${spanClass}">${labelMain}${labelSub ? '<br>' + labelSub : ''}</span>
      <span class="msg">${escHtml(r.message)}</span>
      <button class="del" onclick="remove(${i})" title="Удалить">✕</button>
    `;
    list.appendChild(div);
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toggle(i) { items[i].enabled = !items[i].enabled; }

function remove(i) { items.splice(i, 1); render(); }

function setAddType(type) {
  addType = type;
  document.getElementById('timeFields').style.display     = (type === 'time' || type === 'once') ? '' : 'none';
  document.getElementById('intervalFields').style.display = type === 'interval' ? '' : 'none';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
}

function addItem() {
  if (addType === 'time' || addType === 'once') {
    const time = document.getElementById('newTime').value;
    const msg  = document.getElementById('newMsg').value.trim();
    if (!time || !msg) return;
    if (addType === 'once') {
      items.push({ id: Date.now(), type: 'once', time, message: msg, enabled: true, _fired: false });
    } else {
      items.push({ id: Date.now(), type: 'time', time, message: msg, enabled: true });
    }
    document.getElementById('newMsg').value = '';
  } else {
    const h   = parseInt(document.getElementById('newIntervalH').value, 10) || 0;
    const m   = parseInt(document.getElementById('newIntervalM').value, 10) || 0;
    const msg = document.getElementById('newMsgInterval').value.trim();
    const total = h * 60 + m;
    if (!total || !msg) return;
    items.push({ id: Date.now(), type: 'interval', intervalMinutes: total, message: msg, enabled: true });
    document.getElementById('newMsgInterval').value = '';
  }
  render();
}

function save() {
  // Auto-add any filled-in form before saving
  if (addType === 'time' || addType === 'once') {
    const time = document.getElementById('newTime').value;
    const msg  = document.getElementById('newMsg').value.trim();
    if (time && msg) {
      if (addType === 'once') {
        items.push({ id: Date.now(), type: 'once', time, message: msg, enabled: true, _fired: false });
      } else {
        items.push({ id: Date.now(), type: 'time', time, message: msg, enabled: true });
      }
    }
  } else {
    const h     = parseInt(document.getElementById('newIntervalH').value, 10) || 0;
    const m     = parseInt(document.getElementById('newIntervalM').value, 10) || 0;
    const msg   = document.getElementById('newMsgInterval').value.trim();
    const total = h * 60 + m;
    if (total && msg) {
      items.push({ id: Date.now(), type: 'interval', intervalMinutes: total, message: msg, enabled: true });
    }
  }
  ipcRenderer.send('save-reminders', items);
  window.close();
}

setAddType('time');
render();

const v = ipcRenderer.sendSync('get-app-version');
document.getElementById('authorLine').textContent = `Igor Lomakin · v.${v}`;
