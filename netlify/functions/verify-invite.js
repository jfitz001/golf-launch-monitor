function allowedCodes() {
  return String(process.env.SIGNUP_CODES || process.env.SIGNUP_CODE || process.env.INVITE_CODE || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
}

function normalize(code) {
  return String(code || '').trim();
}

export function isValidInviteCode(code) {
  const input = normalize(code);
  if (!input) return false;
  return allowedCodes().some((allowed) => input === allowed);
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const code = body.code || req.headers.get('x-invite-code');

    if (!isValidInviteCode(code)) {
      return new Response(JSON.stringify({ valid: false, error: 'Invalid signup code' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ valid: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ valid: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
