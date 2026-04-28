import { requireInviteAccess } from './_invite.js';
import { getSupabaseConfig, requireActiveUser } from './_access.js';

// Get all golf sessions for the current user - using REST API
export default async (req, context) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
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

    const config = getSupabaseConfig();
    if (!config) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const activeUser = await requireActiveUser(String(userEmail).trim().toLowerCase(), {
      createIfMissing: false
    });

    if (!activeUser.ok) {
      // If user not created yet, return empty list instead of error
      if (activeUser.response.status === 404) {
        return new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return activeUser.response;
    }

    const userId = activeUser.user.id;

    const sessionsRes = await fetch(
      `${config.supabaseUrl}/rest/v1/golf_sessions?user_id=eq.${userId}&order=created_at.desc`,
      { headers: config.headers }
    );

    if (!sessionsRes.ok) {
      const errorText = await sessionsRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const sessions = await sessionsRes.json();

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
