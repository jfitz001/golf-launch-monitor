// Offline Sync Service - Handle online/offline state and background sync

class SyncService {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.isSyncing = false;
        this.listeners = [];
        
        // Load queue from localStorage
        this.loadQueue();
        
        // Setup event listeners
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Check connection periodically
        setInterval(() => this.checkConnection(), 30000); // Every 30 seconds
    }
    
    handleOnline() {
        console.log('Connection restored');
        this.isOnline = true;
        this.notifyListeners('online');
        this.processQueue();
    }
    
    handleOffline() {
        console.log('Connection lost');
        this.isOnline = false;
        this.notifyListeners('offline');
    }
    
    async checkConnection() {
        try {
            const response = await fetch('/.netlify/functions/get-sessions?email=ping', {
                method: 'HEAD',
                cache: 'no-store'
            });
            
            const wasOffline = !this.isOnline;
            this.isOnline = response.ok;
            
            if (wasOffline && this.isOnline) {
                this.handleOnline();
            } else if (!wasOffline && !this.isOnline) {
                this.handleOffline();
            }
        } catch (error) {
            if (this.isOnline) {
                this.handleOffline();
            }
        }
    }
    
    addToQueue(operation) {
        this.syncQueue.push({
            ...operation,
            timestamp: Date.now(),
            id: Date.now() + Math.random()
        });
        this.saveQueue();
        this.notifyListeners('queue-updated', this.syncQueue.length);
        
        // Try to sync immediately if online
        if (this.isOnline) {
            this.processQueue();
        }
    }
    
    async processQueue() {
        if (this.isSyncing || !this.isOnline || this.syncQueue.length === 0) {
            return;
        }
        
        this.isSyncing = true;
        console.log(`Processing ${this.syncQueue.length} queued operations...`);
        
        const failedOperations = [];
        
        for (const operation of this.syncQueue) {
            try {
                await this.executeOperation(operation);
                console.log('Synced operation:', operation.type);
            } catch (error) {
                console.error('Failed to sync operation:', error);
                failedOperations.push(operation);
            }
        }
        
        // Keep failed operations in queue
        this.syncQueue = failedOperations;
        this.saveQueue();
        this.isSyncing = false;
        
        this.notifyListeners('sync-completed', {
            remaining: this.syncQueue.length
        });
    }
    
    async executeOperation(operation) {
        switch (operation.type) {
            case 'save-session':
                return await this.syncSaveSession(operation.data);
            case 'delete-session':
                return await this.syncDeleteSession(operation.data);
            default:
                console.warn('Unknown operation type:', operation.type);
        }
    }
    
    async syncSaveSession(data) {
        const response = await fetch('/.netlify/functions/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save session');
        }
        
        return await response.json();
    }
    
    async syncDeleteSession(data) {
        const response = await fetch('/.netlify/functions/delete-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete session');
        }
        
        return await response.json();
    }
    
    saveQueue() {
        try {
            localStorage.setItem('syncQueue', JSON.stringify(this.syncQueue));
        } catch (error) {
            console.error('Failed to save sync queue:', error);
        }
    }
    
    loadQueue() {
        try {
            const saved = localStorage.getItem('syncQueue');
            if (saved) {
                this.syncQueue = JSON.parse(saved);
                console.log(`Loaded ${this.syncQueue.length} queued operations`);
            }
        } catch (error) {
            console.error('Failed to load sync queue:', error);
            this.syncQueue = [];
        }
    }
    
    onStatusChange(callback) {
        this.listeners.push(callback);
    }
    
    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Error in sync listener:', error);
            }
        });
    }
    
    getStatus() {
        return {
            isOnline: this.isOnline,
            queueLength: this.syncQueue.length,
            isSyncing: this.isSyncing
        };
    }
}

// Create singleton instance
const syncService = new SyncService();

// Add sync status indicator to UI
function updateSyncIndicator() {
    let indicator = document.getElementById('sync-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'sync-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 8px;
            background: var(--card);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            font-size: 0.875rem;
            z-index: 1000;
            display: none;
        `;
        document.body.appendChild(indicator);
    }
    
    const status = syncService.getStatus();
    
    if (!status.isOnline) {
        indicator.style.display = 'block';
        indicator.style.background = 'var(--warning)';
        indicator.style.color = 'white';
        indicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>⚠️</span>
                <span>Offline Mode</span>
                ${status.queueLength > 0 ? `<span>(${status.queueLength} pending)</span>` : ''}
            </div>
        `;
    } else if (status.queueLength > 0 && status.isSyncing) {
        indicator.style.display = 'block';
        indicator.style.background = 'var(--primary)';
        indicator.style.color = 'white';
        indicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>🔄</span>
                <span>Syncing ${status.queueLength} items...</span>
            </div>
        `;
    } else if (status.queueLength > 0) {
        indicator.style.display = 'block';
        indicator.style.background = 'var(--warning)';
        indicator.style.color = 'white';
        indicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>⏸️</span>
                <span>${status.queueLength} items waiting to sync</span>
            </div>
        `;
    } else {
        // Hide when online and no queue
        setTimeout(() => {
            if (syncService.getStatus().queueLength === 0) {
                indicator.style.display = 'none';
            }
        }, 3000); // Hide after 3 seconds
    }
}

// Listen for sync events
syncService.onStatusChange((event, data) => {
    console.log('Sync event:', event, data);
    updateSyncIndicator();
    
    if (event === 'sync-completed' && data.remaining === 0) {
        // All synced successfully
        const indicator = document.getElementById('sync-indicator');
        if (indicator) {
            indicator.style.background = 'var(--success)';
            indicator.style.color = 'white';
            indicator.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>✓</span>
                    <span>All data synced</span>
                </div>
            `;
        }
    }
});

// Update indicator on page load
window.addEventListener('load', () => {
    updateSyncIndicator();
    
    // Try to sync on load if online
    if (syncService.isOnline && syncService.syncQueue.length > 0) {
        syncService.processQueue();
    }
});

// Export sync service
window.syncService = syncService;
