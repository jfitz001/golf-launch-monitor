import { requireInviteAccess } from './_invite.js';
import { requireActiveUser, trackApiUsage } from './_access.js';

// Track API usage in real-time
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const { endpoint, status, responseTime, user, userEmail } = await req.json();
    const normalizedEmail = String(userEmail || user || '').trim().toLowerCase();

    if (!normalizedEmail) {
      return new Response(JSON.stringify({ error: 'userEmail required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const activeUser = await requireActiveUser(normalizedEmail, { createIfMissing: true });
    if (!activeUser.ok) {
      return activeUser.response;
    }

    await trackApiUsage({
      userEmail: normalizedEmail,
      endpoint: endpoint || 'unknown',
      status: Number.parseInt(status || 0, 10),
      responseTime: Number.parseInt(responseTime || 0, 10)
    });

    return new Response(JSON.stringify({ success: true, message: 'Usage tracked' }), {
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
