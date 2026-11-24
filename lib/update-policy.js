function getTextScale(canvasSize) {
  const numericSize = Number(canvasSize) || 120;
  return Math.max(0.65, Math.min(1.75, numericSize / 120));
}

function shouldShowReleaseNotes(currentVersion, lastSeenVersion) {
  return Boolean(currentVersion) && currentVersion !== lastSeenVersion;
}

function isLegacyKairosElectronEntry(name, command) {
  if (!['Electron', 'electron.app.Electron'].includes(name) || typeof command !== 'string') return false;
  const normalized = command.replace(/\//g, '\\').toLowerCase();
  return normalized.includes('projects\\kairos\\node_modules\\electron\\dist\\electron.exe');
}

function isDuplicateKairosStartupEntry(name, command, executablePath) {
  if (name !== 'Kairos' || typeof command !== 'string' || !executablePath) return false;
  const value = (/REG_SZ\s+([^\r\n]+)/i.exec(command)?.[1] || command).trim().toLowerCase();
  const executable = executablePath.toLowerCase();
  return value === `"${executable}" --autostart` || value === `${executable} --autostart`;
}

function shouldAutoInstallUpdate(autostart, hasOpenWorkWindow) {
  return autostart && !hasOpenWorkWindow;
}

module.exports = { getTextScale, shouldShowReleaseNotes, isLegacyKairosElectronEntry, isDuplicateKairosStartupEntry, shouldAutoInstallUpdate };
