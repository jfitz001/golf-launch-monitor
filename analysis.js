// Pure JavaScript Golf Data Analysis - No API Required

function analyzeGolfData(golfData) {
    const insights = {
        patterns: [],
        warnings: [],
        strengths: [],
        recommendations: []
    };
    
    // Extract metrics
    const carryDistances = golfData.map(s => parseFloat(s['Carry Distance']) || 0);
    const clubSpeeds = golfData.map(s => parseFloat(s['Club Speed']) || 0);
    const sidespins = golfData.map(s => parseFloat(s['Sidespin']) || 0);
    const backspins = golfData.map(s => parseFloat(s['Backspin']) || 0);
    const clubPaths = golfData.map(s => parseFloat(s['Club Path']) || 0);
    const clubFaces = golfData.map(s => parseFloat(s['Club Face']) || 0);
    const launchAngles = golfData.map(s => parseFloat(s['Launch Angle']) || 0);
    const attackAngles = golfData.map(s => parseFloat(s['Attack Angle']) || 0);
    const smashFactors = golfData.map(s => parseFloat(s['Smash Factor']) || 0);
    const deviations = golfData.map(s => parseFloat(s['Carry Deviation Distance']) || 0);
    
    // Averages
    const avgCarry = mean(carryDistances);
    const avgClubSpeed = mean(clubSpeeds);
    const avgSidespin = mean(sidespins);
    const avgBackspin = mean(backspins);
    const avgPath = mean(clubPaths);
    const avgFace = mean(clubFaces);
    const avgLaunch = mean(launchAngles);
    const avgAttack = mean(attackAngles);
    const avgSmash = mean(smashFactors);
    const avgDeviation = mean(deviations.map(Math.abs));
    
    // Standard deviations
    const stdCarry = stdDev(carryDistances);
    const stdPath = stdDev(clubPaths);
    const stdFace = stdDev(clubFaces);
    
    // 1. SLICE/HOOK DETECTION
    if (avgSidespin < -300) {
        insights.warnings.push({
            type: 'slice',
            severity: 'high',
            message: `Slice tendency detected (avg sidespin: ${avgSidespin.toFixed(0)} rpm)`,
            detail: 'Right sidespin causing ball curve. Check club face at impact.'
        });
        insights.recommendations.push('Focus on square club face at impact. Try alignment stick drill.');
    } else if (avgSidespin > 300) {
        insights.warnings.push({
            type: 'hook',
            severity: 'high',
            message: `Hook tendency detected (avg sidespin: ${avgSidespin.toFixed(0)} rpm)`,
            detail: 'Left sidespin causing ball curve. Club face may be closed at impact.'
        });
        insights.recommendations.push('Check grip strength. May be too strong (closed face).');
    } else {
        insights.strengths.push('Good sidespin control - minimal curve');
    }
    
    // 2. PATH/FACE RELATIONSHIP
    const pathFaceDiff = Math.abs(avgFace - avgPath);
    if (pathFaceDiff > 5) {
        insights.warnings.push({
            type: 'path-face',
            severity: 'medium',
            message: `Path-face gap: ${pathFaceDiff.toFixed(1)}°`,
            detail: `Path: ${avgPath.toFixed(1)}°, Face: ${avgFace.toFixed(1)}°. Large gap = sidespin.`
        });
        insights.recommendations.push('Work on matching club face to path. Gate drill helps.');
    } else {
        insights.strengths.push('Club face well-matched to path');
    }
    
    // 3. OUT-TO-IN PATH (common amateur issue)
    if (avgPath < -3) {
        insights.warnings.push({
            type: 'path-out-to-in',
            severity: 'medium',
            message: `Out-to-in swing path (${avgPath.toFixed(1)}°)`,
            detail: 'Cutting across ball. Common cause of slices.'
        });
        insights.recommendations.push('Practice inside-out path. Headcover outside ball drill.');
    } else if (avgPath > 3) {
        insights.patterns.push({
            type: 'path-in-to-out',
            message: `In-to-out swing path (${avgPath.toFixed(1)}°)`,
            detail: 'Draw bias. Good for distance, watch for hooks.'
        });
    }
    
    // 4. LAUNCH ANGLE OPTIMIZATION (9-iron typical: 24-28°)
    if (avgLaunch < 20) {
        insights.warnings.push({
            type: 'launch-low',
            severity: 'medium',
            message: `Low launch angle (${avgLaunch.toFixed(1)}°)`,
            detail: 'Losing potential carry distance. Check ball position.'
        });
        insights.recommendations.push('Move ball forward in stance. Check attack angle.');
    } else if (avgLaunch > 30) {
        insights.warnings.push({
            type: 'launch-high',
            severity: 'low',
            message: `High launch angle (${avgLaunch.toFixed(1)}°)`,
            detail: 'May be losing distance to ballooning.'
        });
        insights.recommendations.push('Ball may be too far forward. Check swing bottom.');
    } else {
        insights.strengths.push(`Good launch angle (${avgLaunch.toFixed(1)}°)`);
    }
    
    // 5. ATTACK ANGLE (9-iron ideal: 4-6° down)
    if (avgAttack > 8) {
        insights.warnings.push({
            type: 'attack-steep',
            severity: 'medium',
            message: `Steep attack angle (${avgAttack.toFixed(1)}°)`,
            detail: 'Too steep = thin/fat shots. May be casting.'
        });
        insights.recommendations.push('Shallow out swing. Feel more sweeping motion.');
    } else if (avgAttack < 2) {
        insights.warnings.push({
            type: 'attack-shallow',
            severity: 'low',
            message: `Shallow attack angle (${avgAttack.toFixed(1)}°)`,
            detail: 'May be picking ball clean vs compressing.'
        });
        insights.recommendations.push('Work on ball-first contact. Divot after ball.');
    } else {
        insights.strengths.push(`Good attack angle (${avgAttack.toFixed(1)}°)`);
    }
    
    // 6. SMASH FACTOR (9-iron ideal: 1.28-1.32)
    if (avgSmash < 1.25) {
        insights.warnings.push({
            type: 'smash-low',
            severity: 'high',
            message: `Low smash factor (${avgSmash.toFixed(2)})`,
            detail: 'Poor energy transfer. Check center contact.'
        });
        insights.recommendations.push('Focus on center face contact. Spray face with powder to see strike.');
    } else if (avgSmash > 1.35) {
        insights.warnings.push({
            type: 'smash-high',
            severity: 'low',
            message: `High smash factor (${avgSmash.toFixed(2)})`,
            detail: 'Unusually high. Check device calibration or thin strikes.'
        });
    } else {
        insights.strengths.push(`Excellent smash factor (${avgSmash.toFixed(2)})`);
    }
    
    // 7. CONSISTENCY ANALYSIS
    const consistencyPct = Math.max(0, 100 - (stdCarry / avgCarry * 100));
    if (consistencyPct < 70) {
        insights.warnings.push({
            type: 'consistency-low',
            severity: 'high',
            message: `Low consistency (${consistencyPct.toFixed(0)}%)`,
            detail: `Distance varies ${stdCarry.toFixed(1)} yds. Work on repeatability.`
        });
        insights.recommendations.push('Tempo drill: count 1-2-3 for backswing-transition-impact.');
    } else if (consistencyPct > 85) {
        insights.strengths.push(`Excellent consistency (${consistencyPct.toFixed(0)}%)`);
    }
    
    // 8. ACCURACY ANALYSIS
    if (avgDeviation > 10) {
        insights.warnings.push({
            type: 'accuracy-poor',
            severity: 'medium',
            message: `Accuracy issue (avg deviation: ${avgDeviation.toFixed(1)} yds)`,
            detail: 'Missing target line. Check alignment and path.'
        });
        insights.recommendations.push('Alignment stick drill. Check feet/hips/shoulders parallel.');
    } else if (avgDeviation < 5) {
        insights.strengths.push(`Very accurate (${avgDeviation.toFixed(1)} yd avg deviation)`);
    }
    
    // 9. SPIN OPTIMIZATION (9-iron ideal backspin: 7000-8500 rpm)
    if (avgBackspin < 6000) {
        insights.warnings.push({
            type: 'spin-low',
            severity: 'medium',
            message: `Low backspin (${avgBackspin.toFixed(0)} rpm)`,
            detail: 'May not hold greens. Check grooves and ball compression.'
        });
        insights.recommendations.push('Clean grooves. Check ball quality. Steeper attack helps spin.');
    } else if (avgBackspin > 9000) {
        insights.warnings.push({
            type: 'spin-high',
            severity: 'low',
            message: `High backspin (${avgBackspin.toFixed(0)} rpm)`,
            detail: 'May be ballooning. Losing distance.'
        });
        insights.recommendations.push('Shallow attack angle slightly. Check ball position.');
    } else {
        insights.strengths.push(`Good backspin (${avgBackspin.toFixed(0)} rpm)`);
    }
    
    // 10. CLUB SPEED vs DISTANCE CORRELATION
    const speedDistanceRatio = avgCarry / avgClubSpeed;
    if (speedDistanceRatio < 0.8) {
        insights.warnings.push({
            type: 'efficiency-low',
            severity: 'medium',
            message: 'Low speed-to-distance efficiency',
            detail: 'Not converting club speed to distance. Check smash factor and launch.'
        });
        insights.recommendations.push('Optimize launch angle and smash factor first.');
    } else if (speedDistanceRatio > 1.0) {
        insights.strengths.push('Excellent speed-to-distance efficiency');
    }
    
    // 11. OUTLIER DETECTION
    const outliers = detectOutliers(carryDistances);
    if (outliers.length > 0) {
        insights.patterns.push({
            type: 'outliers',
            message: `${outliers.length} outlier shots detected`,
            detail: `Shots deviating >2 std dev: ${outliers.map(o => o.toFixed(1)).join(', ')} yds`
        });
    }
    
    // 12. PATH CONSISTENCY
    if (stdPath > 3) {
        insights.warnings.push({
            type: 'path-inconsistent',
            severity: 'medium',
            message: `Inconsistent club path (std dev: ${stdPath.toFixed(1)}°)`,
            detail: 'Path varies too much. Hurts repeatability.'
        });
        insights.recommendations.push('Gate drill for consistent path. Video your swing from behind.');
    } else {
        insights.strengths.push('Consistent club path');
    }
    
    // 13. FACE CONTROL
    if (stdFace > 3) {
        insights.warnings.push({
            type: 'face-inconsistent',
            severity: 'medium',
            message: `Poor face control (std dev: ${stdFace.toFixed(1)}°)`,
            detail: 'Club face angle varies. Main cause of directional issues.'
        });
        insights.recommendations.push('Grip pressure drill. Feel face square at impact.');
    } else {
        insights.strengths.push('Good face control');
    }
    
    return insights;
}

// Statistical helpers
function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
    const avg = mean(arr);
    const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(mean(squareDiffs));
}

function detectOutliers(arr) {
    const avg = mean(arr);
    const std = stdDev(arr);
    return arr.filter(v => Math.abs(v - avg) > 2 * std);
}

function correlate(arr1, arr2) {
    const n = arr1.length;
    const mean1 = mean(arr1);
    const mean2 = mean(arr2);
    
    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;
    
    for (let i = 0; i < n; i++) {
        const diff1 = arr1[i] - mean1;
        const diff2 = arr2[i] - mean2;
        numerator += diff1 * diff2;
        denom1 += diff1 * diff1;
        denom2 += diff2 * diff2;
    }
    
    return numerator / Math.sqrt(denom1 * denom2);
}
