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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.email,
                sessionName: session.name,
                shots: session.data
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
        
        // Result is array directly from simplified function
        const sessions = Array.isArray(result) ? result : (result.sessions || []);
        
        // Update localStorage cache
        localStorage.setItem('savedSessions', JSON.stringify(sessions));
        
        return sessions;
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

// Calculate swing score from ALL session data
async function calculateSwingScoreFromAllSessions() {
    let allShots = [];
    
    // Get current session data
    const currentData = window.golfData || [];
    if (currentData.length > 0) {
        allShots = [...currentData];
    }
    
    // Get all saved sessions
    const savedSessions = JSON.parse(localStorage.getItem('savedSessions') || '[]');
    for (const session of savedSessions) {
        if (session.data && Array.isArray(session.data)) {
            allShots = [...allShots, ...session.data];
        }
    }
    
    // Also try to load from Supabase if available
    try {
        const user = netlifyIdentity?.currentUser();
        if (user) {
            const response = await fetch(`/.netlify/functions/get-sessions?email=${encodeURIComponent(user.email)}`);
            if (response.ok) {
                const supabaseSessions = await response.json();
                for (const session of supabaseSessions) {
                    if (session.data && Array.isArray(session.data)) {
                        allShots = [...allShots, ...session.data];
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Could not load Supabase sessions for score:', e);
    }
    
    return calculateScoreFromShots(allShots);
}

function calculateScoreFromShots(shots) {
    if (!shots || shots.length === 0) {
        return { score: 0, grade: 'N/A', desc: 'No data', breakdown: null };
    }
    
    if (typeof analyzeGolfData !== 'function') {
        return { score: 0, grade: 'N/A', desc: 'Loading...', breakdown: null };
    }
    
    const insights = analyzeGolfData(shots);
    
    // Start at 100, deduct for issues
    let score = 100;
    const breakdown = {
        baseScore: 100,
        highSeverity: 0,
        mediumSeverity: 0,
        lowSeverity: 0,
        strengthBonus: 0,
        totalShots: shots.length
    };
    
    // Major issues (-10 each)
    const majorIssues = insights.warnings.filter(w => w.severity === 'high');
    breakdown.highSeverity = majorIssues.length * 10;
    score -= breakdown.highSeverity;
    
    // Medium issues (-5 each)
    const mediumIssues = insights.warnings.filter(w => w.severity === 'medium');
    breakdown.mediumSeverity = mediumIssues.length * 5;
    score -= breakdown.mediumSeverity;
    
    // Low issues (-2 each)
    const lowIssues = insights.warnings.filter(w => w.severity === 'low');
    breakdown.lowSeverity = lowIssues.length * 2;
    score -= breakdown.lowSeverity;
    
    // Bonus for strengths (+3 each, max +15)
    breakdown.strengthBonus = Math.min(insights.strengths.length * 3, 15);
    score += breakdown.strengthBonus;
    
    // Clamp 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    // Determine grade
    let grade, desc;
    if (score >= 90) { grade = 'A'; desc = 'Tour-Level'; }
    else if (score >= 80) { grade = 'B'; desc = 'Advanced'; }
    else if (score >= 70) { grade = 'C'; desc = 'Solid Amateur'; }
    else if (score >= 60) { grade = 'D'; desc = 'Developing'; }
    else { grade = 'F'; desc = 'Needs Work'; }
    
    return { score, grade, desc, breakdown, warnings: insights.warnings, strengths: insights.strengths };
}

function calculateSwingScore() {
    // Sync version for compatibility - uses current session only
    let data = window.golfData || [];
    if (data.length === 0) {
        const stored = localStorage.getItem('currentGolfData');
        if (stored) try { data = JSON.parse(stored); } catch(e) {}
    }
    return calculateScoreFromShots(data);
}

// Score history management
function getScoreHistory() {
    return JSON.parse(localStorage.getItem('swingScoreHistory') || '[]');
}

function saveScoreToHistory(scoreData) {
    const history = getScoreHistory();
    const entry = {
        score: scoreData.score,
        grade: scoreData.grade,
        date: new Date().toISOString(),
        shotCount: scoreData.breakdown?.totalShots || 0
    };
    
    // Avoid duplicate entries within 1 hour
    const lastEntry = history[history.length - 1];
    if (lastEntry) {
        const lastDate = new Date(lastEntry.date);
        const now = new Date();
        if ((now - lastDate) < 3600000 && lastEntry.score === entry.score) {
            return history;
        }
    }
    
    history.push(entry);
    // Keep last 50 entries
    if (history.length > 50) history.shift();
    localStorage.setItem('swingScoreHistory', JSON.stringify(history));
    return history;
}

function getScoreDelta() {
    const history = getScoreHistory();
    if (history.length < 2) return null;
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    return current.score - previous.score;
}

async function updateSwingScore() {
    const scoreEl = document.getElementById('swingScore');
    const descEl = document.getElementById('swingScoreDesc');
    const deltaEl = document.getElementById('swingScoreDelta');
    const tooltipEl = document.getElementById('swingScoreTooltip');
    
    if (!scoreEl || !descEl) return;
    
    try {
        // Calculate from ALL sessions
        const scoreData = await calculateSwingScoreFromAllSessions();
        
        if (scoreData.score === 0 && scoreData.grade === 'N/A') {
            scoreEl.textContent = '--';
            descEl.textContent = 'Upload data to analyze';
            if (deltaEl) deltaEl.style.display = 'none';
            return;
        }
        
        // Save to history and get delta
        const history = saveScoreToHistory(scoreData);
        const delta = getScoreDelta();
        
        // Update display
        scoreEl.textContent = scoreData.score;
        descEl.textContent = `${scoreData.grade} - ${scoreData.desc}`;
        
        // Show delta arrow
        if (deltaEl && delta !== null && delta !== 0) {
            deltaEl.style.display = 'inline-flex';
            if (delta > 0) {
                deltaEl.className = 'swing-score-delta positive';
                deltaEl.innerHTML = `<span class="delta-arrow">↑</span><span class="delta-value">+${delta}</span>`;
            } else {
                deltaEl.className = 'swing-score-delta negative';
                deltaEl.innerHTML = `<span class="delta-arrow">↓</span><span class="delta-value">${delta}</span>`;
            }
        } else if (deltaEl) {
            deltaEl.style.display = 'none';
        }
        
        // Update tooltip with breakdown
        if (tooltipEl && scoreData.breakdown) {
            const b = scoreData.breakdown;
            tooltipEl.innerHTML = `
                <div class="tooltip-title">Score Breakdown</div>
                <div class="tooltip-row"><span>Base Score:</span><span>100</span></div>
                <div class="tooltip-row negative"><span>High Issues (${b.highSeverity/10}):</span><span>-${b.highSeverity}</span></div>
                <div class="tooltip-row negative"><span>Medium Issues (${b.mediumSeverity/5}):</span><span>-${b.mediumSeverity}</span></div>
                <div class="tooltip-row negative"><span>Low Issues (${b.lowSeverity/2}):</span><span>-${b.lowSeverity}</span></div>
                <div class="tooltip-row positive"><span>Strength Bonus:</span><span>+${b.strengthBonus}</span></div>
                <div class="tooltip-divider"></div>
                <div class="tooltip-row total"><span>Final Score:</span><span>${scoreData.score}</span></div>
                <div class="tooltip-footer">Based on ${b.totalShots} total shots</div>
            `;
        }
        
        // Update improvement chart if exists
        if (typeof renderScoreHistoryChart === 'function') {
            renderScoreHistoryChart(history);
        }
        
    } catch (error) {
        console.error('Swing score error:', error);
        scoreEl.textContent = '--';
        descEl.textContent = 'Error calculating';
    }
}

// Render score history chart
function renderScoreHistoryChart(history) {
    const canvas = document.getElementById('scoreHistoryChart');
    if (!canvas || !history || history.length < 2) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Destroy existing chart
    if (window.scoreHistoryChartInstance) {
        window.scoreHistoryChartInstance.destroy();
    }
    
    const labels = history.slice(-10).map((h, i) => {
        const d = new Date(h.date);
        return `${d.getMonth()+1}/${d.getDate()}`;
    });
    
    const data = history.slice(-10).map(h => h.score);
    
    window.scoreHistoryChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Swing Score',
                data,
                borderColor: '#166534',
                backgroundColor: 'rgba(22, 101, 52, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#166534'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Score: ${ctx.raw}`
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
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
