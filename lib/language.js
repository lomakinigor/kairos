const MAX_TEXT_LENGTH = 4000;

function validateAssistantInput(mode, text) {
  if (mode !== 'translate' && mode !== 'term') {
    throw new Error('Неизвестный режим помощника');
  }
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) throw new Error('Введите текст');
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new Error('Текст не должен превышать 4 000 символов');
  }
  return normalized;
}

function detectDirection(text) {
  const normalized = validateAssistantInput('translate', text);
  const hasCyrillic = /[А-Яа-яЁё]/.test(normalized);
  const hasLatin = /[A-Za-z]/.test(normalized);

  if (!hasCyrillic && !hasLatin) throw new Error('Введите текст на русском или английском');
  return hasCyrillic
    ? { source: 'ru', target: 'en', label: 'Русский → Английский' }
    : { source: 'en', target: 'ru', label: 'Английский → Русский' };
}

module.exports = { MAX_TEXT_LENGTH, detectDirection, validateAssistantInput };
