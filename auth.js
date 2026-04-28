// Netlify Identity authentication + invite-only gate
const netlifyIdentity = window.netlifyIdentity;
const INVITE_TOKEN_KEY = 'invite_access_token';
const INVITE_LINK_KEY = 'invite_link_key';
const ADMIN_EMAIL = 'jamiefitzgerald001@gmail.com';

const inviteState = {
    validated: false,
    gateReady: false
};

function getInviteAccessToken() {
    return localStorage.getItem(INVITE_TOKEN_KEY) || '';
}

function getInviteLinkKey() {
    return localStorage.getItem(INVITE_LINK_KEY) || '';
}

function setInviteLinkFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const inviteFromUrl = (params.get('invite') || '').trim();
    if (inviteFromUrl) {
        localStorage.setItem(INVITE_LINK_KEY, inviteFromUrl);
    }
}

function clearInviteAccess() {
    localStorage.removeItem(INVITE_TOKEN_KEY);
}

window.getInviteAccessToken = getInviteAccessToken;
window.getInviteAuthHeaders = (baseHeaders = {}) => {
    const token = getInviteAccessToken();
    if (!token) return { ...baseHeaders };
    return {
        ...baseHeaders,
        'x-invite-token': token
    };
};

async function verifyInvite(payload) {
    const response = await fetch('/.netlify/functions/verify-invite', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    let result = {};
    try {
        result = await response.json();
    } catch (error) {
        result = {};
    }

    if (!response.ok) {
        throw new Error(result.error || 'Invite verification failed');
    }

    return result;
}

function createInviteGateUi() {
    const authCard = document.querySelector('.auth-card');
    if (!authCard) return null;

    let gate = document.getElementById('inviteGate');
    if (gate) return gate;

    gate = document.createElement('div');
    gate.id = 'inviteGate';
    gate.className = 'invite-gate';
    gate.innerHTML = `
        <label for="join-code-input" class="invite-label">Invite Access Code</label>
        <div class="invite-row">
            <input id="join-code-input" class="invite-input" type="password" autocomplete="one-time-code" placeholder="Enter join code" />
            <button id="unlock-btn" class="invite-unlock-btn" type="button">Unlock</button>
        </div>
        <p id="invite-status" class="invite-status">Invite link + code required before sign in.</p>
    `;

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        authCard.insertBefore(gate, loginBtn);
    } else {
        authCard.appendChild(gate);
    }

    return gate;
}

function setInviteStatus(message, isError = false) {
    const status = document.getElementById('invite-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', !!isError);
}

function setLoginAvailability(enabled) {
    const loginBtn = document.getElementById('login-btn');
    if (!loginBtn) return;
    loginBtn.disabled = !enabled;
    loginBtn.classList.toggle('is-disabled', !enabled);
}

async function initInviteGate() {
    setInviteLinkFromUrl();

    const inviteKey = getInviteLinkKey();
    createInviteGateUi();

    if (!inviteKey) {
        inviteState.validated = false;
        setLoginAvailability(true);
        setInviteStatus('No invite link loaded. Admin can sign in. Others need invite link + code.', true);
        const unlockBtn = document.getElementById('unlock-btn');
        const codeInput = document.getElementById('join-code-input');
        if (unlockBtn) unlockBtn.disabled = true;
        if (codeInput) codeInput.disabled = true;
        inviteState.gateReady = true;
        return;
    }

    const existingToken = getInviteAccessToken();
    if (existingToken) {
        try {
            const validateResult = await verifyInvite({
                token: existingToken,
                inviteKey
            });

            if (validateResult.valid) {
                inviteState.validated = true;
                setLoginAvailability(true);
                setInviteStatus('Invite unlocked. You can sign in now.');
                inviteState.gateReady = true;
                return;
            }
        } catch (error) {
            clearInviteAccess();
        }
    }

    inviteState.validated = false;
    setLoginAvailability(false);
    setInviteStatus('Enter join code to unlock this invite link.');

    const unlockBtn = document.getElementById('unlock-btn');
    const codeInput = document.getElementById('join-code-input');
    if (unlockBtn) unlockBtn.disabled = false;
    if (codeInput) codeInput.disabled = false;

    if (unlockBtn && codeInput && !unlockBtn.dataset.bound) {
        unlockBtn.dataset.bound = '1';
        unlockBtn.addEventListener('click', async () => {
            const joinCode = codeInput.value.trim();
            if (!joinCode) {
                setInviteStatus('Join code required.', true);
                return;
            }

            unlockBtn.disabled = true;
            unlockBtn.textContent = 'Checking...';

            try {
                const result = await verifyInvite({ inviteKey, joinCode });
                if (!result.valid || !result.token) {
                    throw new Error('Invalid invite credentials');
                }

                localStorage.setItem(INVITE_TOKEN_KEY, result.token);
                inviteState.validated = true;
                setLoginAvailability(true);
                setInviteStatus('Invite unlocked. Sign in now.');
                codeInput.value = '';
            } catch (error) {
                setInviteStatus(error.message || 'Invalid code or link.', true);
                inviteState.validated = false;
                setLoginAvailability(false);
            } finally {
                unlockBtn.disabled = false;
                unlockBtn.textContent = 'Unlock';
            }
        });
    }

    inviteState.gateReady = true;
}

