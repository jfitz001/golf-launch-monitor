// Overview page - session-over-session tracking

let allSessions = [];
let selectedClub = 'all';
const overviewCharts = {};

const METRIC_DIRECTION = {
    score: 'higher',
    avgCarry: 'higher',
    bestShot: 'higher',
    consistency: 'higher',
    avgOfflineAbs: 'lower',
    facePathStd: 'lower',
    smash: 'higher',
    launch: 'higher'
};

function chartTheme() {
    const css = getComputedStyle(document.documentElement);
    const text = (css.getPropertyValue('--text') || '').trim() || '#14221b';
    const textSecondary = (css.getPropertyValue('--text-secondary') || '').trim() || '#587264';
    const border = (css.getPropertyValue('--border') || '').trim() || '#d2dfd6';
    return {
        legend: text,
        axis: textSecondary,
        grid: border
    };
}

function baseChartOptions(extra = {}) {
    const t = chartTheme();
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: t.legend, boxWidth: 18 }
            }
        },
        scales: {
            y: {
                grid: { color: t.grid },
                ticks: { color: t.axis },
                title: { color: t.axis }
            },
            x: {
                grid: { color: t.grid },
                ticks: { color: t.axis },
                title: { color: t.axis }
            }
        },
        ...extra
    };
}

function destroyChart(id) {
    if (overviewCharts[id]) {
        overviewCharts[id].destroy();
        delete overviewCharts[id];
    }
}

function createChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    destroyChart(id);
    overviewCharts[id] = new Chart(canvas.getContext('2d'), config);
}

function numericShotValue(shot, keys) {
    for (const key of keys) {
        const value = parseFloat(shot?.[key]);
        if (Number.isFinite(value)) return value;
    }
    return null;
}

function avg(values) {
    const valid = values.filter(Number.isFinite);
    if (!valid.length) return null;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function std(values) {
    const valid = values.filter(Number.isFinite);
    if (valid.length < 2) return null;
    const mean = avg(valid);
    return Math.sqrt(avg(valid.map((value) => (value - mean) ** 2)));
}

function fmt(value, digits = 1, fallback = '--') {
    return Number.isFinite(value) ? value.toFixed(digits) : fallback;
}

function signed(value, digits = 1, suffix = '') {
    if (!Number.isFinite(value)) return '--';
    return `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`;
}

function getSessionShots(session) {
    if (Array.isArray(session?.data)) return session.data;
    if (Array.isArray(session?.shot_data)) return session.shot_data;
    if (Array.isArray(session?.session_data)) return session.session_data;
    return [];
}

function getShotClubName(shot) {
    return (
        shot?.['Club Name'] ||
        shot?.['Club Type'] ||
        shot?.Club ||
        shot?.club ||
        shot?.['Club name'] ||
        shot?.['club name'] ||
        shot?.ClubName ||
        'Unknown'
    );
}

function detectClubFromSession(session) {
    const shots = getSessionShots(session);
    const counts = shots.reduce((acc, shot) => {
        const club = getShotClubName(shot);
        if (!club || club === 'Unknown') return acc;
        acc[club] = (acc[club] || 0) + 1;
        return acc;
    }, {});
    const topClub = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topClub) return topClub;

    if (session?.name) {
        const match = String(session.name).match(/(\d+[\s-]?(iron|wood|hybrid|driver|wedge)|gap wedge|sand wedge|lob wedge)/i);
        if (match) return match[1].trim().replace(/\s+/g, ' ');
    }

    return session?.club_type || 'Unknown';
}

