import { requireInviteAccess } from './_invite.js';
import { getAdminEmail, getOrCreateUser, isAdminEmail } from './_access.js';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { requesterEmail, email } = await req.json();

    if (!isAdminEmail(requesterEmail || '')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!email) {
      return new Response(JSON.stringify({ error: 'email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await getOrCreateUser(normalizedEmail);

    return new Response(JSON.stringify({
      success: true,
      user: {
        email: user.email,
        role: normalizedEmail === getAdminEmail() ? 'admin' : 'user',
        blocked: !!user.is_blocked,
        rateLimitExempt: !!user.rate_limit_exempt,
        lastActive: user.updated_at || user.created_at
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('upsert-user error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
