// Sync Netlify Identity user to Supabase database - using REST API
import { isValidInviteCode } from './verify-invite.js';

const ADMIN_EMAIL = 'jamiefitzgerald001@gmail.com';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function findExistingUser(supabaseUrl, serviceKey, email) {
  const response = await fetch(`${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id,email&limit=1`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  if (!response.ok) return null;
  const users = await response.json().catch(() => []);
  return Array.isArray(users) && users.length ? users[0] : null;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { email, netlify_id, invite_code } = await req.json();

    if (!email) {
      return json({ error: 'Email required' }, 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const projectKey = process.env.PROJECT_KEY;
    const serviceKey = process.env.SERVICE_ROLE_KEY;

    if (!projectKey || !serviceKey) {
      return json({
        error: 'Supabase not configured',
        missing: !projectKey ? 'PROJECT_KEY' : 'SERVICE_ROLE_KEY'
      }, 500);
    }

    const supabaseUrl = `https://${projectKey}.supabase.co`;
    const existingUser = await findExistingUser(supabaseUrl, serviceKey, normalizedEmail);
    const codeFromHeader = req.headers.get('x-invite-code');
    const canCreateUser = existingUser || normalizedEmail === ADMIN_EMAIL || isValidInviteCode(invite_code || codeFromHeader);

    if (!canCreateUser) {
      return json({ error: 'Signup code required for new accounts' }, 403);
    }

    // Call RPC function via REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ensure_user_exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        user_email: normalizedEmail,
        netlify_user_id: netlify_id || null
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Supabase error:', errorText);
      return json({ error: errorText }, 500);
    }

    const userId = await response.json();

    return json({
      success: true,
      user_id: userId
    });
  } catch (error) {
    console.error('Sync user error:', error);
    return json({ error: error.message }, 500);
  }
};
