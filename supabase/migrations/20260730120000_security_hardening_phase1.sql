-- Security hardening phase 1.
-- Unsafe legacy constraints are only replaced after a fail-fast data preflight
-- and successful validation.

-- ---------------------------------------------------------------------------
-- Cross-tenant relationship integrity
-- ---------------------------------------------------------------------------

ALTER TABLE public.students
  ADD CONSTRAINT students_id_owner_id_key UNIQUE (id, owner_id);

ALTER TABLE public.schedule_slots
  ADD CONSTRAINT schedule_slots_id_owner_student_key UNIQUE (id, owner_id, student_id);

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_id_owner_student_key UNIQUE (id, owner_id, student_id);

-- Ownership always comes from the authenticated JWT. A trusted service-role
-- caller may provide an explicit owner for server-to-server maintenance, but
-- browser roles cannot forge or choose ownership fields.
CREATE OR REPLACE FUNCTION public.set_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    IF NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'Missing owner for trusted write'
        USING ERRCODE = '23502';
    END IF;
    RETURN NEW;
  END IF;

  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM caller_id THEN
    RAISE EXCEPTION 'Ownership mismatch'
      USING ERRCODE = '42501';
  END IF;

  NEW.owner_id := caller_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_owner_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_owner_id() FROM anon;
REVOKE ALL ON FUNCTION public.set_owner_id() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_owner_id() TO service_role;

CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'Missing user for trusted write'
        USING ERRCODE = '23502';
    END IF;
    RETURN NEW;
  END IF;

  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM caller_id THEN
    RAISE EXCEPTION 'Ownership mismatch'
      USING ERRCODE = '42501';
  END IF;

  NEW.user_id := caller_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_id() FROM anon;
REVOKE ALL ON FUNCTION public.set_user_id() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_id() TO service_role;

DROP TRIGGER IF EXISTS set_user_id_trg ON public.chat_messages;
CREATE TRIGGER set_user_id_trg
BEFORE INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS set_user_id_trg ON public.user_settings;
CREATE TRIGGER set_user_id_trg
BEFORE INSERT ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_user_id();

-- Historical hard-deletes could leave source_slot_id pointing at a slot that no
-- longer exists because this column previously had no FK. The missing target
-- carries no usable ownership/provenance information, so normalize only those
-- orphaned references. Existing cross-owner/cross-student references still fail
-- the preflight below instead of being guessed or silently rewritten.
UPDATE public.lessons AS lesson
SET source_slot_id = NULL
WHERE lesson.source_slot_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.schedule_slots AS slot
    WHERE slot.id = lesson.source_slot_id
  );

