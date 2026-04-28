import { createHmac, timingSafeEqual } from 'node:crypto';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function getInviteConfig() {
  const inviteKey = (process.env.INVITE_LINK_KEY || '').trim();
  const joinCode = (process.env.INVITE_JOIN_CODE || '').trim();
  const secret = (process.env.INVITE_TOKEN_SECRET || process.env.SERVICE_ROLE_KEY || '').trim();
  const ttlDays = Number.parseInt(process.env.INVITE_TOKEN_TTL_DAYS || '30', 10);

  return {
    inviteKey,
    joinCode,
    secret,
    ttlMs: Number.isFinite(ttlDays) ? Math.max(ttlDays, 1) * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
  };
}

function base64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function parseBase64Json(value) {
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  return JSON.parse(decoded);
}

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function mintInviteToken(inviteKey, secret, ttlMs) {
  const payload = base64Json({
    inviteKey,
    exp: Date.now() + ttlMs,
    iat: Date.now()
  });
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export function validateInviteToken(token, expectedInviteKey, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, error: 'Invalid invite token format' };
  }

  const [payload, signature] = token.split('.');
  const expectedSignature = signPayload(payload, secret);

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid invite token signature' };
  }

  let parsed;
  try {
    parsed = parseBase64Json(payload);
  } catch (error) {
    return { valid: false, error: 'Invalid invite token payload' };
  }

  if (parsed.inviteKey !== expectedInviteKey) {
    return { valid: false, error: 'Invite token link mismatch' };
  }

  if (!parsed.exp || Date.now() > parsed.exp) {
    return { valid: false, error: 'Invite token expired' };
  }

  return { valid: true, payload: parsed };
}

export function getInviteTokenFromRequest(req) {
  const inviteHeader = req.headers.get('x-invite-token');
  if (inviteHeader) return inviteHeader.trim();

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return '';
}

export function requireInviteAccess(req) {
  const config = getInviteConfig();

  if (!config.inviteKey || !config.joinCode || !config.secret) {
    return {
      ok: false,
      response: jsonResponse({
        error: 'Invite access not configured. Set INVITE_LINK_KEY, INVITE_JOIN_CODE, INVITE_TOKEN_SECRET.'
      }, 500)
    };
  }

  const token = getInviteTokenFromRequest(req);
  const tokenResult = validateInviteToken(token, config.inviteKey, config.secret);

  if (!tokenResult.valid) {
    return {
      ok: false,
      response: jsonResponse({ error: tokenResult.error || 'Unauthorized invite access' }, 403)
    };
  }

  return { ok: true, config, tokenPayload: tokenResult.payload };
}

export function validateInviteCredentials(inviteKey, joinCode) {
  const config = getInviteConfig();

  if (!config.inviteKey || !config.joinCode || !config.secret) {
    return {
      ok: false,
      status: 500,
      error: 'Invite access not configured. Set INVITE_LINK_KEY, INVITE_JOIN_CODE, INVITE_TOKEN_SECRET.'
    };
  }

  if (!inviteKey || inviteKey !== config.inviteKey) {
    return { ok: false, status: 403, error: 'Invite link invalid' };
  }

  if (!joinCode || joinCode !== config.joinCode) {
    return { ok: false, status: 403, error: 'Join code invalid' };
  }

  return { ok: true, config };
}

export function inviteJsonResponse(body, status = 200) {
  return jsonResponse(body, status);
}
