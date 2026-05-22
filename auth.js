// Netlify Identity authentication - stable binding + deduped sync + invite gate
const netlifyIdentity = window.netlifyIdentity;

const authConfig = window.__golfAuthConfig || { adminEmail: 'jamiefitzgerald001@gmail.com', inviteStorageKey: 'golfInviteCode' };
window.__golfAuthConfig = authConfig;

const authRuntime = window.__golfAuthRuntime || {
    handlersBound: false,
    syncByEmail: {},
    lastSyncedEmail: '',
    lastSyncedAt: 0,
    shownEmail: '',
    inviteVerified: false
};
window.__golfAuthRuntime = authRuntime;

// Auth UI elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');

if (authSection) authSection.style.display = 'none';
if (appSection) appSection.style.display = 'none';

function getStoredInviteCode() {
    return (localStorage.getItem(authConfig.inviteStorageKey) || '').trim();
}

function getInviteAuthHeaders() {
    const inviteCode = getStoredInviteCode();
    return inviteCode ? { 'X-Invite-Code': inviteCode } : {};
}

window.getInviteAuthHeaders = getInviteAuthHeaders;

function setInviteStatus(message, type = 'info') {
    const status = document.getElementById('invite-status');
    if (!status) return;
    status.textContent = message;
    status.className = `invite-status ${type}`;
}

function setInviteVerified(isVerified) {
    authRuntime.inviteVerified = isVerified;
    const button = document.getElementById('invite-unlock-btn');
    const input = document.getElementById('invite-code-input');
    if (loginBtn) {
        loginBtn.disabled = !isVerified;
        loginBtn.classList.toggle('is-disabled', !isVerified);
        loginBtn.textContent = isVerified ? 'Sign In / Sign Up' : 'Enter Code To Continue';
    }
    if (button) button.textContent = isVerified ? 'Unlocked' : 'Unlock';
    if (input) input.disabled = isVerified;
}

async function verifyInviteCode(code) {
    const inviteCode = String(code || '').trim();
    if (!inviteCode) return false;

    const response = await fetch('/.netlify/functions/verify-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.valid) {
        throw new Error(result.error || 'Invalid signup code');
    }
    localStorage.setItem(authConfig.inviteStorageKey, inviteCode);
    return true;
}

function ensureInviteGate() {
    if (!authSection || !loginBtn) return;
    const card = authSection.querySelector('.auth-card');
    if (!card || document.getElementById('invite-code-input')) return;

    const gate = document.createElement('div');
    gate.className = 'invite-gate';
    gate.innerHTML = `
        <div class="invite-copy">
            <span class="invite-kicker">Private beta</span>
            <strong>Signup code required</strong>
            <span>Existing approved users can unlock once, then sign in normally.</span>
        </div>
        <label class="invite-label" for="invite-code-input">Signup Code</label>
        <div class="invite-row">
            <input id="invite-code-input" class="invite-input" type="password" autocomplete="one-time-code" placeholder="Enter code" />
            <button id="invite-unlock-btn" class="invite-unlock-btn" type="button">Unlock</button>
        </div>
        <div id="invite-status" class="invite-status">Ask admin for signup code.</div>
    `;
    loginBtn.parentElement.insertBefore(gate, loginBtn);

    const input = document.getElementById('invite-code-input');
    const unlock = document.getElementById('invite-unlock-btn');

    async function unlockInvite() {
        const code = input?.value || getStoredInviteCode();
        unlock.disabled = true;
        setInviteStatus('Checking code...');
        try {
            await verifyInviteCode(code);
            setInviteVerified(true);
            setInviteStatus('Code accepted. Sign in or create account.', 'success');
        } catch (error) {
            localStorage.removeItem(authConfig.inviteStorageKey);
            setInviteVerified(false);
            setInviteStatus(error.message || 'Invalid signup code', 'error');
        } finally {
            unlock.disabled = false;
        }
    }

    unlock.addEventListener('click', unlockInvite);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') unlockInvite();
    });

    const storedCode = getStoredInviteCode();
    if (storedCode) {
        input.value = storedCode;
        unlockInvite();
    } else {
        setInviteVerified(false);
    }
}

