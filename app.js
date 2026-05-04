let golfData = [];
// Make golfData globally accessible
window.golfData = golfData;
let charts = {};
const uploadUtils = window.UploadSessionUtils || {};

function setGolfData(nextData) {
    golfData = Array.isArray(nextData) ? nextData : [];
    window.golfData = golfData;
    return golfData;
}

window.setGolfData = setGolfData;

async function checkUserRateLimit(endpoint = 'app-action') {
    const currentUser = window.netlifyIdentity?.currentUser();
    if (!currentUser || !currentUser.email) {
        return false;
    }

    try {
        const response = await fetch('/.netlify/functions/check-rate-limit', {
            method: 'POST',
            headers: (typeof window.getInviteAuthHeaders === 'function')
                ? window.getInviteAuthHeaders({ 'Content-Type': 'application/json' })
                : { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userEmail: currentUser.email,
                endpoint
            })
        });

        if (response.status === 403 || response.status === 429) {
            return false;
        }

        if (!response.ok) {
            return true;
        }

        const data = await response.json();
        return !!data.allowed;
    } catch (error) {
        console.error('Rate limit check failed:', error);
        return true;
    }
}

function getInviteHeaders(baseHeaders = {}) {
    if (typeof window.getInviteAuthHeaders === 'function') {
        return window.getInviteAuthHeaders(baseHeaders);
    }
    return { ...baseHeaders };
}

function getCurrentUserEmail() {
    const currentUser = window.netlifyIdentity?.currentUser?.();
    return currentUser?.email ? String(currentUser.email).trim().toLowerCase() : '';
}

async function fetchWorkingDataFromCloud(userEmail = getCurrentUserEmail()) {
    if (!userEmail) {
        return { success: false, reason: 'no-user' };
    }

    const response = await fetch(`/.netlify/functions/get-working-data?email=${encodeURIComponent(userEmail)}`, {
        headers: getInviteHeaders()
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to load cloud working data');
    }

    return response.json();
}

async function upsertWorkingDataToCloud(workingData, options = {}) {
    const { queueIfOffline = true } = options;
    const userEmail = getCurrentUserEmail();
    if (!userEmail) {
        return { success: false, reason: 'no-user' };
    }

    const payload = {
        userEmail,
        workingData: Array.isArray(workingData) ? workingData : []
    };

    if (queueIfOffline && window.syncService && !window.syncService.isOnline) {
        window.syncService.addToQueue({
            type: 'upsert-working-data',
            data: payload
        });
        return { success: true, queued: true };
    }

    try {
        const response = await fetch('/.netlify/functions/upsert-working-data', {
            method: 'POST',
            headers: getInviteHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(errorText || `Cloud sync failed (${response.status})`);
            error.status = response.status;
            error.retryable = response.status >= 500 || response.status === 408 || response.status === 429;
            throw error;
        }

        const result = await response.json();
        return { success: true, queued: false, ...result };
    } catch (error) {
        if (queueIfOffline && window.syncService && error?.retryable) {
            window.syncService.addToQueue({
                type: 'upsert-working-data',
                data: payload
            });
            return { success: true, queued: true, error: error.message };
        }
        throw error;
    }
}

window.fetchWorkingDataFromCloud = fetchWorkingDataFromCloud;
window.upsertWorkingDataToCloud = upsertWorkingDataToCloud;

function hasPendingWorkingDataSync() {
    try {
        const queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
        return Array.isArray(queue) && queue.some((item) => item?.type === 'upsert-working-data');
    } catch (error) {
        return false;
    }
}

function applyWorkingData(shots, summaryText = '') {
    const nextShots = Array.isArray(shots) ? shots : [];
    golfData = nextShots;
    window.golfData = nextShots;
    localStorage.setItem('currentGolfData', JSON.stringify(nextShots));
    localStorage.setItem('golfData', JSON.stringify(nextShots));
    localStorage.setItem('lastUploadTime', Date.now().toString());

    const dataLoaded = document.getElementById('dataLoaded');
    const noData = document.getElementById('noData');
    if (dataLoaded) dataLoaded.classList.remove('hidden');
    if (noData) noData.style.display = 'none';

    const summary = document.getElementById('uploadSummary');
    if (summary && summaryText) summary.textContent = summaryText;

    if (typeof displayData === 'function') {
        displayData();
    }

    if (document.getElementById('drills') && typeof analyzeGolfData === 'function') {
        const insights = analyzeGolfData(golfData);
        void updateDrills(insights, { aiFirst: true });
    }
}

async function hydrateWorkingDataFromCloud() {
    if (hasPendingWorkingDataSync()) {
        return false;
    }

    const cloudData = await fetchWorkingDataFromCloud();
    if (cloudData?.success && cloudData?.hasData && Array.isArray(cloudData.workingData) && cloudData.workingData.length > 0) {
        applyWorkingData(cloudData.workingData, `Loaded ${cloudData.workingData.length} cloud-synced shots`);
        return true;
    }

    return false;
}

// Check if user is admin and show admin link
window.addEventListener('load', async () => {
    const user = window.netlifyIdentity?.currentUser();
    if (user && user.email === 'jamiefitzgerald001@gmail.com') {
        const adminLink = document.getElementById('admin-link');
        if (adminLink) adminLink.style.display = 'inline-block';
    }

    const summary = document.getElementById('uploadSummary');
    const pendingWorkingSync = hasPendingWorkingDataSync();

    if (!pendingWorkingSync) {
        try {
            if (await hydrateWorkingDataFromCloud()) return;
        } catch (error) {
            console.warn('Cloud working data load skipped:', error.message || error);
        }
    }

    const existingShots = loadStoredShots();
    if (summary && existingShots.length > 0) {
        const loadedMeta = typeof window.getLoadedSessionMeta === 'function'
            ? window.getLoadedSessionMeta()
            : { name: null };
        const loadedLabel = loadedMeta?.name ? `Loaded session: ${loadedMeta.name}. ` : '';
        summary.textContent = `${loadedLabel}${existingShots.length} shots loaded in working set. Upload CSV to add or start new session.`;
    }
});

window.addEventListener('auth:ready', async () => {
    try {
        await hydrateWorkingDataFromCloud();
    } catch (error) {
        console.warn('Cloud working data refresh skipped:', error.message || error);
    }
});

// CSV Upload Handler
const csvFileInput = document.getElementById('csvFile');
if (csvFileInput) {
    csvFileInput.addEventListener('change', handleFileUpload);
}

// Drag and drop
const uploadCard = document.querySelector('.upload-card');
if (uploadCard) {
    uploadCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadCard.style.borderColor = 'var(--primary)';
    });

    uploadCard.addEventListener('dragleave', () => {
        uploadCard.style.borderColor = 'var(--border)';
    });

    uploadCard.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadCard.style.borderColor = 'var(--border)';
        const droppedFiles = Array.from(e.dataTransfer.files || []).filter(file =>
            file.name.toLowerCase().endsWith('.csv')
        );
        if (droppedFiles.length > 0) {
            processFiles(droppedFiles);
        }
    });
}

function handleFileUpload(event) {
    const files = Array.from(event.target.files || []).filter(file =>
        file.name.toLowerCase().endsWith('.csv')
    );
    if (files.length > 0) {
        processFiles(files);
    }
    event.target.value = '';
}

function readCsvFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(String(e.target?.result || ''));
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsText(file);
    });
}

function parseCSVToShots(text) {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/^\uFEFF/, '').trim());
    
    console.log('CSV Headers found:', headers);
    
    // Parse shots
    const shots = [];
    for (let i = 2; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',');
        const shot = {};
        headers.forEach((header, index) => {
            shot[header] = values[index] ? values[index].trim() : '';
        });
        shots.push(shot);
    }

    return shots;
}

