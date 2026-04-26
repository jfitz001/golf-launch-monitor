let tableData = [];
let cloudSyncTimer = null;
const CLOUD_SYNC_DEBOUNCE_MS = 900;
const DEFAULT_SHOT_HEADERS = [
    'Date',
    'Player',
    'Club Name',
    'Brand/Model',
    'Club Type',
    'Club Speed',
    'Attack Angle',
    'Club Path',
    'Club Face',
    'Carry Distance',
    'Carry Deviation Distance',
    'Launch Angle',
    'Backspin',
    'Smash Factor'
];

function getInviteHeaders(baseHeaders = {}) {
    if (typeof window.getInviteAuthHeaders === 'function') {
        return window.getInviteAuthHeaders(baseHeaders);
    }
    return { ...baseHeaders };
}

function getCurrentUserEmail() {
    const user = netlifyIdentity?.currentUser?.();
    return user?.email ? String(user.email).trim().toLowerCase() : '';
}

function isAdmin() {
    const user = netlifyIdentity?.currentUser?.();
    return user && user.email === 'jamiefitzgerald001@gmail.com';
}

function showAdminLinkIfNeeded() {
    const adminLink = document.getElementById('admin-link');
    if (adminLink && isAdmin()) {
        adminLink.style.display = 'inline-block';
    }
}

function persistLocalData() {
    localStorage.setItem('currentGolfData', JSON.stringify(tableData));
    localStorage.setItem('golfData', JSON.stringify(tableData));
    localStorage.setItem('lastUploadTime', Date.now().toString());
}

function showSyncStatus(message, isError = false) {
    let status = document.getElementById('data-sync-status');
    if (!status) {
        const controls = document.querySelector('.table-controls');
        if (!controls) return;
        status = document.createElement('div');
        status.id = 'data-sync-status';
        status.style.cssText = 'display:flex;align-items:center;font-size:13px;font-weight:600;color:var(--text-secondary);padding:6px 2px;';
        controls.appendChild(status);
    }

    status.textContent = message;
    status.style.color = isError ? 'var(--danger)' : 'var(--text-secondary)';
}

