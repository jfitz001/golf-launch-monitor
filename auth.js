// Netlify Identity authentication - stable binding + deduped sync
const netlifyIdentity = window.netlifyIdentity;

const authRuntime = window.__golfAuthRuntime || {
    handlersBound: false,
    syncByEmail: {},
    lastSyncedEmail: '',
    lastSyncedAt: 0,
    shownEmail: ''
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

    const adminLink = document.getElementById('admin-link');
    if (adminLink && user.email === 'jamiefitzgerald001@gmail.com') {
        adminLink.style.display = 'inline-block';
    }

    if (typeof updateSwingScore === 'function') {
        setTimeout(updateSwingScore, 100);
    }
}

function showAuth() {
    authRuntime.shownEmail = '';
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                netlify_id: user.id || null
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
        await syncUserToSupabase(user);
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
    loginBtn.addEventListener('click', () => {
        netlifyIdentity?.open();
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        netlifyIdentity?.logout();
    });
}

bindIdentityHandlers();
window.getCurrentUser = () => netlifyIdentity?.currentUser?.();