function calculateSessionMetrics(session) {
    const shots = getSessionShots(session);
    const carry = shots.map((s) => numericShotValue(s, ['Carry Distance', 'Carry Dist.', 'Carry']));
    const total = shots.map((s) => numericShotValue(s, ['Total Distance', 'Total']));
    const clubSpeed = shots.map((s) => numericShotValue(s, ['Club Speed']));
    const ballSpeed = shots.map((s) => numericShotValue(s, ['Ball Speed']));
    const smash = shots.map((s) => numericShotValue(s, ['Smash Factor']));
    const launch = shots.map((s) => numericShotValue(s, ['Launch Angle']));
    const offlineAbs = shots
        .map((s) => numericShotValue(s, ['Carry Deviation Distance', 'Total Deviation Distance']))
        .filter(Number.isFinite)
        .map((value) => Math.abs(value));
    const faceToPath = shots
        .map((s) => {
            const face = numericShotValue(s, ['Club Face']);
            const path = numericShotValue(s, ['Club Path']);
            return Number.isFinite(face) && Number.isFinite(path) ? face - path : null;
        })
        .filter(Number.isFinite);

    const avgCarry = Number.isFinite(parseFloat(session?.stats?.avgCarry))
        ? parseFloat(session.stats.avgCarry)
        : (Number.isFinite(parseFloat(session?.avgCarry)) ? parseFloat(session.avgCarry) : avg(carry));
    const bestShot = Number.isFinite(parseFloat(session?.stats?.bestShot))
        ? parseFloat(session.stats.bestShot)
        : avg([Math.max(...carry.filter(Number.isFinite))]);
    const carryStd = std(carry);
    const consistency = Number.isFinite(parseFloat(session?.stats?.consistency))
        ? parseFloat(session.stats.consistency)
        : (Number.isFinite(avgCarry) && Number.isFinite(carryStd) && avgCarry > 0
            ? Math.max(0, 100 - (carryStd / avgCarry * 100))
            : null);
    const score = Number.isFinite(parseFloat(session?.swingScore?.score))
        ? parseFloat(session.swingScore.score)
        : (Number.isFinite(consistency) ? Math.round(consistency) : null);

    return {
        shots: shots.length,
        avgCarry,
        bestShot,
        totalAvg: avg(total),
        clubSpeed: avg(clubSpeed),
        ballSpeed: avg(ballSpeed),
        smash: avg(smash),
        launch: avg(launch),
        avgOfflineAbs: avg(offlineAbs),
        facePathStd: std(faceToPath),
        facePathAvg: avg(faceToPath),
        consistency,
        score
    };
}

