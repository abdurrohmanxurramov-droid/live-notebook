-- 1. Dedupe active attendance rows (keep newest per owner/student/date)
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY owner_id, student_id, date
    ORDER BY created_at DESC, id DESC
  ) AS rn
  FROM public.attendance
  WHERE deleted_at IS NULL
)
UPDATE public.attendance a
SET deleted_at = now()
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_owner_student_date_uniq
  ON public.attendance (owner_id, student_id, date)
  WHERE deleted_at IS NULL;

-- 2. Idempotent attendance upsert (RLS applies: SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.upsert_attendance_entry(
  p_student_id uuid,
  p_date date,
  p_status text,
  p_note text,
  p_update_note boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  caller_id uuid := auth.uid();
  row_out public.attendance%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('present','absent','excused','rescheduled_by_teacher') THEN
    RAISE EXCEPTION 'Invalid attendance status' USING ERRCODE = '22023';
  END IF;
  IF p_update_note IS NULL THEN
    RAISE EXCEPTION 'Invalid note update flag' USING ERRCODE = '22023';
  END IF;
  IF p_update_note AND char_length(coalesce(p_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Attendance note is too long' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.students
  WHERE id = p_student_id AND owner_id = caller_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO row_out
  FROM public.attendance
  WHERE owner_id = caller_id AND student_id = p_student_id AND date = p_date
    AND deleted_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.attendance
    SET status = p_status,
        note = CASE WHEN p_update_note THEN p_note ELSE note END
    WHERE id = row_out.id AND owner_id = caller_id
    RETURNING * INTO row_out;
  ELSE
    INSERT INTO public.attendance (owner_id, student_id, date, status, note)
    VALUES (caller_id, p_student_id, p_date, p_status,
            CASE WHEN p_update_note THEN p_note ELSE NULL END)
    RETURNING * INTO row_out;
  END IF;

  RETURN jsonb_build_object(
    'id', row_out.id,
    'student_id', row_out.student_id,
    'date', row_out.date,
    'status', row_out.status,
    'note', row_out.note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_attendance_entry(uuid, date, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_attendance_entry(uuid, date, text, text, boolean) TO authenticated;

-- 3. Short-lived confirmation tokens for permanent deletes
CREATE TABLE IF NOT EXISTS public.mcp_pending_deletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  CONSTRAINT mcp_pending_deletes_table_check CHECK (
    target_table IN ('students','lessons','attendance','finance','homework','schedule_slots')
  )
);

GRANT SELECT, INSERT, DELETE ON public.mcp_pending_deletes TO authenticated;
GRANT ALL ON public.mcp_pending_deletes TO service_role;

ALTER TABLE public.mcp_pending_deletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner select" ON public.mcp_pending_deletes;
CREATE POLICY "owner select" ON public.mcp_pending_deletes
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "owner insert" ON public.mcp_pending_deletes;
CREATE POLICY "owner insert" ON public.mcp_pending_deletes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "owner delete" ON public.mcp_pending_deletes;
CREATE POLICY "owner delete" ON public.mcp_pending_deletes
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

DROP TRIGGER IF EXISTS set_owner_id_mcp_pending_deletes ON public.mcp_pending_deletes;
CREATE TRIGGER set_owner_id_mcp_pending_deletes
  BEFORE INSERT ON public.mcp_pending_deletes
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

CREATE INDEX IF NOT EXISTS mcp_pending_deletes_owner_idx
  ON public.mcp_pending_deletes (owner_id, expires_at);