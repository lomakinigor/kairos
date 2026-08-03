# Spec review

- [x] Понятна бизнес-цель
- [x] Есть acceptance criteria
- [x] Есть негативные сценарии
- [x] Описаны edge cases
- [x] Указана backward compatibility
- [x] Есть стратегия тестирования
- [x] Нет лишнего scope
- [x] Задачу можно разбить на короткие шаги

Gate: дизайн и update-flow подтверждены пользователем.

## Implementation review

- [x] Реализация начата с падающих тестов
- [x] Text scaling вынесен в чистую функцию
- [x] Startup migration удаляет только Electron-команду, связанную с Kairos
- [x] Update errors не блокируют запуск
- [x] Update не устанавливается принудительно
- [x] Release notes содержат лимит 5 запросов в день
- [x] NSIS, blockmap и latest.yml собраны с совпадающими именами
- [x] 16 тестов проходят

Не выполнено в коде: публикация GitHub Release — отдельное внешнее действие.