function normalizeProgressSessions(sessions) {
    return (Array.isArray(sessions) ? sessions : [])
        .map((session, index) => {
            const date = new Date(session?.date || session?.created_at || session?.timestamp || Date.now());
            const data = getSessionShots(session);
            return {
                ...session,
                id: String(session?.id || session?.session_id || `${date.getTime()}-${index}`),
                date: date.toISOString(),
                data,
                club: detectClubFromSession({ ...session, data }),
                metrics: calculateSessionMetrics({ ...session, data })
            };
        })
        .filter((session) => session.data.length > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

window.addEventListener('load', async () => {
    allSessions = normalizeProgressSessions(await loadSessions());
    const currentData = localStorage.getItem('currentGolfData');

    if (allSessions.length === 0 && (!currentData || currentData === '[]')) {
        document.getElementById('dataLoaded').style.display = 'none';
        document.getElementById('noData').classList.remove('hidden');
        return;
    }

    document.getElementById('dataLoaded').classList.remove('hidden');
    document.getElementById('noData').style.display = 'none';

    if (allSessions.length > 0) {
        createClubFilter(allSessions);
        displayFilteredSessions();
    } else {
        displayCurrentSessionStats();
    }
});

function createClubFilter(sessions) {
    const clubs = new Set(sessions.map((session) => session.club).filter((club) => club && club !== 'Unknown'));
    if (!clubs.size || document.getElementById('clubFilter')) return;

    const filterHTML = `
        <div class="progress-filter-bar">
            <label for="clubFilter">Filter by Club</label>
            <select id="clubFilter">
                <option value="all">All Clubs (${sessions.length} sessions)</option>
                ${Array.from(clubs).sort().map((club) => {
                    const count = sessions.filter((session) => session.club === club).length;
                    return `<option value="${club}">${club} (${count} sessions)</option>`;
                }).join('')}
            </select>
        </div>
    `;

    document.getElementById('dataLoaded').insertAdjacentHTML('afterbegin', filterHTML);
    document.getElementById('clubFilter').addEventListener('change', (event) => {
        selectedClub = event.target.value;
        displayFilteredSessions();
    });
}

function displayFilteredSessions() {
    const filteredSessions = selectedClub === 'all'
        ? allSessions
        : allSessions.filter((session) => session.club === selectedClub);

    if (filteredSessions.length === 0) {
        document.getElementById('sessionHistory').innerHTML = `<div class="progress-empty">No sessions found for ${selectedClub}</div>`;
        return;
    }

    displaySummaryStats(filteredSessions);
    displayTrendSummary(filteredSessions);
    createProgressCharts(filteredSessions);
    displaySessionHistory(filteredSessions);
    window.reObserveAnimations?.();
}

function getMetricDelta(sessions, metric) {
    if (sessions.length < 2) return null;
    const latest = sessions[sessions.length - 1]?.metrics?.[metric];
    const previous = sessions[sessions.length - 2]?.metrics?.[metric];
    if (!Number.isFinite(latest) || !Number.isFinite(previous)) return null;
    return latest - previous;
}

function trendClass(metric, delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return 'flat';
    const direction = METRIC_DIRECTION[metric] || 'higher';
    const improved = direction === 'higher' ? delta > 0 : delta < 0;
    return improved ? 'improving' : 'regressing';
}

function displaySummaryStats(sessions) {
    document.getElementById('totalSessions').textContent = sessions.length;

    const scores = sessions.map((session) => session.metrics.score).filter(Number.isFinite);
    document.getElementById('bestScore').textContent = scores.length ? Math.max(...scores).toFixed(0) : '--';

    const offlineDelta = getMetricDelta(sessions, 'avgOfflineAbs');
    document.getElementById('avgImprovement').textContent = Number.isFinite(offlineDelta)
        ? signed(-offlineDelta, 1, ' yd')
        : '--';

    const totalShots = sessions.reduce((sum, session) => sum + (session.metrics.shots || 0), 0);
    const hours = Math.max(sessions.length * 0.25, totalShots / 120).toFixed(1);
    document.getElementById('practiceHours').textContent = `${hours}h`;
}

function displayTrendSummary(sessions) {
    const container = document.getElementById('trendSummary');
    if (!container) return;

    const latest = sessions[sessions.length - 1];
    const previous = sessions[sessions.length - 2];
    const cards = [
        { label: 'Avg Carry', metric: 'avgCarry', unit: ' yd', digits: 1 },
        { label: 'Offline Miss', metric: 'avgOfflineAbs', unit: ' yd', digits: 1 },
        { label: 'Face-Path Spread', metric: 'facePathStd', unit: ' deg', digits: 1 },
        { label: 'Consistency', metric: 'consistency', unit: '%', digits: 0 },
        { label: 'Smash', metric: 'smash', unit: '', digits: 2 },
        { label: 'Launch', metric: 'launch', unit: ' deg', digits: 1 }
    ];

    const latestDate = latest ? new Date(latest.date).toLocaleDateString() : '';
    const previousDate = previous ? new Date(previous.date).toLocaleDateString() : '';

    container.innerHTML = `
        <div class="trend-summary-header">
            <div>
                <h2>Latest Session Progress</h2>
                <p>${previous ? `${previousDate} to ${latestDate}` : 'Save another session to unlock deltas.'}</p>
            </div>
            <div class="trend-session-count">${sessions.length} session${sessions.length === 1 ? '' : 's'}</div>
        </div>
        <div class="trend-summary-grid">
            ${cards.map((card) => {
                const value = latest?.metrics?.[card.metric];
                const delta = getMetricDelta(sessions, card.metric);
                const cls = trendClass(card.metric, delta);
                const deltaText = Number.isFinite(delta) ? signed(delta, card.digits, card.unit) : '--';
                const direction = METRIC_DIRECTION[card.metric] === 'lower' ? 'Lower is better' : 'Higher is better';
                return `
                    <div class="trend-summary-card ${cls}">
                        <span>${card.label}</span>
                        <strong>${fmt(value, card.digits)}${Number.isFinite(value) ? card.unit : ''}</strong>
                        <em>${deltaText} vs prior</em>
                        <small>${direction}</small>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function displayCurrentSessionStats() {
    try {
        const currentData = JSON.parse(localStorage.getItem('currentGolfData') || '[]');

        if (!currentData.length) {
            document.getElementById('dataLoaded').style.display = 'none';
            document.getElementById('noData').classList.remove('hidden');
            return;
        }

        const singleSession = normalizeProgressSessions([{
            name: 'Current Session',
            date: new Date().toISOString(),
            data: currentData
        }])[0];

        displaySummaryStats([singleSession]);
        displayTrendSummary([singleSession]);
        createProgressCharts([singleSession]);
        displaySessionHistory([singleSession], true);
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
    createOfflineTrendChart(sessions);
    createFacePathVarianceChart(sessions);
}

function createScoreProgressChart(sessions) {
    const labels = sessions.map((_, index) => `S${index + 1}`);
    const scores = sessions.map((session) => session.metrics.score);

    createChart('scoreProgressChart', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Swing Score',
                data: scores,
                borderColor: 'rgba(15, 75, 56, 1)',
                backgroundColor: 'rgba(15, 75, 56, 0.12)',
                tension: 0.35,
                fill: true,
                pointRadius: 5
            }, {
                label: 'Trend',
                data: calculateTrendline(scores),
                borderColor: 'rgba(39, 183, 118, 1)',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }]
        },
        options: baseChartOptions({
            plugins: {
                legend: { labels: { color: chartTheme().legend } },
                title: {
                    display: true,
                    text: `${scores.filter(Number.isFinite).length} sessions tracked`,
                    color: chartTheme().axis,
                    font: { size: 12 }
                }
            },
            scales: {
                y: { title: { display: true, text: 'Score (0-100)' }, min: 0, max: 100 },
                x: {}
            }
        })
    });
}