-- Fail closed before installing relationship constraints. Ownership mismatches
-- cannot be repaired automatically because guessing a tenant would be unsafe.
DO $$
DECLARE
  table_name text;
  invalid_count bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM public.students WHERE owner_id IS NULL)
    + (SELECT count(*) FROM public.rates WHERE owner_id IS NULL)
    + (SELECT count(*) FROM public.push_subscriptions WHERE owner_id IS NULL)
  INTO invalid_count;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Security ownership preflight failed: % tenant records have no owner',
      invalid_count
      USING
        ERRCODE = '23514',
        HINT = 'Repair legacy ownership through a private admin audit before retrying';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'schedule_slots',
    'finance',
    'attendance',
    'homework',
    'lessons_conducted',
    'lessons'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*)
       FROM public.%I AS child
       LEFT JOIN public.students AS student
         ON student.id = child.student_id
        AND student.owner_id = child.owner_id
       WHERE child.owner_id IS NULL
          OR student.id IS NULL',
      table_name
    )
    INTO invalid_count;

    IF invalid_count > 0 THEN
      RAISE EXCEPTION
        'Security preflight failed for %: % invalid owner/student relationships',
        table_name,
        invalid_count
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT count(*)
  INTO invalid_count
  FROM public.lessons AS lesson
  LEFT JOIN public.schedule_slots AS slot
    ON slot.id = lesson.source_slot_id
   AND slot.owner_id = lesson.owner_id
   AND slot.student_id = lesson.student_id
  WHERE lesson.source_slot_id IS NOT NULL
    AND slot.id IS NULL;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Security preflight failed: % invalid lesson/source-slot relationships',
      invalid_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO invalid_count
  FROM public.lessons AS lesson
  LEFT JOIN public.lessons AS original
    ON original.id = lesson.moved_from_id
   AND original.owner_id = lesson.owner_id
   AND original.student_id = lesson.student_id
  WHERE lesson.moved_from_id IS NOT NULL
    AND original.id IS NULL;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Security preflight failed: % invalid moved-lesson relationships',
      invalid_count
      USING ERRCODE = '23514';
  END IF;

  SELECT
    (SELECT count(*) FROM public.students WHERE days_per_week NOT BETWEEN 0 AND 7)
    + (SELECT count(*) FROM public.schedule_slots WHERE duration_min NOT BETWEEN 5 AND 600)
    + (SELECT count(*) FROM public.lessons WHERE duration_min NOT BETWEEN 5 AND 600)
    + (
      SELECT count(*)
      FROM public.finance
      WHERE amount > 120000000
         OR (amount < 0 AND deleted_at IS NULL)
         OR currency NOT IN ('RUB', 'USD', 'USDT', 'EGP')
    )
    + (
      SELECT count(*)
      FROM public.attendance
      WHERE status NOT IN ('present', 'absent', 'excused', 'rescheduled_by_teacher')
    )
    + (
      SELECT count(*)
      FROM public.homework
      WHERE status NOT IN ('assigned', 'done', 'not_done', 'partial')
    )
    + (
      SELECT count(*)
      FROM public.rates
      WHERE usd_to_rub NOT BETWEEN 0.000001 AND 1000000
         OR usdt_to_egp NOT BETWEEN 0.000001 AND 1000000
         OR usd_to_egp NOT BETWEEN 0.000001 AND 1000000
    )
    + (
      SELECT count(*)
      FROM public.user_settings
      WHERE default_currency NOT IN ('RUB', 'USD', 'USDT', 'EGP')
         OR default_lesson_duration NOT BETWEEN 5 AND 600
         OR default_lesson_price NOT BETWEEN 0 AND 10000000
         OR week_starts_on NOT BETWEEN 0 AND 6
         OR remind_before_min NOT BETWEEN 0 AND 10000
    )
  INTO invalid_count;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Security preflight failed: % rows violate new data-integrity checks',
      invalid_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.students ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.schedule_slots ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.finance ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.attendance ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.homework ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.rates ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN owner_id SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.lessons_conducted') IS NOT NULL THEN
    ALTER TABLE public.lessons_conducted ALTER COLUMN owner_id SET NOT NULL;
  END IF;
END;
$$;

-- Add as NOT VALID first to keep locks short, validate every existing row, and
-- only then remove the older owner-blind foreign keys.
ALTER TABLE public.schedule_slots
  ADD CONSTRAINT schedule_slots_student_owner_fk
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.finance
  ADD CONSTRAINT finance_student_owner_fk
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.students
  ADD CONSTRAINT students_days_per_week_range_check
  CHECK (days_per_week BETWEEN 0 AND 7) NOT VALID;
ALTER TABLE public.students
  VALIDATE CONSTRAINT students_days_per_week_range_check;

ALTER TABLE public.schedule_slots
  ADD CONSTRAINT schedule_slots_duration_range_check
  CHECK (duration_min BETWEEN 5 AND 600) NOT VALID;
ALTER TABLE public.schedule_slots
  VALIDATE CONSTRAINT schedule_slots_duration_range_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_duration_range_check
  CHECK (duration_min BETWEEN 5 AND 600) NOT VALID;
ALTER TABLE public.lessons
  VALIDATE CONSTRAINT lessons_duration_range_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_values_check
  CHECK (
    default_currency IN ('RUB', 'USD', 'USDT', 'EGP')
    AND default_lesson_duration BETWEEN 5 AND 600
    AND default_lesson_price BETWEEN 0 AND 10000000
    AND week_starts_on BETWEEN 0 AND 6
    AND remind_before_min BETWEEN 0 AND 10000
  ) NOT VALID;
ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_values_check;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_student_owner_fk
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.homework
  ADD CONSTRAINT homework_student_owner_fk
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE CASCADE
  NOT VALID;

