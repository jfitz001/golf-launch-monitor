import { requireInviteAccess } from './_invite.js';
import { getAdminEmail, getSupabaseConfig, isAdminEmail } from './_access.js';

// Get all users for admin - using REST API
export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const url = new URL(req.url);
    const requesterEmail = String(url.searchParams.get('admin') || '').trim().toLowerCase();

    if (!isAdminEmail(requesterEmail)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
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

    const usersRes = await fetch(`${config.supabaseUrl}/rest/v1/users?select=*`, {
      headers: config.headers
    });

    if (!usersRes.ok) {
      const errorText = await usersRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const users = await usersRes.json();

    const adminEmail = getAdminEmail();
    const transformed = (users || []).map((u) => ({
      email: u.email,
      role: String(u.email || '').toLowerCase() === adminEmail ? 'admin' : 'user',
      blocked: !!u.is_blocked,
      rateLimitExempt: !!u.rate_limit_exempt,
      lastActive: u.updated_at || u.created_at
    }));

    return new Response(JSON.stringify({ users: transformed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get users error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