function createDistanceTrendsChart(sessions) {
    const labels = sessions.map((_, index) => `S${index + 1}`);
    const avgDistances = sessions.map((session) => session.metrics.avgCarry);
    const bestDistances = sessions.map((session) => session.metrics.bestShot);

    createChart('distanceTrendsChart', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Avg Carry',
                data: avgDistances,
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                tension: 0.35,
                fill: true,
                pointRadius: 5
            }, {
                label: 'Best Shot',
                data: bestDistances,
                borderColor: 'rgba(31, 164, 99, 1)',
                backgroundColor: 'rgba(31, 164, 99, 0.12)',
                tension: 0.35,
                fill: false,
                pointRadius: 5
            }]
        },
        options: baseChartOptions({
            scales: {
                y: { title: { display: true, text: 'Distance (yards)' }, min: 0 },
                x: {}
            }
        })
    });
}

function createConsistencyTrendsChart(sessions) {
    const labels = sessions.map((_, index) => `S${index + 1}`);
    const consistency = sessions.map((session) => session.metrics.consistency);

    createChart('consistencyTrendsChart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Consistency %',
                data: consistency,
                backgroundColor: consistency.map((value) =>
                    value >= 90 ? 'rgba(31, 164, 99, 0.65)' :
                    value >= 80 ? 'rgba(204, 143, 36, 0.65)' :
                    'rgba(214, 65, 65, 0.65)'
                ),
                borderColor: consistency.map((value) =>
                    value >= 90 ? 'rgba(31, 164, 99, 1)' :
                    value >= 80 ? 'rgba(204, 143, 36, 1)' :
                    'rgba(214, 65, 65, 1)'
                ),
                borderWidth: 2
            }]
        },
        options: baseChartOptions({
            plugins: { legend: { display: false } },
            scales: {
                y: { title: { display: true, text: 'Consistency %' }, min: 0, max: 100 },
                x: {}
            }
        })
    });
}

function createClubTrendsChart(sessions) {
    const clubData = {};
    sessions.forEach((session, index) => {
        if (!clubData[session.club]) clubData[session.club] = [];
        clubData[session.club].push({ session: index + 1, avgCarry: session.metrics.avgCarry });
    });

    const datasets = Object.keys(clubData).map((club, index) => ({
        label: club,
        data: sessions.map((_, sessionIndex) => {
            const match = clubData[club].find((row) => row.session === sessionIndex + 1);
            return match ? match.avgCarry : null;
        }),
        borderColor: `hsl(${(index * 67) % 360}, 68%, 43%)`,
        backgroundColor: `hsla(${(index * 67) % 360}, 68%, 43%, 0.12)`,
        tension: 0.35,
        pointRadius: 5,
        spanGaps: true
    }));

    createChart('clubTrendsChart', {
        type: 'line',
        data: {
            labels: sessions.map((_, index) => `S${index + 1}`),
            datasets
        },
        options: baseChartOptions({
            scales: {
                y: { title: { display: true, text: 'Avg Carry (yards)' }, min: 0 },
                x: {}
            }
        })
    });
}

function createOfflineTrendChart(sessions) {
    const labels = sessions.map((_, index) => `S${index + 1}`);
    const offlineAvg = sessions.map((session) => session.metrics.avgOfflineAbs);

    createChart('offlineTrendChart', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Avg |Offline|',
                data: offlineAvg,
                borderColor: 'rgba(204, 143, 36, 1)',
                backgroundColor: 'rgba(204, 143, 36, 0.16)',
                tension: 0.35,
                fill: true,
                pointRadius: 5
            }]
        },
        options: baseChartOptions({
            plugins: { legend: { display: false } },
            scales: {
                y: { title: { display: true, text: 'Avg |Offline| (yd)' }, min: 0 },
                x: {}
            }
        })
    });
}

