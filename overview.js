// Overview page - session-over-session tracking

let allSessions = [];
let selectedClub = 'all';

window.addEventListener('load', async () => {
    // Load sessions from Supabase (will fallback to localStorage if needed)
    allSessions = await loadSessions();
    const currentData = localStorage.getItem('currentGolfData');
    
    // Check if we have either saved sessions OR a currently loaded session
    if (allSessions.length === 0 && (!currentData || currentData === '[]')) {
        document.getElementById('dataLoaded').style.display = 'none';
        document.getElementById('noData').classList.remove('hidden');
        return;
    }
    
    document.getElementById('dataLoaded').classList.remove('hidden');
    document.getElementById('noData').style.display = 'none';
    
    // If we have saved sessions, show full progress tracking
    if (allSessions.length > 0) {
        // Detect clubs and create filter
        createClubFilter(allSessions);
        
        // Display with selected filter
        displayFilteredSessions();
    } else {
        // Only have current session - show single session stats
        displayCurrentSessionStats();
    }
});

function createClubFilter(sessions) {
    // Extract unique clubs from sessions
    const clubs = new Set();
    sessions.forEach(session => {
        const club = detectClubFromSession(session);
        if (club && club !== 'Unknown') {
            clubs.add(club);
        }
    });
    
    if (clubs.size === 0) {
        return; // No club data available
    }
    
    // Create filter UI
    const filterHTML = `
        <div style="margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
            <label style="color: var(--text-secondary); font-weight: 500;">Filter by Club:</label>
            <select id="clubFilter" style="background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; font-size: 15px; cursor: pointer;">
                <option value="all">All Clubs (${sessions.length} sessions)</option>
                ${Array.from(clubs).sort().map(club => {
                    const count = sessions.filter(s => detectClubFromSession(s) === club).length;
                    return `<option value="${club}">${club} (${count} sessions)</option>`;
                }).join('')}
            </select>
        </div>
    `;
    
    const container = document.getElementById('dataLoaded');
    container.insertAdjacentHTML('afterbegin', filterHTML);
    
    // Add change listener
    document.getElementById('clubFilter').addEventListener('change', (e) => {
        selectedClub = e.target.value;
        displayFilteredSessions();
    });
}

function detectClubFromSession(session) {
    // Try to extract club from session data
    if (session.data && session.data.length > 0) {
        // Check first shot for club type
        const firstShot = session.data[0];
        if (firstShot['Club'] || firstShot['club']) {
            return firstShot['Club'] || firstShot['club'];
        }
    }
    
    // Try to extract from session name (e.g., "5 Iron - Jan 15" or "5 iron session")
    if (session.name) {
        const match = session.name.match(/(\d+[\s\-]?(iron|wood|hybrid|driver|wedge))/i);
        if (match) {
            return match[1].trim();
        }
    }
    
    // Fallback to club_type if available
    if (session.club_type) {
        return session.club_type;
    }
    
    return 'Unknown';
}

function displayFilteredSessions() {
    const filteredSessions = selectedClub === 'all' 
        ? allSessions 
        : allSessions.filter(s => detectClubFromSession(s) === selectedClub);
    
    if (filteredSessions.length === 0) {
        document.getElementById('dataLoaded').innerHTML = `
            <p style="text-align: center; color: var(--text-secondary); padding: 40px;">
                No sessions found for ${selectedClub}
            </p>
        `;
        return;
    }
    
    displaySummaryStats(filteredSessions);
    createProgressCharts(filteredSessions);
    displaySessionHistory(filteredSessions);
}

function displaySummaryStats(sessions) {
    // Total sessions
    document.getElementById('totalSessions').textContent = sessions.length;
    
    // Best swing score
    const scores = sessions.map(s => s.swingScore?.score || 0);
    const bestScore = Math.max(...scores);
    document.getElementById('bestScore').textContent = bestScore > 0 ? bestScore : '--';
    
    // Average improvement (session-over-session)
    let improvements = [];
    for (let i = 1; i < sessions.length; i++) {
        const prev = sessions[i-1].swingScore?.score || 0;
        const curr = sessions[i].swingScore?.score || 0;
        if (prev > 0 && curr > 0) {
            improvements.push(curr - prev);
        }
    }
    const avgImprovement = improvements.length > 0 
        ? improvements.reduce((a,b) => a+b, 0) / improvements.length 
        : 0;
    document.getElementById('avgImprovement').textContent = 
        avgImprovement > 0 ? `+${avgImprovement.toFixed(1)}` : avgImprovement.toFixed(1);
    
    // Practice hours (estimate: 15min per session)
    const hours = (sessions.length * 15 / 60).toFixed(1);
    document.getElementById('practiceHours').textContent = `${hours}h`;
}

