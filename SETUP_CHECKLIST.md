# Supabase + Netlify Setup Checklist

## Step 1: Verify Netlify Environment Variables

Go to: https://app.netlify.com/sites/golf-launch-r10/configuration/env

You need these 3 environment variables set:

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `PROJECT_KEY` | `obwrjgmbyoznntlofqyk` | Your Supabase project ID |
| `SERVICE_ROLE_KEY` | (your service role key) | From Supabase Settings > API |
| `ANON_KEY` | (your anon key) | From Supabase Settings > API |

### How to get keys from Supabase:
1. Go to https://supabase.com/dashboard/project/obwrjgmbyoznntlofqyk/settings/api
2. Copy "Project URL" → extract the project ID (already have: `obwrjgmbyoznntlofqyk`)
3. Copy "anon public" key → set as `ANON_KEY`
4. Copy "service_role" key → set as `SERVICE_ROLE_KEY`

**IMPORTANT**: The service role key you provided earlier appears to have a typo. Please re-copy it from Supabase.

## Step 2: Run Supabase Migration

Go to: https://supabase.com/dashboard/project/obwrjgmbyoznntlofqyk/sql/new

Paste and run this SQL:

```sql
-- Drop existing policies if they exist (allows re-running)
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view own sessions" ON public.golf_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.golf_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.golf_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.golf_sessions;

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  netlify_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create golf_sessions table
CREATE TABLE IF NOT EXISTS public.golf_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  club_type TEXT,
  shot_count INTEGER DEFAULT 0,
  avg_carry DECIMAL(10,2),
  best_shot DECIMAL(10,2),
  consistency DECIMAL(5,2),
  swing_score INTEGER,
  swing_grade TEXT,
  session_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_netlify_id ON public.users(netlify_id);
CREATE INDEX IF NOT EXISTS idx_golf_sessions_user_id ON public.golf_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_sessions_created_at ON public.golf_sessions(created_at);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (true);

-- Create RLS policies for golf_sessions
CREATE POLICY "Users can view own sessions" ON public.golf_sessions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own sessions" ON public.golf_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own sessions" ON public.golf_sessions
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own sessions" ON public.golf_sessions
  FOR DELETE USING (true);

-- Create function to ensure user exists
CREATE OR REPLACE FUNCTION public.ensure_user_exists(
  user_email TEXT,
  netlify_user_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  existing_id UUID;
BEGIN
  SELECT id INTO existing_id FROM public.users WHERE email = user_email;
  
  IF existing_id IS NULL THEN
    INSERT INTO public.users (email, netlify_id)
    VALUES (user_email, netlify_user_id)
    RETURNING id INTO existing_id;
  ELSIF netlify_user_id IS NOT NULL THEN
    UPDATE public.users SET netlify_id = netlify_user_id, updated_at = NOW()
    WHERE id = existing_id;
  END IF;
  
  RETURN existing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Step 3: Redeploy

After setting environment variables, trigger a new deploy:

```bash
cd /Users/jamiefitzgerald/PycharmProjects/tmp/golf
git add -A && git commit --allow-empty -m "Trigger redeploy" && git push
```

Or from Netlify dashboard: Deploys → Trigger deploy

## Step 4: Test

1. Go to https://golf-launch-r10.netlify.app
2. Log in
3. Upload a CSV
4. Click "Save Current Session"
5. Check browser console (F12) for errors
6. Check Supabase Table Editor for new records

## Troubleshooting

### "Supabase not configured" error
- Environment variables not set or misspelled in Netlify

### "relation does not exist" error  
- Migration SQL hasn't been run in Supabase

### Sessions saving to "offline mode"
- Check browser console for the actual API error
- Verify environment variables are set correctly
