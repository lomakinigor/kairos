# Kairos — Desktop Clock Widget

Десктопный виджет-часы для Windows. Electron + HTML Canvas. Всегда поверх окон.

## Стек
- Electron 28+ (no external runtime deps)
- HTML5 Canvas — рисование циферблатов
- Web Audio API — звуки напоминаний
- Node.js fs — хранение данных в userData JSON

## Архитектура
- `main.js` — main process: окно, IPC, autostart, хранение данных
- `renderer/` — виджет: два циферблата на Canvas, логика таймера
- `settings/` — окно настроек напоминаний

## Запуск
```
npm install
npm start
```

## Правила разработки
- Не добавлять внешние npm-зависимости без необходимости
- nodeIntegration: true допустимо (нет remote content)
- Все данные хранятся через `app.getPath('userData')` в main process
- IPC только через `ipcMain.on` / `ipcRenderer.send` (sync только для get-reminders)
