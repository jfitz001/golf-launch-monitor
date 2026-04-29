// Migrate localStorage to Supabase - simplified
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

  async function getGolfSessionColumns() {
    const sampleRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?select=*&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );
    if (!sampleRes.ok) return new Set();
    const rows = await sampleRes.json();
    if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0] !== 'object') return new Set();
    return new Set(Object.keys(rows[0]));
  }

  try {
    const { email, sessions } = await req.json();

    if (!email || !sessions || !Array.isArray(sessions)) {
      return new Response(JSON.stringify({ error: 'Email and sessions array required' }), {
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

    let migrated = 0;
    let failed = 0;
    let availableColumns = new Set();
    try {
      availableColumns = await getGolfSessionColumns();
    } catch (e) {
      availableColumns = new Set();
    }

    for (const session of sessions) {
      try {
        const shots = session.data || [];
        const shotCount = shots.length;
        const avgCarry = shots.reduce((sum, s) => sum + (parseFloat(s['Carry Distance'] || s['Carry Dist.'] || 0)), 0) / shotCount || 0;
        const avgClubSpeed = shots.reduce((sum, s) => sum + (parseFloat(s['Club Speed'] || 0)), 0) / shotCount || 0;

        const payload = {
          user_id: userId,
          session_name: session.name || `Session ${new Date(session.date).toLocaleDateString()}`,
          shot_data: shots,
          shot_count: shotCount
        };
        if (availableColumns.has('avg_carry')) {
          payload.avg_carry = Math.round(avgCarry * 10) / 10;
        }
        if (availableColumns.has('avg_club_speed')) {
          payload.avg_club_speed = Math.round(avgClubSpeed * 10) / 10;
        }

        await fetch(`${supabaseUrl}/rest/v1/golf_sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify(payload)
        });
        migrated++;
      } catch (e) {
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, migrated, failed }), {
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
