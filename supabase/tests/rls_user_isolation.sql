BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(1);

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims =
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

DO $test$
BEGIN
  IF has_table_privilege('anon', 'public.lessons', 'SELECT')
     OR has_table_privilege('anon', 'public.chat_messages', 'SELECT')
     OR has_table_privilege('anon', 'public.user_settings', 'SELECT')
     OR has_table_privilege('anon', 'public.v_lessons_conducted', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous role retains access to private CRM relations';
  END IF;
END;
$test$;

INSERT INTO public.students (id, owner_id, name)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'security-test-a'
);

INSERT INTO public.schedule_slots (
  id,
  owner_id,
  student_id,
  day_of_week,
  start_time,
  duration_min
)
VALUES (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  1,
  '10:00',
  60
);

INSERT INTO public.finance (id, owner_id, student_id, amount, currency)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  100,
  'RUB'
);

INSERT INTO public.attendance (id, owner_id, student_id, date, status)
VALUES (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '2099-01-01',
  'present'
);

INSERT INTO public.homework (id, owner_id, student_id, task, status)
VALUES (
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'security-test',
  'assigned'
);

INSERT INTO public.lessons (
  id,
  owner_id,
  student_id,
  scheduled_date,
  scheduled_time,
  source_slot_id
)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '2099-01-01',
  '10:00',
  '50000000-0000-0000-0000-000000000001'
);

INSERT INTO public.push_subscriptions (
  owner_id,
  endpoint,
  p256dh,
  auth
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'https://push.example.test/security-a',
  'security-p256dh',
  'security-auth'
);

SET LOCAL request.jwt.claims =
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

DO $test$
DECLARE
  visible_count integer;
  affected_count integer;
  rejected boolean;
  rpc_result jsonb;
  student_rpc_result boolean;
BEGIN
  SELECT count(*) INTO visible_count
  FROM public.students
  WHERE id = '20000000-0000-0000-0000-000000000001';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'User B can read User A student';
  END IF;

  SELECT count(*) INTO visible_count
  FROM public.finance
  WHERE id = '30000000-0000-0000-0000-000000000001';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'User B can read User A payment';
  END IF;

  SELECT count(*) INTO visible_count
  FROM public.lessons
  WHERE id = '40000000-0000-0000-0000-000000000001';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'User B can read User A lesson';
  END IF;

  SELECT count(*) INTO visible_count
  FROM public.attendance
  WHERE id = '60000000-0000-0000-0000-000000000001';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'User B can read User A attendance';
  END IF;

  SELECT count(*) INTO visible_count
  FROM public.homework
  WHERE id = '70000000-0000-0000-0000-000000000001';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'User B can read User A homework';
  END IF;

  SELECT count(*) INTO visible_count
  FROM public.push_subscriptions
  WHERE endpoint = 'https://push.example.test/security-a';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'User B can read User A push subscription';
  END IF;

  SELECT count(*) INTO visible_count
  FROM public.v_lessons_conducted
  WHERE owner_id = '10000000-0000-0000-0000-000000000001';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'Security-invoker view exposes User A rows to User B';
  END IF;

  UPDATE public.students
  SET name = 'forged'
  WHERE id = '20000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'User B can update User A student';
  END IF;

  UPDATE public.finance
  SET amount = 999
  WHERE id = '30000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'User B can update User A payment';
  END IF;

  UPDATE public.lessons
  SET status = 'completed'
  WHERE id = '40000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'User B can update User A lesson';
  END IF;

  DELETE FROM public.finance
  WHERE id = '30000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'User B can delete User A payment';
  END IF;

  DELETE FROM public.lessons
  WHERE id = '40000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'User B can delete User A lesson';
  END IF;

  DELETE FROM public.students
  WHERE id = '20000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'User B can delete User A student';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.students (owner_id, name)
    VALUES ('10000000-0000-0000-0000-000000000001', 'forged-owner');
  EXCEPTION
    WHEN insufficient_privilege THEN
      rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Forged owner_id was not rejected with SQLSTATE 42501';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.chat_messages (user_id, role, content)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      'user',
      'forged-user'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Forged user_id was not rejected with SQLSTATE 42501';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.finance (owner_id, student_id, amount, currency)
    VALUES (
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      100,
      'RUB'
    );
  EXCEPTION
    WHEN insufficient_privilege OR foreign_key_violation THEN
      rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Cross-owner student_id was not rejected by RLS/FK';
  END IF;

  SELECT public.set_lesson_status_with_attendance(
    '40000000-0000-0000-0000-000000000001',
    'completed',
    NULL,
    false
  )
  INTO rpc_result;
  IF rpc_result IS NOT NULL THEN
    RAISE EXCEPTION 'Lesson RPC exposed or changed User A lesson';
  END IF;

  SELECT public.set_student_deleted_state(
    '20000000-0000-0000-0000-000000000001',
    true
  )
  INTO student_rpc_result;
  IF student_rpc_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Student RPC exposed or changed User A student';
  END IF;
