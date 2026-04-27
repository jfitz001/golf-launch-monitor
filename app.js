let golfData = [];
let charts = {};

// Check if user is admin and show admin link
window.addEventListener('load', () => {
    const user = netlifyIdentity?.currentUser();
    if (user && user.email === 'jamiefitzgerald001@gmail.com') {
        const adminLink = document.getElementById('admin-link');
        if (adminLink) adminLink.style.display = 'inline-block';
    }
});

// CSV Upload Handler
document.getElementById('csvFile').addEventListener('change', handleFileUpload);

// Drag and drop
const uploadCard = document.querySelector('.upload-card');
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
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        processFile(file);
    }
});

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        processFile(file);
    }
}

function processFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        parseCSV(text);
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    // Log headers to console for debugging
    console.log('CSV Headers found:', headers);
    
    golfData = [];
    for (let i = 2; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',');
        const shot = {};
        headers.forEach((header, index) => {
            shot[header] = values[index] ? values[index].trim() : '';
        });
        golfData.push(shot);
    }
    
    // Log first shot to see what data we have
    if (golfData.length > 0) {
        console.log('First shot data:', golfData[0]);
        console.log('Available columns:', Object.keys(golfData[0]));
    }
    
    // Save data to localStorage for data table page
    localStorage.setItem('currentGolfData', JSON.stringify(golfData));
    localStorage.setItem('golfData', JSON.stringify(golfData));
    
    displayData();
}

function displayData() {
    document.getElementById('dataLoaded').classList.remove('hidden');
    
    // Calculate stats
    const carryDistances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const totalShots = carryDistances.length;
    const avgCarry = (carryDistances.reduce((a, b) => a + b, 0) / totalShots).toFixed(1);
    const bestShot = Math.max(...carryDistances).toFixed(1);
    const stdDev = calculateStdDev(carryDistances);
    const consistency = Math.max(0, 100 - (stdDev / avgCarry * 100)).toFixed(0);
    
    // Update stats cards
    document.getElementById('totalShots').textContent = totalShots;
    document.getElementById('avgCarry').textContent = `${avgCarry} yds`;
    document.getElementById('bestShot').textContent = `${bestShot} yds`;
    document.getElementById('consistency').textContent = `${consistency}%`;
    
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
    
    // Run pure JS analysis
    displayAutomaticInsights();
    
    // Calculate swing score
    updateSwingScore();
}

function calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
}

