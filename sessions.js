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
    document.getElementById('clubUsageSidebar')?.remove();
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

const ACTIVE_SESSION_STORAGE_KEY = 'activeSessionId';
const SESSION_MIGRATION_LOCK_KEY = 'sessionMigrationInFlight';
const SAVED_SESSIONS_BACKUP_KEY = 'savedSessionsBackup';

function setCurrentSessionId(nextId) {
    const normalized = (nextId === null || nextId === undefined || nextId === '')
        ? null
        : String(nextId);
    currentSessionId = normalized;
    if (normalized) {
        localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, normalized);
    } else {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    }
    return currentSessionId;
}

function getCurrentSessionId() {
    if (currentSessionId) return String(currentSessionId);
    const stored = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!stored) return null;
    currentSessionId = String(stored);
    return currentSessionId;
}

function getLoadedSessionMeta() {
    const activeId = getCurrentSessionId();
    if (!activeId) return { id: null, name: null };
    const sessions = readLocalSessionsNormalized();
    const matched = sessions.find((session) => String(session?.id) === String(activeId));
    return {
        id: activeId,
        name: matched?.name || null
    };
}

function normalizeSessionRecord(session, fallbackIndex = 0) {
    if (!session || typeof session !== 'object') return null;

    const data = Array.isArray(session.data)
        ? session.data
        : (Array.isArray(session.session_data) ? session.session_data : (Array.isArray(session.shot_data) ? session.shot_data : []));

    const firstClub = data.length > 0 ? getShotClubName(data[0]) : 'Golf Session';
    const rawName = session.name || session.sessionName || session.session_name || session.club_type || firstClub;
    const invalidName = !rawName || ['undefined', 'null', 'nan'].includes(String(rawName).trim().toLowerCase());
    const name = invalidName ? firstClub : String(rawName).trim();
    const date = session.date || session.created_at || new Date().toISOString();
    const id = String(session.id || session.session_id || session.timestamp || `${Date.now()}-${fallbackIndex}`);
    const shotCount = Number(session.shotCount || session.shot_count || data.length || 0);

    return {
        ...session,
        id,
        name,
        date,
        data,
        shotCount
    };
}

function readLocalSessionsNormalized() {
    return readSessionsFromStorageKey('savedSessions');
}

