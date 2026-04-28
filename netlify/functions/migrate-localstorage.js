import { requireInviteAccess } from './_invite.js';
import { getSupabaseConfig, requireActiveUser } from './_access.js';

// Migrate localStorage sessions to Supabase - using REST API
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { sessions, userEmail } = await req.json();

    if (!sessions || !userEmail) {
      return new Response(JSON.stringify({ error: 'Sessions and email required' }), {
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

    const userId = activeUser.user.id;
    const results = { total: sessions.length, successful: 0, failed: 0, errors: [] };

    for (const session of sessions) {
      try {
        const carryDistances = (session.data || []).map(s => parseFloat(s['Carry Distance']) || 0).filter(d => d > 0);
        const avgCarry = carryDistances.length > 0 ? carryDistances.reduce((a, b) => a + b, 0) / carryDistances.length : 0;
        const bestShot = carryDistances.length > 0 ? Math.max(...carryDistances) : 0;

        const insertRes = await fetch(`${config.supabaseUrl}/rest/v1/golf_sessions`, {
          method: 'POST',
          headers: {
            ...config.headers,
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            user_id: userId,
            club_type: session.name || 'Migrated Session',
            shot_count: (session.data || []).length,
            avg_carry: avgCarry.toFixed(2),
            best_shot: bestShot.toFixed(2),
            consistency: session.stats?.consistency || 0,
            swing_score: session.swingScore?.score || 0,
            swing_grade: session.swingScore?.description || 'Migrated',
            session_data: session.data || []
          })
        });

        if (insertRes.ok) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push({ session: session.name, error: await insertRes.text() });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ session: session.name, error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
