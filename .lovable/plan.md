## Что добавим

### 1. CSV-экспорт (5 отдельных файлов)
- В `src/lib/backup.functions.ts` добавить новую серверную функцию `exportCsv`, возвращающую `{ students, finance, attendance, homework, lessons }` — массивы CSV-строк (UTF-8 + BOM, разделитель `,`, экранирование кавычек). Существующий JSON-экспорт не трогаем.
- В `src/components/settings/BackupSection.tsx` добавить кнопку «Экспорт в CSV» рядом с JSON. По клику — вызвать `exportCsv`, упаковать каждый файл `students.csv / finance.csv / attendance.csv / homework.csv / lessons.csv` в zip через крошечную ручную реализацию zip (uncompressed STORE) либо просто скачивать 5 файлов подряд через `<a download>`. Выбираем второй вариант — без новых зависимостей.

### 2. Фильтры и сортировка учеников (`src/routes/_authenticated/students.tsx`)
Над списком (под поиском) — компактная панель `Card` с контролами:
- **Поиск по имени** — уже есть, оставляем.
- **Предмет** — `Select` со списком уникальных `subject` из `students` + «Все».
- **Долг** — кнопки-чипы: «Все / Должники / Оплачено / Без платежей» (используем уже считающийся `hasUnpaid` + `fin.length`).
- **Скоро урок** — чип «Урок в ближайшие 7 дней» (фильтр по таблице `lessons`, `status='planned'`, `scheduled_date` в диапазоне). Подтягиваем уроки через существующий хук (`useLessons`) или быстрый локальный запрос в `db.ts`.
- **Активные / архив** — чипы «Активные / Архив». «Архив» = `deleted_at IS NOT NULL`. Сейчас `useStudents` отдаёт только активных — расширим: добавим параметр `includeArchived` либо отдельный хук `useStudentsAll`, и для «Архив» показываем удалённых (с пометкой). По умолчанию — «Активные».
- **Сортировка** — `Select`: По имени (А→Я / Я→А), По дате добавления (новые / старые), По дн/нед (больше / меньше).

Состояние фильтров — локальный `useState`, никакой персистентности. UI — те же `Card / Button / Input / Select / Badge`, существующий дизайн не меняем.

### 3. Раздельные напоминания

**Миграция:** добавить в `user_settings` три булевых колонки:
- `remind_lessons boolean NOT NULL DEFAULT true`
- `remind_payments boolean NOT NULL DEFAULT true`
- `remind_homework boolean NOT NULL DEFAULT true`

**Бэкенд:**
- В `src/lib/schemas.ts` — расширить `userSettingsSchema` тремя булевыми полями.
- В `src/lib/settings.functions.ts` — добавить дефолты в `DEFAULTS`.
- В `src/routes/api/public/hooks/lesson-reminders.ts` — перед отправкой push'а тянуть `user_settings.remind_lessons` для каждого `owner_id` (батчем `.in('user_id', ownerIds)`) и пропускать уроки тех, у кого выключено.
- Заготовка для оплат и ДЗ: добавить параллельные хуки `payment-reminders.ts` и `homework-reminders.ts` под `/api/public/hooks/` по тому же шаблону (читают `finance` с `is_paid=false`+ближайший `pay_date`, и `homework` с `due_date=сегодня/завтра`, `status='assigned'`), уважают соответствующий флаг. Cron-расписание для них пользователь подключит позже — код будет готов.

**UI** (`UserSettingsSection.tsx`): три переключателя `Switch` в новом блоке «Напоминания», под существующим «Напомнить за, мин». Сохраняются через тот же `updateSettings`.

### Что НЕ трогаем
- Существующий JSON backup / import.
- Дизайн, темы, шрифты, шапки, навигацию.
- Логику auth, RLS, существующие миграции.
- Splash, haptics, AI-ассистента.

## Технические детали

**Файлы — изменения:**
- `src/lib/backup.functions.ts` — `+exportCsv` server fn.
- `src/components/settings/BackupSection.tsx` — кнопка CSV.
- `src/components/settings/UserSettingsSection.tsx` — блок «Напоминания» (3 Switch).
- `src/routes/_authenticated/students.tsx` — панель фильтров + сортировка, расширенный `filtered`.
- `src/lib/db.ts` — добавить `useStudentsAll()` (включая `deleted_at`).
- `src/lib/schemas.ts` — `+remind_lessons/payments/homework` в `userSettingsSchema`.
- `src/lib/settings.functions.ts` — дефолты.
- `src/routes/api/public/hooks/lesson-reminders.ts` — фильтрация по `remind_lessons`.

**Файлы — новые:**
- `src/routes/api/public/hooks/payment-reminders.ts`
- `src/routes/api/public/hooks/homework-reminders.ts`

**Миграция:** одна, аддитивная — `ALTER TABLE user_settings ADD COLUMN remind_lessons/payments/homework boolean NOT NULL DEFAULT true`. Данные не теряются, существующие пользователи получают `true` по умолчанию. Откат: `DROP COLUMN` (не нужен, изменение безопасное).

**CSV-формат:** UTF-8 с BOM (`\uFEFF`), заголовки — реальные имена колонок БД, даты — ISO, числа — точкой. Это открывается в Excel/Google Sheets «из коробки».
