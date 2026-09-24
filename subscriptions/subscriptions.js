const { clipboard, ipcRenderer } = require('electron');
const {
  findSubscriptionsByAccount,
  applyPayment,
  applyGiftPeriod,
  sortSubscriptionsByNextPayment,
} = require('../lib/subscriptions');

let store = ipcRenderer.sendSync('get-subscriptions');
let paymentTargetId = null;
let giftTargetId = null;

const $ = id => document.getElementById(id);
function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function save() { ipcRenderer.send('save-subscriptions', store); }
function setStatus(text) { $('status').textContent = text; }
function daysUntil(date) {
  const today = new Date(`${localDate()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target - today) / 86400000);
}
function dueLabel(subscription) {
  if (!subscription.nextPaymentDate) return 'дата не указана';
  const days = daysUntil(subscription.nextPaymentDate);
  if (days < 0) return `просрочено на ${Math.abs(days)} дн.`;
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `через ${days} дн.`;
}
function textElement(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function copyRow(label, value) {
  const row = document.createElement('div');
  row.className = 'copy-row';
  const content = document.createElement('span');
  content.textContent = `${label}: `;
  content.appendChild(textElement('strong', value || '—'));
  const copy = textElement('button', 'Копировать', 'copy');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    clipboard.writeText(value || '');
    copy.textContent = 'Скопировано';
    setTimeout(() => { copy.textContent = 'Копировать'; }, 1200);
  });
  row.append(content, copy);
  return row;
}
function card(subscription) {
  const node = document.createElement('article');
  node.className = `card ${subscription.status === 'cancelled' ? 'cancelled' : ''} ${daysUntil(subscription.nextPaymentDate) < 0 && subscription.status !== 'cancelled' ? 'overdue' : ''}`;
  const header = document.createElement('div'); header.className = 'card-header';
  header.append(textElement('div', subscription.serviceName, 'service'), textElement('div', subscription.status === 'cancelled' ? 'отменена' : dueLabel(subscription), 'due'));
  node.append(header);
  node.append(copyRow('Аккаунт', subscription.accountLabel));
  if (subscription.amount || subscription.currency) node.append(copyRow('Сумма', [subscription.amount, subscription.currency].filter(Boolean).join(' ')));
  node.append(copyRow('Последняя карта', subscription.lastPayment?.paymentMethod || 'ещё не отмечена'));
  node.append(copyRow('Следующий платёж', subscription.nextPaymentDate || '—'));
  if (subscription.lastPayment?.paidAt) node.append(textElement('div', `Последняя оплата: ${subscription.lastPayment.paidAt} · доступ до ${subscription.lastPayment.paidThrough}`, 'hint'));
  const actions = document.createElement('div'); actions.className = 'card-actions';
  const edit = textElement('button', 'Изменить', 'button secondary small'); edit.type = 'button'; edit.onclick = () => openEditor(subscription);
  const pay = textElement('button', 'Оплачено', 'button primary small'); pay.type = 'button'; pay.onclick = () => openPayment(subscription);
  const gift = textElement('button', 'Подарочный период', 'button secondary small'); gift.type = 'button'; gift.onclick = () => openGift(subscription);
  const toggle = textElement('button', subscription.status === 'cancelled' ? 'Возобновить' : 'Отменить', 'button secondary small danger'); toggle.type = 'button'; toggle.onclick = () => {
    subscription.status = subscription.status === 'cancelled' ? 'active' : 'cancelled'; save(); render();
  };
  actions.append(edit, pay, gift, toggle); node.append(actions);
  return node;
}
function renderCurrent(subscription) {
  $('currentCard').replaceChildren(card(subscription));
  $('currentSubscription').hidden = false;
}
function render() {
  const list = $('subscriptionList'); list.replaceChildren();
  const items = sortSubscriptionsByNextPayment(store.subscriptions, localDate());
  $('count').textContent = items.length ? `${items.length}` : '';
  $('emptyState').hidden = items.length > 0;
  items.forEach(item => list.appendChild(card(item)));
}
function resetEditor() {
  $('subscriptionEditor').reset(); $('editId').value = ''; $('nextPaymentDate').value = localDate(); $('formHeading').textContent = 'Новая подписка';
}
function openEditor(subscription = null, account = '') {
  resetEditor();
  if (subscription) {
    $('formHeading').textContent = 'Изменить подписку';
    $('editId').value = subscription.id; $('serviceName').value = subscription.serviceName; $('accountLabel').value = subscription.accountLabel;
    $('amount').value = subscription.amount || ''; $('currency').value = subscription.currency || ''; $('nextPaymentDate').value = subscription.nextPaymentDate || localDate();
  } else $('accountLabel').value = account;
  $('subscriptionForm').hidden = false; $('serviceName').focus();
}
function openPayment(subscription) {
  paymentTargetId = subscription.id; $('paymentEditor').reset(); $('paidAt').value = localDate(); $('paymentMethod').value = subscription.lastPayment?.paymentMethod || ''; $('paidThroughRow').hidden = true; $('paymentForm').hidden = false;
}
function openGift(subscription) {
  giftTargetId = subscription.id; $('giftEditor').reset(); $('giftUntil').min = subscription.nextPaymentDate; $('giftForm').hidden = false;
}
$('pasteAccount').addEventListener('click', () => {
  const value = clipboard.readText().trim();
  if (!value) { setStatus('Сначала скопируйте email, логин или метку аккаунта.'); return; }
  const matches = findSubscriptionsByAccount(store.subscriptions, value);
  if (matches.length === 1) { renderCurrent(matches[0]); setStatus('Найдена существующая подписка.'); return; }
  if (matches.length > 1) { $('currentCard').replaceChildren(...matches.map(card)); $('currentSubscription').hidden = false; setStatus('Найдено несколько совпадений — выберите нужную карточку.'); return; }
  $('currentSubscription').hidden = true; openEditor(null, value); setStatus('Совпадений нет — аккаунт вставлен в новую подписку.');
});
$('addSubscription').addEventListener('click', () => openEditor());
$('closeCurrent').addEventListener('click', () => { $('currentSubscription').hidden = true; });
$('closeSubscriptionForm').addEventListener('click', () => { $('subscriptionForm').hidden = true; });
document.querySelectorAll('[data-close-panel]').forEach(button => button.addEventListener('click', () => { $(button.dataset.closePanel).hidden = true; }));
$('paymentPeriod').addEventListener('change', () => { $('paidThroughRow').hidden = $('paymentPeriod').value !== 'custom'; $('paidThrough').required = $('paymentPeriod').value === 'custom'; });
$('subscriptionEditor').addEventListener('submit', event => {
  event.preventDefault();
  const id = $('editId').value || crypto.randomUUID();
  const record = { id, serviceName: $('serviceName').value.trim(), accountLabel: $('accountLabel').value.trim(), amount: $('amount').value.trim(), currency: $('currency').value.trim(), nextPaymentDate: $('nextPaymentDate').value, accessUntil: $('nextPaymentDate').value, status: 'active', remindersEnabled: true };
  const index = store.subscriptions.findIndex(item => item.id === id);
  if (index >= 0) store.subscriptions[index] = { ...store.subscriptions[index], ...record }; else store.subscriptions.push(record);
  save(); render(); $('subscriptionForm').hidden = true; setStatus('Подписка сохранена.');
});
$('paymentEditor').addEventListener('submit', event => {
  event.preventDefault(); const index = store.subscriptions.findIndex(item => item.id === paymentTargetId); if (index < 0) return;
  try { store.subscriptions[index] = applyPayment(store.subscriptions[index], { paidAt: $('paidAt').value, paymentMethod: $('paymentMethod').value, period: $('paymentPeriod').value, paidThrough: $('paidThrough').value }); save(); render(); renderCurrent(store.subscriptions[index]); $('paymentForm').hidden = true; setStatus('Оплата отмечена.'); } catch (error) { setStatus(error.message); }
});
$('giftEditor').addEventListener('submit', event => {
  event.preventDefault(); const index = store.subscriptions.findIndex(item => item.id === giftTargetId); if (index < 0) return;
  try { store.subscriptions[index] = applyGiftPeriod(store.subscriptions[index], $('giftUntil').value); save(); render(); renderCurrent(store.subscriptions[index]); $('giftForm').hidden = true; setStatus('Подарочный период добавлен.'); } catch (error) { setStatus(error.message); }
});
render();
