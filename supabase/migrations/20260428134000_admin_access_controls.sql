-- Admin access controls and rate limit persistence

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rate_limit_exempt BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (key, value)
VALUES ('rate_limits', '{"perMinute":10,"perHour":100,"perDay":500}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_user_email_created_at
  ON public.api_request_logs (user_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at
  ON public.api_request_logs (created_at DESC);

-- Ensure known admin always exempt from rate limits
UPDATE public.users
SET rate_limit_exempt = TRUE
WHERE email = 'jamiefitzgerald001@gmail.com';
