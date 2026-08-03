const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getTextScale,
  shouldShowReleaseNotes,
  isLegacyKairosElectronEntry,
} = require('../lib/update-policy');

test('scales widget text from canvas size with readable limits', () => {
  assert.equal(getTextScale(120), 1);
  assert.equal(getTextScale(50), 0.65);
  assert.equal(getTextScale(260), 1.75);
  assert.equal(getTextScale(180), 1.5);
});

test('shows release notes only for an unseen current version', () => {
  assert.equal(shouldShowReleaseNotes('1.1.0', null), true);
  assert.equal(shouldShowReleaseNotes('1.1.0', '1.0.5'), true);
  assert.equal(shouldShowReleaseNotes('1.1.0', '1.1.0'), false);
});

test('recognizes only legacy Electron startup commands tied to Kairos', () => {
  assert.equal(isLegacyKairosElectronEntry('Electron', '"D:\\AI\\VS Code\\Local\\projects\\kairos\\node_modules\\electron\\dist\\electron.exe" .'), true);
  assert.equal(isLegacyKairosElectronEntry('Electron', 'C:\\other-app\\electron.exe .'), false);
  assert.equal(isLegacyKairosElectronEntry('Kairos', 'C:\\Program Files\\Kairos\\Kairos.exe'), false);
  assert.equal(isLegacyKairosElectronEntry('Slack', 'C:\\Slack\\slack.exe'), false);
});

test('ships accessible release notes with the five requests per day notice', () => {
  const releases = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'updates', 'releases.json'), 'utf8'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'updates', 'updates.html'), 'utf8');
  assert.match(releases['1.1.0'].limit, /5 запросов в день/);
  assert.match(html, /aria-label="Ограничение запросов"/);
  assert.match(html, /id="primary"/);
});

test('delays update checks and never enables dev autostart', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /setTimeout\(\(\) => autoUpdater\.checkForUpdates/);
  assert.match(main, /if \(app\.isPackaged\)/);
  assert.match(main, /args: \['--autostart'\]/);
  assert.doesNotMatch(main, /checkForUpdatesAndNotify/);
});