END;
$test$;

SET LOCAL request.jwt.claims =
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

DO $test$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance (owner_id, student_id, amount, currency)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      -1,
      'RUB'
    );
  EXCEPTION
    WHEN check_violation THEN
      rejected := true;
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Negative active finance amount was not rejected';
  END IF;
END;
$test$;

INSERT INTO public.finance (
  id,
  owner_id,
  student_id,
  amount,
  currency,
  deleted_at
)
VALUES (
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  -1000,
  'USD',
  now()
);

DO $test$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    UPDATE public.finance
    SET deleted_at = NULL
    WHERE id = '30000000-0000-0000-0000-000000000002';
  EXCEPTION
    WHEN check_violation THEN
      rejected := true;
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Archived negative finance row was restored as active';
  END IF;
END;
$test$;

DO $test$
DECLARE
  delete_result boolean;
  restore_result boolean;
BEGIN
  SELECT public.set_student_deleted_state(
    '20000000-0000-0000-0000-000000000001',
    true
  )
  INTO delete_result;

  SELECT public.set_student_deleted_state(
    '20000000-0000-0000-0000-000000000001',
    false
  )
  INTO restore_result;

  IF delete_result IS DISTINCT FROM true OR restore_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Student delete/restore RPC failed for owner';
  END IF;

  IF (
    SELECT deleted_at IS NOT NULL
    FROM public.students
    WHERE id = '20000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Student remained deleted after restore';
  END IF;

  IF NOT (
    SELECT deleted_at IS NOT NULL
    FROM public.finance
    WHERE id = '30000000-0000-0000-0000-000000000002'
  ) THEN
    RAISE EXCEPTION 'Archived negative finance row was restored by student RPC';
  END IF;
END;
$test$;

INSERT INTO public.lessons (
  id,
  owner_id,
  student_id,
  scheduled_date,
  scheduled_time,
  moved_from_id
)
VALUES (
  '40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '2099-01-02',
  '10:00',
  '40000000-0000-0000-0000-000000000001'
);

DELETE FROM public.schedule_slots
WHERE id = '50000000-0000-0000-0000-000000000001';

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE id = '40000000-0000-0000-0000-000000000001'
      AND source_slot_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Source lesson missing or deleting a slot did not clear source_slot_id';
  END IF;
END;
$test$;

DELETE FROM public.lessons
WHERE id = '40000000-0000-0000-0000-000000000001';

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE id = '40000000-0000-0000-0000-000000000002'
      AND moved_from_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Moved lesson missing or deleting its origin did not clear moved_from_id';
  END IF;
END;
$test$;

-- Multi-currency domain: valid ISO 4217 codes accepted, junk rejected.
DO $test$
DECLARE
  rejected boolean;
  code text;
BEGIN
  FOREACH code IN ARRAY ARRAY['EUR', 'TRY', 'AED', 'USDT'] LOOP
    INSERT INTO public.finance (owner_id, student_id, amount, currency)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      100,
      code
    );
  END LOOP;

  FOREACH code IN ARRAY ARRAY['eur', 'XXXXX', 'EURO', 'E1R', ''] LOOP
    rejected := false;
    BEGIN
      INSERT INTO public.finance (owner_id, student_id, amount, currency)
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        100,
        code
      );
    EXCEPTION
      WHEN check_violation THEN
        rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'Invalid currency code % was accepted', code;
    END IF;
  END LOOP;
END;
$test$;

-- user_settings keeps rejecting invalid non-currency values.
INSERT INTO public.user_settings (user_id)
VALUES ('10000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

DO $test$
DECLARE
  rejected boolean;
  affected_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_settings
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Test user_settings row is missing; check cannot be validated';
  END IF;

  rejected := false;
  BEGIN
    UPDATE public.user_settings
    SET default_lesson_duration = 1
    WHERE user_id = '10000000-0000-0000-0000-000000000001';
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    IF affected_count = 0 THEN
      RAISE EXCEPTION 'user_settings update affected zero rows; check is meaningless';
    END IF;
  EXCEPTION
    WHEN check_violation THEN
      rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Invalid default_lesson_duration was accepted';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.user_settings (user_id, default_lesson_duration)
    VALUES ('10000000-0000-0000-0000-000000000002', 1);
  EXCEPTION
    WHEN check_violation THEN
      rejected := true;
    WHEN insufficient_privilege THEN
      rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Invalid default_lesson_duration insert was accepted';
  END IF;
END;
$test$;

SELECT extensions.pass('RLS, ownership, RPC, finance, currency, and FK isolation checks passed');
SELECT * FROM extensions.finish();

ROLLBACK;

