// Load golf data from localStorage
let tableData = [];

// Check if user is admin
function isAdmin() {
    const user = netlifyIdentity.currentUser();
    return user && user.email === 'jamiefitzgerald001@gmail.com';
}

// Show admin link if user is admin
if (isAdmin()) {
    document.getElementById('admin-link').style.display = 'inline-block';
}

// Load data on page load
window.addEventListener('load', () => {
    loadTableData();
});

function loadTableData() {
    const savedData = localStorage.getItem('currentGolfData');
    if (savedData) {
        tableData = JSON.parse(savedData);
        renderTable();
    }
}

function renderTable() {
    const container = document.getElementById('table-container');
    
    if (tableData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No Data Loaded</h3>
                <p>Go to the <a href="index.html">Dashboard</a> and upload a CSV file to get started.</p>
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
    
    // Add select all functionality
    document.getElementById('select-all').addEventListener('change', (e) => {
        document.querySelectorAll('.row-select').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateDeleteButton();
    });
    
    // Update delete button when checkboxes change
    document.querySelectorAll('.row-select').forEach(cb => {
        cb.addEventListener('change', updateDeleteButton);
    });
}

function editCell(cell) {
    const currentValue = cell.textContent.trim();
    const field = cell.dataset.field;
    
    cell.innerHTML = `<input type="text" value="${currentValue}" onblur="saveCell(this)" onkeypress="handleCellKeypress(event, this)">`;
    cell.querySelector('input').focus();
}

function saveCell(input) {
    const cell = input.parentElement;
    const row = cell.closest('tr');
    const index = parseInt(row.dataset.index);
    const field = cell.dataset.field;
    const newValue = input.value;
    
    tableData[index][field] = newValue;
    cell.textContent = newValue;
    
    // Save to localStorage
    localStorage.setItem('currentGolfData', JSON.stringify(tableData));
    
    // Update the main app data
    localStorage.setItem('golfData', JSON.stringify(tableData));
}

function handleCellKeypress(event, input) {
    if (event.key === 'Enter') {
        input.blur();
    }
}

function deleteRow(index) {
    if (confirm('Are you sure you want to delete this shot?')) {
        tableData.splice(index, 1);
        localStorage.setItem('currentGolfData', JSON.stringify(tableData));
        localStorage.setItem('golfData', JSON.stringify(tableData));
        renderTable();
    }
}

function updateDeleteButton() {
    const selected = document.querySelectorAll('.row-select:checked');
    const deleteBtn = document.getElementById('delete-selected-btn');
    
    if (selected.length > 0) {
        deleteBtn.style.display = 'block';
        deleteBtn.textContent = `Delete Selected (${selected.length})`;
    } else {
        deleteBtn.style.display = 'none';
    }
}

// Add shot button
document.getElementById('add-row-btn').addEventListener('click', () => {
    if (tableData.length === 0) {
        alert('Please upload data first from the Dashboard');
        return;
    }
    
    // Create a new row with empty values based on existing structure
    const newRow = {};
    Object.keys(tableData[0]).forEach(key => {
        newRow[key] = '';
    });
    
    tableData.push(newRow);
    localStorage.setItem('currentGolfData', JSON.stringify(tableData));
    localStorage.setItem('golfData', JSON.stringify(tableData));
    renderTable();
    
    // Scroll to bottom
    window.scrollTo(0, document.body.scrollHeight);
});

// Export CSV button
document.getElementById('export-csv-btn').addEventListener('click', () => {
    if (tableData.length === 0) {
        alert('No data to export');
        return;
    }
    
    const headers = Object.keys(tableData[0]);
    let csv = headers.join(',') + '\n';
    
    tableData.forEach(row => {
        csv += headers.map(h => row[h] || '').join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `golf-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
});

// Delete selected button
document.getElementById('delete-selected-btn').addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('.row-select:checked'));
    
    if (selected.length === 0) return;
    
    if (confirm(`Delete ${selected.length} selected shot(s)?`)) {
        const indices = selected.map(cb => {
            return parseInt(cb.closest('tr').dataset.index);
        }).sort((a, b) => b - a); // Sort descending to delete from end
        
        indices.forEach(index => {
            tableData.splice(index, 1);
        });
        
        localStorage.setItem('currentGolfData', JSON.stringify(tableData));
        localStorage.setItem('golfData', JSON.stringify(tableData));
        renderTable();
    }
});
