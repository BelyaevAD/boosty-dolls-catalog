# Референсы углублённого внутреннего поиска

## Внутренние реализации

### Discovery и очередь

- `scripts/update-data.mjs`
- Внутренний поиск Boosty, официальный каталог, Common Crawl, preflight, candidate states и weekly budgets.

### Классификация и API

- `scripts/lib/catalog.mjs`
- Общий Boosty scheduler, язык, релевантность, категории, пагинация постов и санитарная обработка.

### Автоматизация

- `.github/workflows/update-data.yml`
- Пятничный refresh, validation, data-only artifact/commit и запуск Pages.

### Проверки и отчёт

- `test/catalog-core.test.js`
- `scripts/validate-data.mjs`
- `scripts/validate-build.mjs`
- `RESEARCH_REPORT.md`

## Процедуры

- `boosty-it-catalog-discovery` — штатный updater, bounded batches, error gate и review.
- Agent OS `shape-spec` — сохранение границ, критериев и отката.
- Project CodeGuard — API allowlists, input validation, privacy-safe logging, CI least privilege и supply-chain pinning.
