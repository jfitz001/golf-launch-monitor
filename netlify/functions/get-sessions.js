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

    // Transform for frontend (supports mixed legacy/new schemas)
    const transformed = (Array.isArray(sessions) ? sessions : []).map((s, index) => {
      const data = Array.isArray(s.shot_data)
        ? s.shot_data
        : (Array.isArray(s.session_data) ? s.session_data : []);

      const firstShot = data[0] || {};
      const inferredClub = firstShot['Club Name'] || firstShot['Club Type'] || firstShot['Club'] || 'Golf Session';
      const rawName = s.session_name || s.name || s.club_type || inferredClub;
      const invalidName = !rawName || ['undefined', 'null', 'nan'].includes(String(rawName).trim().toLowerCase());
      const safeName = invalidName ? inferredClub : String(rawName).trim();

      return {
        id: String(s.id || s.session_id || `${Date.now()}-${index}`),
        name: safeName,
        date: s.created_at || s.date || new Date().toISOString(),
        shotCount: Number(s.shot_count || data.length || 0),
        avgCarry: s.avg_carry,
        avgClubSpeed: s.avg_club_speed,
        data
      };
    });

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
