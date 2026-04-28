import { requireInviteAccess } from './_invite.js';
import { isAdminEmail, setRateLimits } from './_access.js';

export default async (req, context) => {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { requesterEmail, perMinute, perHour, perDay } = await req.json();

    if (!isAdminEmail(requesterEmail || '')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const limits = await setRateLimits({ perMinute, perHour, perDay });

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
