
-- Tables for Live Notebook
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  days_per_week INTEGER NOT NULL DEFAULT 1,
  subject TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.finance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RUB',
  is_paid BOOLEAN NOT NULL DEFAULT false,
  pay_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lessons_conducted (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lessons_done INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usd_to_rub NUMERIC NOT NULL DEFAULT 90,
  usdt_to_egp NUMERIC NOT NULL DEFAULT 50,
  usd_to_egp NUMERIC NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons_conducted ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rates ENABLE ROW LEVEL SECURITY;

-- Permissive policies (single-user app, no auth)
CREATE POLICY "public all" ON public.students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.finance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.lessons_conducted FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.rates FOR ALL USING (true) WITH CHECK (true);
