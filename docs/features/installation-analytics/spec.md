# Spec: owner-only installation analytics

## Problem statement

Считать уникальные фактически запущенные установки Kairos и показывать агрегаты только владельцу.

## User stories

- Как владелец, я вижу общее число установок, новые установки и активность.
- Как владелец, я вижу распределение установок по версиям.
- Как сторонний пользователь, я не вижу элементов аналитики и не испытываю задержек запуска.

## Data model

Cloudflare D1 table `installations`:

- `installation_hash TEXT PRIMARY KEY`
- `first_seen TEXT NOT NULL`
- `last_seen TEXT NOT NULL`
- `first_version TEXT NOT NULL`
- `current_version TEXT NOT NULL`

Никакие IP или hardware identifiers не записываются.

## API

### `POST /v1/telemetry`

Body: `{ installationId, version }`. Worker хеширует `installationId` с `TELEMETRY_SALT` и выполняет upsert. Ответ `204`.

### `GET /v1/stats`

Требует `x-kairos-owner`. Возвращает `total`, `newToday`, `new7Days`, `new30Days`, `active30Days`, `versions[]`. При неверном token — `404`, чтобы endpoint не раскрывался.

## Desktop behavior

- Через 5 секунд после `ready` main process отправляет telemetry fire-and-forget с timeout.
- Контекстное меню показывает «Статистика установок» только если локально существует owner-token.
- Owner window запрашивает `/v1/stats`; внешняя установка не содержит entry point к статистике.
- Ошибки отображаются только в owner window.

## Acceptance criteria

- Повторный запуск одного installation ID не увеличивает total.
- Новая установка увеличивает total на один.
- IP не входит ни в SQL schema, ни в hash input.
- Stats без owner-token возвращает 404.
- Telemetry failure не влияет на создание основного окна.
- Пункт статистики отсутствует без локального owner-token.
- Только владелец видит aggregate data; raw IDs не возвращаются.

## Test plan

- Worker integration: upsert, unique count, version update, owner authorization.
- UI component: owner stats window fields and error state.
- Main-process code test: delayed non-blocking telemetry and owner-only menu entry.
- Production D1 migration and live owner stats request.

## Rollback

- Удалить вызов telemetry из desktop release.
- Отключить Worker route; существующая D1 table может быть сохранена или удалена отдельно.
