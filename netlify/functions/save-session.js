// Save session to Supabase - simplified
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
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
    const { email, sessionName, shots } = await req.json();

    if (!email || !shots) {
      return new Response(JSON.stringify({ error: 'Email and shots required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ensure user exists
    const userRes = await fetch(`${supabaseUrl}/rest/v1/rpc/ensure_user_exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ user_email: email, netlify_user_id: null })
    });

    const userId = await userRes.json();

    // Calculate stats
    const shotCount = shots.length;
    const avgCarry = shots.reduce((sum, s) => sum + (parseFloat(s['Carry Distance'] || s['Carry Dist.'] || 0)), 0) / shotCount || 0;
    const avgClubSpeed = shots.reduce((sum, s) => sum + (parseFloat(s['Club Speed'] || 0)), 0) / shotCount || 0;

    // Insert session
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/golf_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        user_id: userId,
        session_name: sessionName || `Session ${new Date().toLocaleDateString()}`,
        shot_data: shots,
        shot_count: shotCount,
        avg_carry: Math.round(avgCarry * 10) / 10,
        avg_club_speed: Math.round(avgClubSpeed * 10) / 10
      })
    });

    const session = await insertRes.json();

    return new Response(JSON.stringify({ success: true, session: session[0] }), {
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
