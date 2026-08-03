# Kairos AI Worker

Backend-прокси скрывает OpenAI API key и ограничивает внешние установки пятью успешными запросами в сутки.

## Deployment

1. Скопировать `wrangler.toml.example` в `wrangler.toml`.
2. Создать KV namespace: `npx wrangler kv namespace create QUOTA`.
3. Вставить полученный namespace ID в `wrangler.toml`.
4. Добавить secrets: `OPENAI_API_KEY` и случайный `OWNER_TOKEN` через `wrangler secret put`.
5. Выполнить `npx wrangler deploy`.
6. Записать URL Worker в `%APPDATA%/kairos/assistant-config.json`:

```json
{ "apiUrl": "https://kairos-ai.<account>.workers.dev" }
```

7. Только на машине владельца записать тот же `OWNER_TOKEN` в `%APPDATA%/kairos/owner-token.txt`.

## Installation analytics

1. Создать D1 database и применить `schema.sql`.
2. Добавить binding `DB` в `wrangler.toml`.
3. Добавить случайный `TELEMETRY_SALT` через `wrangler secret put`.
4. Desktop отправляет `installationId` и version в `/v1/telemetry`; D1 хранит только salted hash.
5. `/v1/stats` доступен только с `OWNER_TOKEN`.

Никогда не помещать значения secrets в репозиторий, Electron renderer или установщик.