// Configure Netlify Identity (hide branding)
if (netlifyIdentity) {
    netlifyIdentity.setLocale('en');
}

// Auth UI elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');

// Hide both sections initially to prevent flash
if (authSection) authSection.style.display = 'none';
if (appSection) appSection.style.display = 'none';

// Sync user to Supabase database
async function syncUserToSupabase(user) {
    if (!user || !user.email) return { success: false, blocked: false };

    const response = await fetch('/.netlify/functions/sync-user', {
        method: 'POST',
        headers: window.getInviteAuthHeaders({
            'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
            email: user.email,
            netlify_id: user.id
        })
    });

    let result = {};
    try {
        result = await response.json();
    } catch (error) {
        result = {};
    }

    if (!response.ok) {
        const errorMsg = result.error || 'Failed to sync user';
        const error = new Error(errorMsg);
        error.blocked = result.blocked === true;
        throw error;
    }

    if (result.user_id) {
        localStorage.setItem('supabase_user_id', result.user_id);
    }

    return result;
}

function showApp(user) {
    if (authSection) {
        authSection.style.display = 'none';
    }
    if (appSection) {
        appSection.style.display = 'block';
    }
    if (userEmail) {
        userEmail.textContent = user.email;
    }

    if (user.token && user.token.access_token) {
        localStorage.setItem('netlify_token', user.token.access_token);
    }
}

function showAuth() {
    if (authSection) {
        authSection.style.display = 'flex';
    }
    if (appSection) {
        appSection.style.display = 'none';
    }

    if (!inviteState.validated) {
        setLoginAvailability(false);
    }

    localStorage.removeItem('netlify_token');
}

if (netlifyIdentity) {
    // Initialize Netlify Identity
    netlifyIdentity.on('init', async user => {
        if (user) {
            try {
                await syncUserToSupabase(user);
                if (!inviteState.validated && user.email !== ADMIN_EMAIL) {
                    showAuth();
                    return;
                }
                showApp(user);
            } catch (error) {
                if (error.blocked) {
                    alert('Access revoked by admin.');
                    netlifyIdentity.logout();
                    showAuth();
                    return;
                }
                console.error('Sync error (allowing app):', error);
                showApp(user);
            }
        } else {
            showAuth();
        }
    });

    netlifyIdentity.on('login', async user => {
        try {
            await syncUserToSupabase(user);
            if (!inviteState.validated && user.email !== ADMIN_EMAIL) {
                alert('Invite link + code required for this account.');
                netlifyIdentity.logout();
                showAuth();
                return;
            }
            showApp(user);
            netlifyIdentity.close();

            if (window.updateSessionsList) {
                await window.updateSessionsList();
            }
        } catch (error) {
            if (error.blocked) {
                alert('Access revoked by admin.');
                netlifyIdentity.logout();
                showAuth();
                return;
            }
            console.error('Sync error after login (allowing app):', error);
            showApp(user);
            netlifyIdentity.close();
        }
    });

    netlifyIdentity.on('logout', () => {
        showAuth();
    });
}

async function bootstrapAuth() {
    await initInviteGate();

    if (netlifyIdentity) {
        netlifyIdentity.init();
    }
}

bootstrapAuth();

// Login button
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        if (!inviteState.validated && getInviteLinkKey()) {
            setInviteStatus('Unlock invite first.', true);
        }
        netlifyIdentity.open();
    });
}

// Logout button
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        netlifyIdentity.logout();
    });
}

// Export current user
window.getCurrentUser = () => netlifyIdentity?.currentUser();