function readSessionsFromStorageKey(key) {
    try {
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        return (Array.isArray(raw) ? raw : [])
            .map((session, index) => normalizeSessionRecord(session, index))
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

function readQueuedSessionSavesNormalized() {
    try {
        const raw = JSON.parse(localStorage.getItem('syncQueue') || '[]');
        if (!Array.isArray(raw)) return [];
        return raw
            .filter((item) => item?.type === 'save-session' && Array.isArray(item?.data?.shots))
            .map((item, index) => normalizeSessionRecord({
                id: item.id || item.timestamp || `queued-${index}`,
                name: item.data.sessionName,
                date: item.data.sessionDate,
                data: item.data.shots,
                shotCount: item.data.shots.length
            }, index))
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

function mergeSessionsByFingerprint(...sessionLists) {
    const byFingerprint = new Map();
    sessionLists.flat().forEach((session) => {
        const normalized = normalizeSessionRecord(session);
        const fingerprint = getSessionFingerprint(normalized);
        if (!normalized || !fingerprint) return;
        byFingerprint.set(fingerprint, normalized);
    });

    return Array.from(byFingerprint.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function preserveLocalSessionsBackup() {
    const current = readLocalSessionsNormalized();
    const existing = readSessionsFromStorageKey(SAVED_SESSIONS_BACKUP_KEY);
    const queued = readQueuedSessionSavesNormalized();
    const merged = mergeSessionsByFingerprint(existing, current, queued);
    if (merged.length > 0) {
        localStorage.setItem(SAVED_SESSIONS_BACKUP_KEY, JSON.stringify(merged));
    }
    return merged;
}

function mergeSessions(cloudSessions = [], localSessions = []) {
    const merged = new Map();

    (Array.isArray(localSessions) ? localSessions : []).forEach((session) => {
        const normalized = normalizeSessionRecord(session);
        if (!normalized) return;
        merged.set(String(normalized.id), normalized);
    });

    (Array.isArray(cloudSessions) ? cloudSessions : []).forEach((session) => {
        const normalized = normalizeSessionRecord(session);
        if (!normalized) return;
        merged.set(String(normalized.id), normalized);
    });

    return Array.from(merged.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function getSessionFingerprint(session) {
    const normalized = normalizeSessionRecord(session);
    if (!normalized) return '';
    const shots = normalized.data || [];
    const firstShot = shots[0] || {};
    const lastShot = shots[shots.length - 1] || {};
    const stableShotBits = (shot) => [
        getShotClubName(shot),
        shot?.Date || shot?.date || '',
        shot?.['Club Speed'] || '',
        shot?.['Carry Distance'] || '',
        shot?.['Carry Deviation Distance'] || ''
    ].join(':');

    return [
        normalized.name.toLowerCase(),
        normalized.shotCount,
        stableShotBits(firstShot),
        stableShotBits(lastShot)
    ].join('|');
}

async function fetchCloudSessions(email) {
    const response = await fetch(`/.netlify/functions/get-sessions?email=${encodeURIComponent(email)}`, {
        headers: getInviteHeaders(),
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error('Failed to load sessions');
    }

    const result = await response.json();
    const sessionsRaw = Array.isArray(result) ? result : (result.sessions || []);
    return sessionsRaw
        .map((session, index) => normalizeSessionRecord(session, index))
        .filter(Boolean);
}

async function saveSessionToCloud(email, session) {
    const normalized = normalizeSessionRecord(session);
    if (!normalized || !normalized.data.length) return null;

    const response = await fetch('/.netlify/functions/save-session', {
        method: 'POST',
        headers: getInviteHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            email,
            sessionName: normalized.name,
            sessionDate: normalized.date,
            shots: normalized.data
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to migrate session: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return normalizeSessionRecord(result?.session || normalized);
}

async function migrateLocalSessionsToCloud(email, cloudSessions) {
    if (!email || localStorage.getItem(SESSION_MIGRATION_LOCK_KEY) === '1') {
        return cloudSessions;
    }

    const backupSessions = preserveLocalSessionsBackup();
    const localSessions = mergeSessionsByFingerprint(
        readLocalSessionsNormalized(),
        backupSessions,
        readQueuedSessionSavesNormalized()
    );
    if (!localSessions.length) return cloudSessions;

    const cloudFingerprints = new Set(cloudSessions.map(getSessionFingerprint).filter(Boolean));
    const missingLocalSessions = localSessions.filter((session) => {
        const fingerprint = getSessionFingerprint(session);
        return fingerprint && !cloudFingerprints.has(fingerprint);
    });

    if (!missingLocalSessions.length) return cloudSessions;

    localStorage.setItem(SESSION_MIGRATION_LOCK_KEY, '1');
    try {
        let migratedCount = 0;
        for (const session of missingLocalSessions) {
            try {
                await saveSessionToCloud(email, session);
                migratedCount++;
            } catch (error) {
                console.warn('Could not migrate local session to cloud:', error);
            }
        }

        if (migratedCount === 0) return cloudSessions;

        const refreshedCloud = await fetchCloudSessions(email);
        preserveLocalSessionsBackup();
        localStorage.setItem('savedSessions', JSON.stringify(refreshedCloud));
        window.dispatchEvent(new CustomEvent('sessions:synced', {
            detail: { migrated: migratedCount }
        }));
        return refreshedCloud;
    } finally {
        localStorage.removeItem(SESSION_MIGRATION_LOCK_KEY);
    }
}

function upsertLocalSessionCache(session) {
    const normalized = normalizeSessionRecord(session);
    if (!normalized) return;
    const existing = readLocalSessionsNormalized();
    const merged = mergeSessions([normalized], existing);
    localStorage.setItem('savedSessions', JSON.stringify(merged));
}

// Save sessions to Supabase (with localStorage fallback)
async function saveSessions(session) {
    const user = window.netlifyIdentity?.currentUser();
    
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
            headers: getInviteHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                email: user.email,
                sessionName: session.name,
                sessionDate: session.date,
                shots: session.data
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Save session failed:', response.status, errorText);
            throw new Error(`Failed to save session: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        const canonicalSession = normalizeSessionRecord(result?.session || session);
        if (canonicalSession) {
            upsertLocalSessionCache(canonicalSession);
        }

        return { success: true, offline: false, savedSession: canonicalSession, ...result };
    } catch (error) {
        console.error('Error saving to Supabase, falling back to localStorage:', error);
        
        // Check if it's a database error
        const errorMsg = error.message || '';
        if (errorMsg.includes('relation') || errorMsg.includes('does not exist') || errorMsg.includes('Supabase not configured')) {
            console.error('❌ Database tables not set up! Run the Supabase migration first.');
        }
        
        upsertLocalSessionCache(session);
        const email = user?.email;
        if (email && window.syncService?.addToQueue) {
            window.syncService.addToQueue({
                type: 'save-session',
                data: {
                    email,
                    sessionName: session.name,
                    sessionDate: session.date,
                    shots: session.data
                }
            });
        }
        return { success: true, offline: true, error: error.message };
    }
}

// Load sessions from Supabase (with localStorage fallback)
async function loadSessions() {
    const user = window.netlifyIdentity?.currentUser();
    
    if (!user) {
        // Not logged in, return localStorage only
        const data = localStorage.getItem('savedSessions');
        const parsed = data ? JSON.parse(data) : [];
        return (Array.isArray(parsed) ? parsed : [])
            .map((session, index) => normalizeSessionRecord(session, index))
            .filter(Boolean);
    }
    
    try {
        const email = String(user.email).trim().toLowerCase();
        preserveLocalSessionsBackup();
        const cloudSessions = await fetchCloudSessions(email);
        const sessions = await migrateLocalSessionsToCloud(email, cloudSessions);

        // Logged-in display is cloud-authoritative so devices match.
        preserveLocalSessionsBackup();
        localStorage.setItem('savedSessions', JSON.stringify(sessions));
        
        return sessions;
    } catch (error) {
        console.error('Error loading from Supabase, falling back to localStorage:', error);
        const data = localStorage.getItem('savedSessions');
        const parsed = data ? JSON.parse(data) : [];
        return (Array.isArray(parsed) ? parsed : [])
            .map((session, index) => normalizeSessionRecord(session, index))
            .filter(Boolean);
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
    const originalText = btn?.textContent || '';
    if (btn) {
        btn.textContent = 'Saving...';
        btn.disabled = true;
    }
    
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
    
    if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
    }
    
    if (result.success) {
        setCurrentSessionId(String(result?.savedSession?.id || session.id));
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
    await deleteSessionSilently(sessionId);
}

async function deleteSessionSilently(sessionId) {
    if (!sessionId) return;
    
    const user = window.netlifyIdentity?.currentUser();
    
    if (user) {
        try {
            const response = await fetch('/.netlify/functions/delete-session', {
                method: 'POST',
                headers: getInviteHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    sessionId,
                    email: user.email,
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
    const targetId = String(sessionId);
    const filtered = sessions.filter(s => String(s?.id) !== targetId);
    localStorage.setItem('savedSessions', JSON.stringify(filtered));
    
    if (String(currentSessionId) === targetId) {
        setCurrentSessionId(null);
    }
    
    await updateSessionsList();
    window.dispatchEvent(new CustomEvent('sessions:changed', {
        detail: { action: 'delete', sessionId: targetId }
    }));
}

async function loadSession(sessionId) {
    const sessions = await loadSessions();
    const targetId = String(sessionId);
    const session = sessions.find(s => String(s.id) === targetId);
    
    if (!session) {
        alert('Session not found');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('currentGolfData', JSON.stringify(session.data));
    localStorage.setItem('golfData', JSON.stringify(session.data));
    localStorage.setItem('lastUploadTime', Date.now().toString());
    setCurrentSessionId(session.id);
    
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
        const sessions = (await loadSessions()).filter(Boolean);
        
        if (sessions.length === 0) {
            listDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">No sessions saved yet</div>';
            return;
        }
        
        listDiv.innerHTML = '';
        
        sessions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).forEach(session => {
            const div = document.createElement('div');
            div.className = 'session-item';
            const activeId = getCurrentSessionId();
            if (String(session.id) === String(activeId || '')) {
                div.classList.add('active');
            }
            
            const date = new Date(session.date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            
            const shotCount = Number(session.shotCount || session?.data?.length || 0);
            const displayName = session.name || 'Golf Session';
            
            div.innerHTML = `
                <div class="session-item-name">${displayName}</div>
                <div class="session-item-meta">
                    <span>${dateStr} at ${timeStr}</span>
                    <span>${shotCount} shots</span>
                </div>
                <div class="session-item-actions">
                    <button class="session-item-btn delete delete-btn" data-id="${session.id}">Delete</button>
                </div>
            `;
            
            listDiv.appendChild(div);
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sessionId = String(btn.dataset.id || '');
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

// Calculate swing score from ALL session data (deduplicated)
async function calculateSwingScoreFromAllSessions() {
    // Use loadSessions() as the single source of truth — it already
    // merges cloud + local and deduplicates by fingerprint.
    let sessions = [];
    try {
        sessions = await loadSessions();
    } catch (e) {
        // Fallback to localStorage if network fails
        sessions = readLocalSessionsNormalized();
    }

    // Collect shots from all sessions
    let sessionShots = [];
    for (const session of sessions) {
        const data = session?.data;
        if (Array.isArray(data)) {
            sessionShots = sessionShots.concat(data);
        }
    }

    // Include current working data that may not be saved as a session yet
    const currentData = window.golfData || [];
    if (currentData.length > 0) {
        // Deduplicate: build fingerprints from session shots to avoid
        // counting the same shot twice when working data overlaps a session.
        const seen = new Set();
        for (const shot of sessionShots) {
            seen.add(shotFingerprint(shot));
        }
        for (const shot of currentData) {
            if (!seen.has(shotFingerprint(shot))) {
                sessionShots.push(shot);
            }
        }
    }

    return calculateScoreFromShots(sessionShots);
}

function shotFingerprint(shot) {
    if (!shot || typeof shot !== 'object') return '';
    return [
        shot['Club Speed'] || '',
        shot['Carry Distance'] || '',
        shot['Club Face'] || '',
        shot['Club Path'] || '',
        shot['Date'] || shot['date'] || ''
    ].join('|');
}

function calculateScoreFromShots(shots) {
    if (!shots || shots.length === 0) {
        return { score: 0, grade: 'N/A', desc: 'No data', breakdown: null };
    }
    
    if (typeof analyzeGolfData !== 'function') {
        return { score: 0, grade: 'N/A', desc: 'Loading...', breakdown: null };
    }
    
    const insights = analyzeGolfData(shots);
    const handicap = getPlayerHandicap();
    const calibration = getHandicapScoreCalibration(handicap);
    
    // Amateur-calibrated score: start below perfect and make "100" rare.
    let score = calibration.baseScore;
    const breakdown = {
        baseScore: calibration.baseScore,
        highSeverity: 0,
        mediumSeverity: 0,
        lowSeverity: 0,
        highIssueCount: 0,
        mediumIssueCount: 0,
        lowIssueCount: 0,
        strengthBonus: 0,
        totalShots: shots.length,
        handicap
    };
    
    // Issue penalties adjust to player level from handicap.
    const majorIssues = insights.warnings.filter(w => w.severity === 'high');
    breakdown.highIssueCount = majorIssues.length;
    breakdown.highSeverity = Math.round(majorIssues.length * 12 * calibration.penaltyFactor);
    score -= breakdown.highSeverity;
    
    const mediumIssues = insights.warnings.filter(w => w.severity === 'medium');
    breakdown.mediumIssueCount = mediumIssues.length;
    breakdown.mediumSeverity = Math.round(mediumIssues.length * 6 * calibration.penaltyFactor);
    score -= breakdown.mediumSeverity;
    
    const lowIssues = insights.warnings.filter(w => w.severity === 'low');
    breakdown.lowIssueCount = lowIssues.length;
    breakdown.lowSeverity = Math.round(lowIssues.length * 3 * calibration.penaltyFactor);
    score -= breakdown.lowSeverity;
    
    // Small bonus for strengths. Avoid masking real issues.
    breakdown.strengthBonus = Math.min(insights.strengths.length, calibration.maxStrengthBonus);
    score += breakdown.strengthBonus;
    
    // Imperfect sessions cannot score "tour-perfect" from strengths alone.
    if (insights.warnings.length > 0) {
        score = Math.min(score, calibration.warningCap);
    }

    // Clamp 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    // Determine grade
    let grade, desc;
    if (score >= 96) { grade = 'A+'; desc = handicap !== null && handicap > 5 ? 'Elite for Handicap' : 'Tour-Level'; }
    else if (score >= 88) { grade = 'A'; desc = 'Advanced Amateur'; }
    else if (score >= 78) { grade = 'B'; desc = 'Skilled Amateur'; }
    else if (score >= 68) { grade = 'C'; desc = 'Solid Amateur'; }
    else if (score >= 58) { grade = 'D'; desc = 'Developing'; }
    else { grade = 'F'; desc = 'Needs Work'; }
    
    return { score, grade, desc, breakdown, warnings: insights.warnings, strengths: insights.strengths };
}

function getPlayerHandicap() {
    const raw = localStorage.getItem('playerHandicap');
    const handicap = raw === null ? NaN : Number(raw);
    return Number.isFinite(handicap) ? Math.max(-5, Math.min(54, handicap)) : null;
}

function getHandicapScoreCalibration(handicap) {
    if (handicap === null) {
        return { baseScore: 92, penaltyFactor: 1, maxStrengthBonus: 6, warningCap: 94 };
    }

    const baseScore = Math.round(Math.max(88, Math.min(94, 90 + handicap * 0.15)));
    const penaltyFactor = Math.max(0.82, Math.min(1.15, 1 - ((handicap - 12) * 0.012)));
    const maxStrengthBonus = 6;
    const warningCap = handicap >= 18 ? 93 : handicap >= 10 ? 94 : 94;

    return { baseScore, penaltyFactor, maxStrengthBonus, warningCap };
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
            // Pulse the score card so users notice the change on mobile
            const container = document.getElementById('swingScoreContainer');
            if (container) {
                container.classList.remove('score-updated');
                // Force reflow so the animation retriggers even if called twice
                void container.offsetWidth;
                container.classList.add('score-updated');
                container.addEventListener('animationend', () => {
                    container.classList.remove('score-updated');
                }, { once: true });
            }
        } else if (deltaEl) {
            deltaEl.style.display = 'none';
        }

        // Update tooltip with breakdown
        if (tooltipEl && scoreData.breakdown) {
            const b = scoreData.breakdown;
            tooltipEl.innerHTML = `
                <div class="tooltip-title">Score Breakdown</div>
                <div class="tooltip-row"><span>Base Score:</span><span>${b.baseScore}</span></div>
                <div class="tooltip-row negative"><span>High Issues (${b.highIssueCount || 0}):</span><span>-${b.highSeverity}</span></div>
                <div class="tooltip-row negative"><span>Medium Issues (${b.mediumIssueCount || 0}):</span><span>-${b.mediumSeverity}</span></div>
                <div class="tooltip-row negative"><span>Low Issues (${b.lowIssueCount || 0}):</span><span>-${b.lowSeverity}</span></div>
                <div class="tooltip-row positive"><span>Strength Bonus:</span><span>+${b.strengthBonus}</span></div>
                <div class="tooltip-divider"></div>
                <div class="tooltip-row total"><span>Final Score:</span><span>${scoreData.score}</span></div>
                ${b.handicap !== null && b.handicap !== undefined ? `<div class="tooltip-footer">Handicap calibration: ${b.handicap}</div>` : ''}
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

function setSessionsPanelOpen(isOpen) {
    if (!sessionsPanel) return;
    sessionsPanel.classList.toggle('open', isOpen);
    document.body.classList.toggle('sessions-open', isOpen);
    if (sessionsToggleBtn) {
        sessionsToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        sessionsToggleBtn.setAttribute('aria-label', isOpen ? 'Close sessions' : 'Open sessions');
    }
}

if (sessionsPanel) {
    new MutationObserver(() => {
        document.body.classList.toggle('sessions-open', sessionsPanel.classList.contains('open'));
        if (sessionsToggleBtn) {
            const isOpen = sessionsPanel.classList.contains('open');
            sessionsToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            sessionsToggleBtn.setAttribute('aria-label', isOpen ? 'Close sessions' : 'Open sessions');
        }
    }).observe(sessionsPanel, { attributes: true, attributeFilter: ['class'] });
}

if (saveSessionBtn) {
    saveSessionBtn.remove();
}

if (sessionsToggleBtn && sessionsPanel) {
    sessionsToggleBtn.addEventListener('click', () => {
        setSessionsPanelOpen(!sessionsPanel.classList.contains('open'));
    });
}

if (sessionsPanelCloseBtn && sessionsPanel) {
    sessionsPanelCloseBtn.addEventListener('click', () => {
        setSessionsPanelOpen(false);
    });
}

// Close on outside click
document.addEventListener('click', (e) => {
    const panel = document.getElementById('sessionsPanel');
    const toggle = document.getElementById('sessionsToggle');
    if (!panel || !toggle) return;
    
    if (!panel.contains(e.target) && !toggle.contains(e.target)) {
        setSessionsPanelOpen(false);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        setSessionsPanelOpen(false);
    }
});

window.addEventListener('handicap:changed', () => {
    if (typeof updateSwingScore === 'function') {
        updateSwingScore();
    }
});

// Tap-to-toggle tooltip on touch devices
(function wireScoreTooltipTap() {
    const container = document.getElementById('swingScoreContainer');
    if (!container) return;
    container.addEventListener('click', (e) => {
        // Only activate on touch-primary devices (hover: none)
        if (!window.matchMedia('(hover: none)').matches) return;
        const isOpen = container.classList.toggle('tooltip-open');
        if (isOpen) {
            // Close when tapping outside
            const closeOutside = (ev) => {
                if (!container.contains(ev.target)) {
                    container.classList.remove('tooltip-open');
                    document.removeEventListener('click', closeOutside, { capture: true });
                }
            };
            setTimeout(() => document.addEventListener('click', closeOutside, { capture: true }), 0);
        }
    });
})();

window.updateClubSidebar = (shots) => {
    renderSidebarClubUsage(Array.isArray(shots) ? shots : loadCurrentShotsFromStorage());
};
window.saveSessions = saveSessions;
window.deleteSessionSilently = deleteSessionSilently;
window.setLoadedSessionId = setCurrentSessionId;
window.getLoadedSessionId = getCurrentSessionId;
window.getLoadedSessionMeta = getLoadedSessionMeta;

window.addEventListener('golf-data-updated', (event) => {
    const shots = event?.detail?.shots;
    renderSidebarClubUsage(Array.isArray(shots) ? shots : []);
});

// Initialize on load
window.addEventListener('load', () => {
    getCurrentSessionId();
    renderSidebarClubUsage(loadCurrentShotsFromStorage());
    updateSessionsList();
});
