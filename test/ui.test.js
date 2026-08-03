const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('assistant window contains both approved tabs and accessible input', () => {
  const html = fs.readFileSync(path.join(root, 'assistant', 'assistant.html'), 'utf8');
  assert.match(html, /data-mode="translate"/);
  assert.match(html, /data-mode="term"/);
  assert.match(html, /textarea id="inputText"[^>]*maxlength="4000"/);
  assert.match(html, /aria-live="polite"/);
});

test('main process opens a separate fixed-size assistant window', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(main, /function openAssistant\(\)/);
  assert.match(main, /width: 520,[\s\S]*height: 600/);
  assert.match(main, /Переводчик и IT-помощник/);
  assert.match(main, /assistant-request/);
});

test('API secrets are not present in renderer files', () => {
  const files = ['assistant/assistant.html', 'assistant/assistant.css', 'assistant/assistant.js'];
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(content, /OPENAI_API_KEY|sk-[A-Za-z0-9_-]{20,}/);
  }
});
