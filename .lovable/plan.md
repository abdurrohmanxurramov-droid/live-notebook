
## Goal

Add two self-contained features without touching architecture, DB schema, auth, RLS or design tokens:

1. Advanced calendar (Day / Week / Month) on the existing `/schedule` route
2. Floating Action Button (FAB) with quick-actions bottom sheet on mobile

Existing lessons schema (`lessons` table + `lessons.functions.ts` with `listLessons` / `moveLesson` / `setLessonStatus`) already supports everything needed — no migrations.

---

## 1. Advanced Calendar

### Where
New component `src/components/calendar/Calendar.tsx` mounted at the top of `src/routes/_authenticated/schedule.tsx` (above the existing weekly-slot UI, which stays as-is for managing recurring slots).

### View switcher
Segmented control: **День / Неделя / Месяц**, plus prev/today/next nav and the visible date label. State stored in local `useState` (no URL params, no persistence — keeps scope tight).

### Data
- Use existing `listLessons({ from, to })` server fn via `useServerFn` + `useQuery`. Range computed per view (day: 1 day; week: Mon–Sun; month: full month grid incl. trailing/leading days).
- Join with `useStudents()` (already cached) to render names.
- Status colors from existing tokens: planned = accent, completed = emerald/green token, cancelled = destructive, moved = muted/gold. Use small `Badge` from `ui-bits`.

### Views
- **Day**: vertical hour timeline 8:00–22:00, lessons positioned by `scheduled_time` + `duration_min` (absolute positioning inside an hour-row column).
- **Week**: 7 columns × hour rows, same lesson block component as Day.
- **Month**: 6×7 grid; each cell shows date + up to 3 lesson chips (`HH:MM Имя`) and "+N ещё" overflow that opens a Sheet listing that day's lessons.

Each lesson chip/block shows: student name, `HH:MM`, status Badge.

### Drag & drop reschedule
- Use HTML5 native DnD (no new deps; keeps bundle small). Lesson block is `draggable`; hour-slot cells are drop targets.
- On drop → call existing `moveLesson({ id, new_date, new_time })` then `invalidateQueries(['lessons', ...])`.
- Day/Week support DnD between time slots; Month supports DnD between days (time preserved). Touch fallback: long-press opens a "Перенести" action that shows date/time pickers (reuses existing UI).

### Quick create on empty slot
- Clicking an empty hour cell (Day/Week) or empty day cell (Month) opens a Sheet with: student `Select`, date (prefilled), time (prefilled), duration (from `user_settings.default_lesson_duration`). Submits via direct `supabase.from('lessons').insert({...})` with `owner_id` from session (matches existing pattern in `useMut`).

### Lesson click
- Click on existing lesson → small Sheet with status actions (planned/completed/cancelled) calling `setLessonStatus`, plus a "Перенести" button (opens move dialog) and "Удалить" calling `deleteLesson`.

---

## 2. Quick Actions FAB

### Where
New component `src/components/QuickActionsFab.tsx`, mounted once in `src/routes/_authenticated/route.tsx` (the authenticated layout) so it appears on every authenticated page.

### Visibility
Mobile only: `md:hidden`. Positioned `fixed bottom-24 right-4 z-50` (above BottomNav). Circular 56px button with `+` icon, accent background, large tap target for one-handed use.

### Action sheet
Tapping FAB opens existing `<Sheet>` (bottom sheet) titled "Быстрые действия" with 5 large rows:
1. **Добавить ученика** → navigate `/students` and trigger its "Add" sheet via a `?new=1` query param read by the page.
2. **Добавить платёж** → `/finance?new=1`
3. **Отметить посещаемость** → `/attendance` (today preselected)
4. **Добавить ДЗ** → `/homework?new=1`
5. **Запланировать урок** → opens the same quick-create lesson sheet from the calendar (extracted to a shared hook/component so both entry points reuse it)

Each row: 44px icon tile + bold label + short hint (matches the existing "Ещё" sheet style).

### One-handed optimization
- FAB on the right (default thumb zone); sheet rows are tall (≥64px) and sorted by frequency (student/payment first).
- Sheet auto-closes on action.

---

## Files

**New**
- `src/components/calendar/Calendar.tsx` — view switcher + view router
- `src/components/calendar/DayView.tsx`
- `src/components/calendar/WeekView.tsx`
- `src/components/calendar/MonthView.tsx`
- `src/components/calendar/LessonBlock.tsx` — draggable lesson card
- `src/components/calendar/QuickCreateLessonSheet.tsx` — reused by calendar + FAB
- `src/components/QuickActionsFab.tsx`

**Edited (small)**
- `src/routes/_authenticated/schedule.tsx` — mount `<Calendar />` at top; keep slots UI below
- `src/routes/_authenticated/route.tsx` — render `<QuickActionsFab />`
- `src/routes/_authenticated/students.tsx`, `finance.tsx`, `homework.tsx` — read `?new=1` to auto-open existing add sheets (one `useEffect` each, ~5 lines)

**No changes**: DB schema, RLS, auth, server fns (reuses `listLessons`, `moveLesson`, `setLessonStatus`, `deleteLesson`), design tokens, `BottomNav`, existing recurring-slots UI.

---

## Out of scope (explicit)

- No recurring-event editing from calendar (slots UI already covers it).
- No timezone work (uses existing local-date convention).
- No desktop FAB (mobile only, as requested).
- No new npm packages (native DnD, existing Sheet/Badge/Select).
