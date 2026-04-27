// Netlify Identity authentication
const netlifyIdentity = window.netlifyIdentity;

// Initialize Netlify Identity
netlifyIdentity.on('init', user => {
    if (user) {
        showApp(user);
    } else {
        showAuth();
    }
});

netlifyIdentity.on('login', user => {
    showApp(user);
    netlifyIdentity.close();
});

netlifyIdentity.on('logout', () => {
    showAuth();
});

// Auth UI elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');

// Initialize on page load
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
    if (authSection) authSection.classList.add('hidden');
    if (appSection) appSection.classList.remove('hidden');
    if (userEmail) userEmail.textContent = user.email;
    
    // Store user token for API calls
    localStorage.setItem('netlify_token', user.token.access_token);
}

function showAuth() {
    if (authSection) authSection.classList.remove('hidden');
    if (appSection) appSection.classList.add('hidden');
    localStorage.removeItem('netlify_token');
}

// Export current user
window.getCurrentUser = () => netlifyIdentity.currentUser();
