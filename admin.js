// Admin functionality - v2.0 cleaned
const ADMIN_DASHBOARD_EMAIL = 'jamiefitzgerald001@gmail.com';

// Check if user is admin
function checkAdminAccess() {
    const user = netlifyIdentity.currentUser();
    
    if (!user) {
        document.getElementById('auth-section').style.display = 'flex';
        document.getElementById('app-section').style.display = 'none';
        return false;
    }
    
    if (user.email !== ADMIN_DASHBOARD_EMAIL) {
        document.getElementById('admin-content').style.display = 'none';
        document.getElementById('access-denied').style.display = 'block';
        return false;
    }
    
    document.getElementById('admin-content').style.display = 'block';
    document.getElementById('access-denied').style.display = 'none';
    return true;
}

// Initialize admin after auth ready
function initAdmin() {
    if (checkAdminAccess()) {
        loadAdminData();
        setInterval(loadAdminData, 30000);
    }
}

// Wait for Netlify Identity to be ready
if (typeof netlifyIdentity !== 'undefined') {
    netlifyIdentity.on('init', user => {
        if (user) initAdmin();
    });
    netlifyIdentity.on('login', user => {
        initAdmin();
    });
}

// Store data in memory
let apiUsageData = {
    callsToday: 0,
    callsMonth: 0,
    totalUsers: 1,
    rateLimitHits: 0,
    recentRequests: [],
    users: []
};

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadAdminData() {
    try {
        // Show loading state
        document.getElementById('api-calls-today').textContent = '...';
        document.getElementById('api-calls-month').textContent = '...';
        document.getElementById('total-users').textContent = '...';
        
        // Fetch real database stats from Supabase
        const dbStatsResponse = await fetch('/.netlify/functions/get-database-stats', {
            headers: { 'Content-Type': 'application/json' }
        });
        if (dbStatsResponse.ok) {
            const dbStats = await dbStatsResponse.json();
            
            if (dbStats.totalUsers !== undefined) {
                // Update UI with real database stats
                document.getElementById('total-users').textContent = dbStats.totalUsers;
                
                // Add database health indicators
                const statsGrid = document.querySelector('.stats-grid');
                
                // Check if we need to add new stat cards
                let totalSessionsCard = document.getElementById('total-sessions-card');
                if (!totalSessionsCard && statsGrid) {
                    totalSessionsCard = document.createElement('div');
                    totalSessionsCard.className = 'stat-card';
                    totalSessionsCard.id = 'total-sessions-card';
                    totalSessionsCard.innerHTML = `
                        <p>Total Sessions</p>
                        <h3 id="total-sessions">0</h3>
                    `;
                    statsGrid.appendChild(totalSessionsCard);
                }
                
                let dbSizeCard = document.getElementById('db-size-card');
                if (!dbSizeCard && statsGrid) {
                    dbSizeCard = document.createElement('div');
                    dbSizeCard.className = 'stat-card';
                    dbSizeCard.id = 'db-size-card';
                    dbSizeCard.innerHTML = `
                        <p>Database Size</p>
                        <h3 id="db-size">0 KB</h3>
                    `;
                    statsGrid.appendChild(dbSizeCard);
                }
                
                const totalSessionsEl = document.getElementById('total-sessions');
                if (totalSessionsEl) totalSessionsEl.textContent = dbStats.totalSessions || 0;
                
                const dbSizeEl = document.getElementById('db-size');
                if (dbSizeEl) dbSizeEl.textContent = dbStats.estimatedSize || '0 KB';
                
                // Set API calls to session count as proxy
                document.getElementById('api-calls-today').textContent = dbStats.totalSessions || 0;
                document.getElementById('api-calls-month').textContent = dbStats.totalSessions || 0;
            }
        }
        
        // Fetch usage stats (API tracking)
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
            
            // If we didn't get database stats, fall back to cached data
            if (document.getElementById('total-users').textContent === '...') {
                document.getElementById('total-users').textContent = stats.totalUsers || 1;
            }
            
            document.getElementById('rate-limit-hits').textContent = stats.rateLimitHits || 0;
        } else {
            // Fallback to localStorage on error
            const cached = localStorage.getItem('adminUsageData');
            if (cached) {
                apiUsageData = JSON.parse(cached);
                if (document.getElementById('api-calls-today').textContent === '...') {
                    document.getElementById('api-calls-today').textContent = apiUsageData.callsToday || 0;
                }
                if (document.getElementById('api-calls-month').textContent === '...') {
                    document.getElementById('api-calls-month').textContent = apiUsageData.callsMonth || 0;
                }
                if (document.getElementById('total-users').textContent === '...') {
                    document.getElementById('total-users').textContent = apiUsageData.totalUsers || 1;
                }
                document.getElementById('rate-limit-hits').textContent = apiUsageData.rateLimitHits || 0;
            }
        }
        
        await loadRateLimitConfig();
        
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
            document.getElementById('total-users').textContent = apiUsageData.totalUsers || 1;
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
        // Show loading state
        tbody.innerHTML = '<tr><td colspan="4" class="empty-log">Loading users...</td></tr>';
        
        // Fetch users from backend
        const currentUser = netlifyIdentity?.currentUser();
        if (!currentUser) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-log">Not authenticated</td></tr>';
            return;
        }
        
        // Pass admin email to verify authorization
        const response = await fetch(`/.netlify/functions/get-users?admin=${encodeURIComponent(currentUser.email)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const users = data.users || [];
        
        // Update total users count
        document.getElementById('total-users').textContent = users.length;
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-log">No users found. Make sure Supabase migration is complete.</td></tr>';
            return;
        }
        
        // Sort users - admin first, then by email
        users.sort((a, b) => {
            if (a.role === 'admin' && b.role !== 'admin') return -1;
            if (a.role !== 'admin' && b.role === 'admin') return 1;
            return a.email.localeCompare(b.email);
        });
        
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${escapeHtml(user.email)}</td>
                <td>${user.role === 'admin' ? '<span class="role-badge">Admin</span>' : 'User'}</td>
                <td>${new Date(user.lastActive).toLocaleDateString()}</td>
                <td>
                    <div class="user-actions">
                        ${user.role !== 'admin' ? `
                            <button class="btn-revoke" onclick="setUserBlocked('${user.email}', ${!user.blocked})">${user.blocked ? 'Unblock' : 'Block'}</button>
                            <button class="btn-revoke" onclick="setUserRateExempt('${user.email}', ${!user.rateLimitExempt})">${user.rateLimitExempt ? 'Limit On' : 'Limit Off'}</button>
                        ` : '-'}
                    </div>
                </td>
            </tr>
        `).join('');
        
        // Cache users for offline access
        apiUsageData.users = users;
        localStorage.setItem('adminUsageData', JSON.stringify(apiUsageData));
        
    } catch (error) {
        console.error('Failed to load users:', error);
        
        // Fallback to cached users
        const cached = localStorage.getItem('adminUsageData');
        if (cached) {
            const data = JSON.parse(cached);
            if (data.users && data.users.length > 0) {
                tbody.innerHTML = data.users.map(user => `
                    <tr>
                        <td>${escapeHtml(user.email)}</td>
                        <td>${user.role === 'admin' ? '<span class="role-badge">Admin</span>' : 'User'}</td>
                        <td>${new Date(user.lastActive).toLocaleDateString()}</td>
                        <td>
                            <div class="user-actions">
                                ${user.role !== 'admin' ? `
                                    <button class="btn-revoke" onclick="setUserBlocked('${user.email}', ${!user.blocked})">${user.blocked ? 'Unblock' : 'Block'}</button>
                                    <button class="btn-revoke" onclick="setUserRateExempt('${user.email}', ${!user.rateLimitExempt})">${user.rateLimitExempt ? 'Limit On' : 'Limit Off'}</button>
                                ` : '-'}
                            </div>
                        </td>
                    </tr>
                `).join('');
                
                document.getElementById('total-users').textContent = data.users.length;
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="empty-log">Error loading users: ' + error.message + '</td></tr>';
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-log">Error loading users: ' + error.message + '</td></tr>';
        }
    }
}