function displayCurrentSessionStats() {
    // Show stats for currently loaded session only
    try {
        const currentData = JSON.parse(localStorage.getItem('currentGolfData') || '[]');
        
        if (currentData.length === 0) {
            document.getElementById('dataLoaded').style.display = 'none';
            document.getElementById('noData').classList.remove('hidden');
            return;
        }
        
        // Calculate basic stats from current data
        const carryDistances = currentData.map(s => parseFloat(s['Carry Distance']) || 0).filter(d => d > 0);
        const avgCarry = carryDistances.reduce((a, b) => a + b, 0) / carryDistances.length;
        const stdDev = Math.sqrt(carryDistances.map(x => Math.pow(x - avgCarry, 2)).reduce((a, b) => a + b) / carryDistances.length);
        const consistency = Math.max(0, 100 - (stdDev / avgCarry * 100));
        
        // Update summary cards
        document.getElementById('totalSessions').textContent = '1';
        document.getElementById('bestScore').textContent = Math.round(consistency);
        document.getElementById('avgImprovement').textContent = '--';
        document.getElementById('practiceHours').textContent = '0.25h';
        
        // Create a single-session "history" for charts
        const singleSession = {
            name: 'Current Session',
            timestamp: Date.now(),
            data: currentData,
            swingScore: {
                score: Math.round(consistency),
                description: 'Current session'
            },
            stats: {
                avgCarry: avgCarry.toFixed(1),
                consistency: consistency.toFixed(0),
                totalShots: currentData.length
            }
        };
        
        // Create charts with just this one session
        createProgressCharts([singleSession]);
        
        // Display session history
        const historyDiv = document.getElementById('sessionHistory');
        historyDiv.innerHTML = `
            <div class="drill-card" style="background: var(--card);">
                <h3>${singleSession.name}</h3>
                <p style="color: var(--text-secondary); margin: 8px 0;">
                    ${new Date(singleSession.timestamp).toLocaleDateString()} at ${new Date(singleSession.timestamp).toLocaleTimeString()}
                </p>
                <div class="stats-grid" style="margin-top: 16px;">
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.875rem;">Shots</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary);">${singleSession.stats.totalShots}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.875rem;">Avg Distance</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary);">${singleSession.stats.avgCarry} yds</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.875rem;">Consistency</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary);">${singleSession.stats.consistency}%</div>
                    </div>
                </div>
                <p style="margin-top: 16px; color: var(--warning);">
                    💡 Save this session to track progress over time
                </p>
            </div>
        `;
    } catch (error) {
        console.error('Error displaying current session:', error);
        document.getElementById('dataLoaded').style.display = 'none';
        document.getElementById('noData').classList.remove('hidden');
    }
}

function createProgressCharts(sessions) {
    createScoreProgressChart(sessions);
    createDistanceTrendsChart(sessions);
    createConsistencyTrendsChart(sessions);
    createClubTrendsChart(sessions);
}

