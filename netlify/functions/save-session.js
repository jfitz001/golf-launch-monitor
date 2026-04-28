import { requireInviteAccess } from './_invite.js';
import { getSupabaseConfig, requireActiveUser } from './_access.js';

// Save golf session to Supabase - using REST API
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { session, userEmail } = await req.json();

    if (!session || !userEmail) {
      return new Response(JSON.stringify({ error: 'Session and email required' }), {
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

    const activeUser = await requireActiveUser(String(userEmail).trim().toLowerCase());
    if (!activeUser.ok) {
      return activeUser.response;
    }

    const user = activeUser.user;

    const carryDistances = (session.data || []).map(s => parseFloat(s['Carry Distance']) || 0).filter(d => d > 0);
    const avgCarry = carryDistances.length > 0 ? carryDistances.reduce((a, b) => a + b, 0) / carryDistances.length : 0;
    const bestShot = carryDistances.length > 0 ? Math.max(...carryDistances) : 0;
    const stdDev = carryDistances.length > 1
      ? Math.sqrt(carryDistances.map(x => Math.pow(x - avgCarry, 2)).reduce((a, b) => a + b) / carryDistances.length)
      : 0;
    const consistency = avgCarry > 0 ? Math.max(0, 100 - (stdDev / avgCarry * 100)) : 0;

    const insertRes = await fetch(`${config.supabaseUrl}/rest/v1/golf_sessions`, {
      method: 'POST',
      headers: {
        ...config.headers,
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        user_id: user.id,
        club_type: session.name || 'Unknown',
        shot_count: (session.data || []).length,
        avg_carry: avgCarry.toFixed(2),
        best_shot: bestShot.toFixed(2),
        consistency: consistency.toFixed(2),
        swing_score: session.swingScore?.score || Math.round(consistency),
        swing_grade: session.swingScore?.description || 'Good',
        session_data: session.data || []
      })
    });

    if (!insertRes.ok) {
      const errorText = await insertRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const savedSession = await insertRes.json();

    return new Response(JSON.stringify({
      success: true,
      session: savedSession[0]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Save session error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
