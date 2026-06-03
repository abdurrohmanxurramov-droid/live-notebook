# Фаза 3 — Полировка и устойчивость

## 1. Миграция БД (одной транзакцией)

### 1.1 Soft delete везде
Добавить `deleted_at timestamptz` в: `students`, `lessons`, `attendance`, `finance`, `homework`, `schedule_slots`.
- Индексы `WHERE deleted_at IS NULL` на горячих колонках.
- RLS политики оставляем как есть (читаем `WHERE deleted_at IS NULL` в server fn).
- Каскадного хард-удаления не меняем — добавим server fn `softDeleteStudent` (помечает student + связанные записи).

### 1.2 Таблица `user_settings`
```sql
CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY,
  default_currency text NOT NULL DEFAULT 'RUB',
  default_lesson_duration int NOT NULL DEFAULT 60,
  default_lesson_price numeric NOT NULL DEFAULT 0,
  week_starts_on smallint NOT NULL DEFAULT 1,
  remind_before_min int NOT NULL DEFAULT 60,
  locale text NOT NULL DEFAULT 'ru',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
+ GRANT, RLS `auth.uid() = user_id`, триггер `update_updated_at`.

### 1.3 Резервные копии (export)
Без отдельной таблицы. Server fn `exportBackup()` собирает JSON со всеми пользовательскими таблицами, отдаёт файл скачиванием. `importBackup()` принимает JSON и делает upsert по id (с пометкой owner_id из auth.uid()).

## 2. Server functions

### 2.1 `src/lib/settings.functions.ts`
- `getSettings()` — read-or-create row.
- `updateSettings(partial)` — Zod-валидация полей.

### 2.2 `src/lib/backup.functions.ts`
- `exportBackup()` → `{ version, exported_at, tables: {...} }`.
- `importBackup({ json })` → upsert, dry-run + counts.

### 2.3 Soft delete
В `students.functions.ts` / `lessons.functions.ts` / `finance.functions.ts` / `homework.functions.ts`:
- `softDelete{Entity}(id)` — `UPDATE ... SET deleted_at = now()`.
- `restore{Entity}(id)` — `SET deleted_at = NULL`.
- Все list-функции фильтруют `WHERE deleted_at IS NULL` (опционально `include_deleted`).

### 2.4 Zod-схемы
`src/lib/schemas.ts` — общие схемы для студента, урока, платежа, ДЗ. Используются и на сервере (`inputValidator`), и в формах (`zodResolver`).

## 3. UI

### 3.1 Поиск и фильтры
- `/students` — поиск по имени/предмету/телефону, фильтр «активные / в архиве».
- `/finance` — фильтр студент, период, статус оплаты.
- `/homework` — фильтр студент, статус.
- `/schedule` — фильтр студент + статус (уже есть частично).

### 3.2 Скелетоны
Заменить `isLoading` спиннеры на shadcn `<Skeleton>` на всех страницах списков.

### 3.3 Пустые состояния
Компонент `<EmptyState icon title description action />`. Подключить на пустые списки.

### 3.4 Корзина
`/settings` → секция «Корзина»: списки удалённых студентов / уроков / платежей / ДЗ с кнопкой «Восстановить».

### 3.5 Пользовательские настройки
`/settings` → секция «Настройки»: валюта по умолчанию, длительность урока, цена, начало недели, напоминание за N минут. Применяются как defaults в формах создания.

### 3.6 Бэкапы
`/settings` → секция «Резервные копии»:
- Кнопка «Скачать бэкап» → JSON-файл.
- Загрузка JSON → preview + кнопка «Импортировать».

### 3.7 Zod-валидация форм
Перевести все формы (`StudentForm`, `LessonForm`, `PaymentForm`, `HomeworkForm`) на `react-hook-form` + `zodResolver` со схемами из `src/lib/schemas.ts`.

## 4. Порядок выполнения

1. Миграция (soft delete + user_settings).
2. `schemas.ts` + server functions (settings, backup, soft delete).
3. Settings UI (настройки + корзина + бэкапы).
4. Формы → Zod.
5. Списки → поиск/фильтры + скелетоны + empty states.
6. Прогон по экранам, проверка билда.

## 5. Что НЕ делаем в этой фазе
- Cron-задачи бэкапов (только on-demand).
- Версионирование схемы импорта (только текущая версия).
- Pagination — отложим, пока списки маленькие.