async function loadRateLimitConfig() {
    const currentUser = netlifyIdentity?.currentUser();
    if (!currentUser) return;

    const response = await fetch(`/.netlify/functions/get-rate-limits?admin=${encodeURIComponent(currentUser.email)}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to load rate limits');
    }

    const data = await response.json();
    const limits = data.limits || {};

    document.getElementById('requests-per-minute').value = limits.perMinute ?? 10;
    document.getElementById('requests-per-hour').value = limits.perHour ?? 100;
    document.getElementById('requests-per-day').value = limits.perDay ?? 500;
}

// Save rate limits
document.getElementById('save-rate-limits').addEventListener('click', async () => {
    const currentUser = netlifyIdentity?.currentUser();
    if (!currentUser) return;

    const rateLimits = {
        perMinute: parseInt(document.getElementById('requests-per-minute').value),
        perHour: parseInt(document.getElementById('requests-per-hour').value),
        perDay: parseInt(document.getElementById('requests-per-day').value)
    };

    const response = await fetch('/.netlify/functions/set-rate-limits', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            requesterEmail: currentUser.email,
            ...rateLimits
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed to save rate limits: ${errorData.error}`);
        return;
    }

    alert('Rate limits saved successfully!');
});

// Track API call (call this from app.js when making API requests)
async function trackApiCall(endpoint, status, responseTime) {
    try {
        const user = netlifyIdentity?.currentUser();
        const callData = {
            timestamp: new Date().toISOString(),
            user: user ? user.email : 'anonymous',
            userEmail: user ? user.email : '',
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
async function checkRateLimit(endpoint = 'app-action') {
    try {
        const user = netlifyIdentity?.currentUser();
        const userEmail = user ? user.email : '';
        
        const response = await fetch('/.netlify/functions/check-rate-limit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userEmail, endpoint })
        });
        
        if (response.status === 403 || response.status === 429) {
            return false;
        }

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

async function setUserBlocked(email, blocked) {
    await updateUserAccess(email, { blocked });
}

async function setUserRateExempt(email, rateLimitExempt) {
    await updateUserAccess(email, { rateLimitExempt });
}

async function updateUserAccess(email, updates) {
    const currentUser = netlifyIdentity?.currentUser();
    if (!currentUser) return;

    const action = updates.blocked === true ? 'block' : updates.blocked === false ? 'unblock' : 'update';
    if (!confirm(`${action.toUpperCase()} user ${email}?`)) return;

    const response = await fetch('/.netlify/functions/set-user-access', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            requesterEmail: currentUser.email,
            targetEmail: email,
            ...updates
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed: ${errorData.error}`);
        return;
    }

    await loadUserList();
}

async function addUserByEmail() {
    const currentUser = netlifyIdentity?.currentUser();
    if (!currentUser) return;

    const email = prompt('Enter user email to add/sync (e.g., david@example.com)');
    if (!email) return;

    const response = await fetch('/.netlify/functions/upsert-user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            requesterEmail: currentUser.email,
            email
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed to add user: ${errorData.error}`);
        return;
    }

    await loadUserList();
}

// Data Migration Tool
document.getElementById('migrate-data-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('migrate-data-btn');
    const status = document.getElementById('migration-status');
    const resultsDiv = document.getElementById('migration-results');
    const reportDiv = document.getElementById('migration-report');
    
    // Get localStorage sessions
    const localSessions = JSON.parse(localStorage.getItem('savedSessions') || '[]');
    
    if (localSessions.length === 0) {
        status.textContent = 'No sessions found in localStorage to migrate.';
        status.style.color = 'var(--warning)';
        return;
    }
    
    if (!confirm(`Migrate ${localSessions.length} sessions from localStorage to Supabase?`)) {
        return;
    }
    
    const user = netlifyIdentity?.currentUser();
    if (!user) {
        alert('You must be logged in to migrate data');
        return;
    }
    
    // Show loading state
    btn.disabled = true;
    btn.textContent = 'Migrating...';
    status.textContent = `Migrating ${localSessions.length} sessions...`;
    status.style.color = 'var(--primary)';
    resultsDiv.style.display = 'none';
    
    try {
        const response = await fetch('/.netlify/functions/migrate-localstorage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessions: localSessions,
                userEmail: user.email
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Show results
        btn.textContent = 'Migrate LocalStorage Data';
        btn.disabled = false;
        status.textContent = '';
        resultsDiv.style.display = 'block';
        
        let reportHTML = `
            <div style="background: var(--bg); padding: 16px; border-radius: 8px; margin-top: 12px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px;">
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.875rem;">Total</div>
                        <div style="font-size: 1.5rem; font-weight: bold;">${result.results.total}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.875rem;">Successful</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: var(--success);">${result.results.successful}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.875rem;">Failed</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: var(--danger);">${result.results.failed}</div>
                    </div>
                </div>
        `;
        
        if (result.results.errors.length > 0) {
            reportHTML += '<h4 style="margin-top: 16px;">Errors:</h4><ul style="margin: 8px 0;">';
            result.results.errors.forEach(error => {
                reportHTML += `<li style="color: var(--danger); margin: 4px 0;">${error.session}: ${error.error}</li>`;
            });
            reportHTML += '</ul>';
        }
        
        reportHTML += '</div>';
        reportDiv.innerHTML = reportHTML;
        
        if (result.results.successful > 0) {
            alert(`Migration complete! ${result.results.successful} sessions migrated successfully.`);
        }
    } catch (error) {
        console.error('Migration error:', error);
        btn.textContent = 'Migrate LocalStorage Data';
        btn.disabled = false;
        status.textContent = `Migration failed: ${error.message}`;
        status.style.color = 'var(--danger)';
        
        // Show helpful message if it's a Supabase configuration error
        if (error.message.includes('Supabase not configured') || error.message.includes('relation') || error.message.includes('does not exist')) {
            resultsDiv.style.display = 'block';
            reportDiv.innerHTML = `
                <div style="background: var(--danger); color: white; padding: 16px; border-radius: 8px; margin-top: 12px;">
                    <h4 style="margin: 0 0 8px 0;">Database Not Set Up</h4>
                    <p style="margin: 0;">The Supabase database tables haven't been created yet. Please run the migration SQL in your Supabase dashboard first.</p>
                    <p style="margin: 8px 0 0 0; font-size: 0.875rem;"><strong>Instructions:</strong></p>
                    <ol style="margin: 4px 0 0 16px; font-size: 0.875rem;">
                        <li>Go to <a href="https://supabase.com/dashboard" target="_blank" style="color: white; text-decoration: underline;">Supabase Dashboard</a></li>
                        <li>Open SQL Editor</li>
                        <li>Run the migration file from <code>supabase/migrations/</code></li>
                    </ol>
                </div>
            `;
        }
    }
});

// Export functions for use in other scripts
window.trackApiCall = trackApiCall;
window.checkRateLimit = checkRateLimit;
window.setUserBlocked = setUserBlocked;
window.setUserRateExempt = setUserRateExempt;
window.addUserByEmail = addUserByEmail;
