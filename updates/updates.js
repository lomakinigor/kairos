const { ipcRenderer } = require('electron');

const eyebrow = document.getElementById('eyebrow');
const version = document.getElementById('version');
const title = document.getElementById('title');
const subtitle = document.getElementById('subtitle');
const items = document.getElementById('items');
const limit = document.getElementById('limit');
const later = document.getElementById('later');
const primary = document.getElementById('primary');

ipcRenderer.on('updates-data', (_, data) => {
  const ready = data.mode === 'ready';
  eyebrow.textContent = ready ? 'ГОТОВО К УСТАНОВКЕ' : 'ЧТО НОВОГО';
  version.textContent = data.version;
  title.textContent = ready ? `Kairos ${data.version} готов` : data.notes.title;
  subtitle.textContent = ready
    ? 'Обновление скачано. Перезапуск займёт меньше минуты.'
    : 'Новые возможности уже готовы — настройки и напоминания остались на месте.';
  items.replaceChildren(...data.notes.items.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  limit.textContent = data.notes.limit || '';
  limit.hidden = !data.notes.limit;
  later.hidden = !ready;
  primary.textContent = ready ? 'Перезапустить и обновить' : 'Понятно';
  primary.onclick = () => ipcRenderer.send('updates-action', ready ? 'install' : 'acknowledge');
});

later.addEventListener('click', () => ipcRenderer.send('updates-action', 'later'));
