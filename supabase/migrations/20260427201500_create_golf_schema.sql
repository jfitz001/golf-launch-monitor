-- Golf sessions schema for multi-user support

-- Users table (extends Netlify Identity)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  netlify_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Golf sessions table
CREATE TABLE IF NOT EXISTS public.golf_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  club_type TEXT,
  shot_count INTEGER,
  avg_carry DECIMAL,
  best_shot DECIMAL,
  consistency DECIMAL,
  swing_score INTEGER,
  swing_grade TEXT,
  session_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_golf_sessions_user_id ON public.golf_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_sessions_created_at ON public.golf_sessions(created_at DESC);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view own profile"
  ON public.users
  FOR SELECT
  USING (email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (email = current_setting('request.jwt.claims', true)::json->>'email');

-- RLS Policies for golf_sessions table
CREATE POLICY "Users can view own sessions"
  ON public.golf_sessions
  FOR SELECT
  USING (user_id IN (
    SELECT id FROM public.users 
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  ));

CREATE POLICY "Users can insert own sessions"
  ON public.golf_sessions
  FOR INSERT
  WITH CHECK (user_id IN (
    SELECT id FROM public.users 
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  ));

CREATE POLICY "Users can update own sessions"
  ON public.golf_sessions
  FOR UPDATE
  USING (user_id IN (
    SELECT id FROM public.users 
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  ));

CREATE POLICY "Users can delete own sessions"
  ON public.golf_sessions
  FOR DELETE
  USING (user_id IN (
    SELECT id FROM public.users 
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
  ));

-- Function to auto-create user from Netlify Identity
CREATE OR REPLACE FUNCTION public.ensure_user_exists(user_email TEXT, netlify_user_id TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid UUID;
BEGIN
  INSERT INTO public.users (email, netlify_id)
  VALUES (user_email, netlify_user_id)
  ON CONFLICT (email) 
  DO UPDATE SET netlify_id = COALESCE(EXCLUDED.netlify_id, users.netlify_id)
  RETURNING id INTO user_uuid;
  
  RETURN user_uuid;
END;
$$;
