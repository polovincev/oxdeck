# Публикация OxDeck

## 1. Создание репозитория на GitHub

На GitHub нажмите **New repository**, укажите имя `oxdeck` и выберите **Public**. Не добавляйте README, `.gitignore` или лицензию: эти файлы уже есть локально.

Затем выполните в папке проекта:

```bash
git remote add origin https://github.com/polovincev/oxdeck.git
git add .
git commit -m "Initial release"
git push -u origin main
```

## 2. Первый релиз

Текущая версия проекта — `0.1.0`. Создайте и отправьте соответствующий тег:

```bash
git tag -a v0.1.0 -m "OxDeck v0.1.0"
git push origin v0.1.0
```

Тег запустит workflow **Release macOS**. Его прогресс будет виден во вкладке **Actions**, а готовые ZIP-файлы появятся во вкладке **Releases**:

- `arm64` — Mac с Apple Silicon (M1, M2, M3 и новее);
- `x64` — Mac на Intel.

## 3. Следующие версии

Сначала перенесите описание изменений из секции `Unreleased` в новую версию внутри `CHANGELOG.md` и зафиксируйте его. Затем выберите тип версии:

- `patch` — исправление: `0.1.0` → `0.1.1`;
- `minor` — новая обратно совместимая возможность: `0.1.0` → `0.2.0`;
- `major` — несовместимое изменение: `0.1.0` → `1.0.0`.

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog"
pnpm version patch --message "chore: release v%s"
git push origin main --follow-tags
```

`pnpm version` обновит `package.json`, создаст commit и Git-тег. Отправленный тег снова запустит сборку и создаст новую страницу GitHub Release с автоматически сформированными заметками.

## Локальная сборка

```bash
pnpm make:arm64
pnpm make:x64
```

Приложения появятся в папке `out`, а готовые ZIP-файлы — в `out/releases`.

## Подпись macOS

Текущие сборки не подписаны сертификатом Apple и не нотарифицированы. На другом Mac их можно открыть через контекстное меню **Открыть** или через **System Settings → Privacy & Security → Open Anyway**. Для распространения без предупреждения Gatekeeper понадобится подписка Apple Developer, сертификат `Developer ID Application` и нотарификация сборки.
