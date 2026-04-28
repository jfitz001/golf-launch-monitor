import {
  getInviteConfig,
  inviteJsonResponse,
  mintInviteToken,
  validateInviteCredentials,
  validateInviteToken
} from './_invite.js';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { inviteKey, joinCode, token } = await req.json();

    // Token validation path
    if (token) {
      const config = getInviteConfig();
      if (!config.inviteKey || !config.secret) {
        return inviteJsonResponse({
          error: 'Invite access not configured. Set INVITE_LINK_KEY and INVITE_TOKEN_SECRET.'
        }, 500);
      }

      const validation = validateInviteToken(token, config.inviteKey, config.secret);
      if (!validation.valid) {
        return inviteJsonResponse({ valid: false, error: validation.error }, 403);
      }

      return inviteJsonResponse({ valid: true, expiresAt: validation.payload.exp }, 200);
    }

    // Invite key + join code exchange path
    const credentialResult = validateInviteCredentials((inviteKey || '').trim(), (joinCode || '').trim());
    if (!credentialResult.ok) {
      return inviteJsonResponse({ valid: false, error: credentialResult.error }, credentialResult.status);
    }

    const inviteToken = mintInviteToken(
      credentialResult.config.inviteKey,
      credentialResult.config.secret,
      credentialResult.config.ttlMs
    );

    return inviteJsonResponse({
      valid: true,
      token: inviteToken,
      expiresInDays: Math.round(credentialResult.config.ttlMs / (24 * 60 * 60 * 1000))
    }, 200);
  } catch (error) {
    console.error('Verify invite error:', error);
    return inviteJsonResponse({ error: error.message || 'Invite verification failed' }, 500);
  }
};
