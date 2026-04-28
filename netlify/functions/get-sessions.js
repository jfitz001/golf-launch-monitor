// Get sessions from Supabase - simplified
export default async (req, context) => {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

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
    // Get user ID
    const userRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );

    const users = await userRes.json();
    if (!users || users.length === 0) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = users[0].id;

    // Get sessions
    const sessionsRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?user_id=eq.${userId}&order=created_at.desc`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );

    const sessions = await sessionsRes.json();

    // Transform for frontend
    const transformed = sessions.map(s => ({
      id: s.id,
      name: s.session_name,
      date: s.created_at,
      shotCount: s.shot_count,
      avgCarry: s.avg_carry,
      avgClubSpeed: s.avg_club_speed,
      data: s.shot_data
    }));

    return new Response(JSON.stringify(transformed), {
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
