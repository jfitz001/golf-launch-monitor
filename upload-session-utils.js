(function initUploadSessionUtils(globalScope) {
    function getShotFingerprint(shot) {
        const keys = Object.keys(shot || {}).sort();
        return keys.map((key) => `${key}:${shot?.[key] || ''}`).join('|');
    }

    function dedupeShots(shots) {
        const seen = new Set();
        const deduped = [];
        (Array.isArray(shots) ? shots : []).forEach((shot) => {
            const key = getShotFingerprint(shot);
            if (seen.has(key)) return;
            seen.add(key);
            deduped.push(shot);
        });
        return deduped;
    }

    function mergeShotsForUpload(existingShots, newShots, mode = 'append') {
        const baseShots = mode === 'replace' ? [] : (Array.isArray(existingShots) ? existingShots : []);
        const parsedNew = Array.isArray(newShots) ? newShots : [];
        const mergedShots = dedupeShots([...baseShots, ...parsedNew]);
        return {
            mergedShots,
            dedupedCount: (baseShots.length + parsedNew.length) - mergedShots.length
        };
    }

    const api = {
        getShotFingerprint,
        dedupeShots,
        mergeShotsForUpload
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    globalScope.UploadSessionUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
