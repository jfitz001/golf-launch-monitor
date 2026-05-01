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
    const { userEmail, workingData } = await req.json();
    const email = userEmail ? String(userEmail).trim().toLowerCase() : '';

    if (!email || !Array.isArray(workingData)) {
      return new Response(JSON.stringify({ error: 'userEmail and workingData[] required' }), {
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

    const payload = [{
      user_id: userId,
      working_data: workingData,
      updated_at: new Date().toISOString()
    }];

    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/user_working_data?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!upsertRes.ok) {
      const txt = await upsertRes.text();
      return new Response(JSON.stringify({ error: `Failed to upsert working data: ${txt}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rows = await upsertRes.json();
    const row = Array.isArray(rows) ? rows[0] : rows;

    return new Response(JSON.stringify({
      success: true,
      userId,
      rowId: row?.id || null,
      updatedAt: row?.updated_at || payload[0].updated_at,
      shotCount: Array.isArray(workingData) ? workingData.length : 0
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
