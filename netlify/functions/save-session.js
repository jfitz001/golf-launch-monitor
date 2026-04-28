// Save golf session to Supabase - using REST API
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { session, userEmail } = await req.json();
    
    if (!session || !userEmail) {
      return new Response(JSON.stringify({ error: 'Session and email required' }), {
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
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=representation'
    };

    // Ensure user exists
    const userRes = await fetch(`${supabaseUrl}/rest/v1/rpc/ensure_user_exists`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_email: userEmail, netlify_user_id: null })
    });

    if (!userRes.ok) {
      const errorText = await userRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = await userRes.json();

    // Calculate stats
    const carryDistances = session.data.map(s => parseFloat(s['Carry Distance']) || 0).filter(d => d > 0);
    const avgCarry = carryDistances.length > 0 ? carryDistances.reduce((a,b) => a+b, 0) / carryDistances.length : 0;
    const bestShot = carryDistances.length > 0 ? Math.max(...carryDistances) : 0;
    const stdDev = carryDistances.length > 1 ? Math.sqrt(carryDistances.map(x => Math.pow(x - avgCarry, 2)).reduce((a, b) => a + b) / carryDistances.length) : 0;
    const consistency = avgCarry > 0 ? Math.max(0, 100 - (stdDev / avgCarry * 100)) : 0;

    // Insert session
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/golf_sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        club_type: session.name || 'Unknown',
        shot_count: session.data.length,
        avg_carry: avgCarry.toFixed(2),
        best_shot: bestShot.toFixed(2),
        consistency: consistency.toFixed(2),
        swing_score: session.swingScore?.score || Math.round(consistency),
        swing_grade: session.swingScore?.description || 'Good',
        session_data: session.data
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
