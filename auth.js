// Netlify Identity authentication
const netlifyIdentity = window.netlifyIdentity;

// Configure Netlify Identity (hide branding)
if (netlifyIdentity) {
    netlifyIdentity.setLocale('en');
}

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
    console.log('Showing app for user:', user.email);
    if (authSection) {
        authSection.style.display = 'none';
    }
    if (appSection) {
        appSection.style.display = 'block';
    }
    if (userEmail) {
        userEmail.textContent = user.email;
    }
    
    // Store user token for API calls
    if (user.token && user.token.access_token) {
        localStorage.setItem('netlify_token', user.token.access_token);
    }
}

function showAuth() {
    console.log('Showing auth screen');
    if (authSection) {
        authSection.style.display = 'flex';
    }
    if (appSection) {
        appSection.style.display = 'none';
    }
    localStorage.removeItem('netlify_token');
}

// Export current user
window.getCurrentUser = () => netlifyIdentity.currentUser();
