# Аудит LiveNotebook — что работает и что чинить

## Что работает
- **Auth**: `/auth`, Google OAuth, onboarding-gate, sign-out без 401-шторма.
- **Календарь и уроки**: `listLessons`, `moveLesson` (с revive существующей строки и rollback), `regenerateLessons` (upsert по уникальному индексу), инвалидация `["lessons"]`/`["attendance"]` после мутаций.
- **Синхронизация посещаемости**: `syncAttendanceForLesson` корректно создаёт/обновляет/soft-удаляет строки при смене статуса урока.
- **Карточка ученика**: счётчики циклов, шкала «12 уроков», авто-долг при переходе цикла.
- **AI-ассистент**: серверный `OPENAI_API_KEY`, локализованные 401/429/402, tool-loop до 10 шагов, история в `chat_messages`.
- **Webhooks**: timing-safe hook-auth, кэш секрета 5 мин, `lesson-reminders` уважает `remind_lessons` и чистит 410/404.
- **Backup**: `owner_id`/`user_id` жёстко переписываются на текущего пользователя, построчная Zod-валидация.
- **Sheet**: portal в `document.body`, скролл и body-lock работают.
- **Темы**: пол ↔ тема (female→bloom, male→classic), sign-out сбрасывает в classic.
- **SSR**: fallback для Supabase-ключей в `vite.config.ts`, browser-only guard в клиенте.

## Что НЕ работает / риски (в порядке приоритета)

**1. Backup ломается на статусах ДЗ.** `homeworkRowSchema` разрешает только `assigned|done|skipped`, а БД (`db.ts`) хранит `assigned|done|not_done|partial`. Импорт валится.

**2. AI не синхронизирует attendance.** `execTool → update_lesson_status` пишет `.update({ status })` напрямую, минуя `syncAttendanceForLesson` — из-за этого журнал расходится с календарём при действиях через ассистента.

**3. AI `add_homework` использует несуществующий статус `skipped`** вместо `not_done|partial`.

**4. Attendance/Finance inserts без `owner_id`** в `StudentRoom.tsx` (авто-долг и вставка attendance). При RLS INSERT-политике `owner_id = auth.uid()` строка может быть отклонена или уйдёт с NULL.

**5. Finance.currency без `USDT`.** В `db.ts` тип `RUB|USD|EGP`, а backup и AI уже принимают `USDT` — типы и рантайм расходятся.

**6. VAPID: старые push-подписки мёртвые.** После ротации ключей существующие строки не работают до первой отправки (потом авто-чистка 410). Нужен UI-нудж «переподпишитесь».

**7. `regenerateLessons` на `/schedule` падает молча** — только `console.error`, пользователь не видит тост.

**8. `lessons_conducted` в TABLES бэкапа** — фантомная таблица, экспорт упадёт, если её нет в БД.

## План исправлений (только код, минимально инвазивно)

### Шаг 1 — Backup (`src/lib/backup.functions.ts`)
- В `homeworkRowSchema.status`: заменить `["assigned","done","skipped"]` на `["assigned","done","not_done","partial"]`.
- Убрать `lessons_conducted` из `TABLES` и `TABLE_SELECTS`, либо обернуть экспорт `try/catch` с `continue` при 42P01.

### Шаг 2 — AI (`src/lib/ai.functions.ts`)
- В `update_lesson_status` вместо прямого `.update()` вызывать общий helper: продублировать `syncAttendanceForLesson` из `lessons.functions.ts` (или вынести в `src/lib/lessons.server.ts` и импортировать в обоих местах).
- В `add_homework` `status`-enum: `["assigned","done","not_done","partial"]`.

### Шаг 3 — StudentRoom (`src/components/StudentRoom.tsx`)
- В `sup.from("attendance").insert(...)` и в insert `finance` при авто-долге добавить `owner_id: user.id` (взять из `supabase.auth.getUser()` один раз в компоненте).

### Шаг 4 — Тип Finance (`src/lib/db.ts`)
- `currency: "RUB" | "USD" | "EGP" | "USDT"`.

### Шаг 5 — Schedule autorun (`src/routes/_authenticated/schedule.tsx`)
- В `.catch` показать `toast.error("Не удалось обновить расписание уроков")` в дополнение к `console.error`.

### Шаг 6 — Push refresh nudge (`src/lib/push.ts` / `settings/UserSettingsSection.tsx`)
- При загрузке настроек, если `getSubscription()` вернул старую подписку с чужим `applicationServerKey`, автоматически `unsubscribe()` и попросить включить заново тостом.

### Технические заметки
- Все правки — фронт + серверные функции, миграций БД не требуется.
- RLS/GRANT не меняем.
- VAPID секреты уже в порядке, только UI-нудж для устаревших подписок.

Подтвердите план (или скажите, какие шаги пропустить) — и я всё внесу.