DO $$
BEGIN
  IF to_regclass('public.lessons_conducted') IS NOT NULL THEN
    ALTER TABLE public.lessons_conducted
      ADD CONSTRAINT lessons_conducted_student_owner_fk
      FOREIGN KEY (student_id, owner_id)
      REFERENCES public.students (id, owner_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_student_owner_fk
  FOREIGN KEY (student_id, owner_id)
  REFERENCES public.students (id, owner_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_source_slot_owner_fk
  FOREIGN KEY (source_slot_id, owner_id, student_id)
  REFERENCES public.schedule_slots (id, owner_id, student_id)
  ON DELETE SET NULL (source_slot_id)
  NOT VALID;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_moved_from_owner_fk
  FOREIGN KEY (moved_from_id, owner_id, student_id)
  REFERENCES public.lessons (id, owner_id, student_id)
  ON DELETE SET NULL (moved_from_id)
  NOT VALID;

ALTER TABLE public.schedule_slots
  VALIDATE CONSTRAINT schedule_slots_student_owner_fk;
ALTER TABLE public.finance
  VALIDATE CONSTRAINT finance_student_owner_fk;
ALTER TABLE public.attendance
  VALIDATE CONSTRAINT attendance_student_owner_fk;
ALTER TABLE public.homework
  VALIDATE CONSTRAINT homework_student_owner_fk;
DO $$
BEGIN
  IF to_regclass('public.lessons_conducted') IS NOT NULL THEN
    ALTER TABLE public.lessons_conducted
      VALIDATE CONSTRAINT lessons_conducted_student_owner_fk;
  END IF;
END;
$$;
ALTER TABLE public.lessons
  VALIDATE CONSTRAINT lessons_student_owner_fk;
ALTER TABLE public.lessons
  VALIDATE CONSTRAINT lessons_source_slot_owner_fk;
ALTER TABLE public.lessons
  VALIDATE CONSTRAINT lessons_moved_from_owner_fk;

-- The historical single-column foreign keys ignore ownership. Keeping them
-- would allow an owner-blind cascade when a student, slot, or lesson is
-- permanently deleted. The validated composite constraints replace them.
DO $$
DECLARE
  foreign_key record;
BEGIN
  FOR foreign_key IN
    SELECT
      constraint_row.conrelid::regclass AS table_name,
      constraint_row.conname
    FROM pg_constraint AS constraint_row
    JOIN pg_attribute AS constrained_column
      ON constrained_column.attrelid = constraint_row.conrelid
     AND constrained_column.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f'
      AND array_length(constraint_row.conkey, 1) = 1
      AND (
        (
          constraint_row.confrelid = 'public.students'::regclass
          AND constraint_row.conrelid = ANY (ARRAY[
            'public.schedule_slots'::regclass,
            'public.finance'::regclass,
            'public.attendance'::regclass,
            'public.homework'::regclass,
            to_regclass('public.lessons_conducted'),
            'public.lessons'::regclass
          ])
          AND constrained_column.attname = 'student_id'
        )
        OR (
          constraint_row.conrelid = 'public.lessons'::regclass
          AND constraint_row.confrelid = 'public.schedule_slots'::regclass
          AND constrained_column.attname = 'source_slot_id'
        )
        OR (
          constraint_row.conrelid = 'public.lessons'::regclass
          AND constraint_row.confrelid = 'public.lessons'::regclass
          AND constrained_column.attname = 'moved_from_id'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      foreign_key.table_name,
      foreign_key.conname
    );
  END LOOP;
END;
$$;

CREATE INDEX schedule_slots_student_owner_idx
  ON public.schedule_slots (student_id, owner_id);
CREATE INDEX finance_student_owner_idx
  ON public.finance (student_id, owner_id);
CREATE INDEX attendance_student_owner_idx
  ON public.attendance (student_id, owner_id);
CREATE INDEX homework_student_owner_idx
  ON public.homework (student_id, owner_id);
DO $$
BEGIN
  IF to_regclass('public.lessons_conducted') IS NOT NULL THEN
    CREATE INDEX lessons_conducted_student_owner_idx
      ON public.lessons_conducted (student_id, owner_id);
  END IF;
END;
$$;
CREATE INDEX lessons_student_owner_idx
  ON public.lessons (student_id, owner_id);
CREATE INDEX lessons_source_slot_owner_idx
  ON public.lessons (source_slot_id, owner_id, student_id)
  WHERE source_slot_id IS NOT NULL;
CREATE INDEX lessons_moved_from_owner_idx
  ON public.lessons (moved_from_id, owner_id, student_id)
  WHERE moved_from_id IS NOT NULL;

-- Private CRM relations have no unauthenticated use. RLS is the primary
-- boundary, while revoking stale anon/PUBLIC grants keeps a second barrier in
-- place if a policy is changed incorrectly later.
DO $$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'students',
    'schedule_slots',
    'lessons',
    'attendance',
    'finance',
    'homework',
    'lessons_conducted',
    'rates',
    'push_subscriptions',
    'chat_messages',
    'user_settings',
    'v_lessons_conducted'
  ]
  LOOP
    IF to_regclass(format('public.%I', relation_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', relation_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', relation_name);
  END LOOP;
END;
$$;

-- Relationship-aware RLS prevents a caller from using a foreign UUID as an
-- existence oracle. Both a missing record and another user's record are denied.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'schedule_slots',
    'finance',
    'attendance',
    'homework',
    'lessons_conducted'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS "owner insert" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "owner update" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "owner insert" ON public.%I
       FOR INSERT TO authenticated
       WITH CHECK (
         auth.uid() = owner_id
         AND EXISTS (
           SELECT 1 FROM public.students AS student
           WHERE student.id = %I.student_id
             AND student.owner_id = auth.uid()
         )
       )',
      table_name,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "owner update" ON public.%I
       FOR UPDATE TO authenticated
       USING (auth.uid() = owner_id)
       WITH CHECK (
         auth.uid() = owner_id
         AND EXISTS (
           SELECT 1 FROM public.students AS student
           WHERE student.id = %I.student_id
             AND student.owner_id = auth.uid()
         )
       )',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "owner insert" ON public.lessons;
DROP POLICY IF EXISTS "owner update" ON public.lessons;

CREATE POLICY "owner insert" ON public.lessons
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND EXISTS (
    SELECT 1
    FROM public.students AS student
    WHERE student.id = lessons.student_id
      AND student.owner_id = auth.uid()
  )
  AND (
    source_slot_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.schedule_slots AS slot
      WHERE slot.id = lessons.source_slot_id
        AND slot.owner_id = auth.uid()
        AND slot.student_id = lessons.student_id
    )
  )
);

CREATE POLICY "owner update" ON public.lessons
FOR UPDATE TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (
  auth.uid() = owner_id
  AND EXISTS (
    SELECT 1
    FROM public.students AS student
    WHERE student.id = lessons.student_id
      AND student.owner_id = auth.uid()
  )
  AND (
    source_slot_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.schedule_slots AS slot
      WHERE slot.id = lessons.source_slot_id
        AND slot.owner_id = auth.uid()
        AND slot.student_id = lessons.student_id
    )
  )
);

