# Kairos AI Assistant — Spec

## Problem statement

Добавить в Kairos быстрый перевод RU ↔ EN и простое объяснение IT-терминов, сохранив неизменными размеры и назначение основного виджета.

## User stories

- Как пользователь, я открываю AI-помощник из контекстного меню, не расширяя часы.
- Как пользователь, я вставляю русский или английский текст и получаю перевод на другой язык.
- Как новичок, я ввожу IT-термин и получаю простое объяснение, бытовой пример и назначение.
- Как внешний пользователь, я вижу остаток из пяти ежедневных запросов.
- Как владелец, я использую настроенную локально установку без дневного лимита.

## Acceptance criteria

1. Основное окно Kairos сохраняет текущие размеры.
2. Контекстное меню содержит пункт `Переводчик и IT-помощник`.
3. Открывается не более одного assistant-окна размером 520 × 600 px.
4. Вкладки `Перевод` и `IT-термин` доступны с клавиатуры.
5. Кириллический текст помечается как `Русский → Английский`, латинский — `Английский → Русский`.
6. Пустой ввод и текст длиннее 4 000 символов не отправляются.
7. `Ctrl+Enter` отправляет запрос.
8. Ответ можно скопировать.
9. Внешняя установка получает не более 5 успешных запросов за сутки UTC.
10. Owner-токен снимает дневное ограничение и не входит в репозиторий/установщик.
11. OpenAI API key существует только в secret-хранилище Worker.
12. Сетевые, quota- и provider-ошибки показываются понятным русским текстом и не влияют на часы/таймер.

## Негативные сценарии и edge cases

- Строка из цифр/символов без букв: запрос отклоняется с просьбой ввести текст.
- Смешанный RU/EN: направление определяется по количеству букв; названия продуктов и code fragments сохраняются.
- Повторный быстрый клик: второй запрос не отправляется, пока первый выполняется.
- Ответ без ожидаемой структуры: показывается как обычный текст без падения UI.
- Исчерпан лимит: Worker возвращает 429 и время следующего сброса.
- Нет production URL: UI сообщает, что AI-сервис не настроен.
- Недействительный owner-токен обрабатывается как обычный внешний запрос.

## Affected files/modules

- `main.js`: assistant window, IPC, installation ID, локальный owner-token.
- `assistant/assistant.html`, `assistant/assistant.css`, `assistant/assistant.js`: UI.
- `lib/language.js`: определение направления.
- `worker/worker.js`: OpenAI proxy и quota enforcement.
- `worker/wrangler.toml.example`: конфигурация deploy без secrets.
- `test/`: unit и integration tests.
- `package.json`: test scripts.

## Data model

- `userData/installation-id.txt`: случайный UUID установки.
- `userData/owner-token.txt`: опциональный токен только на машине владельца.
- Worker KV: `quota:<UTC-date>:<identity-hash>` → число успешных запросов, TTL 48 часов.

## API contract

`POST /v1/assistant`

Request:

```json
{ "mode": "translate|term", "text": "...", "installationId": "uuid" }
```

Optional header: `X-Kairos-Owner: <token>`.

Success:

```json
{ "result": "...", "remaining": 4, "unlimited": false }
```

Errors use `{ "error": "code", "message": "русский текст" }` with HTTP 400/429/502/503.

## Test plan

- Unit: direction detection, validation, prompt construction, quota decisions.
- Integration: Worker request contract with fake KV and fake OpenAI fetch.
- Static UI smoke test: required controls and IPC channel exist.
- Manual Electron smoke: open, switch tabs, submit, copy, close/reopen.

## Rollback plan

Удалить пункт меню, IPC handlers, папки `assistant/`, `lib/`, `worker/` и связанные test scripts. Существующие часы, таймер и напоминания не используют новые модули.