function createFacePathVarianceChart(sessions) {
    const labels = sessions.map((_, index) => `S${index + 1}`);
    const variance = sessions.map((session) => session.metrics.facePathStd);

    createChart('facePathVarianceChart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'F2P Std Dev',
                data: variance,
                backgroundColor: variance.map((value) => Number.isFinite(value) && value <= 2
                    ? 'rgba(31, 164, 99, 0.65)'
                    : Number.isFinite(value) && value <= 3.5
                        ? 'rgba(204, 143, 36, 0.65)'
                        : 'rgba(214, 65, 65, 0.65)'),
                borderColor: variance.map((value) => Number.isFinite(value) && value <= 2
                    ? 'rgba(31, 164, 99, 1)'
                    : Number.isFinite(value) && value <= 3.5
                        ? 'rgba(204, 143, 36, 1)'
                        : 'rgba(214, 65, 65, 1)'),
                borderWidth: 2
            }]
        },
        options: baseChartOptions({
            plugins: { legend: { display: false } },
            scales: {
                y: { title: { display: true, text: 'Std Dev (deg)' }, min: 0 },
                x: {}
            }
        })
    });
}

function displaySessionHistory(sessions, currentOnly = false) {
    const container = document.getElementById('sessionHistory');
    if (!container) return;

    const html = sessions.slice().reverse().map((session) => {
        const index = sessions.findIndex((candidate) => candidate.id === session.id);
        const previous = index > 0 ? sessions[index - 1] : null;
        const date = new Date(session.date);
        const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const metrics = session.metrics;
        const carryDelta = previous ? metrics.avgCarry - previous.metrics.avgCarry : null;
        const offlineDelta = previous ? metrics.avgOfflineAbs - previous.metrics.avgOfflineAbs : null;
        const f2pDelta = previous ? metrics.facePathStd - previous.metrics.facePathStd : null;

        return `
            <article class="progress-session-card anim-visible">
                <div class="progress-session-head">
                    <div>
                        <h4>${session.name || session.club || 'Golf Session'}</h4>
                        <p>${dateStr}</p>
                    </div>
                    <span>${session.club}</span>
                </div>
                <div class="progress-session-grid">
                    <div><span>Shots</span><strong>${metrics.shots}</strong></div>
                    <div><span>Avg Carry</span><strong>${fmt(metrics.avgCarry)} yd</strong><em>${signed(carryDelta, 1, ' yd')}</em></div>
                    <div><span>Offline</span><strong>${fmt(metrics.avgOfflineAbs)} yd</strong><em>${signed(offlineDelta, 1, ' yd')}</em></div>
                    <div><span>F2P Spread</span><strong>${fmt(metrics.facePathStd)} deg</strong><em>${signed(f2pDelta, 1, ' deg')}</em></div>
                    <div><span>Consistency</span><strong>${fmt(metrics.consistency, 0)}%</strong></div>
                    <div><span>Smash</span><strong>${fmt(metrics.smash, 2)}</strong></div>
                </div>
                ${currentOnly ? '<p class="progress-save-note">Save this session to compare it against future sessions.</p>' : ''}
                <button data-session-id="${session.id}" class="secondary-button progress-load-session">Load Session</button>
            </article>
        `;
    }).join('');

    container.innerHTML = html || '<div class="progress-empty">No sessions for this filter.</div>';
    container.querySelectorAll('.progress-load-session').forEach((button) => {
        button.addEventListener('click', () => loadSessionById(button.dataset.sessionId));
    });
}

function loadSessionById(sessionId) {
    const session = allSessions.find((candidate) => String(candidate.id) === String(sessionId));
    if (session && session.data) {
        localStorage.setItem('currentGolfData', JSON.stringify(session.data));
        localStorage.setItem('golfData', JSON.stringify(session.data));
        localStorage.setItem('lastUploadTime', Date.now().toString());
        if (typeof window.setLoadedSessionId === 'function') {
            window.setLoadedSessionId(session.id);
        }
        window.location.href = '/upload';
    }
}

function calculateTrendline(data) {
    const validData = data
        .map((y, x) => ({ x, y }))
        .filter((point) => Number.isFinite(point.y));
    if (validData.length < 2) return data.map(() => null);

    const n = validData.length;
    const sumX = validData.reduce((sum, point) => sum + point.x, 0);
    const sumY = validData.reduce((sum, point) => sum + point.y, 0);
    const sumXY = validData.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumX2 = validData.reduce((sum, point) => sum + point.x * point.x, 0);
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return data.map(() => null);

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return data.map((_, x) => slope * x + intercept);
}
