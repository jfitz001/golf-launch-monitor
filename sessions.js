// Session Management - LocalStorage

function saveSessions(sessions) {
    localStorage.setItem('golfSessions', JSON.stringify(sessions));
}

function loadSessions() {
    const data = localStorage.getItem('golfSessions');
    return data ? JSON.parse(data) : [];
}

function saveCurrentSession() {
    if (!golfData || golfData.length === 0) {
        alert('No data to save');
        return;
    }
    
    const sessionName = prompt('Enter session name (e.g., "Range Session - Jan 15")');
    if (!sessionName) return;
    
    const sessions = loadSessions();
    const session = {
        id: Date.now(),
        name: sessionName,
        date: new Date().toISOString(),
        data: golfData,
        stats: calculateSessionStats()
    };
    
    sessions.push(session);
    saveSessions(sessions);
    currentSessionId = session.id;
    updateSessionsList();
    alert('Session saved!');
    document.getElementById('sessionsPanel').classList.remove('open');
}

function deleteSessionById(sessionId) {
    if (!confirm('Delete this session?')) return;
    
    const sessions = loadSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    saveSessions(filtered);
    
    if (currentSessionId === sessionId) {
        currentSessionId = null;
    }
    
    updateSessionsList();
}

function loadSession(sessionId) {
    const sessions = loadSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) return;
    
    golfData = session.data;
    displayData();
}

let currentSessionId = null;

function updateSessionsList() {
    const listDiv = document.getElementById('sessionsList');
    const sessions = loadSessions();
    
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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sessionId = parseInt(btn.dataset.id);
            loadSession(sessionId);
            currentSessionId = sessionId;
            updateSessionsList();
            document.getElementById('sessionsPanel').classList.remove('open');
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sessionId = parseInt(btn.dataset.id);
            deleteSessionById(sessionId);
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