async function fetchWorkingDataFromCloud() {
    const userEmail = getCurrentUserEmail();
    if (!userEmail) return { success: false, reason: 'no-user' };

    const response = await fetch(`/.netlify/functions/get-working-data?email=${encodeURIComponent(userEmail)}`, {
        headers: getInviteHeaders()
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}

async function pushWorkingDataToCloudNow() {
    const userEmail = getCurrentUserEmail();
    if (!userEmail) return { success: false, reason: 'no-user' };

    const payload = { userEmail, workingData: tableData };

    if (window.syncService && !window.syncService.isOnline) {
        window.syncService.addToQueue({
            type: 'upsert-working-data',
            data: payload
        });
        showSyncStatus('Offline: queued data sync');
        return { success: true, queued: true };
    }

    try {
        const response = await fetch('/.netlify/functions/upsert-working-data', {
            method: 'POST',
            headers: getInviteHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const result = await response.json();
        showSyncStatus('Cloud synced');
        return { success: true, queued: false, ...result };
    } catch (error) {
        if (window.syncService) {
            window.syncService.addToQueue({
                type: 'upsert-working-data',
                data: payload
            });
            showSyncStatus('Sync retry queued');
            return { success: true, queued: true, error: error.message };
        }
        throw error;
    }
}

function queueCloudSync() {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
        void pushWorkingDataToCloudNow();
    }, CLOUD_SYNC_DEBOUNCE_MS);
}

function commitDataChange() {
    persistLocalData();
    queueCloudSync();
}

function parseLocalData() {
    try {
        const savedData = localStorage.getItem('currentGolfData');
        if (!savedData || savedData === '[]') return [];
        const parsed = JSON.parse(savedData);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

async function loadTableData() {
    showAdminLinkIfNeeded();

    const localData = parseLocalData();
    tableData = localData;

    const userEmail = getCurrentUserEmail();
    if (userEmail) {
        try {
            const cloudResult = await fetchWorkingDataFromCloud();
            const cloudData = Array.isArray(cloudResult?.workingData) ? cloudResult.workingData : [];
            const cloudHasData = !!cloudResult?.hasData && cloudData.length > 0;

            if (cloudHasData) {
                const localFingerprint = JSON.stringify(localData);
                const cloudFingerprint = JSON.stringify(cloudData);
                if (localFingerprint !== cloudFingerprint) {
                    tableData = cloudData;
                    persistLocalData();
                }
                showSyncStatus('Loaded cloud working data');
            } else if (localData.length > 0) {
                showSyncStatus('No cloud data yet, using local');
                queueCloudSync();
            }
        } catch (error) {
            console.error('Cloud data load failed:', error);
            if (localData.length > 0) {
                showSyncStatus('Cloud load failed, using local data', true);
            }
        }
    } else if (localData.length > 0) {
        showSyncStatus('Local mode (sign in for cloud sync)');
    }

    renderTable();
}

function renderTable() {
    const container = document.getElementById('table-container');

    if (tableData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No Data Loaded</h3>
                <p>Upload CSV on <a href="/upload">Upload</a> page, or click <strong>+ Add Shot</strong> to create a row.</p>
            </div>
        `;
        return;
    }

    const headers = Object.keys(tableData[0]);

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th class="checkbox-cell">
                        <input type="checkbox" id="select-all">
                    </th>
                    <th>#</th>
                    ${headers.map(h => `<th>${h}</th>`).join('')}
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    tableData.forEach((row, index) => {
        html += `
            <tr data-index="${index}">
                <td class="checkbox-cell">
                    <input type="checkbox" class="row-select">
                </td>
                <td>${index + 1}</td>
                ${headers.map(h => `
                    <td class="editable-cell" data-field="${h}" onclick="editCell(this)">
                        ${row[h] || ''}
                    </td>
                `).join('')}
                <td>
                    <div class="row-actions">
                        <button class="action-btn delete" onclick="deleteRow(${index})">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;

    const selectAll = document.getElementById('select-all');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            document.querySelectorAll('.row-select').forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateDeleteButton();
        });
    }

    document.querySelectorAll('.row-select').forEach(cb => {
        cb.addEventListener('change', updateDeleteButton);
    });
}

function editCell(cell) {
    const currentValue = cell.textContent.trim();
    cell.innerHTML = `<input type="text" value="${currentValue.replace(/"/g, '&quot;')}" onblur="saveCell(this)" onkeypress="handleCellKeypress(event, this)">`;
    cell.querySelector('input').focus();
}

function saveCell(input) {
    const cell = input.parentElement;
    const row = cell.closest('tr');
    const index = Number.parseInt(row.dataset.index, 10);
    const field = cell.dataset.field;
    const newValue = input.value;

    if (!tableData[index]) return;

    tableData[index][field] = newValue;
    cell.textContent = newValue;
    commitDataChange();
}

function handleCellKeypress(event, input) {
    if (event.key === 'Enter') {
        input.blur();
    }
}

function deleteRow(index) {
    if (!confirm('Are you sure you want to delete this shot?')) return;

    tableData.splice(index, 1);
    commitDataChange();
    renderTable();
}

function updateDeleteButton() {
    const selected = document.querySelectorAll('.row-select:checked');
    const deleteBtn = document.getElementById('delete-selected-btn');

    if (!deleteBtn) return;

    if (selected.length > 0) {
        deleteBtn.style.display = 'block';
        deleteBtn.textContent = `Delete Selected (${selected.length})`;
    } else {
        deleteBtn.style.display = 'none';
    }
}

function createEmptyRowFromHeaders(headers) {
    const row = {};
    headers.forEach((key) => {
        row[key] = '';
    });
    return row;
}

const addRowBtn = document.getElementById('add-row-btn');
if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
        if (tableData.length === 0) {
            tableData = [createEmptyRowFromHeaders(DEFAULT_SHOT_HEADERS)];
        } else {
            tableData.push(createEmptyRowFromHeaders(Object.keys(tableData[0])));
        }

        commitDataChange();
        renderTable();
        window.scrollTo(0, document.body.scrollHeight);
    });
}

function escapeCsvCell(value) {
    const raw = value == null ? '' : String(value);
    if (/[",\n]/.test(raw)) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
}

const exportCsvBtn = document.getElementById('export-csv-btn');
if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
        if (tableData.length === 0) {
            alert('No data to export');
            return;
        }

        const headers = Object.keys(tableData[0]);
        const lines = [headers.map(escapeCsvCell).join(',')];

        tableData.forEach(row => {
            lines.push(headers.map(h => escapeCsvCell(row[h] || '')).join(','));
        });

        const csv = `${lines.join('\n')}\n`;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `golf-data-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    });
}

const deleteSelectedBtn = document.getElementById('delete-selected-btn');
if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
        const selected = Array.from(document.querySelectorAll('.row-select:checked'));
        if (selected.length === 0) return;

        if (!confirm(`Delete ${selected.length} selected shot(s)?`)) return;

        const indices = selected
            .map(cb => Number.parseInt(cb.closest('tr').dataset.index, 10))
            .sort((a, b) => b - a);

        indices.forEach(index => {
            tableData.splice(index, 1);
        });

        commitDataChange();
        renderTable();
    });
}

window.addEventListener('load', () => {
    void loadTableData();
});

if (window.netlifyIdentity && typeof window.netlifyIdentity.on === 'function') {
    window.netlifyIdentity.on('init', (user) => {
        if (user) void loadTableData();
    });
    window.netlifyIdentity.on('login', () => {
        void loadTableData();
    });
}

window.addEventListener('golf-data-updated', (event) => {
    const shots = event?.detail?.shots;
    if (!Array.isArray(shots)) return;
    tableData = shots;
    renderTable();
});
