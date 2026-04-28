import { inviteJsonResponse } from './_invite.js';

const DEFAULT_ADMIN_EMAIL = 'jamiefitzgerald001@gmail.com';
const DEFAULT_RATE_LIMITS = {
  perMinute: 10,
  perHour: 100,
  perDay: 500
};

export function getAdminEmail() {
  return (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
}

export function isAdminEmail(email = '') {
  return String(email).trim().toLowerCase() === getAdminEmail();
}

export function getSupabaseConfig() {
  const projectKey = process.env.PROJECT_KEY;
  const serviceKey = process.env.SERVICE_ROLE_KEY;

  if (!projectKey || !serviceKey) {
    return null;
  }

  return {
    supabaseUrl: `https://${projectKey}.supabase.co`,
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  };
}

export async function ensureUserExists(email, netlifyUserId = null) {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/ensure_user_exists`, {
    method: 'POST',
    headers: config.headers,
    body: JSON.stringify({
      user_email: email,
      netlify_user_id: netlifyUserId
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getUserByEmail(email) {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=*`,
    { headers: config.headers }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const users = await response.json();
  return users?.[0] || null;
}

export async function getOrCreateUser(email, netlifyUserId = null) {
  let user = await getUserByEmail(email);
  if (!user) {
    await ensureUserExists(email, netlifyUserId);
    user = await getUserByEmail(email);
  }
  return user;
}

export async function requireActiveUser(email, options = {}) {
  const { createIfMissing = true, netlifyUserId = null } = options;

  if (!email) {
    return {
      ok: false,
      response: inviteJsonResponse({ error: 'Email required' }, 400)
    };
  }

  try {
    const user = createIfMissing
      ? await getOrCreateUser(email, netlifyUserId)
      : await getUserByEmail(email);

    if (!user) {
      return {
        ok: false,
        response: inviteJsonResponse({ error: 'User not found' }, 404)
      };
    }

    if (user.is_blocked) {
      return {
        ok: false,
        response: inviteJsonResponse({ error: 'User access revoked' }, 403)
      };
    }

    return { ok: true, user };
  } catch (error) {
    return {
      ok: false,
      response: inviteJsonResponse({ error: error.message || 'User check failed' }, 500)
    };
  }
}

export async function getRateLimits() {
  const config = getSupabaseConfig();
  if (!config) return { ...DEFAULT_RATE_LIMITS };

  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/app_settings?key=eq.rate_limits&select=value`,
    { headers: config.headers }
  );

  if (!response.ok) {
    return { ...DEFAULT_RATE_LIMITS };
  }

  const rows = await response.json();
  const value = rows?.[0]?.value || {};

  return {
    perMinute: Math.max(1, Number.parseInt(value.perMinute || DEFAULT_RATE_LIMITS.perMinute, 10)),
    perHour: Math.max(1, Number.parseInt(value.perHour || DEFAULT_RATE_LIMITS.perHour, 10)),
    perDay: Math.max(1, Number.parseInt(value.perDay || DEFAULT_RATE_LIMITS.perDay, 10))
  };
}

export async function setRateLimits(rateLimits) {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  const normalized = {
    perMinute: Math.max(1, Number.parseInt(rateLimits.perMinute || DEFAULT_RATE_LIMITS.perMinute, 10)),
    perHour: Math.max(1, Number.parseInt(rateLimits.perHour || DEFAULT_RATE_LIMITS.perHour, 10)),
    perDay: Math.max(1, Number.parseInt(rateLimits.perDay || DEFAULT_RATE_LIMITS.perDay, 10))
  };

  const response = await fetch(`${config.supabaseUrl}/rest/v1/app_settings`, {
    method: 'POST',
    headers: {
      ...config.headers,
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({
      key: 'rate_limits',
      value: normalized,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return normalized;
}

export async function trackApiUsage({ userEmail, endpoint, status, responseTime }) {
  const config = getSupabaseConfig();
  if (!config || !userEmail) return;

  const response = await fetch(`${config.supabaseUrl}/rest/v1/api_request_logs`, {
    method: 'POST',
    headers: config.headers,
    body: JSON.stringify({
      user_email: userEmail,
      endpoint: endpoint || 'unknown',
      status: Number.isFinite(status) ? status : 0,
      response_time_ms: Number.isFinite(responseTime) ? responseTime : null
    })
  });

  if (!response.ok) {
    console.error('trackApiUsage error:', await response.text());
  }
}

export async function getUsageCounts(userEmail) {
  const config = getSupabaseConfig();
  if (!config || !userEmail) {
    return { minute: 0, hour: 0, day: 0 };
  }

  const now = Date.now();
  const minuteAgo = new Date(now - 60 * 1000).toISOString();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const base = `${config.supabaseUrl}/rest/v1/api_request_logs?user_email=eq.${encodeURIComponent(userEmail)}&select=id`;
  const headers = { ...config.headers, Prefer: 'count=exact' };

  const [minuteRes, hourRes, dayRes] = await Promise.all([
    fetch(`${base}&created_at=gte.${encodeURIComponent(minuteAgo)}`, { headers }),
    fetch(`${base}&created_at=gte.${encodeURIComponent(hourAgo)}`, { headers }),
    fetch(`${base}&created_at=gte.${encodeURIComponent(dayAgo)}`, { headers })
  ]);

  const parseCount = (res) => {
    const contentRange = res.headers.get('content-range');
    if (!contentRange) return 0;
    const total = Number.parseInt(contentRange.split('/')[1] || '0', 10);
    return Number.isFinite(total) ? total : 0;
  };

  return {
    minute: minuteRes.ok ? parseCount(minuteRes) : 0,
    hour: hourRes.ok ? parseCount(hourRes) : 0,
    day: dayRes.ok ? parseCount(dayRes) : 0
  };
}

export async function updateUserAccess(email, { isBlocked, rateLimitExempt }) {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  const patch = {
    updated_at: new Date().toISOString()
  };

  if (typeof isBlocked === 'boolean') patch.is_blocked = isBlocked;
  if (typeof rateLimitExempt === 'boolean') patch.rate_limit_exempt = rateLimitExempt;

  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
    {
      method: 'PATCH',
      headers: {
        ...config.headers,
        Prefer: 'return=representation'
      },
      body: JSON.stringify(patch)
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const rows = await response.json();
  return rows?.[0] || null;
}
