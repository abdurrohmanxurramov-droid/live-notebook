-- Read-only production preflight. This returns counts only and does not expose
-- row IDs or personal CRM data. Every invalid_count must be zero except
-- lessons.source_slot_missing, which the migration deterministically normalizes
-- to NULL, and finance.archived_negative_legacy, which is preserved while a
-- validated constraint keeps negative amounts out of active finance data.
SELECT 'students.owner_id_null' AS check_name, count(*) AS invalid_count
FROM public.students
WHERE owner_id IS NULL

UNION ALL
SELECT 'rates.owner_id_null', count(*)
FROM public.rates
WHERE owner_id IS NULL

UNION ALL
SELECT 'push_subscriptions.owner_id_null', count(*)
FROM public.push_subscriptions
WHERE owner_id IS NULL

UNION ALL
SELECT 'schedule_slots.student_owner', count(*)
FROM public.schedule_slots AS child
LEFT JOIN public.students AS student
  ON student.id = child.student_id
 AND student.owner_id = child.owner_id
WHERE child.owner_id IS NULL OR student.id IS NULL

UNION ALL
SELECT 'finance.student_owner', count(*)
FROM public.finance AS child
LEFT JOIN public.students AS student
  ON student.id = child.student_id
 AND student.owner_id = child.owner_id
WHERE child.owner_id IS NULL OR student.id IS NULL

UNION ALL
SELECT 'attendance.student_owner', count(*)
FROM public.attendance AS child
LEFT JOIN public.students AS student
  ON student.id = child.student_id
 AND student.owner_id = child.owner_id
WHERE child.owner_id IS NULL OR student.id IS NULL

UNION ALL
SELECT 'homework.student_owner', count(*)
FROM public.homework AS child
LEFT JOIN public.students AS student
  ON student.id = child.student_id
 AND student.owner_id = child.owner_id
WHERE child.owner_id IS NULL OR student.id IS NULL

UNION ALL
SELECT 'lessons.student_owner', count(*)
FROM public.lessons AS child
LEFT JOIN public.students AS student
  ON student.id = child.student_id
 AND student.owner_id = child.owner_id
WHERE child.owner_id IS NULL OR student.id IS NULL

UNION ALL
SELECT 'lessons.source_slot_missing', count(*)
FROM public.lessons AS lesson
WHERE lesson.source_slot_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.schedule_slots AS slot
    WHERE slot.id = lesson.source_slot_id
  )

UNION ALL
SELECT 'lessons.source_slot_owner_student', count(*)
FROM public.lessons AS lesson
JOIN public.schedule_slots AS slot
  ON slot.id = lesson.source_slot_id
WHERE slot.owner_id IS DISTINCT FROM lesson.owner_id
   OR slot.student_id IS DISTINCT FROM lesson.student_id

UNION ALL
SELECT 'lessons.moved_from', count(*)
FROM public.lessons AS lesson
LEFT JOIN public.lessons AS original
  ON original.id = lesson.moved_from_id
 AND original.owner_id = lesson.owner_id
 AND original.student_id = lesson.student_id
WHERE lesson.moved_from_id IS NOT NULL AND original.id IS NULL

UNION ALL
SELECT 'students.days_per_week', count(*)
FROM public.students
WHERE days_per_week NOT BETWEEN 0 AND 7

UNION ALL
SELECT 'schedule_slots.duration_min', count(*)
FROM public.schedule_slots
WHERE duration_min NOT BETWEEN 5 AND 600

UNION ALL
SELECT 'lessons.duration_min', count(*)
FROM public.lessons
WHERE duration_min NOT BETWEEN 5 AND 600

UNION ALL
SELECT 'finance.archived_negative_legacy', count(*)
FROM public.finance
WHERE amount < 0
  AND deleted_at IS NOT NULL

UNION ALL
SELECT 'finance.amount_currency_blocking', count(*)
FROM public.finance
WHERE (amount < 0 AND deleted_at IS NULL)
   OR amount > 120000000
   OR currency !~ '^([A-Z]{3}|USDT)$'

UNION ALL
SELECT 'attendance.status', count(*)
FROM public.attendance
WHERE status NOT IN ('present', 'absent', 'excused', 'rescheduled_by_teacher')

UNION ALL
SELECT 'homework.status', count(*)
FROM public.homework
WHERE status NOT IN ('assigned', 'done', 'not_done', 'partial')

UNION ALL
SELECT 'rates.values', count(*)
FROM public.rates
WHERE usd_to_rub NOT BETWEEN 0.000001 AND 1000000
   OR usdt_to_egp NOT BETWEEN 0.000001 AND 1000000
   OR usd_to_egp NOT BETWEEN 0.000001 AND 1000000

UNION ALL
SELECT 'rates.currency_map', count(*)
FROM public.rates
WHERE base_currency <> 'USD'
   OR jsonb_typeof(rates_map) <> 'object'

UNION ALL
SELECT 'user_settings.values', count(*)
FROM public.user_settings
WHERE default_currency !~ '^([A-Z]{3}|USDT)$'
   OR default_lesson_duration NOT BETWEEN 5 AND 600
   OR default_lesson_price NOT BETWEEN 0 AND 10000000
   OR week_starts_on NOT BETWEEN 0 AND 6
   OR remind_before_min NOT BETWEEN 0 AND 10000

ORDER BY check_name;
