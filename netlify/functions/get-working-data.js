import { requireInviteAccess } from './_invite.js';
import { getSupabaseConfig, requireActiveUser } from './_access.js';

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
      userEmail = body.userEmail || body.email;
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

    const activeUser = await requireActiveUser(String(userEmail).trim().toLowerCase());
    if (!activeUser.ok) {
      return activeUser.response;
    }

    const userId = activeUser.user.id;

    const fetchRes = await fetch(
      `${config.supabaseUrl}/rest/v1/user_working_data?user_id=eq.${userId}&select=id,working_data,updated_at&limit=1`,
      { headers: config.headers }
    );

    if (!fetchRes.ok) {
      const errorText = await fetchRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rows = await fetchRes.json();
    const row = rows?.[0] || null;

    return new Response(JSON.stringify({
      success: true,
      hasData: !!row,
      workingData: row?.working_data || [],
      updatedAt: row?.updated_at || null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get working data error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