function createScoreProgressChart(sessions) {
    const ctx = document.getElementById('scoreProgressChart').getContext('2d');
    
    const labels = sessions.map((s, i) => `Session ${i + 1}`);
    const scores = sessions.map(s => s.swingScore?.score || null);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Swing Score',
                data: scores,
                borderColor: 'rgba(124, 58, 237, 1)',
                backgroundColor: 'rgba(124, 58, 237, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 6,
                pointHoverRadius: 8
            }, {
                label: 'Trend',
                data: calculateTrendline(scores),
                borderColor: 'rgba(16, 185, 129, 1)',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } },
                title: {
                    display: true,
                    text: `${scores.filter(s => s !== null).length} sessions tracked`,
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Score (0-100)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' },
                    min: 0,
                    max: 100
                },
                x: {
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createDistanceTrendsChart(sessions) {
    const ctx = document.getElementById('distanceTrendsChart').getContext('2d');
    
    const labels = sessions.map((s, i) => `S${i + 1}`);
    const avgDistances = sessions.map(s => parseFloat(s.stats?.avgCarry) || null);
    const bestDistances = sessions.map(s => parseFloat(s.stats?.bestShot) || null);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Avg Carry',
                data: avgDistances,
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 5
            }, {
                label: 'Best Shot',
                data: bestDistances,
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: false,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Distance (yards)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createConsistencyTrendsChart(sessions) {
    const ctx = document.getElementById('consistencyTrendsChart').getContext('2d');
    
    const labels = sessions.map((s, i) => `S${i + 1}`);
    const consistency = sessions.map(s => parseFloat(s.stats?.consistency) || null);
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Consistency %',
                data: consistency,
                backgroundColor: consistency.map(c => 
                    c >= 90 ? 'rgba(16, 185, 129, 0.6)' :
                    c >= 80 ? 'rgba(245, 158, 11, 0.6)' :
                    'rgba(239, 68, 68, 0.6)'
                ),
                borderColor: consistency.map(c => 
                    c >= 90 ? 'rgba(16, 185, 129, 1)' :
                    c >= 80 ? 'rgba(245, 158, 11, 1)' :
                    'rgba(239, 68, 68, 1)'
                ),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Consistency %', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' },
                    min: 0,
                    max: 100
                },
                x: {
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createClubTrendsChart(sessions) {
    const ctx = document.getElementById('clubTrendsChart').getContext('2d');
    
    // Extract club performance by session
    const clubData = {};
    sessions.forEach((session, idx) => {
        const club = detectClubFromSession(session);
        if (!clubData[club]) clubData[club] = [];
        clubData[club].push({
            session: idx + 1,
            avgCarry: parseFloat(session.stats?.avgCarry) || 0
        });
    });
    
    const datasets = Object.keys(clubData).map((club, idx) => ({
        label: club,
        data: sessions.map((_, sIdx) => {
            const match = clubData[club].find(d => d.session === sIdx + 1);
            return match ? match.avgCarry : null;
        }),
        borderColor: `hsl(${idx * 60}, 70%, 50%)`,
        backgroundColor: `hsla(${idx * 60}, 70%, 50%, 0.1)`,
        tension: 0.4,
        pointRadius: 5,
        spanGaps: true
    }));
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: sessions.map((_, i) => `S${i + 1}`),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Avg Distance (yards)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function displaySessionHistory(sessions) {
    const container = document.getElementById('sessionHistory');
    
    const html = sessions.slice().reverse().map((session, idx) => {
        const actualIdx = sessions.length - 1 - idx;
        const date = new Date(session.timestamp || session.date);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const club = detectClubFromSession(session);
        
        return `
            <div class="drill-card">
                <h4>Session ${actualIdx + 1}: ${club}</h4>
                <p style="color: var(--text-secondary); font-size: 13px; margin: 8px 0;">${dateStr}</p>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 12px;">
                    <div>
                        <div style="color: var(--text-secondary); font-size: 12px;">Swing Score</div>
                        <div style="font-size: 20px; font-weight: 600; color: var(--primary);">
                            ${session.swingScore?.score || '--'}
                        </div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 12px;">Avg Carry</div>
                        <div style="font-size: 20px; font-weight: 600; color: var(--primary);">
                            ${session.stats?.avgCarry || '--'} yds
                        </div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 12px;">Shots</div>
                        <div style="font-size: 20px; font-weight: 600; color: var(--primary);">
                            ${session.stats?.shots || session.data?.length || 0}
                        </div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 12px;">Consistency</div>
                        <div style="font-size: 20px; font-weight: 600; color: var(--primary);">
                            ${session.stats?.consistency || '--'}%
                        </div>
                    </div>
                </div>
                <button onclick="loadSession(${actualIdx})" class="secondary-button" style="margin-top: 16px; width: 100%;">
                    Load This Session
                </button>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

async function loadSession(index) {
    const session = allSessions[index];
    
    if (session && session.data) {
        localStorage.setItem('currentGolfData', JSON.stringify(session.data));
        localStorage.setItem('golfData', JSON.stringify(session.data));
        localStorage.setItem('lastUploadTime', Date.now().toString());
        window.location.href = '/upload';
    }
}

function calculateTrendline(data) {
    const validData = data.map((y, x) => ({x, y})).filter(d => d.y !== null);
    if (validData.length < 2) return data.map(() => null);
    
    const n = validData.length;
    const sumX = validData.reduce((sum, d) => sum + d.x, 0);
    const sumY = validData.reduce((sum, d) => sum + d.y, 0);
    const sumXY = validData.reduce((sum, d) => sum + d.x * d.y, 0);
    const sumX2 = validData.reduce((sum, d) => sum + d.x * d.x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return data.map((_, x) => slope * x + intercept);
}
