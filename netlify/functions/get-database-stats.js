// Get database stats - simplified
export default async (req, context) => {
  const projectKey = process.env.PROJECT_KEY;
  const serviceKey = process.env.SERVICE_ROLE_KEY;

  if (!projectKey || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = `https://${projectKey}.supabase.co`;

  try {
    // Count users
    const usersRes = await fetch(
      `${supabaseUrl}/rest/v1/users?select=id`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'count=exact'
        }
      }
    );
    const userCount = parseInt(usersRes.headers.get('content-range')?.split('/')[1] || '0');

    // Count sessions
    const sessionsRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?select=id`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'count=exact'
        }
      }
    );
    const sessionCount = parseInt(sessionsRes.headers.get('content-range')?.split('/')[1] || '0');

    return new Response(JSON.stringify({
      totalUsers: userCount,
      totalSessions: sessionCount,
      estimatedSize: `${Math.round((userCount * 0.5 + sessionCount * 2) * 10) / 10} KB`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
