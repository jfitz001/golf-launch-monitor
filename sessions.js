// Session Management - Supabase with localStorage fallback

function getInviteHeaders(baseHeaders = {}) {
    if (typeof window.getInviteAuthHeaders === 'function') {
        return window.getInviteAuthHeaders(baseHeaders);
    }
    return { ...baseHeaders };
}

function getShotClubName(shot) {
    return (
        shot['Club Name'] ||
        shot['Club Type'] ||
        shot['Club'] ||
        shot['club'] ||
        shot['Club name'] ||
        shot['club name'] ||
        shot['ClubName'] ||
        'Unknown Club'
    );
}

function renderSidebarClubUsage(shots = []) {
    const panelHeader = document.querySelector('.sessions-panel-header');
    if (!panelHeader) return;

    let section = document.getElementById('clubUsageSidebar');
    if (!section) {
        section = document.createElement('div');
        section.id = 'clubUsageSidebar';
        section.className = 'club-usage-sidebar';
        panelHeader.appendChild(section);
    }

    if (!Array.isArray(shots) || shots.length === 0) {
        section.innerHTML = `
            <div class="club-usage-title">Clubs In Current Data</div>
            <div class="club-usage-empty">Upload CSV data to see club flags.</div>
        `;
        return;
    }

    const counts = shots.reduce((acc, shot) => {
        const club = getShotClubName(shot);
        acc[club] = (acc[club] || 0) + 1;
        return acc;
    }, {});

    const sortedClubs = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 18);

    const pills = sortedClubs
        .map(([club, count]) => `<span class="club-pill">${club} <strong>${count}</strong></span>`)
        .join('');

    section.innerHTML = `
        <div class="club-usage-title">Clubs In Current Data</div>
        <div class="club-usage-pills">${pills}</div>
    `;
}

