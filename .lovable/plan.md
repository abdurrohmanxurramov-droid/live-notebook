## Диагностический отчёт

### Какие таблицы используются календарём
- **Календарь (`Calendar.tsx`)** читает только из таблицы **`lessons`** через server fn `listLessons` (фильтр по диапазону дат). `schedule_slots` календарём напрямую НЕ используется — это шаблон, из которого `regenerateLessons` создаёт реальные `lessons`.
- **Расписание по дням недели** (нижняя часть `/schedule`) читает **`schedule_slots`**.
- **Карточка ученика (`StudentRoom.tsx`)** читает только **`attendance`** и `homework`/`finance` — не читает `lessons` вообще.

### Почему некоторые ученики не отображаются в календаре
Если у ученика есть запись в `schedule_slots`, но соответствующие `lessons` ещё не сгенерированы в окне `[-3 мес, +1 мес]`, его в календаре не будет. `regenerateLessons` запускается только при добавлении нового слота (`AddSlotSheet`). Старые слоты, добавленные до этой логики, или вставленные напрямую — не порождают `lessons` автоматически. Также при первом открытии нет авто-вызова `regenerateLessons`.

### Почему «урок пройден» не засчитывается в карточке ученика
`setLessonStatus` обновляет только `lessons.status`. Запись в `attendance` НЕ создаётся. А `StudentRoom` считает пройденные уроки исключительно по `attendance` (`countedCount = att.filter(a => a.status==='present' || 'absent')`). Поэтому смена статуса урока в календаре никак не отражается на карточке ученика. Аналогично для `cancelled`/`moved` — `attendance` не обновляется.

Дополнительно: `setLessonStatus`/`moveLesson`/`deleteLesson` в `Calendar.tsx` инвалидируют только `["lessons"]`, но не `["attendance"]`, поэтому даже если бы attendance писалась — карточка не перерисовалась бы без рефреша.

### Минимальный список файлов к изменению
1. `src/lib/lessons.functions.ts` — расширить `setLessonStatus`, чтобы upsert-ить запись в `attendance` (по `student_id + date`) на основе нового статуса урока; в `moveLesson` — удалять старую attendance за исходную дату или ставить `rescheduled_by_teacher`; в `deleteLesson` — чистить attendance за эту дату по student_id, если она была создана из урока.
2. `src/components/calendar/Calendar.tsx` — после `setStatus`/`move`/`del` инвалидировать также `["attendance"]` (и `["schedule"]` на всякий).
3. `src/routes/_authenticated/schedule.tsx` — в загрузке страницы один раз вызвать `regenerateLessons` (idempotent — он пропускает уже существующие комбинации student/date/time), чтобы старые слоты подтянулись в календарь.

Никаких schema-миграций, никакого редизайна, никаких изменений auth/secrets.

### Маппинг статусов lesson → attendance
| lesson.status | attendance.status |
|---|---|
| `completed` | `present` |
| `cancelled` | `absent` |
| `moved` | `rescheduled_by_teacher` |
| `planned` | удалить attendance за эту дату (откат) |

Upsert по уникальному ключу `(student_id, date)`. Если у пользователя уже стоит ручная attendance с этой парой — перезаписывается статусом из урока (это ожидаемо: календарь — UI отметки).

### Инвалидация кешей
В `Calendar.tsx` после любой мутации:
```ts
qc.invalidateQueries({ queryKey: ["lessons"] });
qc.invalidateQueries({ queryKey: ["attendance"] });
```
Это перерисует и календарь, и `StudentRoom`, и счётчик циклов.

### Авто-регенерация при заходе на /schedule
В `SchedulePage` добавить `useEffect` с одноразовым (на маунт) вызовом `regenerateLessons()` через `useServerFn`. После успеха — `qc.invalidateQueries({ queryKey: ["lessons"] })`. Это починит «пустые» вторник/четверг/субботу для существующих слотов.

### Acceptance — как проверим
- Слот вт/чт/сб → виден в календаре после захода на /schedule (благодаря авто-regenerate).
- «Урок пройден» в календаре → attendance.present появляется → карточка ученика сразу инкрементит счётчик (через инвалидацию).
- Перенос урока → старая attendance становится `rescheduled_by_teacher`, новая дата без attendance (станет present когда отметят).
- Отмена → attendance.absent, в карточке не считается как пройденный (т.к. она считает present+absent одинаково «съел» — это уже существующая логика; не трогаем).
- Hard refresh — состояние сохраняется (всё в БД).

### Что НЕ делаем
- Не трогаем схему БД, RLS, миграции, секреты, service role, дизайн, offline-очередь, edge functions.

### Команды после фикса
`npm run lint`, `npx tsc --noEmit`, `npm run build`.
