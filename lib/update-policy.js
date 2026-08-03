function getTextScale(canvasSize) {
  const numericSize = Number(canvasSize) || 120;
  return Math.max(0.65, Math.min(1.75, numericSize / 120));
}

function shouldShowReleaseNotes(currentVersion, lastSeenVersion) {
  return Boolean(currentVersion) && currentVersion !== lastSeenVersion;
}

function isLegacyKairosElectronEntry(name, command) {
  if (name !== 'Electron' || typeof command !== 'string') return false;
  const normalized = command.replace(/\//g, '\\').toLowerCase();
  return normalized.includes('electron') && normalized.includes('projects\\kairos');
}

module.exports = { getTextScale, shouldShowReleaseNotes, isLegacyKairosElectronEntry };
