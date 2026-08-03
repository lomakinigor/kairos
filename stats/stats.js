const { ipcRenderer } = require('electron');

const fields = {
  total: document.getElementById('total'),
  today: document.getElementById('today'),
  week: document.getElementById('week'),
  month: document.getElementById('month'),
  active: document.getElementById('active'),
};
const versions = document.getElementById('versions');
const status = document.getElementById('status');
const refresh = document.getElementById('refresh');

function load() {
  refresh.disabled = true;
  status.textContent = 'Загружаю статистику…';
  ipcRenderer.send('stats-request');
}

ipcRenderer.on('stats-response', (_, response) => {
  refresh.disabled = false;
  if (!response.ok) {
    status.textContent = response.message;
    return;
  }
  const data = response.stats;
  fields.total.textContent = data.total;
  fields.today.textContent = data.newToday;
  fields.week.textContent = data.new7Days;
  fields.month.textContent = data.new30Days;
  fields.active.textContent = data.active30Days;
  const maximum = Math.max(1, ...data.versions.map(item => item.count));
  versions.replaceChildren(...data.versions.map(item => {
    const row = document.createElement('div');
    row.className = 'version-row';
    const label = document.createElement('span');
    label.textContent = `v${item.version}`;
    const bar = document.createElement('span');
    bar.className = 'version-bar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.max(4, item.count / maximum * 100)}%`;
    bar.append(fill);
    const count = document.createElement('span');
    count.className = 'version-count';
    count.textContent = item.count;
    row.append(label, bar, count);
    return row;
  }));
  if (!data.versions.length) versions.textContent = 'Пока нет данных';
  status.textContent = 'Обновлено только что';
});

refresh.addEventListener('click', load);
load();
