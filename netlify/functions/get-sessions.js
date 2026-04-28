// Get all golf sessions for the current user - using REST API
export default async (req, context) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    let userEmail;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      userEmail = url.searchParams.get('email');
    } else {
      const body = await req.json();
      userEmail = body.email;
    }

    if (!userEmail) {
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
    const headers = {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    };

    // Get user ID
    const userRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(userEmail)}&select=id`,
      { headers }
    );

    if (!userRes.ok) {
      return new Response(JSON.stringify({ sessions: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const users = await userRes.json();
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ sessions: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = users[0].id;

    // Fetch sessions
    const sessionsRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?user_id=eq.${userId}&order=created_at.desc`,
      { headers }
    );

    if (!sessionsRes.ok) {
      const errorText = await sessionsRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const sessions = await sessionsRes.json();

    // Transform to match localStorage format
    const transformed = (sessions || []).map(s => ({
      id: s.id,
      name: s.club_type || 'Golf Session',
      date: s.created_at,
      timestamp: new Date(s.created_at).getTime(),
      data: s.session_data,
      swingScore: {
        score: s.swing_score,
        description: s.swing_grade
      },
      stats: {
        totalShots: s.shot_count,
        avgCarry: s.avg_carry,
        bestShot: s.best_shot,
        consistency: s.consistency
      }
    }));

    return new Response(JSON.stringify({ sessions: transformed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
