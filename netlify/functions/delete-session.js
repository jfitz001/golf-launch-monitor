import { requireInviteAccess } from './_invite.js';
import { getSupabaseConfig, requireActiveUser } from './_access.js';

// Delete golf session - using REST API
export default async (req, context) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { sessionId, userEmail } = await req.json();

    if (!sessionId || !userEmail) {
      return new Response(JSON.stringify({ error: 'Session ID and email required' }), {
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

    const activeUser = await requireActiveUser(String(userEmail).trim().toLowerCase(), {
      createIfMissing: false
    });
    if (!activeUser.ok) {
      return activeUser.response;
    }

    const userId = activeUser.user.id;

    const deleteRes = await fetch(
      `${config.supabaseUrl}/rest/v1/golf_sessions?id=eq.${sessionId}&user_id=eq.${userId}`,
      { method: 'DELETE', headers: config.headers }
    );

    if (!deleteRes.ok) {
      const errorText = await deleteRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete session error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
