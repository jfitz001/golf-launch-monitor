import { requireInviteAccess } from './_invite.js';
import {
  getRateLimits,
  getUsageCounts,
  isAdminEmail,
  requireActiveUser,
  trackApiUsage
} from './_access.js';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const inviteAccess = requireInviteAccess(req);
  if (!inviteAccess.ok) {
    return inviteAccess.response;
  }

  const apiKey = process.env.GEMINI_API_KEY || context.env?.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const userEmail = String(body.userEmail || '').trim().toLowerCase();

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
    const limits = await getRateLimits();

    if (!isAdminEmail(userEmail) && !user.rate_limit_exempt) {
      const usage = await getUsageCounts(userEmail);
      const allowed =
        usage.minute < limits.perMinute &&
        usage.hour < limits.perHour &&
        usage.day < limits.perDay;

      if (!allowed) {
        await trackApiUsage({
          userEmail,
          endpoint: 'gemini-proxy:rate-limit-hit',
          status: 429,
          responseTime: 0
        });

        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          limits,
          usage: {
            currentMinute: usage.minute,
            currentHour: usage.hour,
            currentDay: usage.day
          }
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const startTime = Date.now();

    const payload = {
      contents: body.contents || []
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    await trackApiUsage({
      userEmail,
      endpoint: 'gemini-proxy',
      status: response.status,
      responseTime
    });

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
