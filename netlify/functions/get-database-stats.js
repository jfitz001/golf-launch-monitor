// Get database stats for admin - using REST API
export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const projectKey = process.env.PROJECT_KEY;
    const serviceKey = process.env.SERVICE_ROLE_KEY;

    if (!projectKey || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = `https://${projectKey}.supabase.co`;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'count=exact'
    };

    // Get user count
    const usersRes = await fetch(`${supabaseUrl}/rest/v1/users?select=id`, { 
      headers: { ...headers, 'Prefer': 'count=exact' }
    });
    const userCount = parseInt(usersRes.headers.get('content-range')?.split('/')[1] || '0');

    // Get session count
    const sessionsRes = await fetch(`${supabaseUrl}/rest/v1/golf_sessions?select=id,created_at`, { 
      headers: { ...headers, 'Prefer': 'count=exact' }
    });
    const sessionCount = parseInt(sessionsRes.headers.get('content-range')?.split('/')[1] || '0');

    // Get today's sessions
    const today = new Date().toISOString().split('T')[0];
    const todayRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?created_at=gte.${today}&select=id`, 
      { headers: { ...headers, 'Prefer': 'count=exact' } }
    );
    const todayCount = parseInt(todayRes.headers.get('content-range')?.split('/')[1] || '0');

    // Get this month's sessions
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const monthRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?created_at=gte.${monthStart}&select=id`, 
      { headers: { ...headers, 'Prefer': 'count=exact' } }
    );
    const monthCount = parseInt(monthRes.headers.get('content-range')?.split('/')[1] || '0');

    return new Response(JSON.stringify({ 
      success: true,
      stats: {
        totalUsers: userCount,
        totalSessions: sessionCount,
        sessionsToday: todayCount,
        sessionsMonth: monthCount,
        estimatedSizeMB: (sessionCount * 0.01).toFixed(2)
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get database stats error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
