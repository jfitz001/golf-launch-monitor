import { requireInviteAccess } from './_invite.js';
import { getSupabaseConfig, requireActiveUser } from './_access.js';

export default async (req, context) => {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { userEmail, workingData } = await req.json();

    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!Array.isArray(workingData)) {
      return new Response(JSON.stringify({ error: 'workingData array required' }), {
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

    const upsertRes = await fetch(`${config.supabaseUrl}/rest/v1/user_working_data?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        ...config.headers,
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        user_id: userId,
        working_data: workingData,
        updated_at: new Date().toISOString()
      })
    });

    if (!upsertRes.ok) {
      const errorText = await upsertRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rows = await upsertRes.json();
    const row = rows?.[0] || null;

    return new Response(JSON.stringify({
      success: true,
      updatedAt: row?.updated_at || new Date().toISOString(),
      count: Array.isArray(workingData) ? workingData.length : 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Upsert working data error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
