// Netlify Identity authentication - v2.0 cleaned
const netlifyIdentity = window.netlifyIdentity;

// Configure Netlify Identity
if (netlifyIdentity) {
    netlifyIdentity.setLocale('en');
}

// Initialize Netlify Identity
netlifyIdentity.on('init', async user => {
    if (user) {
        await syncUserToSupabase(user);
        showApp(user);
    } else {
        showAuth();
    }
});

netlifyIdentity.on('login', async user => {
    await syncUserToSupabase(user);
    showApp(user);
    netlifyIdentity.close();
    
    // Refresh sessions after login
    if (window.updateSessionsList) {
        await window.updateSessionsList();
    }
});

netlifyIdentity.on('logout', () => {
    showAuth();
});

// Sync user to Supabase database
async function syncUserToSupabase(user) {
    if (!user || !user.email) return;
    
    try {
        console.log('Syncing user to Supabase:', user.email);
        
        const response = await fetch('/.netlify/functions/sync-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.email,
                netlify_id: user.id
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to sync user:', response.status, errorText);
            return;
        }
        
        const result = await response.json();
        console.log('User synced:', result);
        
        if (result.user_id) {
            localStorage.setItem('supabase_user_id', result.user_id);
        }
    } catch (error) {
        console.error('Error syncing user:', error);
    }
}

// Auth UI elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');

// Hide both sections initially
if (authSection) authSection.style.display = 'none';
if (appSection) appSection.style.display = 'none';

// Initialize
netlifyIdentity.init();

// Login button
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        netlifyIdentity.open();
    });
}

// Logout button
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        netlifyIdentity.logout();
    });
}

function showApp(user) {
    console.log('Showing app for:', user.email);
    if (authSection) authSection.style.display = 'none';
    if (appSection) appSection.style.display = 'block';
    if (userEmail) userEmail.textContent = user.email;
    
    // Show admin link if admin
    const adminLink = document.getElementById('admin-link');
    if (adminLink && user.email === 'jamiefitzgerald001@gmail.com') {
        adminLink.style.display = 'inline-block';
    }
}

function showAuth() {
    console.log('Showing auth screen');
    if (authSection) authSection.style.display = 'flex';
    if (appSection) appSection.style.display = 'none';
}

window.getCurrentUser = () => netlifyIdentity.currentUser();