function createDispersionChart() {
    const ctx = document.getElementById('dispersionChart').getContext('2d');
    const carryDistances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const deviations = golfData.map(s => parseFloat(s['Carry Deviation Distance']) || 0);
    
    const maxDist = Math.max(...carryDistances);
    const minDist = Math.min(...carryDistances);
    const avgDist = carryDistances.reduce((a, b) => a + b, 0) / carryDistances.length;
    
    if (charts.dispersion) charts.dispersion.destroy();
    
    // Circular green - typical diameter is 25-30 yards
    const greenRadius = 15; // 15 yard radius = 30 yard diameter green
    const greenCenterX = 0; // Centered on target line
    const greenCenterY = avgDist; // Centered at average distance
    
    // Create circle points for the green
    const createCircle = (centerX, centerY, radius, points = 60) => {
        const circle = [];
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * 2 * Math.PI;
            circle.push({
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
            });
        }
        return circle;
    };
    
    charts.dispersion = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                // Background (fairway/rough)
                {
                    label: 'Fairway/Rough',
                    data: [
                        { x: -30, y: minDist - 20 },
                        { x: 30, y: minDist - 20 },
                        { x: 30, y: maxDist + 20 },
                        { x: -30, y: maxDist + 20 }
                    ],
                    borderColor: 'rgba(107, 142, 35, 0.3)',
                    backgroundColor: 'rgba(107, 142, 35, 0.1)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: true,
                    type: 'line',
                    showLine: true,
                    order: 5
                },
                // Circular Golf Green
                {
                    label: 'Green',
                    data: createCircle(greenCenterX, greenCenterY, greenRadius),
                    borderColor: 'rgba(34, 139, 34, 0.8)',
                    backgroundColor: 'rgba(60, 179, 113, 0.35)', // Medium sea green
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: true,
                    type: 'line',
                    showLine: true,
                    order: 3
                },
                // Hole/Cup
                {
                    label: 'Hole',
                    data: [{ x: 0, y: avgDist }],
                    backgroundColor: 'rgba(0, 0, 0, 1)',
                    borderColor: 'rgba(255, 215, 0, 1)',
                    pointRadius: 8,
                    pointStyle: 'triangle',
                    order: 0
                },
                // Shots on green
                {
                    label: 'On Green',
                    data: carryDistances.map((dist, i) => {
                        const dev = deviations[i];
                        const distFromCenter = Math.sqrt(Math.pow(dev - greenCenterX, 2) + Math.pow(dist - greenCenterY, 2));
                        return distFromCenter <= greenRadius ? { x: dev, y: dist } : null;
                    }).filter(d => d !== null),
                    backgroundColor: 'rgba(16, 185, 129, 0.9)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 2,
                    pointRadius: 6,
                    order: 1
                },
                // Shots missed green
                {
                    label: 'Missed Green',
                    data: carryDistances.map((dist, i) => {
                        const dev = deviations[i];
                        const distFromCenter = Math.sqrt(Math.pow(dev - greenCenterX, 2) + Math.pow(dist - greenCenterY, 2));
                        return distFromCenter > greenRadius ? { x: dev, y: dist } : null;
                    }).filter(d => d !== null),
                    backgroundColor: 'rgba(239, 68, 68, 0.9)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2,
                    pointRadius: 6,
                    order: 1
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
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { 
                    labels: { 
                        color: '#f1f5f9',
                        filter: (item) => ['On Green', 'Missed Green'].includes(item.text)
                    } 
                },
                title: {
                    display: true,
                    text: `Green in Regulation: ${Math.round((carryDistances.filter((dist, i) => {
                        const dev = deviations[i];
                        // Check if shot is within circular green (distance from center <= radius)
                        const distFromCenter = Math.sqrt(Math.pow(dev - greenCenterX, 2) + Math.pow(dist - greenCenterY, 2));
                        return distFromCenter <= greenRadius;
                    }).length / carryDistances.length) * 100)}%`,
                    color: '#10b981',
                    font: { size: 14, weight: 'bold' }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (['On Green', 'Missed Green'].includes(ctx.dataset.label)) {
                                const deviation = ctx.parsed.x;
                                const distance = ctx.parsed.y;
                                const direction = deviation > 0 ? 'right' : deviation < 0 ? 'left' : 'center';
                                const distToPin = Math.sqrt(Math.pow(deviation, 2) + Math.pow(distance - avgDist, 2));
                                return [
                                    `${ctx.dataset.label}`,
                                    `Carry: ${distance.toFixed(1)} yds`,
                                    `${Math.abs(deviation).toFixed(1)} yds ${direction}`,
                                    `${distToPin.toFixed(1)} yds from hole`
                                ];
                            } else if (ctx.dataset.label === 'Hole') {
                                return 'Target Hole';
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Distance (yards)', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.2)' },
                    ticks: { color: '#94a3b8' },
                    min: 0,
                    max: maxDist + 10
                },
                x: {
                    title: { display: true, text: 'Left (-) / Right (+)  yards', color: '#94a3b8' },
                    grid: { color: 'rgba(71, 85, 105, 0.2)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function createDistanceChart() {
    const ctx = document.getElementById('distanceChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('spinChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('pathChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('launchChart').getContext('2d');
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
            maintainAspectRatio: true,
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

// Display automatic insights (no API needed)
function displayAutomaticInsights() {
    const insights = analyzeGolfData(golfData);
    const insightsDiv = document.getElementById('insights');
    
    // Get club info - try multiple possible column names
    const clubNames = golfData.map(s => 
        s['Club Name'] || 
        s['Club Type'] || 
        s['Club'] || 
        s['club'] || 
        s['Club name'] || 
        s['club name'] || 
        s['ClubName'] ||
        ''
    ).filter(c => c);
    const detectedClub = clubNames.length > 0 ? clubNames[0] : 'Unknown Club';
    
    // Calculate key metrics
    const carryDistances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const avgCarry = (carryDistances.reduce((a, b) => a + b, 0) / carryDistances.length).toFixed(1);
    const bestCarry = Math.max(...carryDistances).toFixed(1);
    const worstCarry = Math.min(...carryDistances.filter(d => d > 0)).toFixed(1);
    const gapYards = (bestCarry - worstCarry).toFixed(1);
    
    const clubSpeeds = golfData.map(s => parseFloat(s['Club Speed']) || 0);
    const avgSpeed = (clubSpeeds.reduce((a, b) => a + b, 0) / clubSpeeds.length).toFixed(1);
    
    const smashFactors = golfData.map(s => parseFloat(s['Smash Factor']) || 0);
    const avgSmash = (smashFactors.reduce((a, b) => a + b, 0) / smashFactors.length).toFixed(2);
    
    const launchAngles = golfData.map(s => parseFloat(s['Launch Angle']) || 0);
    const avgLaunch = (launchAngles.reduce((a, b) => a + b, 0) / launchAngles.length).toFixed(1);
    
    const backspins = golfData.map(s => parseFloat(s['Backspin']) || 0);
    const avgSpin = (backspins.reduce((a, b) => a + b, 0) / backspins.length).toFixed(0);
    
    const deviations = golfData.map(s => Math.abs(parseFloat(s['Carry Deviation Distance']) || 0));
    const avgDeviation = (deviations.reduce((a, b) => a + b, 0) / deviations.length).toFixed(1);
    
    let html = '<div style="color: var(--text); line-height: 1.8;">';
    
    // Club-specific header
    html += `<div style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end)); padding: 20px; border-radius: 8px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 8px 0; color: white; font-size: 20px;">${detectedClub} Performance Analysis</h3>
        <div style="color: rgba(255,255,255,0.9); font-size: 14px;">${golfData.length} shots analyzed</div>
    </div>`;
    
    // Key Metrics Summary
    html += `<div style="background: var(--surface-light); padding: 20px; border-radius: 8px; margin-bottom: 24px;">
        <h4 style="margin-top: 0; color: var(--text);">Key Metrics</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; font-size: 14px;">
            <div>
                <div style="color: var(--text-secondary);">Distance Range</div>
                <div style="font-size: 18px; font-weight: 600; color: var(--primary);">${worstCarry} - ${bestCarry} yds</div>
                <div style="color: var(--text-secondary); font-size: 12px;">Gap: ${gapYards} yards</div>
            </div>
            <div>
                <div style="color: var(--text-secondary);">Average Carry</div>
                <div style="font-size: 18px; font-weight: 600; color: var(--primary);">${avgCarry} yards</div>
            </div>
            <div>
                <div style="color: var(--text-secondary);">Club Speed</div>
                <div style="font-size: 18px; font-weight: 600; color: var(--primary);">${avgSpeed} km/h</div>
            </div>
            <div>
                <div style="color: var(--text-secondary);">Smash Factor</div>
                <div style="font-size: 18px; font-weight: 600; color: var(--primary);">${avgSmash}</div>
            </div>
            <div>
                <div style="color: var(--text-secondary);">Launch Angle</div>
                <div style="font-size: 18px; font-weight: 600; color: var(--primary);">${avgLaunch}°</div>
            </div>
            <div>
                <div style="color: var(--text-secondary);">Backspin</div>
                <div style="font-size: 18px; font-weight: 600; color: var(--primary);">${avgSpin} rpm</div>
            </div>
        </div>
    </div>`;
    
    // Accuracy Analysis
    html += `<div style="background: var(--surface-light); padding: 20px; border-radius: 8px; margin-bottom: 24px;">
        <h4 style="margin-top: 0; color: var(--text);">Accuracy Analysis</h4>
        <div style="font-size: 14px;">
            <div style="margin-bottom: 12px;">
                <strong>Average Miss:</strong> ${avgDeviation} yards offline
            </div>
            <div style="margin-bottom: 12px;">
                <strong>Dispersion:</strong> ${gapYards} yard carry gap (best to worst)
            </div>
            <div>
                <strong>Verdict:</strong> ${avgDeviation < 5 ? '✓ Excellent accuracy' : avgDeviation < 10 ? '⚠ Good accuracy, room for improvement' : '⚠ Work on directional control'}
            </div>
        </div>
    </div>`;
    
    // Strengths
    if (insights.strengths.length > 0) {
        html += '<div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--success); padding: 16px; border-radius: 8px; margin-bottom: 16px;">';
        html += '<h4 style="color: var(--success); margin-top: 0;">What\'s Working Well</h4><ul style="margin: 0;">';
        insights.strengths.forEach(s => {
            html += `<li>${s}</li>`;
        });
        html += '</ul></div>';
    }
    
    // Critical Issues (High Severity)
    const criticalIssues = insights.warnings.filter(w => w.severity === 'high');
    if (criticalIssues.length > 0) {
        html += '<div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--danger); padding: 16px; border-radius: 8px; margin-bottom: 16px;">';
        html += '<h4 style="color: var(--danger); margin-top: 0;">Critical Issues (Fix First)</h4>';
        criticalIssues.forEach(w => {
            html += `<div style="margin-bottom: 12px;">
                <strong>${w.message}</strong><br>
                <span style="color: var(--text-secondary); font-size: 14px;">${w.detail}</span>
            </div>`;
        });
        html += '</div>';
    }
    
    // Medium Priority Issues
    const mediumIssues = insights.warnings.filter(w => w.severity === 'medium');
    if (mediumIssues.length > 0) {
        html += '<div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid var(--warning); padding: 16px; border-radius: 8px; margin-bottom: 16px;">';
        html += '<h4 style="color: var(--warning); margin-top: 0;">Areas for Improvement</h4>';
        mediumIssues.forEach(w => {
            html += `<div style="margin-bottom: 12px;">
                <strong>${w.message}</strong><br>
                <span style="color: var(--text-secondary); font-size: 14px;">${w.detail}</span>
            </div>`;
        });
        html += '</div>';
    }
    
    // Action Items
    if (insights.recommendations.length > 0) {
        html += '<div style="background: var(--surface-light); border-left: 4px solid var(--primary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">';
        html += '<h4 style="color: var(--primary); margin-top: 0;">Recommended Actions</h4><ol style="margin: 0; padding-left: 20px;">';
        insights.recommendations.slice(0, 5).forEach(r => {
            html += `<li style="margin-bottom: 8px;">${r}</li>`;
        });
        html += '</ol></div>';
    }
    
    html += '</div>';
    insightsDiv.innerHTML = html;
    
    // Update drills based on recommendations
    updateDrills(insights);
}

function updateDrills(insights) {
    const drillsDiv = document.getElementById('drills');
    const drillsContent = drillsDiv.querySelector('.drills-content');
    
    // Comprehensive drill database with detailed instructions
    const drillDatabase = {
        'slice': {
            title: 'Inside-Out Path Correction',
            desc: 'Place alignment stick or headcover 6" outside target line. Swing without hitting it. Forces inside path.',
            reps: '10 swings, 3 sets',
            focus: 'Feel club approaching from inside',
            priority: 10
        },
        'hook': {
            title: 'Face Control Awareness',
            desc: 'Grip pressure at 4/10. Practice half swings focusing on square face at impact. Use mirror for feedback.',
            reps: '20 half swings',
            focus: 'Lighter grip prevents early release',
            priority: 10
        },
        'path-face': {
            title: 'Gate Drill for Path-Face Match',
            desc: 'Create 18" gate with alignment sticks. Swing through gate with square face. Trains coordination.',
            reps: '15 swings, record path/face data',
            focus: 'Face angle matches path angle',
            priority: 9
        },
        'path-out-to-in': {
            title: 'Alignment Stick Behind Ball',
            desc: 'Stick angled 45° behind ball (inside). Prevents over-the-top. Swing under stick.',
            reps: '12 swings, 2 sets',
            focus: 'Shallow from inside',
            priority: 9
        },
        'path-in-to-out': {
            title: 'Square Path Training',
            desc: 'Gate drill with tight tolerances. Practice neutral path. Prevent excessive draw.',
            reps: '10 swings through gate',
            focus: 'Neutral 0-2° path',
            priority: 7
        },
        'launch-low': {
            title: 'Ball Position + Tee Height',
            desc: 'Move ball 1-2" forward. Tee higher. Practice ascending blow. Feel hitting "up" on ball.',
            reps: '15 shots, measure launch',
            focus: 'Positive attack angle',
            priority: 8
        },
        'launch-high': {
            title: 'Compress Down Drill',
            desc: 'Ball position center-back. Focus on descending strike. Divot after ball.',
            reps: '12 shots, check divots',
            focus: 'Ball-first contact',
            priority: 6
        },
        'attack-steep': {
            title: 'Shallow Transition Drill',
            desc: 'Pump drill: halfway down, pause, feel club shallow. Then complete swing.',
            reps: '8 pump drills, 8 full swings',
            focus: 'Shallow plane in transition',
            priority: 8
        },
        'attack-shallow': {
            title: 'Compression Training',
            desc: 'Focus on hitting down. Place tee 2" in front of ball. Try to hit both.',
            reps: '10 swings',
            focus: 'Descending angle of attack',
            priority: 7
        },
        'smash-low': {
            title: 'Center Strike Protocol',
            desc: 'Impact tape on face. 20 swings. Map strike pattern. Adjust setup until centered.',
            reps: '20 swings, adjust between sets',
            focus: 'Sweet spot contact',
            priority: 10
        },
        'smash-high': {
            title: 'Contact Quality Check',
            desc: 'May indicate thin strikes. Focus on solid compression. Check lie angle.',
            reps: 'Validation shots',
            focus: 'Center-face contact',
            priority: 5
        },
        'consistency-low': {
            title: 'Tempo & Rhythm Builder',
            desc: '3-count tempo: 1 (backswing), 2 (transition), 3 (impact). Metronome app at 60 BPM.',
            reps: '25 swings with count',
            focus: 'Repeatable tempo',
            priority: 9
        },
        'accuracy-poor': {
            title: 'Alignment Station Setup',
            desc: 'Sticks for feet, hips, shoulders. Check parallel alignment. Film from behind.',
            reps: '10 swings with alignment check',
            focus: 'Square setup',
            priority: 8
        },
        'spin-low': {
            title: 'Spin Enhancement',
            desc: 'Clean grooves. New ball. Steeper attack. Focus on quality compression.',
            reps: '15 shots, measure spin',
            focus: 'Crisp contact, clean grooves',
            priority: 7
        },
        'spin-high': {
            title: 'Spin Reduction',
            desc: 'Shallow attack angle. Ball forward. Reduce dynamic loft.',
            reps: '12 shots',
            focus: 'Lower spin loft',
            priority: 6
        },
        'path-inconsistent': {
            title: 'Path Repeatability Training',
            desc: 'Video from down-the-line. Gate drill. Track path deviation. Reduce variance.',
            reps: '20 swings, measure each',
            focus: 'Path within ±2°',
            priority: 8
        },
        'face-inconsistent': {
            title: 'Face Control Mastery',
            desc: 'Grip consistency drill. Mark grip. Check every swing. Feel square at impact.',
            reps: '15 swings, verify face angle',
            focus: 'Face within ±2°',
            priority: 9
        },
        'efficiency-low': {
            title: 'Speed-Distance Optimization',
            desc: 'Focus on smash factor and launch. Quality contact + optimal launch = max distance.',
            reps: 'Combined launch + contact drills',
            focus: 'Smash 1.30+, launch 24-28°',
            priority: 7
        }
    };
    
    // Prioritize drills based on severity and impact
    const scoredDrills = [];
    
    insights.warnings.forEach(w => {
        if (drillDatabase[w.type]) {
            const drill = drillDatabase[w.type];
            let score = drill.priority;
            
            // Boost priority for high severity
            if (w.severity === 'high') score += 3;
            if (w.severity === 'medium') score += 1;
            
            scoredDrills.push({ ...drill, score, issue: w.message });
        }
    });
    
    // Sort by score (highest priority first)
    scoredDrills.sort((a, b) => b.score - a.score);
    
    // If no specific issues, add general improvement drills
    if (scoredDrills.length === 0) {
        scoredDrills.push(
            {
                title: 'Fundamentals Check',
                desc: 'Alignment, grip, posture, ball position. Video from face-on and down-the-line.',
                reps: '5 swings per checkpoint',
                focus: 'Baseline fundamentals',
                issue: 'General improvement'
            },
            {
                title: 'Consistency Builder',
                desc: 'Same target, same club. Track dispersion. Goal: reduce spread by 20%.',
                reps: '20 shots',
                focus: 'Repeatable motion',
                issue: 'Build consistency'
            },
            {
                title: 'Data-Driven Practice',
                desc: 'Pick one metric (path, face, launch). Drill until variance drops. Measure progress.',
                reps: 'Until metric improves',
                focus: 'One metric at a time',
                issue: 'Targeted improvement'
            }
        );
    }
    
    // Render top 4-6 drills
    let html = '';
    const drillsToShow = Math.min(6, Math.max(3, scoredDrills.length));
    
    scoredDrills.slice(0, drillsToShow).forEach((drill, index) => {
        const priorityColor = drill.score >= 12 ? 'var(--danger)' : 
                             drill.score >= 9 ? 'var(--warning)' : 
                             'var(--primary)';
        const drillId = `drill-${index}`;
        
        html += `<div class="drill-card expandable-drill" style="border-left-color: ${priorityColor}; cursor: pointer;" onclick="toggleDrill('${drillId}')">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <h4 style="margin: 0;">${index + 1}. ${drill.title}</h4>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                        ${drill.score >= 12 ? 'Critical' : drill.score >= 9 ? 'High Priority' : 'Recommended'}
                    </span>
                    <span class="drill-toggle" id="${drillId}-toggle" style="font-size: 18px; transition: transform 0.3s;">▼</span>
                </div>
            </div>
            ${drill.issue ? `<div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; font-style: italic;">Addresses: ${drill.issue}</div>` : ''}
            <div id="${drillId}-content" class="drill-content" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out;">
                <p style="margin-bottom: 12px;">${drill.desc}</p>
                ${drill.reps ? `<div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;"><strong>Reps:</strong> ${drill.reps}</div>` : ''}
                ${drill.focus ? `<div style="font-size: 13px; color: var(--primary);"><strong>Focus:</strong> ${drill.focus}</div>` : ''}
            </div>
        </div>`;
    });
    
    drillsContent.innerHTML = html;
}

// Toggle drill expansion
function toggleDrill(drillId) {
    const content = document.getElementById(`${drillId}-content`);
    const toggle = document.getElementById(`${drillId}-toggle`);
    
    if (content.style.maxHeight && content.style.maxHeight !== '0px') {
        content.style.maxHeight = '0px';
        toggle.style.transform = 'rotate(0deg)';
    } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        toggle.style.transform = 'rotate(180deg)';
    }
}

// Generate insights with Gemini (optional)
document.getElementById('generateInsights').addEventListener('click', async () => {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert('Gemini API key not configured. Using built-in analysis instead.');
        displayAutomaticInsights();
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

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ 
                    parts: [{ text: prompt }] 
                }]
            })
        });
        
        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0]) {
            throw new Error('Invalid API response. Check your API key.');
        }
        
        const insight = data.candidates[0].content.parts[0].text;
        
        insightsDiv.innerHTML = `<div style="color: var(--text); line-height: 1.8;">${insight.replace(/\n/g, '<br>')}</div>`;
        
    } catch (error) {
        insightsDiv.innerHTML = `<div style="color: var(--danger);">Error generating AI insights. Using built-in analysis.</div>`;
        console.error(error);
        setTimeout(displayAutomaticInsights, 1000);
    }
});

function createSmashChart() {
    const ctx = document.getElementById('smashChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('attackChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('consistencyChart').getContext('2d');
    
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
    if (clubFilter.options.length === 1) { // Only "All Clubs" option
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('ballSpeedChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('carryTotalChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('loftChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('directionChart').getContext('2d');
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('apexChart').getContext('2d');
    const apexHeights = golfData.map(s => parseFloat(s['Apex']) || parseFloat(s['Max Height']) || 0).filter(h => h > 0);
    
    if (charts.apex) charts.apex.destroy();
    
    // Create histogram bins
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
            maintainAspectRatio: true,
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
    const ctx = document.getElementById('gappingChart').getContext('2d');
    
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
            maintainAspectRatio: true,
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
