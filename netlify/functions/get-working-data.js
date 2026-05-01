export default async (req, context) => {
  if (req.method !== 'GET') {
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

  async function ensureUserId(email) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/ensure_user_exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ user_email: email, netlify_user_id: null })
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to ensure user: ${txt}`);
    }

    return extractRpcUserId(await res.json());
  }

  try {
    const url = new URL(req.url);
    const rawEmail = url.searchParams.get('email');
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = await ensureUserId(email);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rowRes = await fetch(
      `${supabaseUrl}/rest/v1/user_working_data?user_id=eq.${encodeURIComponent(userId)}&select=id,working_data,updated_at&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );

    if (!rowRes.ok) {
      const txt = await rowRes.text();
      return new Response(JSON.stringify({ error: `Failed to fetch working data: ${txt}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rows = await rowRes.json();
    const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const workingData = Array.isArray(first?.working_data) ? first.working_data : [];

    return new Response(JSON.stringify({
      success: true,
      hasData: workingData.length > 0,
      workingData,
      updatedAt: first?.updated_at || null
    }), {
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