-- Database-level invariants are added with short locks and immediately
-- validated because the fail-fast preflight already checked legacy rows.
ALTER TABLE public.finance
  ADD CONSTRAINT finance_amount_upper_bound_check
  CHECK (amount <= 120000000) NOT VALID;
ALTER TABLE public.finance
  VALIDATE CONSTRAINT finance_amount_upper_bound_check;

-- Debt is represented by a positive amount with is_paid=false. Production has
-- one already soft-deleted legacy manual row with a negative amount; preserve
-- that historical record instead of guessing its meaning. Archived negative
-- rows remain exportable/importable, but cannot be restored into active finance
-- until their amount is explicitly corrected.
ALTER TABLE public.finance
  ADD CONSTRAINT finance_active_amount_nonnegative_check
  CHECK (amount >= 0 OR deleted_at IS NOT NULL) NOT VALID;
ALTER TABLE public.finance
  VALIDATE CONSTRAINT finance_active_amount_nonnegative_check;

ALTER TABLE public.finance
  ADD CONSTRAINT finance_currency_check
  CHECK (currency IN ('RUB', 'USD', 'USDT', 'EGP')) NOT VALID;
ALTER TABLE public.finance
  VALIDATE CONSTRAINT finance_currency_check;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'absent', 'excused', 'rescheduled_by_teacher')) NOT VALID;