function loadStoredShots() {
    try {
        const stored = localStorage.getItem('currentGolfData');
        if (!stored || stored === '[]') return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function dedupeShots(shots) {
    if (typeof uploadUtils.dedupeShots === 'function') {
        return uploadUtils.dedupeShots(shots);
    }
    const seen = new Set();
    const deduped = [];
    (Array.isArray(shots) ? shots : []).forEach((shot) => {
        const key = JSON.stringify(shot || {});
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(shot);
    });
    return deduped;
}

function askUploadSessionMode(existingShotsCount = 0) {
    if (existingShotsCount <= 0) return 'replace';

    const loadedMeta = typeof window.getLoadedSessionMeta === 'function'
        ? window.getLoadedSessionMeta()
        : { id: null, name: null };
    const loadedText = loadedMeta?.name
        ? `Loaded session: "${loadedMeta.name}".\n`
        : '';

    const choice = window.prompt(
        `${loadedText}Upload mode:\n1 = Add CSV to current working session\n2 = Start NEW session (replace current working shots)\n\nEnter 1 or 2:`,
        loadedMeta?.id ? '1' : '2'
    );

    if (choice === null) return 'cancel';
    const normalized = String(choice).trim().toLowerCase();
    if (normalized === '1' || normalized === 'add' || normalized === 'append') return 'append';
    if (normalized === '2' || normalized === 'new' || normalized === 'replace') return 'replace';
    alert('Upload cancelled. Enter 1 (add) or 2 (new session).');
    return 'cancel';
}

function updateUploadSummary(fileCount, newShotsCount, totalShotsCount, dedupedCount = 0) {
    const summary = document.getElementById('uploadSummary');
    if (!summary) return;
    const dedupeText = dedupedCount > 0 ? ` • removed ${dedupedCount} duplicates` : '';
    summary.textContent = `${fileCount} file${fileCount === 1 ? '' : 's'} added • ${newShotsCount} new shots • ${totalShotsCount} total shots${dedupeText}`;
}

function getUploadedClubSummary(shots) {
    const counts = {};
    (Array.isArray(shots) ? shots : []).forEach((shot) => {
        const club = shot?.['Club Name'] || shot?.['Club Type'] || shot?.Club || shot?.club || 'Golf';
        counts[club] = (counts[club] || 0) + 1;
    });

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([club]) => club)
        .join(', ') || 'Golf';
}

function getUploadSessionName(files, shots, uploadMode) {
    const loadedMeta = typeof window.getLoadedSessionMeta === 'function'
        ? window.getLoadedSessionMeta()
        : { id: null, name: null };

    if (uploadMode === 'append' && loadedMeta?.name) {
        return loadedMeta.name;
    }

    const fileNames = (Array.isArray(files) ? files : [])
        .map((file) => String(file?.name || '').replace(/\.csv$/i, '').trim())
        .filter(Boolean);
    if (fileNames.length === 1) return fileNames[0];

    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${getUploadedClubSummary(shots)} ${date}`;
}

async function saveUploadedSessionToCloud(files, shots, uploadMode) {
    if (typeof window.saveSessions !== 'function' || !Array.isArray(shots) || shots.length === 0) {
        return { success: false, reason: 'save-unavailable' };
    }

    const loadedMeta = typeof window.getLoadedSessionMeta === 'function'
        ? window.getLoadedSessionMeta()
        : { id: null, name: null };
    const replacingLoadedSession = uploadMode === 'append' && loadedMeta?.id;

    const session = {
        id: Date.now(),
        name: getUploadSessionName(files, shots, uploadMode),
        date: new Date().toISOString(),
        timestamp: Date.now(),
        data: shots
    };

    const result = await window.saveSessions(session);
    if (result?.success) {
        const savedId = String(result?.savedSession?.id || session.id);
        if (!result.offline && replacingLoadedSession && String(loadedMeta.id) !== savedId && typeof window.deleteSessionSilently === 'function') {
            await window.deleteSessionSilently(loadedMeta.id);
        }
        if (typeof window.setLoadedSessionId === 'function') {
            window.setLoadedSessionId(savedId);
        }
        if (typeof window.updateSessionsList === 'function') {
            await window.updateSessionsList();
        }
        window.dispatchEvent(new CustomEvent('sessions:changed', {
            detail: { action: 'save', sessionId: savedId }
        }));
    }

    return result;
}

async function processFiles(files) {
    const validFiles = files.filter(file => file.name.toLowerCase().endsWith('.csv'));
    if (validFiles.length === 0) return;

    try {
        const texts = await Promise.all(validFiles.map(readCsvFile));
        const newShots = texts.flatMap(text => parseCSVToShots(text));
        const existingShots = (Array.isArray(golfData) && golfData.length > 0) ? golfData : loadStoredShots();
        const uploadMode = askUploadSessionMode(existingShots.length);
        if (uploadMode === 'cancel') return;

        const mergeResult = (typeof uploadUtils.mergeShotsForUpload === 'function')
            ? uploadUtils.mergeShotsForUpload(existingShots, newShots, uploadMode)
            : {
                mergedShots: dedupeShots([...(uploadMode === 'replace' ? [] : existingShots), ...newShots]),
                dedupedCount: 0
            };
        const mergedShots = mergeResult.mergedShots;

        golfData = mergedShots;
        window.golfData = mergedShots;

        localStorage.setItem('currentGolfData', JSON.stringify(mergedShots));
        localStorage.setItem('golfData', JSON.stringify(mergedShots));
        localStorage.setItem('lastUploadTime', Date.now().toString());

        const cloudResult = await upsertWorkingDataToCloud(mergedShots, { queueIfOffline: true });
        const sessionSaveResult = await saveUploadedSessionToCloud(validFiles, mergedShots, uploadMode);
        const dedupedCount = Number(mergeResult?.dedupedCount || 0);
        updateUploadSummary(validFiles.length, newShots.length, mergedShots.length, dedupedCount);

        if (cloudResult?.queued) {
            console.warn('Working data sync queued:', cloudResult.error || 'retry later');
        }
        if (sessionSaveResult?.offline) {
            console.warn('Uploaded session queued/local until cloud is reachable:', sessionSaveResult.error || 'retry later');
        }

        if (typeof window.updateClubSidebar === 'function') {
            window.updateClubSidebar(mergedShots);
        }
        window.dispatchEvent(new CustomEvent('golf-data-updated', { detail: { shots: mergedShots } }));

        displayData();
    } catch (error) {
        console.error('CSV upload error:', error);
        alert(error.message || 'Failed to process uploaded CSV files.');
    }
}

function displayData() {
    // Load data from localStorage if not in memory
    if (!golfData || golfData.length === 0) {
        const stored = localStorage.getItem('currentGolfData');
        if (stored && stored !== '[]') {
            golfData = JSON.parse(stored);
            window.golfData = golfData;
        }
    }
    
    // Check if we have data
    if (!golfData || golfData.length === 0) {
        console.warn('No golf data available to display');
        return;
    }
    
    const dataLoadedSection = document.getElementById('dataLoaded');
    if (dataLoadedSection) {
        dataLoadedSection.classList.remove('hidden');
        // Re-register newly visible elements with the animation observer.
        // Elements inside a display:none container aren't intersecting at init
        // time, so they never received anim-visible. Observe them now that they
        // are in the DOM and visible.
        requestAnimationFrame(() => {
            if (typeof window.reObserveAnimations === 'function') {
                window.reObserveAnimations();
            }
            // Hard fallback: if IO still hasn't fired after 400 ms, force-show
            // all sections so nothing stays invisible on slow/restricted browsers.
            setTimeout(() => {
                dataLoadedSection.querySelectorAll(
                    '.stat-card, .chart-card, .quick-link-card, .score-history-section'
                ).forEach(el => el.classList.add('anim-visible'));
            }, 400);
        });
    }

    if (typeof window.updateClubSidebar === 'function') {
        window.updateClubSidebar(golfData);
    }
    
    // Calculate stats
    const carryDistances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const totalShots = carryDistances.length;
    const avgCarry = (carryDistances.reduce((a, b) => a + b, 0) / totalShots).toFixed(1);
    const bestShot = Math.max(...carryDistances).toFixed(1);
    const stdDev = calculateStdDev(carryDistances);
    const consistency = Math.max(0, 100 - (stdDev / avgCarry * 100)).toFixed(0);
    
    // Update stats cards
    const totalShotsEl = document.getElementById('totalShots');
    const avgCarryEl = document.getElementById('avgCarry');
    const bestShotEl = document.getElementById('bestShot');
    const consistencyEl = document.getElementById('consistency');

    if (totalShotsEl) totalShotsEl.textContent = totalShots;
    if (avgCarryEl) avgCarryEl.textContent = `${avgCarry} yds`;
    if (bestShotEl) bestShotEl.textContent = `${bestShot} yds`;
    if (consistencyEl) consistencyEl.textContent = `${consistency}%`;
    
    // Create charts
    createDispersionChart();
    createDistanceChart();
    createLaunchChart();
    createSpinChart();
    createPathChart();
    createSmashChart();
    createAttackChart();
    createConsistencyChart();
    createBallSpeedChart();
    createCarryTotalChart();
    createLoftChart();
    createDirectionChart();
    createApexChart();
    createGappingChart();
    renderAllClubsFacePathModule();
    
    // Run pure JS analysis
    displayAutomaticInsights();
    
    // Calculate swing score (check if elements exist)
    if (typeof updateSwingScore === 'function') {
        updateSwingScore();
    } else {
        console.warn('updateSwingScore function not found');
    }
}

function calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
}

function createDispersionChart() {
    const canvas = document.getElementById('dispersionChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Club colors
    const clubColors = {
        'Driver': '#ef4444',
        '3 Wood': '#f97316',
        '5 Wood': '#3b82f6',
        '4 Hybrid': '#ef4444',
        '5 Hybrid': '#f97316',
        '4 Iron': '#8b5cf6',
        '5 Iron': '#f59e0b',
        '6 Iron': '#22c55e',
        '7 Iron': '#06b6d4',
        '8 Iron': '#10b981',
        '9 Iron': '#6366f1',
        'Pitching Wedge': '#ec4899',
        'Gap Wedge': '#3b82f6',
        'Sand Wedge': '#a855f7',
        'Lob Wedge': '#14b8a6'
    };
    
    const getClubName = (shot) => shot['Club Name'] || shot['Club Type'] || shot['Club'] || 'Unknown';
    
    // Group shots by club and sort by average distance (longest first)
    const clubGroups = {};
    golfData.forEach(shot => {
        const club = getClubName(shot);
        if (!clubGroups[club]) clubGroups[club] = [];
        clubGroups[club].push(shot);
    });
    
    const sortedClubs = Object.entries(clubGroups)
        .map(([club, shots]) => {
            const avgDist = shots.reduce((sum, s) => sum + (parseFloat(s['Carry Distance']) || 0), 0) / shots.length;
            return { club, shots, avgDist };
        })
        .sort((a, b) => b.avgDist - a.avgDist);
    
    const carryDistances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const deviations = golfData.map(s => parseFloat(s['Carry Deviation Distance']) || 0);
    
    const maxDist = Math.max(...carryDistances);
    const avgDist = carryDistances.reduce((a, b) => a + b, 0) / carryDistances.length;
    
    if (charts.dispersion) charts.dispersion.destroy();
    
    const greenRadius = 15;
    const greenCenterX = 0;
    const greenCenterY = avgDist;
    
    const createCircle = (centerX, centerY, radius, points = 60) => {
        const circle = [];
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * 2 * Math.PI;
            circle.push({ x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) });
        }
        return circle;
    };
    
    // Create datasets for each club
    const clubDatasets = sortedClubs.map(({ club, shots }, idx) => {
        const color = clubColors[club] || `hsl(${(idx * 47) % 360}, 70%, 50%)`;
        return {
            label: club,
            data: shots.map(s => ({
                x: parseFloat(s['Carry Deviation Distance']) || 0,
                y: parseFloat(s['Carry Distance']) || 0
            })),
            backgroundColor: color,
            borderColor: color,
            borderWidth: 2,
            pointRadius: 6,
            order: 1
        };
    });
    
    charts.dispersion = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Green',
                    data: createCircle(greenCenterX, greenCenterY, greenRadius),
                    borderColor: 'rgba(34, 139, 34, 0.8)',
                    backgroundColor: 'rgba(60, 179, 113, 0.35)',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: true,
                    type: 'line',
                    showLine: true,
                    order: 3
                },
                {
                    label: 'Hole',
                    data: [{ x: 0, y: avgDist }],
                    backgroundColor: 'black',
                    borderColor: 'gold',
                    pointRadius: 8,
                    pointStyle: 'triangle',
                    order: 0
                },
                {
                    label: 'Target Line',
                    data: [{ x: 0, y: 0 }, { x: 0, y: maxDist + 10 }],
                    borderColor: 'rgba(245, 158, 11, 0.5)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    type: 'line',
                    order: 2
                },
                ...clubDatasets
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#374151',
                        usePointStyle: true,
                        padding: 15,
                        filter: (item) => !['Green', 'Hole', 'Target Line'].includes(item.text)
                    }
                },
                title: {
                    display: true,
                    text: `Shot Dispersion by Club (${sortedClubs.length} clubs, ${golfData.length} shots)`,
                    color: '#166534',
                    font: { size: 14, weight: 'bold' }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (['Green', 'Hole', 'Target Line'].includes(ctx.dataset.label)) return '';
                            const deviation = ctx.parsed.x;
                            const distance = ctx.parsed.y;
                            const direction = deviation > 0 ? 'right' : deviation < 0 ? 'left' : 'center';
                            return [
                                `${ctx.dataset.label}`,
                                `Carry: ${distance.toFixed(1)} yds`,
                                `${Math.abs(deviation).toFixed(1)} yds ${direction}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Carry Distance (yards)', color: '#64748b' },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: '#64748b' },
                    min: 0,
                    max: maxDist + 20
                },
                x: {
                    title: { display: true, text: 'Offline (yards) - Left / Right', color: '#64748b' },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: '#64748b' }
                }
            }
        }
    });
}

