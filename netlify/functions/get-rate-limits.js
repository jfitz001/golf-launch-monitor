import { requireInviteAccess } from './_invite.js';
import { getRateLimits, isAdminEmail } from './_access.js';

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
    const requesterEmail = url.searchParams.get('admin') || '';
    if (!isAdminEmail(requesterEmail)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const limits = await getRateLimits();
    return new Response(JSON.stringify({ success: true, limits }), {
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