ALTER TABLE public.attendance
  VALIDATE CONSTRAINT attendance_status_check;

ALTER TABLE public.homework
  ADD CONSTRAINT homework_status_check
  CHECK (status IN ('assigned', 'done', 'not_done', 'partial')) NOT VALID;
ALTER TABLE public.homework
  VALIDATE CONSTRAINT homework_status_check;

ALTER TABLE public.rates
  ADD CONSTRAINT rates_values_check
  CHECK (
    usd_to_rub BETWEEN 0.000001 AND 1000000
    AND usdt_to_egp BETWEEN 0.000001 AND 1000000
    AND usd_to_egp BETWEEN 0.000001 AND 1000000
  ) NOT VALID;
ALTER TABLE public.rates
  VALIDATE CONSTRAINT rates_values_check;

-- ---------------------------------------------------------------------------
-- Distributed idempotency for public reminder hooks
-- ---------------------------------------------------------------------------

CREATE TABLE public.hook_executions (
  hook_name text NOT NULL,
  window_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hook_name, window_key)
);
CREATE INDEX hook_executions_created_at_idx
  ON public.hook_executions (created_at);

ALTER TABLE public.hook_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hook_executions FROM PUBLIC;
REVOKE ALL ON public.hook_executions FROM anon;
REVOKE ALL ON public.hook_executions FROM authenticated;
GRANT ALL ON public.hook_executions TO service_role;

