# Фаза 2 — Таблица `lessons` + история календаря

## 1. Миграция БД (одной транзакцией)

### 1.1 Enum + таблица `lessons`
```sql
CREATE TYPE lesson_status AS ENUM ('planned','completed','cancelled','moved');

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  duration_min int NOT NULL DEFAULT 60,
  status lesson_status NOT NULL DEFAULT 'planned',
  notes text,
  source_slot_id uuid,            -- из какого schedule_slot создан
  moved_from_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, scheduled_date, scheduled_time)
);
CREATE INDEX ON public.lessons (owner_id, scheduled_date);
CREATE INDEX ON public.lessons (student_id, scheduled_date);
```
+ GRANT authenticated/service_role, RLS `auth.uid() = owner_id`, триггер `set_owner_id`, триггер `update_updated_at`.

### 1.2 FK на студентов для целостности
Добавить `ON DELETE CASCADE` на `attendance.student_id`, `finance.student_id`, `homework.student_id`, `schedule_slots.student_id`, `push_subscriptions` (FK не нужен).

### 1.3 Удалить `lessons_conducted`
Drop таблицы — заменим вьюхой `v_lessons_conducted` (`COUNT(*) FILTER (WHERE status='completed')` GROUP BY student_id).

## 2. Server functions (`src/lib/lessons.functions.ts`)
Все под `requireSupabaseAuth`:
- `listLessons({ from, to })` — для календаря
- `setLessonStatus({ id, status, notes? })` — Провёл/Отменил
- `moveLesson({ id, new_date, new_time })` — старая → `moved`, новая строка с `moved_from_id`
- `regenerateLessons()` — окно −3 мес … +1 мес:
  - читает `schedule_slots`
  - разворачивает в даты по `day_of_week`
  - upsert по UNIQUE (skip конфликтов)
  - для прошлых дат: смотрит `attendance` → `completed/cancelled`, иначе `completed`
  - для будущих: `planned`
  - не трогает существующие `cancelled/moved/completed`
- При INSERT/UPDATE/DELETE `schedule_slots` — вызывать `regenerateLessons` (триггер БД или явный вызов из UI)

## 3. UI

### 3.1 `/schedule`
- Календарь читает `lessons` (через `listLessons` + useSuspenseQuery)
- На каждом уроке: бейдж статуса + кнопки **Провёл / Отменил / Перенёс**
- «Перенёс» — Dialog с DatePicker + TimePicker
- Фильтр по статусу (планируемые / все)

### 3.2 `/students/$id`
- Заменить чтение `lessons_conducted` на вьюху `v_lessons_conducted`
- Добавить вкладку «История уроков» (последние 20 из `lessons`)

### 3.3 Settings
- Кнопка «Пересоздать историю уроков» → `regenerateLessons()`
- Автозапуск 1 раз: если у пользователя 0 строк в `lessons` и есть `schedule_slots`

## 4. Связанные изменения
- `lesson-reminders` cron → читает из `lessons WHERE scheduled_date = today() AND status = 'planned'` вместо разворота `schedule_slots` (поддерживает переносы/отмены)
- `ai.functions.ts` → статистика из `lessons` + `v_lessons_conducted`
- `attendance` остаётся для обратной совместимости, но новые UI пишут в `lessons.status`

## 5. Проверка
1. Миграция применяется без ошибок
2. После «Пересоздать историю» появляются записи за 3 месяца
3. Календарь рендерит уроки с правильными статусами
4. Кнопки Провёл/Отменил меняют статус, счётчик в карточке студента обновляется
5. Перенос создаёт новую запись, старая = `moved`
6. Cron-напоминания не приходят на отменённые/перенесённые

## Технические детали
- UNIQUE `(student_id, date, time)` защищает от дублей при повторной генерации
- `v_lessons_conducted` — обычная вьюха, RLS наследуется от `lessons`
- `moved_from_id` self-FK с `ON DELETE SET NULL` — удаление оригинала не каскадит на новую
- Окно генерации (3 мес / 1 мес) вынесем в константу
