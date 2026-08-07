# Референсы русскоязычного расширения

## Внутренние реализации

### Квалификация и классификация

- `scripts/lib/catalog.mjs`
- Язык, релевантность, категории, санитарная обработка, общий Boosty scheduler.

### Очередь и выпуск данных

- `scripts/update-data.mjs`
- Discovery, preflight, recheck, обновление опубликованных профилей, отчёт и snapshots.

### Проверки

- `scripts/validate-data.mjs`
- `scripts/validate-build.mjs`
- `test/catalog-core.test.js`

### Исследовательская база

- `RESEARCH_REPORT.md`
- Количественная оценка 11 сегментов и полного пула 240–300 профилей.

## Процедуры

- `boosty-it-catalog-discovery` — штатный updater, error gate, ручной review и Pages release.
- Agent OS `shape-spec` — компактная фиксация объёма, критериев и отката.
- Project CodeGuard — input validation, SSRF allowlists, privacy-safe logs, client-side и CI/supply-chain controls.
