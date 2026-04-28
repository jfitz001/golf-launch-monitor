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
        // Auto-refresh every 30 seconds
        setInterval(loadAdminData, 30000);
    }
});

// Store data in memory
let apiUsageData = {
    callsToday: 0,
    callsMonth: 0,
    totalUsers: 1,
    rateLimitHits: 0,
    recentRequests: [],
    users: []
};

async function loadAdminData() {
    try {
        // Show loading state
        document.getElementById('api-calls-today').textContent = '...';
        document.getElementById('api-calls-month').textContent = '...';
        
        // Fetch real usage stats from backend
        const user = netlifyIdentity.currentUser();
        const token = user ? await user.jwt() : null;
        
        const response = await fetch('/.netlify/functions/get-usage-stats', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const stats = await response.json();
            apiUsageData = stats;
            
            // Update UI with real data
            document.getElementById('api-calls-today').textContent = stats.callsToday || 0;
            document.getElementById('api-calls-month').textContent = stats.callsMonth || 0;
            document.getElementById('total-users').textContent = stats.totalUsers || 1;
            document.getElementById('rate-limit-hits').textContent = stats.rateLimitHits || 0;
        } else {
            // Fallback to localStorage on error
            const cached = localStorage.getItem('adminUsageData');
            if (cached) {
                apiUsageData = JSON.parse(cached);
                document.getElementById('api-calls-today').textContent = apiUsageData.callsToday || 0;
                document.getElementById('api-calls-month').textContent = apiUsageData.callsMonth || 0;
                document.getElementById('total-users').textContent = apiUsageData.totalUsers || 1;
                document.getElementById('rate-limit-hits').textContent = apiUsageData.rateLimitHits || 0;
            }
        }
        
        // Load rate limit config
        const rateLimits = JSON.parse(localStorage.getItem('rateLimits') || '{"perMinute":10,"perHour":100,"perDay":500}');
        document.getElementById('requests-per-minute').value = rateLimits.perMinute;
        document.getElementById('requests-per-hour').value = rateLimits.perHour;
        document.getElementById('requests-per-day').value = rateLimits.perDay;
        
        // Load API request log and user list
        await Promise.all([
            loadApiRequestLog(),
            loadUserList()
        ]);
        
    } catch (error) {
        console.error('Failed to load admin data:', error);
        // Fallback to cached data
        const cached = localStorage.getItem('adminUsageData');
        if (cached) {
            apiUsageData = JSON.parse(cached);
            document.getElementById('api-calls-today').textContent = apiUsageData.callsToday || 0;
            document.getElementById('api-calls-month').textContent = apiUsageData.callsMonth || 0;
        }
    }
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

async function loadUserList() {
    const tbody = document.getElementById('user-list-body');
    
    try {
        // Fetch users from Netlify Identity
        const currentUser = netlifyIdentity.currentUser();
        
        // For now, show current user and any cached users
        const users = apiUsageData.users || [];
        
        // Add current user if not in list
        if (currentUser && !users.find(u => u.email === currentUser.email)) {
            users.push({
                email: currentUser.email,
                role: currentUser.email === ADMIN_EMAIL ? 'admin' : 'user',
                lastActive: new Date().toISOString()
            });
        }
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-log">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(user => `
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
    } catch (error) {
        console.error('Failed to load users:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="empty-log">Error loading users</td></tr>';
    }
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
async function trackApiCall(endpoint, status, responseTime) {
    try {
        const user = netlifyIdentity?.currentUser();
        const callData = {
            timestamp: new Date().toISOString(),
            user: user ? user.email : 'anonymous',
            endpoint: endpoint,
            status: status,
            responseTime: responseTime
        };
        
        // Send to backend
        await fetch('/.netlify/functions/track-api-usage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(callData)
        });
        
        // Also update local cache for immediate feedback
        const cached = JSON.parse(localStorage.getItem('adminUsageData') || '{"callsToday":0,"callsMonth":0,"recentRequests":[]}');
        cached.callsToday = (cached.callsToday || 0) + 1;
        cached.callsMonth = (cached.callsMonth || 0) + 1;
        
        cached.recentRequests = cached.recentRequests || [];
        cached.recentRequests.unshift(callData);
        
        // Keep only last 100 requests
        if (cached.recentRequests.length > 100) {
            cached.recentRequests = cached.recentRequests.slice(0, 100);
        }
        
        localStorage.setItem('adminUsageData', JSON.stringify(cached));
    } catch (error) {
        console.error('Failed to track API call:', error);
    }
}

// Check rate limit with backend
async function checkRateLimit() {
    try {
        const user = netlifyIdentity?.currentUser();
        const userId = user ? user.id : 'anonymous';
        
        const response = await fetch('/.netlify/functions/check-rate-limit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId })
        });
        
        if (response.ok) {
            const result = await response.json();
            return result.allowed;
        }
        
        // Fallback to local check if backend fails
        return checkRateLimitLocal();
    } catch (error) {
        console.error('Rate limit check failed:', error);
        return checkRateLimitLocal();
    }
}

// Fallback local rate limit check
function checkRateLimitLocal() {
    const rateLimits = JSON.parse(localStorage.getItem('rateLimits') || '{"perMinute":10,"perHour":100,"perDay":500}');
    const now = Date.now();
    
    const cached = JSON.parse(localStorage.getItem('adminUsageData') || '{"recentRequests":[]}');
    const recentRequests = cached.recentRequests || [];
    
    // Get recent calls from last minute
    const recentCalls = recentRequests.filter(req => {
        return now - new Date(req.timestamp).getTime() < 60000; // 1 minute
    });
    
    if (recentCalls.length >= rateLimits.perMinute) {
        const updated = JSON.parse(localStorage.getItem('adminUsageData') || '{}');
        updated.rateLimitHits = (updated.rateLimitHits || 0) + 1;
        localStorage.setItem('adminUsageData', JSON.stringify(updated));
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
