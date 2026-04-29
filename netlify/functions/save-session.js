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

  function extractRpcUserId(payload) {
    if (!payload) return null;
    if (typeof payload === 'string') return payload;
    if (Array.isArray(payload)) return extractRpcUserId(payload[0]);
    if (typeof payload === 'object') {
      return payload.user_id || payload.id || payload.ensure_user_exists || null;
    }
    return null;
  }

  async function getGolfSessionColumns() {
    const columnsRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?select=*&limit=0`,
      {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'count=exact'
        }
      }
    );

    if (!columnsRes.ok) return new Set();

    const raw = columnsRes.headers.get('content-profile') || '';
    // content-profile doesn't list columns; fallback: fetch one row with limit=1 and inspect keys.
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
    const { email, sessionName, shots } = await req.json();

    if (!email || !Array.isArray(shots)) {
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

    if (!userRes.ok) {
      const userErrorText = await userRes.text();
      return new Response(JSON.stringify({ error: `Failed to ensure user: ${userErrorText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userPayload = await userRes.json();
    const userId = extractRpcUserId(userPayload);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id from ensure_user_exists response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Calculate stats
    const shotCount = shots.length;
    const avgCarry = shots.reduce((sum, s) => sum + (parseFloat(s['Carry Distance'] || s['Carry Dist.'] || 0)), 0) / shotCount || 0;
    const avgClubSpeed = shots.reduce((sum, s) => sum + (parseFloat(s['Club Speed'] || 0)), 0) / shotCount || 0;

    // Build payload using guaranteed columns, plus optional metrics if columns exist.
    const payload = {
      user_id: userId,
      session_name: sessionName || `Session ${new Date().toLocaleDateString()}`,
      shot_data: shots,
      shot_count: shotCount
    };

    try {
      const availableColumns = await getGolfSessionColumns();
      if (availableColumns.has('avg_carry')) {
        payload.avg_carry = Math.round(avgCarry * 10) / 10;
      }
      if (availableColumns.has('avg_club_speed')) {
        payload.avg_club_speed = Math.round(avgClubSpeed * 10) / 10;
      }
    } catch (e) {
      // Ignore optional column detection failures; core payload still valid.
    }

    // Insert session
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/golf_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!insertRes.ok) {
      const insertErrorText = await insertRes.text();
      return new Response(JSON.stringify({ error: `Failed to save session: ${insertErrorText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const insertPayload = await insertRes.json();
    const session = Array.isArray(insertPayload) ? insertPayload[0] : insertPayload;

    return new Response(JSON.stringify({ success: true, session }), {
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
