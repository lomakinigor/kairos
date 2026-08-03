const { clipboard, ipcRenderer } = require('electron');
const { detectDirection, validateAssistantInput } = require('../lib/language');

const input = document.getElementById('inputText');
const counter = document.getElementById('counter');
const direction = document.getElementById('direction');
const submitButton = document.getElementById('submitButton');
const status = document.getElementById('status');
const quota = document.getElementById('quota');
const resultCard = document.getElementById('resultCard');
const resultTitle = document.getElementById('resultTitle');
const result = document.getElementById('result');
const copyButton = document.getElementById('copyButton');
const inputLabel = document.getElementById('inputLabel');

let mode = 'translate';
let requestId = 0;
let pending = false;

function updateDirection() {
  counter.textContent = `${input.value.length} / 4000`;
  if (mode !== 'translate' || !input.value.trim()) {
    direction.textContent = mode === 'translate' ? 'Язык определится автоматически' : 'Объяснение простым русским языком';
    return;
  }
  try { direction.textContent = detectDirection(input.value).label; }
  catch (_) { direction.textContent = 'Введите текст на русском или английском'; }
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll('.tab').forEach(tab => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  const translating = mode === 'translate';
  inputLabel.textContent = translating ? 'Текст для перевода' : 'IT-термин';
  input.placeholder = translating
    ? 'Введите фразу на русском или английском…'
    : 'Например: API, Docker или backend…';
  submitButton.textContent = translating ? 'Перевести' : 'Объяснить';
  resultTitle.textContent = translating ? 'Результат перевода' : 'Простое объяснение';
  status.textContent = '';
  resultCard.hidden = true;
  updateDirection();
  input.focus();
}

function updateQuota(remaining, unlimited) {
  quota.textContent = unlimited ? 'Без ограничений' : `Осталось: ${remaining}`;
  if (!unlimited && remaining === 0) submitButton.disabled = true;
}

function submit() {
  if (pending) return;
  let text;
  try {
    text = validateAssistantInput(mode, input.value);
    if (mode === 'translate') detectDirection(text);
  } catch (error) {
    status.textContent = error.message;
    return;
  }
  pending = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Обрабатываю…';
  status.textContent = '';
  resultCard.hidden = true;
  ipcRenderer.send('assistant-request', { requestId: ++requestId, mode, text });
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
input.addEventListener('input', updateDirection);
input.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); submit(); }
});
submitButton.addEventListener('click', submit);
copyButton.addEventListener('click', () => {
  clipboard.writeText(result.textContent);
  copyButton.textContent = 'Скопировано';
  setTimeout(() => { copyButton.textContent = 'Копировать'; }, 1400);
});

ipcRenderer.on('assistant-ready', (_, data) => {
  updateQuota(data.remaining, data.unlimited);
  if (!data.configured) status.textContent = 'AI-сервис пока не настроен';
});

ipcRenderer.on('assistant-response', (_, data) => {
  if (data.requestId !== requestId) return;
  pending = false;
  submitButton.disabled = false;
  submitButton.textContent = mode === 'translate' ? 'Перевести' : 'Объяснить';
  if (!data.ok) {
    status.textContent = data.message;
    if (data.remaining === 0) updateQuota(0, false);
    return;
  }
  result.textContent = data.result;
  resultCard.hidden = false;
  updateQuota(data.remaining, data.unlimited);
});

updateDirection();
ipcRenderer.send('assistant-init');