function createDistanceChart() {
    const canvas = document.getElementById('distanceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const distances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    
    // 9-iron benchmarks
    const benchmarks = {
        tourPro: 143,
        scratch: 130,
        amateur: 110,
        beginner: 90
    };
    
    if (charts.distance) charts.distance.destroy();
    
    charts.distance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Tour Pro', 'Scratch', 'You', 'Amateur', 'Beginner'],
            datasets: [{
                label: 'Carry Distance (yards)',
                data: [
                    benchmarks.tourPro,
                    benchmarks.scratch,
                    avgDistance,
                    benchmarks.amateur,
                    benchmarks.beginner
                ],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.6)',
                    'rgba(59, 130, 246, 0.6)',
                    'rgba(124, 58, 237, 0.8)',
                    'rgba(245, 158, 11, 0.6)',
                    'rgba(239, 68, 68, 0.6)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(59, 130, 246, 1)',
                    'rgba(124, 58, 237, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y.toFixed(1)} yards`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
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

function createSpinChart() {
    const canvas = document.getElementById('spinChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const backspin = golfData.map(s => parseFloat(s['Backspin']) || 0);
    const avgBackspin = backspin.reduce((a, b) => a + b, 0) / backspin.length;
    
    // 9-iron spin benchmarks
    const spinBenchmarks = {
        tourPro: 7800,
        optimal: 7200,
        amateur: 6000,
        low: 5000
    };
    
    if (charts.spin) charts.spin.destroy();
    
    charts.spin = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Tour Pro', 'Optimal', 'You', 'Amateur', 'Low Spin'],
            datasets: [{
                label: 'Backspin (rpm)',
                data: [
                    spinBenchmarks.tourPro,
                    spinBenchmarks.optimal,
                    avgBackspin,
                    spinBenchmarks.amateur,
                    spinBenchmarks.low
                ],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.6)',
                    'rgba(59, 130, 246, 0.6)',
                    'rgba(124, 58, 237, 0.8)',
                    'rgba(245, 158, 11, 0.6)',
                    'rgba(239, 68, 68, 0.6)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(59, 130, 246, 1)',
                    'rgba(124, 58, 237, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
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

function createPathChart() {
    const canvas = document.getElementById('pathChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const clubPath = golfData.map(s => parseFloat(s['Club Path']) || 0);
    const faceAngle = golfData.map(s => parseFloat(s['Club Face']) || 0);
    
    if (charts.path) charts.path.destroy();
    
    // Create circular background zones
    const createCircle = (radius, points = 50) => {
        const data = [];
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * 2 * Math.PI;
            data.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
        }
        return data;
    };
    
    charts.path = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Amateur Zone',
                    data: createCircle(10),
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: true,
                    type: 'line',
                    showLine: true,
                    order: 4
                },
                {
                    label: 'Good Zone',
                    data: createCircle(5),
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: true,
                    type: 'line',
                    showLine: true,
                    order: 3
                },
                {
                    label: 'Tour Pro Zone',
                    data: createCircle(2),
                    borderColor: 'rgba(16, 185, 129, 0.6)',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    type: 'line',
                    showLine: true,
                    order: 2
                },
                {
                    label: 'Perfect (0,0)',
                    data: [{ x: 0, y: 0 }],
                    backgroundColor: 'rgba(16, 185, 129, 1)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    pointRadius: 8,
                    pointStyle: 'star',
                    order: 0
                },
                {
                    label: 'Your Shots',
                    data: clubPath.map((path, i) => ({ x: path, y: faceAngle[i] })),
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderColor: 'rgba(124, 58, 237, 1)',
                    borderWidth: 2,
                    pointRadius: 6,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    labels: { 
                        color: '#f1f5f9',
                        filter: (item) => !['Amateur Zone', 'Good Zone', 'Tour Pro Zone'].includes(item.text)
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.label === 'Your Shots') {
                                return `Path: ${ctx.parsed.x.toFixed(1)}°, Face: ${ctx.parsed.y.toFixed(1)}°`;
                            } else if (ctx.dataset.label === 'Perfect (0,0)') {
                                return 'Perfect Square Impact';
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Face Angle (deg)', color: '#94a3b8' },
                    grid: { 
                        color: 'rgba(71, 85, 105, 0.2)',
                        circular: true
                    },
                    ticks: { color: '#94a3b8' },
                    min: -15,
                    max: 15
                },
                x: {
                    title: { display: true, text: 'Club Path (deg)', color: '#94a3b8' },
                    grid: { 
                        color: 'rgba(71, 85, 105, 0.2)',
                        circular: true
                    },
                    ticks: { color: '#94a3b8' },
                    min: -15,
                    max: 15
                }
            }
        }
    });
}

function createLaunchChart() {
    const canvas = document.getElementById('launchChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const launchAngles = golfData.map(s => parseFloat(s['Launch Angle']) || 0);
    const avgLaunch = launchAngles.reduce((a, b) => a + b, 0) / launchAngles.length;
    
    // 9-iron launch benchmarks
    const launchBenchmarks = {
        tourPro: 26,
        optimal: 24,
        amateur: 20,
        low: 16
    };
    
    if (charts.launch) charts.launch.destroy();
    
    charts.launch = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Tour Pro', 'Optimal', 'You', 'Amateur', 'Too Low'],
            datasets: [{
                label: 'Launch Angle (degrees)',
                data: [
                    launchBenchmarks.tourPro,
                    launchBenchmarks.optimal,
                    avgLaunch,
                    launchBenchmarks.amateur,
                    launchBenchmarks.low
                ],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.6)',
                    'rgba(59, 130, 246, 0.6)',
                    'rgba(124, 58, 237, 0.8)',
                    'rgba(245, 158, 11, 0.6)',
                    'rgba(239, 68, 68, 0.6)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(59, 130, 246, 1)',
                    'rgba(124, 58, 237, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y.toFixed(1)}°`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
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

// API key is now stored in Netlify environment variables
// No need for manual entry or localStorage

// Get club from shot
function getShotClub(shot) {
    return shot['Club Name'] || shot['Club Type'] || shot['Club'] || 
           shot['club'] || shot['Club name'] || shot['club name'] || 
           shot['ClubName'] || 'Unknown Club';
}

// Group shots by club
function groupShotsByClub(shots) {
    const groups = {};
    shots.forEach(shot => {
        const club = getShotClub(shot);
        if (!groups[club]) groups[club] = [];
        groups[club].push(shot);
    });
    return groups;
}

// Display automatic insights (no API needed) - PER CLUB
function displayAutomaticInsights() {
    const insightsDiv = document.getElementById('insights');
    if (!insightsDiv) return; // Not on this page
    
    const clubGroups = groupShotsByClub(golfData);
    const clubs = Object.keys(clubGroups).sort();
    
    let html = '<div style="line-height: 1.6;">';
    
    // Overall summary at top
    html += renderOverallSummary(golfData, clubs.length);
    
    // Per-club analysis
    clubs.forEach(clubName => {
        const clubShots = clubGroups[clubName];
        if (clubShots.length === 0) return;
        html += renderClubAnalysis(clubName, clubShots);
    });
    
    html += '</div>';
    insightsDiv.innerHTML = html;
    
    // Add Face-to-path scatter chart and club summary table
    addFacePathChartAndSummary(golfData, clubGroups);
    
    // Update drills based on overall analysis
    const overallInsights = analyzeGolfData(golfData);
    void updateDrills(overallInsights, { aiFirst: true });
}

function renderOverallSummary(allShots, clubCount) {
    const carries = allShots.map(s => parseFloat(s['Carry Distance']) || 0);
    const avgCarry = (carries.reduce((a,b) => a+b, 0) / carries.length).toFixed(1);
    const deviations = allShots.map(s => Math.abs(parseFloat(s['Carry Deviation Distance']) || 0));
    const avgDev = (deviations.reduce((a,b) => a+b, 0) / deviations.length).toFixed(1);
    
    return `
        <div style="background: linear-gradient(to bottom right, #0f172a, #334155); padding: 32px; border-radius: 24px; margin-bottom: 32px; color: white;">
            <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.7; margin-bottom: 8px;">Session Overview</div>
            <h2 style="margin: 0 0 12px 0; font-size: 32px; font-weight: 700; letter-spacing: -0.025em;">All Clubs Analysis</h2>
            <p style="opacity: 0.9; margin: 0 0 20px 0; max-width: 700px;">Per-club breakdown below. Each club analyzed separately for accurate insights.</p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px;">
                <div><div style="opacity: 0.7; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Total Shots</div><div style="font-size: 28px; font-weight: 700; margin-top: 4px;">${allShots.length}</div></div>
                <div><div style="opacity: 0.7; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Clubs Used</div><div style="font-size: 28px; font-weight: 700; margin-top: 4px;">${clubCount}</div></div>
                <div><div style="opacity: 0.7; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Avg Carry</div><div style="font-size: 28px; font-weight: 700; margin-top: 4px;">${avgCarry}<span style="font-size: 14px; opacity: 0.7;"> yd</span></div></div>
                <div><div style="opacity: 0.7; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Avg Offline</div><div style="font-size: 28px; font-weight: 700; margin-top: 4px;">${avgDev}<span style="font-size: 14px; opacity: 0.7;"> yd</span></div></div>
            </div>
        </div>
    `;
}

function renderClubAnalysis(clubName, clubShots) {
    const insights = analyzeGolfData(clubShots);
    
    const carries = clubShots.map(s => parseFloat(s['Carry Distance']) || 0).filter(d => d > 0);
    const avgCarry = (carries.reduce((a,b) => a+b, 0) / carries.length).toFixed(1);
    const bestCarry = Math.max(...carries).toFixed(1);
    const worstCarry = Math.min(...carries).toFixed(1);
    const gap = (bestCarry - worstCarry).toFixed(1);
    
    const speeds = clubShots.map(s => parseFloat(s['Club Speed']) || 0).filter(d => d > 0);
    const avgSpeed = speeds.length ? (speeds.reduce((a,b) => a+b, 0) / speeds.length).toFixed(1) : '0';
    
    const smashes = clubShots.map(s => parseFloat(s['Smash Factor']) || 0).filter(d => d > 0);
    const avgSmash = smashes.length ? (smashes.reduce((a,b) => a+b, 0) / smashes.length).toFixed(2) : '0';
    
    const launches = clubShots.map(s => parseFloat(s['Launch Angle']) || 0);
    const avgLaunch = (launches.reduce((a,b) => a+b, 0) / launches.length).toFixed(1);
    
    const spins = clubShots.map(s => parseFloat(s['Backspin']) || 0);
    const avgSpin = (spins.reduce((a,b) => a+b, 0) / spins.length).toFixed(0);
    
    const devs = clubShots.map(s => Math.abs(parseFloat(s['Carry Deviation Distance']) || 0));
    const avgDev = (devs.reduce((a,b) => a+b, 0) / devs.length).toFixed(1);
    
    const critical = insights.warnings.filter(w => w.severity === 'high');
    const medium = insights.warnings.filter(w => w.severity === 'medium');
    
    let html = `
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h3 style="margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.025em;">${clubName}</h3>
                    <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">${clubShots.length} shots analyzed</p>
                </div>
                <div style="background: #f1f5f9; padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #475569;">
                    ${avgDev < 5 ? '✓ Accurate' : avgDev < 10 ? '⚠ Workable' : '⚠ Needs Work'}
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div style="padding: 16px; background: #f8fafc; border-radius: 12px;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Avg Carry</div>
                    <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${avgCarry} <span style="font-size: 12px; color: #64748b;">yd</span></div>
                </div>
                <div style="padding: 16px; background: #f8fafc; border-radius: 12px;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Best Carry</div>
                    <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${bestCarry} <span style="font-size: 12px; color: #64748b;">yd</span></div>
                </div>
                <div style="padding: 16px; background: #f8fafc; border-radius: 12px;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Smash</div>
                    <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${avgSmash}</div>
                </div>
                <div style="padding: 16px; background: #f8fafc; border-radius: 12px;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Launch</div>
                    <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${avgLaunch}°</div>
                </div>
                <div style="padding: 16px; background: #f8fafc; border-radius: 12px;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Spin</div>
                    <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${avgSpin} <span style="font-size: 12px; color: #64748b;">rpm</span></div>
                </div>
                <div style="padding: 16px; background: #f8fafc; border-radius: 12px;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Avg Offline</div>
                    <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${avgDev} <span style="font-size: 12px; color: #64748b;">yd</span></div>
                </div>
            </div>
    `;
    
    if (insights.strengths.length > 0) {
        html += `<div style="background: #ecfdf5; border-left: 3px solid #10b981; padding: 16px; border-radius: 12px; margin-bottom: 12px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #047857; margin-bottom: 8px;">What's Working</div>
            <ul style="margin: 0; padding-left: 20px; color: #064e3b; font-size: 14px;">${insights.strengths.map(s => `<li style="margin-bottom: 4px;">${s}</li>`).join('')}</ul>
        </div>`;
    }
    
    if (critical.length > 0) {
        html += `<div style="background: #fef2f2; border-left: 3px solid #ef4444; padding: 16px; border-radius: 12px; margin-bottom: 12px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #b91c1c; margin-bottom: 8px;">Fix First</div>
            ${critical.map(w => `<div style="font-size: 14px; color: #7f1d1d; margin-bottom: 8px;"><strong>${w.message}</strong><br><span style="color: #991b1b; font-size: 13px;">${w.detail}</span></div>`).join('')}
        </div>`;
    }
    
    if (medium.length > 0) {
        html += `<div style="background: #fffbeb; border-left: 3px solid #f59e0b; padding: 16px; border-radius: 12px; margin-bottom: 12px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #b45309; margin-bottom: 8px;">Improve</div>
            ${medium.map(w => `<div style="font-size: 14px; color: #78350f; margin-bottom: 8px;"><strong>${w.message}</strong><br><span style="color: #92400e; font-size: 13px;">${w.detail}</span></div>`).join('')}
        </div>`;
    }
    
    if (insights.recommendations.length > 0) {
        html += `<div style="background: #f1f5f9; border-left: 3px solid #0f172a; padding: 16px; border-radius: 12px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #334155; margin-bottom: 8px;">Recommended Actions</div>
            <ol style="margin: 0; padding-left: 20px; color: #1e293b; font-size: 14px;">${insights.recommendations.slice(0, 4).map(r => `<li style="margin-bottom: 4px;">${r}</li>`).join('')}</ol>
        </div>`;
    }
    
    html += '</div>';
    return html;
}

// Add Face-to-path scatter chart and detailed club summary table
function addFacePathChartAndSummary(allShots, clubGroups) {
    const insightsDiv = document.getElementById('insights');
    if (!insightsDiv) return;
    const existingPanel = document.getElementById('facePathAnalysisPanel');
    if (existingPanel) existingPanel.remove();

    const chartId = 'facePathScatterChart';
    const legendId = 'facePathScatterLegend';
    const chartHTML = `
        <div id="facePathAnalysisPanel">
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; margin-top: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">All Clubs: Face-to-path vs Offline</h3>
            <p style="margin: 4px 0 16px 0; color: #64748b; font-size: 14px;">Color coded by club. Use legend chips to toggle clubs on/off.</p>
            <div id="${legendId}" class="club-filter-legend"></div>
            <div style="height: 400px; position: relative; margin-top: 12px;"><canvas id="${chartId}"></canvas></div>
        </div>
        ${renderClubSummaryTable(clubGroups)}
        </div>
    `;

    insightsDiv.insertAdjacentHTML('beforeend', chartHTML);
    setTimeout(() => renderAllClubsFacePathChart(chartId, legendId, allShots), 100);
}

const CLUB_COLORS = {
    'Gap Wedge': '#8b5cf6', 'Pitching Wedge': '#a78bfa', 'Sand Wedge': '#7c3aed',
    'Lob Wedge': '#6d28d9', '9 Iron': '#06b6d4', '8 Iron': '#22c55e',
    '7 Iron': '#10b981', '6 Iron': '#059669', '5 Iron': '#f59e0b',
    '4 Iron': '#d97706', '3 Iron': '#b45309', '4 Hybrid': '#ef4444',
    '3 Hybrid': '#dc2626', '5 Hybrid': '#f87171', '5 Wood': '#3b82f6',
    '3 Wood': '#2563eb', '7 Wood': '#1d4ed8', 'Driver': '#1e40af'
};

function getClubColor(club) {
    return CLUB_COLORS[club] || '#64748b';
}

function readNumericField(row, fields) {
    for (const field of fields) {
        const value = parseFloat(row?.[field]);
        if (Number.isFinite(value)) return value;
    }
    return NaN;
}

function getFacePathOfflinePoint(row) {
    const face = readNumericField(row, ['Club Face', 'ClubFace', 'Club Face Angle']);
    const path = readNumericField(row, ['Club Path', 'ClubPath']);
    const directF2P = readNumericField(row, ['Face to Path', 'Face-to-Path', 'Face To Path', 'Face Path']);
    const offline = readNumericField(row, ['Carry Deviation Distance', 'Total Deviation Distance']);
    const f2p = Number.isFinite(face) && Number.isFinite(path) ? face - path : directF2P;

    if (!Number.isFinite(f2p) || !Number.isFinite(offline)) return null;
    return { x: f2p, y: offline };
}

function getFacePathVisibilityState() {
    try {
        const saved = localStorage.getItem('facePathClubVisibility');
        if (!saved) return {};
        const parsed = JSON.parse(saved);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
}

function saveFacePathVisibilityState(state) {
    localStorage.setItem('facePathClubVisibility', JSON.stringify(state));
}

function renderAllClubsFacePathChart(canvasId, legendId, allShots) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const clubGroups = groupShotsByClub(allShots || []);
    const visibilityState = getFacePathVisibilityState();

    const allClubDatasets = Object.keys(clubGroups)
        .sort()
        .map(club => ({
            club,
            points: clubGroups[club].map(s => {
                return getFacePathOfflinePoint(s);
            }).filter(Boolean)
        }))
        .filter(item => item.points.length > 0);

    const visibleDatasets = allClubDatasets
        .filter(item => visibilityState[item.club] !== false)
        .map(item => ({
            label: item.club,
            data: item.points,
            backgroundColor: getClubColor(item.club),
            borderColor: getClubColor(item.club),
            pointRadius: 5,
            pointHoverRadius: 7
        }));

    if (charts[canvasId]) charts[canvasId].destroy();

    charts[canvasId] = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: visibleDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: F2P ${ctx.parsed.x.toFixed(1)}°, Offline ${ctx.parsed.y.toFixed(1)} yd`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Face-to-Path (°)', color: '#64748b' },
                    grid: { color: '#e2e8f0' },
                    ticks: { color: '#64748b' }
                },
                y: {
                    title: { display: true, text: 'Offline (yd)', color: '#64748b' },
                    grid: { color: '#e2e8f0' },
                    ticks: { color: '#64748b' }
                }
            }
        }
    });

    const legend = document.getElementById(legendId);
    if (legend) {
        const chips = allClubDatasets.map(item => {
            const enabled = visibilityState[item.club] !== false;
            return `<button type="button" class="club-filter-chip ${enabled ? 'is-on' : 'is-off'}" data-club="${item.club}">
                <span class="club-dot" style="background:${getClubColor(item.club)}"></span>
                <span>${item.club}</span>
                <strong>${item.points.length}</strong>
            </button>`;
        }).join('');

        legend.innerHTML = chips || '<div class="club-filter-empty">No club/path/face data available.</div>';

        legend.querySelectorAll('.club-filter-chip').forEach((button) => {
            button.addEventListener('click', () => {
                const club = button.dataset.club;
                if (!club) return;
                const nextState = getFacePathVisibilityState();
                nextState[club] = !(nextState[club] !== false);
                saveFacePathVisibilityState(nextState);
                renderAllClubsFacePathChart(canvasId, legendId, allShots);
            });
        });
    }
}

function renderAllClubsFacePathModule(canvasId = 'allClubsFacePathChart', legendId = 'allClubsFacePathLegend', shots = golfData) {
    if (!Array.isArray(shots) || shots.length === 0) return;
    renderAllClubsFacePathChart(canvasId, legendId, shots);
}

window.renderAllClubsFacePathModule = renderAllClubsFacePathModule;

function renderClubSummaryTable(clubGroups) {
    const rows = Object.keys(clubGroups).map(club => {
        const shots = clubGroups[club];
        const carries = shots.map(s => parseFloat(s['Carry Distance']) || 0).filter(d => d > 0);
        const smashes = shots.map(s => parseFloat(s['Smash Factor']) || 0).filter(d => d > 0);
        // "Clean" = smash factor > 1.1 and carry > 50% of avg
        const avgCarryAll = carries.reduce((a,b) => a+b, 0) / Math.max(carries.length, 1);
        const cleanShots = shots.filter(s => {
            const c = parseFloat(s['Carry Distance']) || 0;
            const sm = parseFloat(s['Smash Factor']) || 0;
            return sm >= 1.1 && c >= avgCarryAll * 0.5;
        });
        const cleanCarries = cleanShots.map(s => parseFloat(s['Carry Distance']) || 0);
        const cleanSmashes = cleanShots.map(s => parseFloat(s['Smash Factor']) || 0);
        const cleanPaths = cleanShots.map(s => parseFloat(s['Club Path']) || 0);
        const cleanFaces = cleanShots.map(s => parseFloat(s['Club Face']) || 0);
        const cleanSpins = cleanShots.map(s => parseFloat(s['Backspin']) || 0);
        const cleanOffline = cleanShots.map(s => Math.abs(parseFloat(s['Carry Deviation Distance']) || 0));
        
        const avg = (arr) => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
        const median = (arr) => {
            if (!arr.length) return 0;
            const sorted = [...arr].sort((a,b) => a-b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
        };
        
        const avgCarry = avg(cleanCarries);
        const bestCarry = cleanCarries.length ? Math.max(...cleanCarries) : 0;
        const avgSmash = avg(cleanSmashes);
        const avgPath = avg(cleanPaths);
        const avgFace = avg(cleanFaces);
        const ftp = avgFace - avgPath;
        const avgSpin = avg(cleanSpins);
        const medOffline = median(cleanOffline);
        
        return { club, shots: shots.length, clean: cleanShots.length, avgCarry, bestCarry, avgSmash, avgPath, avgFace, ftp, avgSpin, medOffline };
    });
    
    const fmt = (n, d=1) => isNaN(n) || n === null ? '—' : Number(n).toFixed(d);
    const signed = (n) => isNaN(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(1);
    
    let html = `
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; margin-top: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">Club Summary</h3>
            <p style="margin: 4px 0 20px 0; color: #64748b; font-size: 14px;">Clean swings only for averages. Smash 1.10+ and carry within 50% of avg.</p>
            <div style="overflow-x: auto;">
                <table style="width: 100%; min-width: 900px; border-collapse: collapse; font-size: 14px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">
                            <th style="padding: 12px 8px;">Club</th>
                            <th style="padding: 12px 8px; text-align: right;">Shots</th>
                            <th style="padding: 12px 8px; text-align: right;">Clean</th>
                            <th style="padding: 12px 8px; text-align: right;">Avg Carry</th>
                            <th style="padding: 12px 8px; text-align: right;">Best Carry</th>
                            <th style="padding: 12px 8px; text-align: right;">Smash</th>
                            <th style="padding: 12px 8px; text-align: right;">Path</th>
                            <th style="padding: 12px 8px; text-align: right;">Face</th>
                            <th style="padding: 12px 8px; text-align: right;">F2P</th>
                            <th style="padding: 12px 8px; text-align: right;">Spin</th>
                            <th style="padding: 12px 8px; text-align: right;">Med Offline</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    rows.forEach(r => {
        html += `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                <td style="padding: 14px 8px; font-weight: 600; color: #0f172a;"><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${getClubColor(r.club)}; margin-right: 8px; vertical-align: middle;"></span>${r.club}</td>
                <td style="padding: 14px 8px; text-align: right; color: #475569;">${r.shots}</td>
                <td style="padding: 14px 8px; text-align: right; color: #475569;">${r.clean}</td>
                <td style="padding: 14px 8px; text-align: right; color: #0f172a;">${fmt(r.avgCarry)} yd</td>
                <td style="padding: 14px 8px; text-align: right; color: #0f172a;">${fmt(r.bestCarry)} yd</td>
                <td style="padding: 14px 8px; text-align: right; color: #0f172a;">${fmt(r.avgSmash, 2)}</td>
                <td style="padding: 14px 8px; text-align: right; color: #475569;">${signed(r.avgPath)}°</td>
                <td style="padding: 14px 8px; text-align: right; color: #475569;">${signed(r.avgFace)}°</td>
                <td style="padding: 14px 8px; text-align: right; font-weight: 700; color: #0f172a;">${signed(r.ftp)}°</td>
                <td style="padding: 14px 8px; text-align: right; color: #475569;">${fmt(r.avgSpin, 0)}</td>
                <td style="padding: 14px 8px; text-align: right; color: #0f172a;">${fmt(r.medOffline)} yd</td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div></div>';
    return html;
}

function average(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
    if (!Array.isArray(values) || values.length < 2) return 0;
    const avg = average(values);
    const variance = average(values.map(v => (v - avg) ** 2));
    return Math.sqrt(variance);
}

function summarizeShots(shots = []) {
    const offlineAbs = shots
        .map(s => Math.abs(parseFloat(s['Carry Deviation Distance'])))
        .filter(Number.isFinite);
    const faceToPath = shots
        .map(s => parseFloat(s['Club Face']) - parseFloat(s['Club Path']))
        .filter(Number.isFinite);
    const smash = shots
        .map(s => parseFloat(s['Smash Factor']))
        .filter(Number.isFinite);
    const launch = shots
        .map(s => parseFloat(s['Launch Angle']))
        .filter(Number.isFinite);

    return {
        avgOfflineAbs: average(offlineAbs),
        faceToPathStd: standardDeviation(faceToPath),
        avgSmash: average(smash),
        avgLaunch: average(launch)
    };
}

function percentageChange(previous, latest) {
    if (!Number.isFinite(previous) || !Number.isFinite(latest) || previous === 0) return null;
    return ((latest - previous) / Math.abs(previous)) * 100;
}

function getTrendStatus(changePct, betterWhen = 'lower', threshold = 4) {
    if (!Number.isFinite(changePct)) return 'flat';
    const signed = betterWhen === 'lower' ? -changePct : changePct;
    if (signed >= threshold) return 'improving';
    if (signed <= -threshold) return 'regressing';
    return 'flat';
}

function formatTrendText(label, changePct, status) {
    if (!Number.isFinite(changePct)) return `${label}: not enough trend data yet.`;
    const direction = changePct > 0 ? 'up' : 'down';
    return `${label}: ${Math.abs(changePct).toFixed(1)}% ${direction} (${status}).`;
}

async function loadRecentSessionsForTraining() {
    if (typeof loadSessions === 'function') {
        try {
            const sessions = await loadSessions();
            if (Array.isArray(sessions)) return sessions;
        } catch (error) {
            console.warn('Session load for training trend failed:', error);
        }
    }

    try {
        const local = JSON.parse(localStorage.getItem('savedSessions') || '[]');
        return Array.isArray(local) ? local : [];
    } catch (error) {
        return [];
    }
}

async function buildTrainingTrendContext() {
    const sessions = await loadRecentSessionsForTraining();
    const valid = sessions.filter(s => Array.isArray(s?.data) && s.data.length > 0);
    const latest = valid.slice(0, 3);
    const previous = valid.slice(3, 6);

    const latestMetrics = summarizeShots(latest.flatMap(s => s.data || []));
    const previousMetrics = summarizeShots(previous.flatMap(s => s.data || []));

    const metrics = {
        offline: {
            changePct: percentageChange(previousMetrics.avgOfflineAbs, latestMetrics.avgOfflineAbs),
            status: getTrendStatus(percentageChange(previousMetrics.avgOfflineAbs, latestMetrics.avgOfflineAbs), 'lower'),
            text: ''
        },
        facePathVariance: {
            changePct: percentageChange(previousMetrics.faceToPathStd, latestMetrics.faceToPathStd),
            status: getTrendStatus(percentageChange(previousMetrics.faceToPathStd, latestMetrics.faceToPathStd), 'lower'),
            text: ''
        },
        smash: {
            changePct: percentageChange(previousMetrics.avgSmash, latestMetrics.avgSmash),
            status: getTrendStatus(percentageChange(previousMetrics.avgSmash, latestMetrics.avgSmash), 'higher'),
            text: ''
        },
        launch: {
            changePct: percentageChange(previousMetrics.avgLaunch, latestMetrics.avgLaunch),
            status: 'flat',
            text: ''
        }
    };

    const launchChange = metrics.launch.changePct;
    if (Number.isFinite(launchChange)) {
        if (Math.abs(launchChange) <= 4) {
            metrics.launch.status = 'flat';
        } else if (launchChange > 0) {
            metrics.launch.status = 'rising';
        } else {
            metrics.launch.status = 'falling';
        }
    }

    metrics.offline.text = formatTrendText('Offline miss', metrics.offline.changePct, metrics.offline.status);
    metrics.facePathVariance.text = formatTrendText('Face/path variance', metrics.facePathVariance.changePct, metrics.facePathVariance.status);
    metrics.smash.text = formatTrendText('Smash factor', metrics.smash.changePct, metrics.smash.status);
    metrics.launch.text = formatTrendText('Launch angle', metrics.launch.changePct, metrics.launch.status);

    return {
        sessionsAnalyzed: valid.length,
        latestMetrics,
        previousMetrics,
        metrics
    };
}

const TRAINING_PLAYBOOK = {
    'slice': {
        title: 'Path + Face Neutralization',
        rootCause: 'Face is staying open to path through impact with path trending left.',
        drillSteps: [
            'Set one alignment stick outside ball line to block over-the-top path.',
            'Hit 8 half-swings focusing on square face at lead-arm parallel.',
            'Hit 8 full swings and confirm face-to-path stays near neutral.'
        ],
        repsSets: '3 rounds of 8+8 swings',
        targetMetric: 'Face-to-path between -1.0° and +1.0° with average offline miss < 8 yd',
        retestRule: 'Retest after 24 swings and compare to prior session.',
        priority: 10,
        club: 'Driver / Woods'
    },
    'hook': {
        title: 'Face Stability Control',
        rootCause: 'Face closing too quickly relative to club path.',
        drillSteps: [
            'Use 4/10 grip pressure and rehearse hold-off finish.',
            'Hit 10 punch shots with chest facing target at impact.',
            'Move to normal swing speed while preserving face feel.'
        ],
        repsSets: '2 sets of 10 punch + 10 full',
        targetMetric: 'Club face average within ±1.5° of target',
        retestRule: 'If face closes beyond -2°, restart with punch set.',
        priority: 9,
        club: 'Irons / Hybrids'
    },
    'path-face': {
        title: 'Face-to-Path Match Drill',
        rootCause: 'Face and path are not synchronized at impact.',
        drillSteps: [
            'Build a gate 18\" in front of ball for path control.',
            'Hit 12 balls with identical setup and tempo.',
            'Record face/path after each block and adjust setup only once per block.'
        ],
        repsSets: '3 sets of 12 balls',
        targetMetric: 'Absolute face-to-path average under 2.0°',
        retestRule: 'Recheck after each set; stop once 2 consecutive sets pass.',
        priority: 9,
        club: 'All clubs'
    },
    'path-out-to-in': {
        title: 'Shallow Transition Pattern',
        rootCause: 'Transition steepens and path cuts left.',
        drillSteps: [
            'Place stick angled behind ball on inside track.',
            'Make 10 pump rehearsals to feel shallowing.',
            'Hit 10 full swings without contacting stick.'
        ],
        repsSets: '3 rounds of 10 rehearsals + 10 swings',
        targetMetric: 'Club path between -2.0° and +1.0°',
        retestRule: 'Re-measure path after each round.',
        priority: 9,
        club: 'Mid irons / woods'
    },
    'path-in-to-out': {
        title: 'Neutral Path Centering',
        rootCause: 'Path is excessively in-to-out, creating over-draw risk.',
        drillSteps: [
            'Set two alignment rods to create neutral swing corridor.',
            'Hit 12 balls keeping path centered in corridor.',
            'Add target start-line constraint with intermediate target.'
        ],
        repsSets: '2 sets of 12 balls',
        targetMetric: 'Club path between 0.0° and +2.0°',
        retestRule: 'If path > +3°, reduce release and repeat.',
        priority: 7,
        club: 'Driver / long clubs'
    },
    'launch-low': {
        title: 'Launch Window Raise',
        rootCause: 'Ball position and attack pattern are suppressing launch.',
        drillSteps: [
            'Move ball 1 ball forward and raise tee height slightly.',
            'Hit 10 shots focusing on hitting up through impact.',
            'Keep chest tilt away from target through strike.'
        ],
        repsSets: '3 sets of 10 shots',
        targetMetric: 'Average launch angle increase by 2.0°+',
        retestRule: 'Re-check launch after each set.',
        priority: 8,
        club: 'Driver / fairway woods'
    },
    'launch-high': {
        title: 'Launch Compression Control',
        rootCause: 'Dynamic loft too high at impact.',
        drillSteps: [
            'Move ball half-ball back in stance.',
            'Hit 12 shots with forward shaft lean feel.',
            'Check divot starts after ball on turf shots.'
        ],
        repsSets: '2 sets of 12 shots',
        targetMetric: 'Launch angle reduced toward target window',
        retestRule: 'If launch stays high, reduce wrist extension through impact.',
        priority: 7,
        club: 'Irons'
    },
    'attack-steep': {
        title: 'Steepness Reduction',
        rootCause: 'Downswing plane is steep, creating strike inconsistency.',
        drillSteps: [
            'Perform 8 pump-drill reps from top to slot position.',
            'Hit 8 balls with same shallow feeling.',
            'Review attack angle after each 8-ball block.'
        ],
        repsSets: '3 rounds of 8+8',
        targetMetric: 'Attack angle closer to neutral by 1.5°',
        retestRule: 'Repeat until two rounds show improvement.',
        priority: 8,
        club: 'All clubs'
    },
    'attack-shallow': {
        title: 'Compression Increase',
        rootCause: 'Attack angle too shallow for current club intent.',
        drillSteps: [
            'Place tee 2\" ahead of ball as strike-through checkpoint.',
            'Hit 12 swings clipping both ball then forward tee.',
            'Keep pressure moving lead side through impact.'
        ],
        repsSets: '2 sets of 12 swings',
        targetMetric: 'Attack angle moves more negative by ~1.0°',
        retestRule: 'Re-measure after each 12-ball block.',
        priority: 7,
        club: 'Irons / wedges'
    },
    'smash-low': {
        title: 'Center Contact Protocol',
        rootCause: 'Strike quality off-center reducing energy transfer.',
        drillSteps: [
            'Apply impact spray/tape and map 10 strikes.',
            'Adjust setup distance and posture to center pattern.',
            'Hit 2 blocks of 10 swings and re-check strike map.'
        ],
        repsSets: '3 blocks of 10 swings',
        targetMetric: 'Smash factor +0.05 improvement with centered strike cluster',
        retestRule: 'Re-test every 10 shots; adjust setup only between blocks.',
        priority: 10,
        club: 'All clubs'
    },
    'consistency-low': {
        title: 'Tempo Repeatability Build',
        rootCause: 'Tempo variance is creating pattern instability.',
        drillSteps: [
            'Use 1-2-3 tempo cadence (backswing-transition-impact).',
            'Hit 15 swings at 70% speed.',
            'Hit 15 swings at full speed with same cadence.'
        ],
        repsSets: '2 cycles of 30 swings',
        targetMetric: 'Offline standard deviation drops by 10%+',
        retestRule: 'Compare spread after each cycle.',
        priority: 9,
        club: 'Primary gamer club first'
    },
    'accuracy-poor': {
        title: 'Start-Line Accuracy Station',
        rootCause: 'Setup alignment and start-line control are inconsistent.',
        drillSteps: [
            'Set body-line stick parallel left of target.',
            'Add 2-yard start-line gate 10 yards ahead.',
            'Hit 20 shots through gate before changing target.'
        ],
        repsSets: '2 sets of 20 shots',
        targetMetric: 'Average offline miss reduced under 8 yd',
        retestRule: 'Re-test every 20 shots and log pass rate.',
        priority: 8,
        club: 'All clubs'
    },
    'path-inconsistent': {
        title: 'Path Variance Reduction',
        rootCause: 'Swing direction varies shot-to-shot.',
        drillSteps: [
            'Film down-the-line for baseline swings.',
            'Run gate drill and record path for 15 shots.',
            'Repeat only if variance remains high.'
        ],
        repsSets: '3 sets of 15 measured swings',
        targetMetric: 'Path standard deviation under 2.0°',
        retestRule: 'Advance only after two passing sets.',
        priority: 8,
        club: 'Club with highest miss rate'
    },
    'face-inconsistent': {
        title: 'Face Dispersion Control',
        rootCause: 'Face orientation at impact varies too much.',
        drillSteps: [
            'Mark grip checkpoints and re-check before each swing.',
            'Hit 12 controlled shots keeping same release feel.',
            'Increase speed only after face control stabilizes.'
        ],
        repsSets: '3 sets of 12 swings',
        targetMetric: 'Face angle standard deviation under 2.0°',
        retestRule: 'If variance spikes, reset to 60% speed.',
        priority: 9,
        club: 'All clubs'
    },
    'efficiency-low': {
        title: 'Speed-to-Distance Efficiency',
        rootCause: 'Ball speed conversion from club speed is inefficient.',
        drillSteps: [
            'Pair center contact drill with launch check.',
            'Hit 10 shots prioritizing strike, not speed.',
            'Then hit 10 at normal tempo and compare smash.'
        ],
        repsSets: '3 rounds of 10+10 shots',
        targetMetric: 'Smash trend rising with no launch loss',
        retestRule: 'Re-check smash and launch after each round.',
        priority: 7,
        club: 'Primary distance club'
    }
};

function getTrendMetricForWarning(type) {
    const map = {
        'slice': 'offline',
        'hook': 'offline',
        'path-face': 'facePathVariance',
        'path-out-to-in': 'facePathVariance',
        'path-in-to-out': 'facePathVariance',
        'path-inconsistent': 'facePathVariance',
        'face-inconsistent': 'facePathVariance',
        'accuracy-poor': 'offline',
        'smash-low': 'smash',
        'efficiency-low': 'smash',
        'launch-low': 'launch',
        'launch-high': 'launch',
        'attack-steep': 'offline',
        'attack-shallow': 'offline'
    };
    return map[type] || 'offline';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function buildTrainingAiSummary(recommendations, trendContext) {
    const currentUser = window.netlifyIdentity?.currentUser?.();
    if (!currentUser?.email) return '';

    const allowed = await checkUserRateLimit('gemini-proxy');
    if (!allowed) return '';

    const compactPlan = recommendations.slice(0, 4).map((rec, index) => (
        `${index + 1}. ${rec.title}\nIssue: ${rec.issue}\nTarget: ${rec.targetMetric}\nRetest: ${rec.retestRule}`
    )).join('\n\n');

    const prompt = `You are a golf coach.\nCreate a concise training focus summary in 4 bullet points.\n\nTrend context:\n- Offline: ${trendContext.metrics.offline.text}\n- Face/path variance: ${trendContext.metrics.facePathVariance.text}\n- Smash: ${trendContext.metrics.smash.text}\n- Launch: ${trendContext.metrics.launch.text}\n\nRecommendations:\n${compactPlan}\n\nRequirements:\n- Keep under 120 words.\n- Include one \"today focus\" bullet.\n- Include one \"stop doing\" bullet.\n- Use plain text bullets only.`;
    const response = await fetch('/.netlify/functions/gemini-proxy', {
        method: 'POST',
        headers: getInviteHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            userEmail: currentUser.email,
            contents: [{
                parts: [{ text: prompt }]
            }]
        })
    });

    if (!response.ok) return '';
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return '';
    return `<div class="training-ai-summary">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
}

async function updateDrills(insights, options = {}) {
    const drillsRoot = document.getElementById('drills');
    if (!drillsRoot) return;
    const drillsContent = drillsRoot.classList.contains('drills-content')
        ? drillsRoot
        : drillsRoot.querySelector('.drills-content') || drillsRoot;

    drillsContent.innerHTML = '<div class=\"loading\">Building personalized training plan...</div>';

    const trendContext = await buildTrainingTrendContext();
    const recommendations = [];

    (insights?.warnings || []).forEach((warning) => {
        const template = TRAINING_PLAYBOOK[warning.type];
        if (!template) return;

        const metricKey = getTrendMetricForWarning(warning.type);
        const metricTrend = trendContext.metrics[metricKey];
        const severityBoost = warning.severity === 'high' ? 3 : warning.severity === 'medium' ? 1 : 0;

        recommendations.push({
            issue: warning.message,
            rootCause: template.rootCause,
            drillSteps: template.drillSteps,
            repsSets: template.repsSets,
            targetMetric: template.targetMetric,
            retestRule: template.retestRule,
            priority: template.priority + severityBoost,
            club: template.club,
            title: template.title,
            trendStatus: metricTrend?.status || 'flat',
            trendText: metricTrend?.text || 'Trend unavailable.'
        });
    });

    if (recommendations.length === 0) {
        recommendations.push({
            issue: 'No major warning patterns detected',
            rootCause: 'Baseline quality is stable. Focus on consolidation and repeatability.',
            drillSteps: [
                'Run a 30-shot baseline session with your top 2 clubs.',
                'Keep same pre-shot routine on every swing.',
                'Track one metric only (offline or smash) for consistency.'
            ],
            repsSets: '2 rounds of 15 measured swings',
            targetMetric: 'Maintain or improve consistency by 5%',
            retestRule: 'Re-test in next saved session and compare spread.',
            priority: 6,
            club: 'All clubs',
            title: 'Performance Consolidation',
            trendStatus: trendContext.metrics.offline.status,
            trendText: trendContext.metrics.offline.text
        });
    }

    recommendations.sort((a, b) => b.priority - a.priority);
    const drillsToShow = recommendations.slice(0, 6);

    let aiSummaryHtml = '';
    const aiFirst = options.aiFirst !== false;
    if (aiFirst) {
        try {
            aiSummaryHtml = await buildTrainingAiSummary(drillsToShow, trendContext);
        } catch (error) {
            console.warn('Training AI summary skipped:', error.message || error);
        }
    }

    const trendPills = `
        <div class=\"training-trend-strip\">
            <span class=\"trend-pill ${trendContext.metrics.offline.status}\">Offline: ${trendContext.metrics.offline.status}</span>
            <span class=\"trend-pill ${trendContext.metrics.facePathVariance.status}\">Face/Path: ${trendContext.metrics.facePathVariance.status}</span>
            <span class=\"trend-pill ${trendContext.metrics.smash.status}\">Smash: ${trendContext.metrics.smash.status}</span>
            <span class=\"trend-pill ${trendContext.metrics.launch.status}\">Launch: ${trendContext.metrics.launch.status}</span>
        </div>
    `;

    let html = `
        <div class=\"training-summary-card\">
            <h4 style=\"margin:0 0 8px 0;\">Session Trend Snapshot</h4>
            <p style=\"margin:0 0 8px 0; color:var(--text-secondary); font-size:14px;\">Based on ${trendContext.sessionsAnalyzed} saved sessions (latest vs previous window).</p>
            ${trendPills}
            ${aiSummaryHtml || '<p style=\"margin-top:10px; color:var(--text-secondary); font-size:14px;\">AI coach summary unavailable. Using deterministic training plan.</p>'}
        </div>
    `;

    drillsToShow.forEach((drill, index) => {
        const priorityColor = drill.priority >= 12 ? 'var(--danger)' :
            drill.priority >= 9 ? 'var(--warning)' :
                'var(--primary)';
        const drillId = `drill-${index}`;

        html += `<div class=\"drill-card expandable-drill\" style=\"border-left-color:${priorityColor}; cursor:pointer;\" onclick=\"toggleDrill('${drillId}')\">
            <div style=\"display:flex; justify-content:space-between; align-items:start; gap:10px; margin-bottom:8px;\">
                <div>
                    <h4 style=\"margin:0;\">${index + 1}. ${drill.title}</h4>
                    <div style=\"font-size:12px; color:var(--text-secondary); margin-top:4px;\">Club Focus: ${drill.club}</div>
                </div>
                <div style=\"display:flex; gap:8px; align-items:center;\">
                    <span style=\"font-size:11px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;\">${drill.priority >= 12 ? 'Critical' : drill.priority >= 9 ? 'High Priority' : 'Recommended'}</span>
                    <span class=\"drill-toggle\" id=\"${drillId}-toggle\" style=\"font-size:18px; transition:transform 0.3s;\">▼</span>
                </div>
            </div>
            <div style=\"font-size:13px; color:var(--text-secondary); margin-bottom:10px;\"><strong>Issue:</strong> ${drill.issue}</div>
            <div style=\"font-size:13px; color:var(--text-secondary); margin-bottom:12px;\"><strong>Trend:</strong> ${drill.trendText}</div>
            <div id=\"${drillId}-content\" class=\"drill-content\" style=\"max-height:0; overflow:hidden; transition:max-height 0.3s ease-out;\">
                <div style=\"font-size:14px; margin-bottom:10px;\"><strong>Root Cause:</strong> ${drill.rootCause}</div>
                <div style=\"font-size:14px; margin-bottom:6px;\"><strong>What To Do Today</strong></div>
                <ol style=\"margin:0 0 12px 20px; color:var(--text-secondary); font-size:14px;\">
                    ${drill.drillSteps.map(step => `<li style=\"margin-bottom:4px;\">${step}</li>`).join('')}
                </ol>
                <div style=\"font-size:13px; color:var(--text-secondary); margin-bottom:6px;\"><strong>Reps/Sets:</strong> ${drill.repsSets}</div>
                <div style=\"font-size:13px; color:var(--text-secondary); margin-bottom:6px;\"><strong>How You Know It Worked:</strong> ${drill.targetMetric}</div>
                <div style=\"font-size:13px; color:var(--primary);\"><strong>Retest Rule:</strong> ${drill.retestRule}</div>
            </div>
        </div>`;
    });

    drillsContent.innerHTML = html;
}

// Toggle drill expansion
function toggleDrill(drillId) {
    const content = document.getElementById(`${drillId}-content`);
    const toggle = document.getElementById(`${drillId}-toggle`);
    if (!content || !toggle) return;
    
    if (content.style.maxHeight && content.style.maxHeight !== '0px') {
        content.style.maxHeight = '0px';
        toggle.style.transform = 'rotate(0deg)';
    } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        toggle.style.transform = 'rotate(180deg)';
    }
}

// Generate insights with Gemini (optional)
const generateInsightsBtn = document.getElementById('generateInsights');
if (generateInsightsBtn) {
generateInsightsBtn.addEventListener('click', async () => {
    const currentUser = window.netlifyIdentity?.currentUser();
    if (!currentUser || !currentUser.email) {
        alert('Sign in required for AI analysis.');
        return;
    }

    const allowed = await checkUserRateLimit('gemini-proxy');
    if (!allowed) {
        alert('Rate limit reached (or access revoked).');
        return;
    }
    
    const insightsDiv = document.getElementById('insights');
    insightsDiv.innerHTML = '<div class="loading">Analyzing your swing data with AI...</div>';
    
    try {
        const stats = calculateSwingStats();
        const prompt = `Analyze this golf swing data and provide insights:
        
Total Shots: ${stats.totalShots}
Average Carry: ${stats.avgCarry} yards
Best Shot: ${stats.bestShot} yards
Consistency: ${stats.consistency}%
Average Club Speed: ${stats.avgClubSpeed} km/h
Average Backspin: ${stats.avgBackspin} rpm
Average Launch Angle: ${stats.avgLaunch}°
Average Club Path: ${stats.avgPath}°

Provide:
1. 3 key strengths in the swing
2. 3 areas for improvement
3. Specific recommendations with target numbers
4. 2-3 personalized drill suggestions

Format as HTML with proper styling.`;

        const startTime = Date.now();
        
        const response = await fetch('/.netlify/functions/gemini-proxy', {
            method: 'POST',
            headers: (typeof window.getInviteAuthHeaders === 'function')
                ? window.getInviteAuthHeaders({ 'Content-Type': 'application/json' })
                : { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userEmail: currentUser.email,
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });
        
        const responseTime = Date.now() - startTime;
        
        const data = await response.json();
        if (response.status === 429) {
            throw new Error('Rate limit reached. Try again later.');
        }
        if (response.status === 403) {
            throw new Error('Access revoked by admin.');
        }
        
        // Track API call for admin monitoring
        if (window.trackApiCall) {
            window.trackApiCall('gemini-proxy', response.status, responseTime);
        }
        
        if (!data.candidates || !data.candidates[0]) {
            throw new Error('Invalid API response. Check your API key.');
        }
        
        const insight = data.candidates[0].content.parts[0].text;
        
        insightsDiv.innerHTML = `<div style="color: var(--text); line-height: 1.8;">${insight.replace(/\n/g, '<br>')}</div>`;
        
    } catch (error) {
        // Track failed API call
        if (window.trackApiCall) {
            window.trackApiCall('gemini-api', 500, 0);
        }
        
        insightsDiv.innerHTML = `<div style="color: var(--danger);">Error generating AI insights. Using built-in analysis.</div>`;
        console.error(error);
        setTimeout(displayAutomaticInsights, 1000);
    }
});
}

function createSmashChart() {
    const canvas = document.getElementById('smashChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const smashFactors = golfData.map(s => parseFloat(s['Smash Factor']) || 0);
    
    if (charts.smash) charts.smash.destroy();
    
    // Group into bins
    const bins = [0, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40];
    const counts = new Array(bins.length - 1).fill(0);
    
    smashFactors.forEach(sf => {
        for (let i = 0; i < bins.length - 1; i++) {
            if (sf >= bins[i] && sf < bins[i + 1]) {
                counts[i]++;
                break;
            }
        }
    });
    
    charts.smash = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins.slice(0, -1).map((b, i) => `${b.toFixed(2)}-${bins[i+1].toFixed(2)}`),
            datasets: [{
                label: 'Shot Count',
                data: counts,
                backgroundColor: 'rgba(4, 120, 87, 0.6)',
                borderColor: 'rgba(4, 120, 87, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Number of Shots', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8', stepSize: 1 }
                },
                x: {
                    title: { display: true, text: 'Smash Factor Range', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createAttackChart() {
    const canvas = document.getElementById('attackChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const attackAngles = golfData.map(s => parseFloat(s['Attack Angle']) || 0);
    const distances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    
    if (charts.attack) charts.attack.destroy();
    
    charts.attack = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Your Shots',
                    data: attackAngles.map((angle, i) => ({ x: angle, y: distances[i] })),
                    backgroundColor: 'rgba(8, 145, 178, 0.7)',
                    borderColor: 'rgba(8, 145, 178, 1)',
                    pointRadius: 6
                },
                {
                    label: 'Optimal Zone (4-6°)',
                    data: [
                        { x: 4, y: 40 },
                        { x: 6, y: 40 },
                        { x: 6, y: 90 },
                        { x: 4, y: 90 },
                        { x: 4, y: 40 }
                    ],
                    borderColor: 'rgba(16, 185, 129, 0.5)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    type: 'line',
                    showLine: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Carry Distance (yards)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    title: { display: true, text: 'Attack Angle (deg)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createConsistencyChart(selectedClub = null) {
    const canvas = document.getElementById('consistencyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Group shots by club - try multiple possible column names
    const clubGroups = {};
    golfData.forEach((shot, index) => {
        const club = shot['Club Name'] || 
                    shot['Club Type'] || 
                    shot['Club'] || 
                    shot['club'] || 
                    shot['Club name'] || 
                    shot['club name'] || 
                    shot['ClubName'] ||
                    'Unknown';
        if (!clubGroups[club]) clubGroups[club] = [];
        clubGroups[club].push({
            index,
            distance: parseFloat(shot['Carry Distance']) || 0
        });
    });
    
    // Populate club filter dropdown (only on first call)
    const clubFilter = document.getElementById('club-filter');
    if (clubFilter && clubFilter.options.length === 1) { // Only "All Clubs" option
        Object.keys(clubGroups).sort().forEach(club => {
            const option = document.createElement('option');
            option.value = club;
            option.textContent = `${club} (${clubGroups[club].length} shots)`;
            clubFilter.appendChild(option);
        });
        
        // Add change event listener
        clubFilter.addEventListener('change', (e) => {
            createConsistencyChart(e.target.value || null);
        });
    }
    
    // Determine which club to display
    let mainClub, clubData, distances;
    
    if (selectedClub) {
        // Use selected club
        mainClub = selectedClub;
        clubData = clubGroups[mainClub] || [];
        distances = clubData.map(s => s.distance);
    } else {
        // Use all shots combined
        mainClub = 'All Clubs';
        clubData = golfData.map((shot, index) => ({
            index,
            distance: parseFloat(shot['Carry Distance']) || 0
        }));
        distances = clubData.map(s => s.distance);
    }
    
    const avgDistance = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
    
    if (charts.consistency) charts.consistency.destroy();
    
    // Calculate rolling average (5-shot window)
    const rollingAvg = [];
    for (let i = 0; i < distances.length; i++) {
        const start = Math.max(0, i - 2);
        const end = Math.min(distances.length, i + 3);
        const window = distances.slice(start, end);
        rollingAvg.push(window.reduce((a, b) => a + b, 0) / window.length);
    }
    
    charts.consistency = new Chart(ctx, {
        type: 'line',
        data: {
            labels: distances.map((_, i) => `${i + 1}`),
            datasets: [
                {
                    label: 'Shot Distance',
                    data: distances,
                    borderColor: 'rgba(124, 58, 237, 0.6)',
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    tension: 0
                },
                {
                    label: '5-Shot Average',
                    data: rollingAvg,
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 3,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: 'Session Average',
                    data: new Array(distances.length).fill(avgDistance),
                    borderColor: 'rgba(245, 158, 11, 0.8)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } },
                title: {
                    display: true,
                    text: `${distances.length} shot${distances.length !== 1 ? 's' : ''}`,
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Carry Distance (yards)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    title: { display: true, text: 'Shot Number', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { 
                        color: '#94a3b8',
                        maxTicksLimit: 15
                    }
                }
            }
        }
    });
}

function createBallSpeedChart() {
    const canvas = document.getElementById('ballSpeedChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ballSpeeds = golfData.map(s => parseFloat(s['Ball Speed']) || 0).filter(s => s > 0);
    const clubSpeeds = golfData.map(s => parseFloat(s['Club Speed']) || 0).filter(s => s > 0);
    
    if (charts.ballSpeed) charts.ballSpeed.destroy();
    
    // Calculate efficiency (ball speed / club speed ratio)
    const efficiencies = ballSpeeds.map((bs, i) => clubSpeeds[i] ? (bs / clubSpeeds[i]) : 0);
    const avgEfficiency = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;
    
    charts.ballSpeed = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Your Shots',
                data: clubSpeeds.map((cs, i) => ({ x: cs, y: ballSpeeds[i] })),
                backgroundColor: 'rgba(124, 58, 237, 0.8)',
                borderColor: 'rgba(124, 58, 237, 1)',
                pointRadius: 6
            }, {
                label: 'Ideal 1.5x Ratio',
                data: [{ x: Math.min(...clubSpeeds), y: Math.min(...clubSpeeds) * 1.5 }, 
                       { x: Math.max(...clubSpeeds), y: Math.max(...clubSpeeds) * 1.5 }],
                type: 'line',
                borderColor: 'rgba(16, 185, 129, 0.5)',
                borderDash: [5, 5],
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } },
                title: {
                    display: true,
                    text: `Avg Efficiency: ${avgEfficiency.toFixed(2)}x`,
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Ball Speed (km/h)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    title: { display: true, text: 'Club Speed (km/h)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createCarryTotalChart() {
    const canvas = document.getElementById('carryTotalChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const carryDist = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const totalDist = golfData.map(s => parseFloat(s['Total Distance']) || parseFloat(s['Carry Distance']) || 0);
    
    if (charts.carryTotal) charts.carryTotal.destroy();
    
    const rollAvg = totalDist.map((t, i) => t - carryDist[i]).reduce((a, b) => a + b, 0) / totalDist.length;
    
    charts.carryTotal = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Your Shots',
                data: carryDist.map((c, i) => ({ x: c, y: totalDist[i] })),
                backgroundColor: 'rgba(245, 158, 11, 0.8)',
                borderColor: 'rgba(245, 158, 11, 1)',
                pointRadius: 6
            }, {
                label: '1:1 Line (No Roll)',
                data: [{ x: Math.min(...carryDist), y: Math.min(...carryDist) }, 
                       { x: Math.max(...carryDist), y: Math.max(...carryDist) }],
                type: 'line',
                borderColor: 'rgba(148, 163, 184, 0.5)',
                borderDash: [5, 5],
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } },
                title: {
                    display: true,
                    text: `Avg Roll: ${rollAvg.toFixed(1)} yards`,
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Total Distance (yards)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    title: { display: true, text: 'Carry Distance (yards)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createLoftChart() {
    const canvas = document.getElementById('loftChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const launchAngles = golfData.map(s => parseFloat(s['Launch Angle']) || 0);
    const clubSpeeds = golfData.map(s => parseFloat(s['Club Speed']) || 0);
    
    if (charts.loft) charts.loft.destroy();
    
    const avgLaunch = launchAngles.reduce((a, b) => a + b, 0) / launchAngles.length;
    
    charts.loft = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Your Shots',
                data: clubSpeeds.map((cs, i) => ({ x: cs, y: launchAngles[i] })),
                backgroundColor: 'rgba(236, 72, 153, 0.8)',
                borderColor: 'rgba(236, 72, 153, 1)',
                pointRadius: 6
            }, {
                label: 'Optimal Zone',
                data: [
                    { x: Math.min(...clubSpeeds), y: 12 },
                    { x: Math.max(...clubSpeeds), y: 12 },
                    { x: Math.max(...clubSpeeds), y: 18 },
                    { x: Math.min(...clubSpeeds), y: 18 }
                ],
                type: 'line',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderColor: 'rgba(16, 185, 129, 0.5)',
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } },
                title: {
                    display: true,
                    text: `Avg Launch: ${avgLaunch.toFixed(1)}°`,
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Launch Angle (degrees)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    title: { display: true, text: 'Club Speed (km/h)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createDirectionChart() {
    const canvas = document.getElementById('directionChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const deviations = golfData.map(s => parseFloat(s['Carry Deviation Distance']) || 0);
    const distances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    
    if (charts.direction) charts.direction.destroy();
    
    const leftShots = deviations.filter(d => d < -2).length;
    const rightShots = deviations.filter(d => d > 2).length;
    const straightShots = deviations.filter(d => Math.abs(d) <= 2).length;
    
    charts.direction = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: ['Straight', 'Right', 'Left'],
            datasets: [{
                data: [straightShots, rightShots, leftShots],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.6)',
                    'rgba(245, 158, 11, 0.6)',
                    'rgba(239, 68, 68, 0.6)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } },
                title: {
                    display: true,
                    text: `${Math.round((straightShots / deviations.length) * 100)}% Straight`,
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            scales: {
                r: {
                    ticks: { color: '#94a3b8', backdropColor: 'transparent' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' }
                }
            }
        }
    });
}

function createApexChart() {
    const canvas = document.getElementById('apexChart');
    if (!canvas) return;
    
    const apexHeights = golfData.map(s => parseFloat(s['Apex']) || parseFloat(s['Max Height']) || 0).filter(h => h > 0);
    
    // Hide chart card if no apex data
    const chartCard = canvas.closest('.chart-card');
    if (apexHeights.length === 0) {
        if (chartCard) chartCard.style.display = 'none';
        return;
    }
    if (chartCard) chartCard.style.display = '';
    
    const ctx = canvas.getContext('2d');
    if (charts.apex) charts.apex.destroy();
    
    const bins = [0, 10, 20, 30, 40, 50, 60];
    const counts = new Array(bins.length - 1).fill(0);
    
    apexHeights.forEach(h => {
        for (let i = 0; i < bins.length - 1; i++) {
            if (h >= bins[i] && h < bins[i + 1]) {
                counts[i]++;
                break;
            }
        }
    });
    
    const avgApex = apexHeights.reduce((a, b) => a + b, 0) / apexHeights.length;
    
    charts.apex = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins.slice(0, -1).map((b, i) => `${b}-${bins[i + 1]}m`),
            datasets: [{
                label: 'Shot Count',
                data: counts,
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: apexHeights.length > 0 ? `Avg Apex: ${avgApex.toFixed(1)}m` : 'No apex data',
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Number of Shots', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8', stepSize: 1 }
                },
                x: {
                    title: { display: true, text: 'Apex Height Range', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createGappingChart() {
    const canvas = document.getElementById('gappingChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (charts.gapping) charts.gapping.destroy();
    
    // Group by club and calculate average distance
    const clubData = {};
    golfData.forEach(shot => {
        const club = shot['Club Type'] || shot['Club Name'] || shot['Club'] || 'Unknown';
        const distance = parseFloat(shot['Carry Distance']) || 0;
        
        if (!clubData[club]) clubData[club] = [];
        clubData[club].push(distance);
    });
    
    const clubAverages = Object.entries(clubData).map(([club, distances]) => ({
        club,
        avg: distances.reduce((a, b) => a + b, 0) / distances.length,
        count: distances.length
    })).sort((a, b) => b.avg - a.avg);
    
    charts.gapping = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: clubAverages.map(c => c.club),
            datasets: [{
                label: 'Avg Distance',
                data: clubAverages.map(c => c.avg),
                backgroundColor: clubAverages.map((_, i) => 
                    `rgba(${124 - i * 20}, ${58 + i * 30}, ${237 - i * 20}, 0.6)`
                ),
                borderColor: clubAverages.map((_, i) => 
                    `rgba(${124 - i * 20}, ${58 + i * 30}, ${237 - i * 20}, 1)`
                ),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `${clubAverages.length} clubs analyzed`,
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Distance (yards)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    title: { display: true, text: 'Club', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.3)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function calculateSwingStats() {
    return {
        totalShots: golfData.length,
        avgCarry: (golfData.reduce((sum, s) => sum + (parseFloat(s['Carry Distance']) || 0), 0) / golfData.length).toFixed(1),
        bestShot: Math.max(...golfData.map(s => parseFloat(s['Carry Distance']) || 0)).toFixed(1),
        consistency: document.getElementById('consistency').textContent,
        avgClubSpeed: (golfData.reduce((sum, s) => sum + (parseFloat(s['Club Speed']) || 0), 0) / golfData.length).toFixed(1),
        avgBackspin: (golfData.reduce((sum, s) => sum + (parseFloat(s['Backspin']) || 0), 0) / golfData.length).toFixed(0),
        avgLaunch: (golfData.reduce((sum, s) => sum + (parseFloat(s['Launch Angle']) || 0), 0) / golfData.length).toFixed(1),
        avgPath: (golfData.reduce((sum, s) => sum + (parseFloat(s['Club Path']) || 0), 0) / golfData.length).toFixed(1)
    };
}
