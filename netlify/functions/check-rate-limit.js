import { requireInviteAccess } from './_invite.js';
import {
  getRateLimits,
  getUsageCounts,
  isAdminEmail,
  requireActiveUser,
  trackApiUsage
} from './_access.js';

// Check if user has exceeded rate limits
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  try {
    const body = await req.json();
    const userEmail = String(body.userEmail || body.email || '').trim().toLowerCase();
    const endpoint = String(body.endpoint || 'unknown').trim();

    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'userEmail required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const activeUser = await requireActiveUser(userEmail, { createIfMissing: true });
    if (!activeUser.ok) {
      return activeUser.response;
    }

    const user = activeUser.user;

    if (isAdminEmail(userEmail) || user.rate_limit_exempt) {
      return new Response(JSON.stringify({
        allowed: true,
        bypassed: true,
        reason: 'admin-or-exempt',
        limits: await getRateLimits(),
        usage: { currentMinute: 0, currentHour: 0, currentDay: 0 }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const limits = await getRateLimits();
    const usage = await getUsageCounts(userEmail);

    const allowed =
      usage.minute < limits.perMinute &&
      usage.hour < limits.perHour &&
      usage.day < limits.perDay;

    if (!allowed) {
      await trackApiUsage({
        userEmail,
        endpoint: `${endpoint}:rate-limit-hit`,
        status: 429,
        responseTime: 0
      });
    }

    return new Response(JSON.stringify({
      allowed,
      limits,
      usage: {
        currentMinute: usage.minute,
        currentHour: usage.hour,
        currentDay: usage.day
      }
    }), {
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
