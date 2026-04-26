-- Per-user working dataset for editable Data tab sync

CREATE TABLE IF NOT EXISTS public.user_working_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  working_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_working_data_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_working_data_user_id
  ON public.user_working_data (user_id);

CREATE INDEX IF NOT EXISTS idx_user_working_data_updated_at
  ON public.user_working_data (updated_at DESC);

ALTER TABLE public.user_working_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own working data"
  ON public.user_working_data
  FOR SELECT
  USING (user_id IN (
    SELECT id FROM public.users
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  ));

CREATE POLICY "Users can insert own working data"
  ON public.user_working_data
  FOR INSERT
  WITH CHECK (user_id IN (
    SELECT id FROM public.users
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  ));

CREATE POLICY "Users can update own working data"
  ON public.user_working_data
  FOR UPDATE
  USING (user_id IN (
    SELECT id FROM public.users
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  ));
