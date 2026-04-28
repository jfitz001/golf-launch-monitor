import { requireInviteAccess } from './_invite.js';
import { getOrCreateUser } from './_access.js';

// Sync Netlify Identity user to Supabase database - using REST API
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { email, netlify_id } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = await getOrCreateUser(String(email).trim().toLowerCase(), netlify_id || null);

    if (!user) {
      return new Response(JSON.stringify({ error: 'User sync failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (user.is_blocked) {
      return new Response(JSON.stringify({
        error: 'User access revoked',
        blocked: true
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: user.id,
      blocked: !!user.is_blocked,
      rateLimitExempt: !!user.rate_limit_exempt
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Sync user error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
