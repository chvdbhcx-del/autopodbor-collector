# Сборщик для @autosearchcorapt_bot

Раз в час (GitHub Actions, `collect.yml`):
1. обходит площадки, которые бот сам открыть не может (список `sites` в `config.yaml`, модули `src/sources/`);
2. читает новые посты Telegram-каналов продавцов (`channels`), склеивает альбомы одной машины;
3. отправляет всё боту JSON-пакетом от отдельного Telegram-аккаунта и просит бот обновить подписки (`#refresh`).

Состояние (что уже отправлено) хранится в ветке `state`.

## Секреты (Settings → Secrets and variables → Actions)
| Имя | Что это |
|---|---|
| `TG_API_ID`, `TG_API_HASH` | ключи приложения с https://my.telegram.org → API development tools (для запасного аккаунта) |
| `TG_SESSION` | строка сессии, её печатает `npm run login` |
| `ANTHROPIC_API_KEY` | необязательно: перевод описаний и разбор постов каналов |
| `WG_CONF` | необязательно: WireGuard-конфиг; включается переменной `USE_WG=1` |

После первого запуска отправьте боту с админского аккаунта `/ingest <id аккаунта сборщика>` (id печатается в логе).

## Пробы
См. `probe/README.md`.
