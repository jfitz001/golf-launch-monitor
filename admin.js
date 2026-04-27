// Admin functionality
const ADMIN_EMAIL = 'jamiefitzgerald001@gmail.com';

// Check if user is admin
function checkAdminAccess() {
    const user = netlifyIdentity.currentUser();
    
    if (!user) {
        document.getElementById('auth-section').style.display = 'flex';
        document.getElementById('app-section').style.display = 'none';
        return false;
    }
    
    if (user.email !== ADMIN_EMAIL) {
        document.getElementById('admin-content').style.display = 'none';
        document.getElementById('access-denied').style.display = 'block';
        return false;
    }
    
    document.getElementById('admin-content').style.display = 'block';
    document.getElementById('access-denied').style.display = 'none';
    return true;
}

// Initialize admin dashboard
window.addEventListener('load', () => {
    if (checkAdminAccess()) {
        loadAdminData();
    }
});

// Mock data for demonstration (in production, this would come from a database)
let apiUsageData = {
    callsToday: 0,
    callsMonth: 0,
    totalUsers: 1,
    rateLimitHits: 0,
    recentRequests: [],
    users: [
        {
            email: ADMIN_EMAIL,
            role: 'admin',
            lastActive: new Date().toISOString()
        }
    ]
};

// Load from localStorage if exists
const savedUsageData = localStorage.getItem('adminUsageData');
if (savedUsageData) {
    apiUsageData = { ...apiUsageData, ...JSON.parse(savedUsageData) };
}

function loadAdminData() {
    // Load API usage stats
    document.getElementById('api-calls-today').textContent = apiUsageData.callsToday || 0;
    document.getElementById('api-calls-month').textContent = apiUsageData.callsMonth || 0;
    document.getElementById('total-users').textContent = apiUsageData.totalUsers || 1;
    document.getElementById('rate-limit-hits').textContent = apiUsageData.rateLimitHits || 0;
    
    // Load rate limit config
    const rateLimits = JSON.parse(localStorage.getItem('rateLimits') || '{"perMinute":10,"perHour":100,"perDay":500}');
    document.getElementById('requests-per-minute').value = rateLimits.perMinute;
    document.getElementById('requests-per-hour').value = rateLimits.perHour;
    document.getElementById('requests-per-day').value = rateLimits.perDay;
    
    // Load API request log
    loadApiRequestLog();
    
    // Load user list
    loadUserList();
}

function loadApiRequestLog() {
    const tbody = document.getElementById('api-log-body');
    
    if (!apiUsageData.recentRequests || apiUsageData.recentRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-log">No recent requests</td></tr>';
        return;
    }
    
    tbody.innerHTML = apiUsageData.recentRequests.slice(0, 20).map(req => `
        <tr>
            <td>${new Date(req.timestamp).toLocaleString()}</td>
            <td>${req.user}</td>
            <td>${req.endpoint}</td>
            <td><span class="status-badge ${req.status < 400 ? 'success' : 'error'}">${req.status}</span></td>
            <td>${req.responseTime}ms</td>
        </tr>
    `).join('');
}

function loadUserList() {
    const tbody = document.getElementById('user-list-body');
    
    tbody.innerHTML = apiUsageData.users.map(user => `
        <tr>
            <td>${user.email}</td>
            <td>${user.role === 'admin' ? '<span class="role-badge">Admin</span>' : 'User'}</td>
            <td>${new Date(user.lastActive).toLocaleDateString()}</td>
            <td>
                <div class="user-actions">
                    ${user.role !== 'admin' ? '<button class="btn-revoke" onclick="revokeAccess(\'' + user.email + '\')">Revoke</button>' : '-'}
                </div>
            </td>
        </tr>
    `).join('');
}

// Save rate limits
document.getElementById('save-rate-limits').addEventListener('click', () => {
    const rateLimits = {
        perMinute: parseInt(document.getElementById('requests-per-minute').value),
        perHour: parseInt(document.getElementById('requests-per-hour').value),
        perDay: parseInt(document.getElementById('requests-per-day').value)
    };
    
    localStorage.setItem('rateLimits', JSON.stringify(rateLimits));
    alert('Rate limits saved successfully!');
});

// Track API call (call this from app.js when making API requests)
function trackApiCall(endpoint, status, responseTime) {
    apiUsageData.callsToday = (apiUsageData.callsToday || 0) + 1;
    apiUsageData.callsMonth = (apiUsageData.callsMonth || 0) + 1;
    
    const user = netlifyIdentity.currentUser();
    
    apiUsageData.recentRequests = apiUsageData.recentRequests || [];
    apiUsageData.recentRequests.unshift({
        timestamp: new Date().toISOString(),
        user: user ? user.email : 'anonymous',
        endpoint: endpoint,
        status: status,
        responseTime: responseTime
    });
    
    // Keep only last 100 requests
    if (apiUsageData.recentRequests.length > 100) {
        apiUsageData.recentRequests = apiUsageData.recentRequests.slice(0, 100);
    }
    
    localStorage.setItem('adminUsageData', JSON.stringify(apiUsageData));
}

// Check rate limit
function checkRateLimit() {
    const rateLimits = JSON.parse(localStorage.getItem('rateLimits') || '{"perMinute":10,"perHour":100,"perDay":500}');
    const now = Date.now();
    
    // Get recent calls from last minute
    const recentCalls = (apiUsageData.recentRequests || []).filter(req => {
        return now - new Date(req.timestamp).getTime() < 60000; // 1 minute
    });
    
    if (recentCalls.length >= rateLimits.perMinute) {
        apiUsageData.rateLimitHits = (apiUsageData.rateLimitHits || 0) + 1;
        localStorage.setItem('adminUsageData', JSON.stringify(apiUsageData));
        return false;
    }
    
    return true;
}

// Revoke user access
function revokeAccess(email) {
    if (confirm(`Revoke access for ${email}?`)) {
        apiUsageData.users = apiUsageData.users.filter(u => u.email !== email);
        apiUsageData.totalUsers = apiUsageData.users.length;
        localStorage.setItem('adminUsageData', JSON.stringify(apiUsageData));
        loadUserList();
        alert('Access revoked');
    }
}

// Export functions for use in other scripts
window.trackApiCall = trackApiCall;
window.checkRateLimit = checkRateLimit;
