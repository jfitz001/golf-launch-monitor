import { requireInviteAccess } from './_invite.js';
import {
  getAdminEmail,
  isAdminEmail,
  getOrCreateUser,
  updateUserAccess
} from './_access.js';

export default async (req, context) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { requesterEmail, targetEmail, blocked, rateLimitExempt } = await req.json();

    if (!isAdminEmail(requesterEmail || '')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!targetEmail) {
      return new Response(JSON.stringify({ error: 'targetEmail required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedTarget = String(targetEmail).trim().toLowerCase();
    if (normalizedTarget === getAdminEmail()) {
      return new Response(JSON.stringify({ error: 'Cannot modify admin access flags' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await getOrCreateUser(normalizedTarget);
    const updated = await updateUserAccess(normalizedTarget, {
      isBlocked: typeof blocked === 'boolean' ? blocked : undefined,
      rateLimitExempt: typeof rateLimitExempt === 'boolean' ? rateLimitExempt : undefined
    });

    return new Response(JSON.stringify({
      success: true,
      user: {
        email: updated.email,
        blocked: !!updated.is_blocked,
        rateLimitExempt: !!updated.rate_limit_exempt
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('set-user-access error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
