import { requireInviteAccess } from './_invite.js';
import { getSupabaseConfig } from './_access.js';

// Get API usage statistics
export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const config = getSupabaseConfig();
    if (!config) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    const countHeaders = { ...config.headers, Prefer: 'count=exact' };

    const parseCount = (res) => {
      const contentRange = res.headers.get('content-range');
      if (!contentRange) return 0;
      const total = Number.parseInt(contentRange.split('/')[1] || '0', 10);
      return Number.isFinite(total) ? total : 0;
    };

    const [todayCallsRes, monthCallsRes, rateLimitHitsRes, usersCountRes, recentRes] = await Promise.all([
      fetch(`${config.supabaseUrl}/rest/v1/api_request_logs?select=id&created_at=gte.${encodeURIComponent(todayIso)}`, { headers: countHeaders }),
      fetch(`${config.supabaseUrl}/rest/v1/api_request_logs?select=id&created_at=gte.${encodeURIComponent(monthStart)}`, { headers: countHeaders }),
      fetch(`${config.supabaseUrl}/rest/v1/api_request_logs?select=id&status=eq.429&created_at=gte.${encodeURIComponent(monthStart)}`, { headers: countHeaders }),
      fetch(`${config.supabaseUrl}/rest/v1/users?select=id`, { headers: countHeaders }),
      fetch(`${config.supabaseUrl}/rest/v1/api_request_logs?select=user_email,endpoint,status,response_time_ms,created_at&order=created_at.desc&limit=50`, { headers: config.headers })
    ]);

    const recentRows = recentRes.ok ? await recentRes.json() : [];

    const stats = {
      callsToday: todayCallsRes.ok ? parseCount(todayCallsRes) : 0,
      callsMonth: monthCallsRes.ok ? parseCount(monthCallsRes) : 0,
      totalUsers: usersCountRes.ok ? parseCount(usersCountRes) : 0,
      rateLimitHits: rateLimitHitsRes.ok ? parseCount(rateLimitHitsRes) : 0,
      recentRequests: recentRows.map((row) => ({
        timestamp: row.created_at,
        user: row.user_email,
        endpoint: row.endpoint,
        status: row.status,
        responseTime: row.response_time_ms ?? 0
      })),
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
