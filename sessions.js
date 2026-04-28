// Session Management - Supabase with localStorage fallback

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
        const response = await fetch('/.netlify/functions/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session,
                userEmail: user.email
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save session');
        }
        
        const result = await response.json();
        
        // Also save to localStorage as backup
        const localSessions = JSON.parse(localStorage.getItem('savedSessions') || '[]');
        localSessions.push(session);
        localStorage.setItem('savedSessions', JSON.stringify(localSessions));
        
        return result;
    } catch (error) {
        console.error('Error saving to Supabase, falling back to localStorage:', error);
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
        const response = await fetch(`/.netlify/functions/get-sessions?email=${encodeURIComponent(user.email)}`);
        
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
    if (!golfData || golfData.length === 0) {
        alert('No data to save');
        return;
    }
    
    const sessionName = prompt('Enter session name (e.g., "Range Session - Jan 15")');
    if (!sessionName) return;
    
    // Show loading state
    const btn = document.getElementById('saveSessionBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    const swingScoreData = calculateSwingScore();
    const session = {
        id: Date.now(),
        name: sessionName,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        data: golfData,
        swingScore: {
            score: swingScoreData.score,
            description: `${swingScoreData.grade} - ${swingScoreData.desc}`
        },
        stats: calculateSessionStats()
    };
    
    const result = await saveSessions(session);
    
    btn.textContent = originalText;
    btn.disabled = false;
    
    if (result.success) {
        currentSessionId = session.id;
        await updateSessionsList();
        alert(result.offline ? 'Session saved offline (will sync when online)' : 'Session saved!');
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
                headers: { 'Content-Type': 'application/json' },
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
    
    if (!session) return;
    
    golfData = session.data;
    localStorage.setItem('currentGolfData', JSON.stringify(golfData));
    displayData();
}

let currentSessionId = null;

async function updateSessionsList() {
    const listDiv = document.getElementById('sessionsList');
    
    // Show loading state
    listDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">Loading sessions...</div>';
    
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
    const insights = analyzeGolfData(golfData);
    
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
    const result = calculateSwingScore();
    
    document.getElementById('swingScore').textContent = result.score;
    document.getElementById('swingScoreDesc').textContent = `${result.grade} - ${result.desc}`;
}

// Event listeners
document.getElementById('saveSessionBtn').addEventListener('click', saveCurrentSession);

document.getElementById('sessionsToggle').addEventListener('click', () => {
    document.getElementById('sessionsPanel').classList.add('open');
});

document.getElementById('sessionsPanelClose').addEventListener('click', () => {
    document.getElementById('sessionsPanel').classList.remove('open');
});

// Close on outside click
document.addEventListener('click', (e) => {
    const panel = document.getElementById('sessionsPanel');
    const toggle = document.getElementById('sessionsToggle');
    
    if (!panel.contains(e.target) && !toggle.contains(e.target)) {
        panel.classList.remove('open');
    }
});

// Initialize on load
window.addEventListener('load', () => {
    updateSessionsList();
});