CREATE OR REPLACE FUNCTION public.claim_hook_execution(
  p_hook_name text,
  p_window_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF p_hook_name NOT IN (
    'lesson-reminders',
    'payment-reminders',
    'homework-reminders'
  ) OR p_window_key IS NULL OR length(p_window_key) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid hook execution key'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.hook_executions
  WHERE created_at < now() - interval '8 days';

  INSERT INTO public.hook_executions (hook_name, window_key)
  VALUES (p_hook_name, p_window_key)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_hook_execution(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_hook_execution(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_hook_execution(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_hook_execution(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Per-user rate limits for expensive authenticated operations
-- ---------------------------------------------------------------------------

CREATE TABLE public.app_rate_limits (
  user_id uuid NOT NULL,
  scope text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, scope, window_start)
);
CREATE INDEX app_rate_limits_window_start_idx
  ON public.app_rate_limits (window_start);

ALTER TABLE public.app_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_rate_limits FROM PUBLIC;
REVOKE ALL ON public.app_rate_limits FROM anon;
REVOKE ALL ON public.app_rate_limits FROM authenticated;
GRANT ALL ON public.app_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_app_rate_limit(p_scope text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  limit_count integer;
  window_seconds integer;
  bucket_start timestamptz;
  new_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RETURN false;
  END IF;

  CASE p_scope
    WHEN 'ai_chat' THEN
      limit_count := 20;
      window_seconds := 600;
    WHEN 'backup_export' THEN
      limit_count := 5;
      window_seconds := 60;
    WHEN 'backup_import' THEN
      limit_count := 2;
      window_seconds := 600;
    WHEN 'push_test' THEN
      limit_count := 5;
      window_seconds := 60;
    WHEN 'mcp_write' THEN
      limit_count := 30;
      window_seconds := 600;
    ELSE
      RAISE EXCEPTION 'Unknown rate-limit scope'
        USING ERRCODE = '22023';
  END CASE;

  bucket_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / window_seconds) * window_seconds
  );

  INSERT INTO public.app_rate_limits (
    user_id,
    scope,
    window_start,
    request_count
  )
  VALUES (caller_id, p_scope, bucket_start, 1)
  ON CONFLICT (user_id, scope, window_start)
  DO UPDATE SET request_count = public.app_rate_limits.request_count + 1
  RETURNING request_count INTO new_count;

  DELETE FROM public.app_rate_limits
  WHERE window_start < now() - interval '2 days';

  RETURN new_count <= limit_count;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_app_rate_limit(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_app_rate_limit(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_app_rate_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_app_rate_limit(text) TO service_role;

-- Atomic MCP lesson-status update. Ownership is derived from auth.uid(); RLS
-- remains active because this function uses SECURITY INVOKER.
CREATE OR REPLACE FUNCTION public.set_lesson_status_with_attendance(
  p_lesson_id uuid,
  p_status public.lesson_status,
  p_notes text,
  p_update_notes boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  lesson_row public.lessons%ROWTYPE;
  attendance_id uuid;
  attendance_status text;
BEGIN
  IF p_update_notes IS NULL THEN
    RAISE EXCEPTION 'Invalid notes update flag'
      USING ERRCODE = '22023';
  END IF;

  IF p_update_notes AND char_length(coalesce(p_notes, '')) > 1000 THEN
    RAISE EXCEPTION 'Lesson notes are too long'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO lesson_row
  FROM public.lessons
  WHERE id = p_lesson_id
    AND owner_id = auth.uid()
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.lessons
  SET status = p_status,
      notes = CASE WHEN p_update_notes THEN p_notes ELSE notes END
  WHERE id = lesson_row.id
    AND owner_id = auth.uid()
  RETURNING * INTO lesson_row;

  attendance_status := CASE p_status
    WHEN 'completed' THEN 'present'
    WHEN 'cancelled' THEN 'absent'
    WHEN 'moved' THEN 'rescheduled_by_teacher'
    ELSE NULL
  END;

  SELECT id
  INTO attendance_id
  FROM public.attendance
  WHERE owner_id = auth.uid()
    AND student_id = lesson_row.student_id
    AND date = lesson_row.scheduled_date
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF attendance_status IS NULL THEN
    IF attendance_id IS NOT NULL THEN
      UPDATE public.attendance
      SET deleted_at = now()
      WHERE id = attendance_id
        AND owner_id = auth.uid();
    END IF;
  ELSIF attendance_id IS NOT NULL THEN
    UPDATE public.attendance
    SET status = attendance_status,
        deleted_at = NULL
    WHERE id = attendance_id
      AND owner_id = auth.uid();
  ELSE
    INSERT INTO public.attendance (
      owner_id,
      student_id,
      date,
      status
    )
    VALUES (
      auth.uid(),
      lesson_row.student_id,
      lesson_row.scheduled_date,
      attendance_status
    );
  END IF;

  RETURN jsonb_build_object(
    'id', lesson_row.id,
    'student_id', lesson_row.student_id,
    'scheduled_date', lesson_row.scheduled_date,
    'scheduled_time', lesson_row.scheduled_time,
    'duration_min', lesson_row.duration_min,
    'status', lesson_row.status,
    'notes', lesson_row.notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_lesson_status_with_attendance(
  uuid,
  public.lesson_status,
  text,
  boolean
)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_lesson_status_with_attendance(
  uuid,
  public.lesson_status,
  text,
  boolean
)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.set_lesson_status_with_attendance(
  uuid,
  public.lesson_status,
  text,
  boolean
)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_lesson_status_with_attendance(
  uuid,
  public.lesson_status,
  text,
  boolean
)
  TO service_role;

-- Atomically soft-delete or restore a student and all owned child records.
CREATE OR REPLACE FUNCTION public.set_student_deleted_state(
  p_student_id uuid,
  p_deleted boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_value timestamptz := CASE WHEN p_deleted THEN now() ELSE NULL END;
BEGIN
  IF p_deleted IS NULL THEN
    RAISE EXCEPTION 'Invalid deleted-state flag'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.students
  WHERE id = p_student_id
    AND owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.students
  SET deleted_at = deleted_value
  WHERE id = p_student_id
    AND owner_id = auth.uid();

  UPDATE public.schedule_slots
  SET deleted_at = deleted_value
  WHERE student_id = p_student_id
    AND owner_id = auth.uid();

  UPDATE public.lessons
  SET deleted_at = deleted_value
  WHERE student_id = p_student_id
    AND owner_id = auth.uid();

  UPDATE public.attendance
  SET deleted_at = deleted_value
  WHERE student_id = p_student_id
    AND owner_id = auth.uid();

  UPDATE public.finance
  SET deleted_at = deleted_value
  WHERE student_id = p_student_id
    AND owner_id = auth.uid()
    AND (p_deleted OR amount >= 0);

  UPDATE public.homework
  SET deleted_at = deleted_value
  WHERE student_id = p_student_id
    AND owner_id = auth.uid();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_student_deleted_state(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_student_deleted_state(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_student_deleted_state(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_deleted_state(uuid, boolean) TO service_role;