function loadCurrentShotsFromStorage() {
    try {
        const stored = localStorage.getItem('currentGolfData');
        if (!stored || stored === '[]') return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

// Save sessions to Supabase (with localStorage fallback)
async function saveSessions(session) {
    const user = netlifyIdentity?.currentUser();
    
    if (!user) {
        console.warn('No user logged in, saving to localStorage only');
        const localSessions = JSON.parse(localStorage.getItem('savedSessions') || '[]');
        localSessions.push(session);
        localStorage.setItem('savedSessions', JSON.stringify(localSessions));
        return { success: true, offline: true };
    }
    
    try {
        console.log('Attempting to save session to Supabase...');
        const response = await fetch('/.netlify/functions/save-session', {
            method: 'POST',
            headers: getInviteHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                session,
                userEmail: user.email
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Save session failed:', response.status, errorText);
            throw new Error(`Failed to save session: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log('Session saved to Supabase successfully!');
        
        // Also save to localStorage as backup
        const localSessions = JSON.parse(localStorage.getItem('savedSessions') || '[]');
        localSessions.push(session);
        localStorage.setItem('savedSessions', JSON.stringify(localSessions));
        
        return { success: true, offline: false, ...result };
    } catch (error) {
        console.error('Error saving to Supabase, falling back to localStorage:', error);
        
        // Check if it's a database error
        const errorMsg = error.message || '';
        if (errorMsg.includes('relation') || errorMsg.includes('does not exist') || errorMsg.includes('Supabase not configured')) {
            console.error('❌ Database tables not set up! Run the Supabase migration first.');
        }
        
        const localSessions = JSON.parse(localStorage.getItem('savedSessions') || '[]');
        localSessions.push(session);
        localStorage.setItem('savedSessions', JSON.stringify(localSessions));
        return { success: true, offline: true, error: error.message };
    }
}

// Load sessions from Supabase (with localStorage fallback)
async function loadSessions() {
    const user = netlifyIdentity?.currentUser();
    
    if (!user) {
        // Not logged in, return localStorage only
        const data = localStorage.getItem('savedSessions');
        return data ? JSON.parse(data) : [];
    }
    
    try {
        const response = await fetch(`/.netlify/functions/get-sessions?email=${encodeURIComponent(user.email)}`, {
            headers: getInviteHeaders()
        });
        
        if (!response.ok) {
            throw new Error('Failed to load sessions');
        }
        
        const result = await response.json();
        
        // Update localStorage cache
        localStorage.setItem('savedSessions', JSON.stringify(result.sessions || []));
        
        return result.sessions || [];
    } catch (error) {
        console.error('Error loading from Supabase, falling back to localStorage:', error);
        const data = localStorage.getItem('savedSessions');
        return data ? JSON.parse(data) : [];
    }
}

async function saveCurrentSession() {
    // Check for golfData (from app.js) or currentGolfData (from localStorage)
    let dataToSave = [];
    
    if (typeof golfData !== 'undefined' && golfData && golfData.length > 0) {
        dataToSave = golfData;
    } else {
        const storedData = localStorage.getItem('currentGolfData');
        if (storedData) {
            try {
                dataToSave = JSON.parse(storedData);
            } catch (e) {
                console.error('Error parsing stored data:', e);
            }
        }
    }
    
    if (!dataToSave || dataToSave.length === 0) {
        alert('No data to save. Please upload a CSV file first.');
        return;
    }
    
    const sessionName = prompt('Enter session name (e.g., "Range Session - Jan 15")');
    if (!sessionName) return;
    
    // Show loading state
    const btn = document.getElementById('saveSessionBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    // Temporarily set global golfData for stat calculations
    const originalGolfData = typeof golfData !== 'undefined' ? golfData : null;
    if (typeof window !== 'undefined') {
        window.golfData = dataToSave;
    }
    
    let swingScoreData, stats;
    try {
        // Calculate stats using the temporary golfData
        swingScoreData = typeof calculateSwingScore !== 'undefined' ? calculateSwingScore() : { score: 0, grade: 'N/A', desc: 'Not calculated' };
        stats = typeof calculateSessionStats !== 'undefined' ? calculateSessionStats() : {};
    } catch (error) {
        console.error('Error calculating stats:', error);
        swingScoreData = { score: 0, grade: 'N/A', desc: 'Error calculating' };
        stats = {};
    } finally {
        // Restore original golfData
        if (typeof window !== 'undefined' && originalGolfData !== null) {
            window.golfData = originalGolfData;
        }
    }
    
    const session = {
        id: Date.now(),
        name: sessionName,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        data: dataToSave,
        swingScore: {
            score: swingScoreData.score,
            description: `${swingScoreData.grade} - ${swingScoreData.desc}`
        },
        stats: stats
    };
    
    const result = await saveSessions(session);
    
    btn.textContent = originalText;
    btn.disabled = false;
    
    if (result.success) {
        currentSessionId = session.id;
        await updateSessionsList();
        
        if (result.offline) {
            if (result.error && (result.error.includes('relation') || result.error.includes('does not exist'))) {
                alert('⚠️ Session saved locally only.\n\nSupabase database not set up yet. Run the migration in your Supabase dashboard to enable cloud sync.\n\nYour data is safe in localStorage.');
            } else {
                alert('Session saved offline (will sync when database is ready)');
            }
        } else {
            alert('✅ Session saved to cloud!');
        }
        
        document.getElementById('sessionsPanel').classList.remove('open');
    } else {
        alert('Error saving session. Please try again.');
    }
}

async function deleteSessionById(sessionId) {
    if (!confirm('Delete this session?')) return;
    
    const user = netlifyIdentity?.currentUser();
    
    if (user) {
        try {
            const response = await fetch('/.netlify/functions/delete-session', {
                method: 'POST',
                headers: getInviteHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    sessionId,
                    userEmail: user.email
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete session');
            }
        } catch (error) {
            console.error('Error deleting from Supabase:', error);
        }
    }
    
    // Also delete from localStorage
    const sessions = JSON.parse(localStorage.getItem('savedSessions') || '[]');
    const filtered = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem('savedSessions', JSON.stringify(filtered));
    
    if (currentSessionId === sessionId) {
        currentSessionId = null;
    }
    
    await updateSessionsList();
}

async function loadSession(sessionId) {
    const sessions = await loadSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
        alert('Session not found');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('currentGolfData', JSON.stringify(session.data));
    localStorage.setItem('golfData', JSON.stringify(session.data));
    localStorage.setItem('lastUploadTime', Date.now().toString());
    
    // Update global golfData
    if (typeof golfData !== 'undefined') {
        golfData = session.data;
    }
    window.golfData = session.data;
    renderSidebarClubUsage(session.data);
    
    // Force full reload to refresh all charts and analysis
    window.location.reload();
}

let currentSessionId = null;

async function updateSessionsList() {
    const listDiv = document.getElementById('sessionsList');
    if (!listDiv) return;
    
    // Show loading state
    listDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">Loading sessions...</div>';
    
    try {
        const sessions = await loadSessions();
        
        if (sessions.length === 0) {
            listDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">No sessions saved yet</div>';
            return;
        }
        
        listDiv.innerHTML = '';
        
        sessions.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(session => {
            const div = document.createElement('div');
            div.className = 'session-item';
            if (session.id === currentSessionId) {
                div.classList.add('active');
            }
            
            const date = new Date(session.date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            
            div.innerHTML = `
                <div class="session-item-name">${session.name}</div>
                <div class="session-item-meta">
                    <span>${dateStr} at ${timeStr}</span>
                    <span>${session.data.length} shots</span>
                </div>
                <div class="session-item-actions">
                    <button class="session-item-btn load-btn" data-id="${session.id}">Load</button>
                    <button class="session-item-btn delete delete-btn" data-id="${session.id}">Delete</button>
                </div>
            `;
            
            listDiv.appendChild(div);
        });
        
        // Add event listeners
        document.querySelectorAll('.load-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sessionId = parseInt(btn.dataset.id);
                await loadSession(sessionId);
                currentSessionId = sessionId;
                await updateSessionsList();
                document.getElementById('sessionsPanel').classList.remove('open');
            });
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sessionId = parseInt(btn.dataset.id);
                await deleteSessionById(sessionId);
            });
        });
    } catch (error) {
        console.error('Error updating sessions list:', error);
        listDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">Error loading sessions. Using local storage.</div>';
    }
}

function calculateSessionStats() {
    const carryDistances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const avgCarry = carryDistances.reduce((a, b) => a + b, 0) / carryDistances.length;
    
    return {
        shots: golfData.length,
        avgCarry: avgCarry.toFixed(1),
        bestShot: Math.max(...carryDistances).toFixed(1)
    };
}

function calculateSwingScore() {
    // Get data from multiple sources
    let data = null;
    if (typeof golfData !== 'undefined' && golfData && golfData.length > 0) {
        data = golfData;
    } else if (window.golfData && window.golfData.length > 0) {
        data = window.golfData;
    }
    
    if (!data || data.length === 0) {
        return { score: 0, grade: 'N/A', desc: 'No data' };
    }
    
    const insights = analyzeGolfData(data);
    
    // Start at 100, deduct for issues
    let score = 100;
    
    // Major issues (-10 each)
    const majorIssues = insights.warnings.filter(w => w.severity === 'high');
    score -= majorIssues.length * 10;
    
    // Medium issues (-5 each)
    const mediumIssues = insights.warnings.filter(w => w.severity === 'medium');
    score -= mediumIssues.length * 5;
    
    // Low issues (-2 each)
    const lowIssues = insights.warnings.filter(w => w.severity === 'low');
    score -= lowIssues.length * 2;
    
    // Bonus for strengths (+3 each, max +15)
    const strengthBonus = Math.min(insights.strengths.length * 3, 15);
    score += strengthBonus;
    
    // Clamp 0-100
    score = Math.max(0, Math.min(100, score));
    
    // Determine grade
    let grade, desc;
    if (score >= 90) {
        grade = 'A';
        desc = 'Tour-Level Performance';
    } else if (score >= 80) {
        grade = 'B';
        desc = 'Advanced Player';
    } else if (score >= 70) {
        grade = 'C';
        desc = 'Solid Amateur';
    } else if (score >= 60) {
        grade = 'D';
        desc = 'Developing Player';
    } else {
        grade = 'F';
        desc = 'Needs Improvement';
    }
    
    return { score, grade, desc };
}

function updateSwingScore() {
    const scoreEl = document.getElementById('swingScore');
    const descEl = document.getElementById('swingScoreDesc');
    
    if (!scoreEl || !descEl) return;
    
    // Get data - check window.golfData first (set by app.js)
    let data = window.golfData;
    
    // Fallback to localStorage
    if (!data || data.length === 0) {
        const stored = localStorage.getItem('currentGolfData');
        if (stored && stored !== '[]') {
            try { data = JSON.parse(stored); } catch (e) { data = null; }
        }
    }
    
    if (!data || data.length === 0) {
        scoreEl.textContent = '--';
        descEl.textContent = 'Upload data to analyze';
        return;
    }
    
    // Check analyzeGolfData exists
    if (typeof analyzeGolfData !== 'function') {
        scoreEl.textContent = '--';
        descEl.textContent = 'Analysis loading...';
        return;
    }
    
    try {
        const insights = analyzeGolfData(data);
        
        // Calculate score
        let score = 100;
        score -= (insights.warnings.filter(w => w.severity === 'high').length * 10);
        score -= (insights.warnings.filter(w => w.severity === 'medium').length * 5);
        score -= (insights.warnings.filter(w => w.severity === 'low').length * 2);
        score += Math.min(insights.strengths.length * 3, 15);
        score = Math.max(0, Math.min(100, score));
        
        // Grade
        let grade, desc;
        if (score >= 90) { grade = 'A'; desc = 'Tour-Level'; }
        else if (score >= 80) { grade = 'B'; desc = 'Advanced'; }
        else if (score >= 70) { grade = 'C'; desc = 'Solid Amateur'; }
        else if (score >= 60) { grade = 'D'; desc = 'Developing'; }
        else { grade = 'F'; desc = 'Needs Work'; }
        
        scoreEl.textContent = score;
        descEl.textContent = `${grade} - ${desc}`;
    } catch (error) {
        console.error('Swing score error:', error);
        scoreEl.textContent = '--';
        descEl.textContent = 'Error';
    }
}

// Event listeners
const saveSessionBtn = document.getElementById('saveSessionBtn');
const sessionsToggleBtn = document.getElementById('sessionsToggle');
const sessionsPanelCloseBtn = document.getElementById('sessionsPanelClose');
const sessionsPanel = document.getElementById('sessionsPanel');

if (saveSessionBtn) {
    saveSessionBtn.addEventListener('click', saveCurrentSession);
}

if (sessionsToggleBtn && sessionsPanel) {
    sessionsToggleBtn.addEventListener('click', () => {
        sessionsPanel.classList.add('open');
    });
}

if (sessionsPanelCloseBtn && sessionsPanel) {
    sessionsPanelCloseBtn.addEventListener('click', () => {
        sessionsPanel.classList.remove('open');
    });
}

// Close on outside click
document.addEventListener('click', (e) => {
    const panel = document.getElementById('sessionsPanel');
    const toggle = document.getElementById('sessionsToggle');
    if (!panel || !toggle) return;
    
    if (!panel.contains(e.target) && !toggle.contains(e.target)) {
        panel.classList.remove('open');
    }
});

window.updateClubSidebar = (shots) => {
    renderSidebarClubUsage(Array.isArray(shots) ? shots : loadCurrentShotsFromStorage());
};

window.addEventListener('golf-data-updated', (event) => {
    const shots = event?.detail?.shots;
    renderSidebarClubUsage(Array.isArray(shots) ? shots : []);
});

// Initialize on load
window.addEventListener('load', () => {
    renderSidebarClubUsage(loadCurrentShotsFromStorage());
    updateSessionsList();
});
