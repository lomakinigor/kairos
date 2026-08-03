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

Никогда не помещать значения secrets в репозиторий, Electron renderer или установщик.