function showApp(user) {
    if (!user) return;
    if (authRuntime.shownEmail === user.email && appSection?.style.display === 'block') {
        return;
    }

    authRuntime.shownEmail = user.email;

    if (authSection) {
        authSection.style.display = 'none';
        authSection.classList.remove('ready');
    }
    if (appSection) {
        appSection.style.display = 'block';
        requestAnimationFrame(() => {
            appSection.classList.add('ready');
        });
    }
    if (userEmail) userEmail.textContent = user.email;

    const metadata = user.user_metadata || user.app_metadata || user.data || {};
    if (metadata.handicap !== undefined && metadata.handicap !== null && metadata.handicap !== '') {
        localStorage.setItem('playerHandicap', String(metadata.handicap));
    }

    const adminLink = document.getElementById('admin-link');
    if (adminLink && user.email === authConfig.adminEmail) {
        adminLink.style.display = 'inline-block';
    }

    if (typeof updateSwingScore === 'function') {
        setTimeout(updateSwingScore, 100);
    }

    window.dispatchEvent(new CustomEvent('auth:ready', {
        detail: { email: user.email }
    }));
}

function showAuth() {
    authRuntime.shownEmail = '';
    ensureInviteGate();
    if (appSection) {
        appSection.style.display = 'none';
        appSection.classList.remove('ready');
    }
    if (authSection) {
        authSection.style.display = 'flex';
        requestAnimationFrame(() => {
            authSection.classList.add('ready');
        });
    }
}

async function syncUserToSupabase(user) {
    if (!user || !user.email) return { success: false };

    const email = String(user.email).trim().toLowerCase();
    const now = Date.now();

    if (authRuntime.lastSyncedEmail === email && (now - authRuntime.lastSyncedAt) < 30000) {
        return { success: true, cached: true };
    }

    if (authRuntime.syncByEmail[email]) {
        return authRuntime.syncByEmail[email];
    }

    const promise = (async () => {
        const response = await fetch('/.netlify/functions/sync-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getInviteAuthHeaders() },
            body: JSON.stringify({
                email,
                netlify_id: user.id || null,
                invite_code: getStoredInviteCode() || null
            })
        });

        let result = {};
        try {
            result = await response.json();
        } catch (error) {
            result = {};
        }

        if (!response.ok) {
            throw new Error(result.error || `Sync failed (${response.status})`);
        }

        if (result.user_id) {
            localStorage.setItem('supabase_user_id', result.user_id);
        }

        authRuntime.lastSyncedEmail = email;
        authRuntime.lastSyncedAt = Date.now();
        return result;
    })()
        .catch((error) => {
            console.error('Auth sync error:', error);
            return { success: false, error: error.message };
        })
        .finally(() => {
            delete authRuntime.syncByEmail[email];
        });

    authRuntime.syncByEmail[email] = promise;
    return promise;
}

function bindIdentityHandlers() {
    if (!netlifyIdentity || authRuntime.handlersBound) return;

    authRuntime.handlersBound = true;
    netlifyIdentity.setLocale('en');

    netlifyIdentity.on('init', async (user) => {
        if (user) {
            await syncUserToSupabase(user);
            showApp(user);
            return;
        }
        showAuth();
    });

    netlifyIdentity.on('login', async (user) => {
        const result = await syncUserToSupabase(user);
        if (result && result.success === false && result.error) {
            setInviteVerified(false);
            showAuth();
            setInviteStatus(result.error, 'error');
            netlifyIdentity.close();
            return;
        }
        showApp(user);
        netlifyIdentity.close();

        if (window.updateSessionsList) {
            await window.updateSessionsList();
        }
    });

    netlifyIdentity.on('logout', () => {
        showAuth();
    });

    netlifyIdentity.init();
}

if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        if (!authRuntime.inviteVerified) {
            showAuth();
            setInviteStatus('Enter signup code first.', 'error');
            return;
        }
        netlifyIdentity?.open();
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        netlifyIdentity?.logout();
    });
}

ensureInviteGate();
bindIdentityHandlers();

window.addEventListener('load', () => {
    setTimeout(() => {
        const authVisible = authSection && getComputedStyle(authSection).display !== 'none';
        const appVisible = appSection && getComputedStyle(appSection).display !== 'none';
        if (!authVisible && !appVisible) {
            showAuth();
            if (!netlifyIdentity) {
                setInviteStatus('Auth widget still loading. Refresh if sign in does not open.', 'error');
            }
        }
    }, 1200);
});
window.getCurrentUser = () => netlifyIdentity?.currentUser?.();
