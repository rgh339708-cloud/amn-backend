/**
 * storage.js - إدارة localStorage بشكل آمن ومنظم
 * Public Security Portal - Data Persistence Layer
 */

// Intercept all fetch requests globally to inject the Bypass-Tunnel-Reminder header
// and rewrite relative API calls (e.g. '/api/exams') to point to the correct backend server.
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(resource, options = {}) {
    let url = '';
    let isRequestObject = false;

    if (typeof resource === 'string') {
      url = resource;
    } else if (resource && typeof resource === 'object') {
      if (resource.url) {
        url = resource.url;
        isRequestObject = true;
      } else if (typeof resource.toString === 'function') {
        url = resource.toString();
      }
    }

    if (url) {
      let backendUrl = '';
      try {
        const settings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
        if (settings && settings.backendUrl) {
          backendUrl = settings.backendUrl;
        }
      } catch (e) {}

      const host = window.location.hostname;
      const isProduction = host !== 'localhost' && host !== '127.0.0.1' && window.location.protocol !== 'file:';

      if (isProduction) {
        if (!backendUrl || backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1') || backendUrl.includes('trycloudflare.com') || backendUrl.includes('loca.lt')) {
          backendUrl = 'https://amn-backend.onrender.com';
        }
      } else {
        if (!backendUrl) {
          backendUrl = 'http://localhost:3000';
        }
      }

      // Rewrite relative API calls
      const isRelativeApi = !url.startsWith('http://') && !url.startsWith('https://') && url.includes('/api/');
      if (isRelativeApi && backendUrl) {
        const idx = url.indexOf('/api/');
        url = backendUrl + url.substring(idx);
        
        if (typeof resource === 'string') {
          resource = url;
        } else if (isRequestObject) {
          try {
            resource = new Request(url, resource);
          } catch(e) {
            resource.url = url;
          }
        } else {
          resource = url;
        }
      }

      const isBackendCall = (backendUrl && url.includes(backendUrl)) || url.includes('trycloudflare.com') || url.includes('loca.lt');
      if (isBackendCall) {
        options = options || {};
        if (!options.headers) {
          options.headers = {};
        }
        
        if (options.headers instanceof Headers) {
          if (!options.headers.has('Bypass-Tunnel-Reminder')) {
            options.headers.append('Bypass-Tunnel-Reminder', 'true');
          }
        } else if (Array.isArray(options.headers)) {
          const hasHeader = options.headers.some(([k]) => k.toLowerCase() === 'bypass-tunnel-reminder');
          if (!hasHeader) {
            options.headers.push(['Bypass-Tunnel-Reminder', 'true']);
          }
        } else {
          options.headers['Bypass-Tunnel-Reminder'] = 'true';
        }
      }
    }
    return originalFetch.call(this, resource, options);
  };
})();

// Global helper to prevent hanging fetch calls (especially useful when localtunnel is offline/slow)
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 30000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  const headers = { ...options.headers };
  if (typeof resource === 'string' && resource.startsWith('http')) {
    headers['Bypass-Tunnel-Reminder'] = 'true';
  }
  
  try {
    const response = await fetch(resource, {
      ...options,
      headers: headers,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

const Storage = (() => {
  const PREFIX = 'ps_';

  const keys = {
    USERS:          `${PREFIX}users`,
    CURRENT_USER:   `${PREFIX}current_user`,
    ANNOUNCEMENTS:  `${PREFIX}announcements`,
    NEWS:           `${PREFIX}news`,
    PROMOTIONS:     `${PREFIX}promotions`,
    GUIDE_TOPICS:   `${PREFIX}guide_topics`,
    EXAMS:          `${PREFIX}exams`,
    EXAM_RESULTS:   `${PREFIX}exam_results`,
    APPLICATIONS:   `${PREFIX}applications`,
    DATABASE_ROWS:  `${PREFIX}database_rows`,
    SETTINGS:       `${PREFIX}settings`,
    MEMBERS:        `${PREFIX}members`,
    CENTERS:        `${PREFIX}centers`,
    REPORTS:        `${PREFIX}reports`,
    PAGES:          `${PREFIX}pages`,
    PAGE_CUSTOMIZATIONS: `${PREFIX}page_customizations`,
    INITIALIZED:    `${PREFIX}initialized`,
    SYSTEM_LOGS:    `${PREFIX}system_logs`,
    RETAKE_REQUESTS: `${PREFIX}retake_requests`,
    EXAM_VIOLATIONS: `${PREFIX}exam_violations`,
    DISCORD_LOGS:   `${PREFIX}discord_logs`,
  };

  const lastWriteTime = {};

  /**
   * Get an item from storage, returns defaultValue if not found/parse error
   */
  function get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  }
  /**
   * Save an item to storage
   */
  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      lastWriteTime[key] = Date.now();
      syncToRemote(key, 'set', null, null, value);
      return true;
    } catch (e) {
      console.error('Storage write error:', e);
      return false;
    }
  }

  /**
   * Remove an item
   */
  function remove(key) {
    localStorage.removeItem(key);
  }

  /**
   * Clear all app data
   */
  function clearAll() {
    Object.values(keys).forEach(k => localStorage.removeItem(k));
  }

  /**
   * Get all items of a collection
   */
  function getCollection(key) {
    const val = get(key, []);
    return Array.isArray(val) ? val.filter(Boolean) : [];
  }

  /**
   * Add item to a collection (array). Auto-generates id + timestamps
   */
  function addToCollection(key, item) {
    const collection = getCollection(key);
    const newItem = {
      id: item.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...item,
    };
    collection.unshift(newItem); // newest first
    localStorage.setItem(key, JSON.stringify(collection));
    lastWriteTime[key] = Date.now();
    syncToRemote(key, 'add', newItem.id, newItem, collection);
    return newItem;
  }

  /**
   * Update an item in a collection by id
   */
  function updateInCollection(key, id, updates) {
    const collection = getCollection(key);
    const idx = collection.findIndex(item => item.id === id);
    if (idx === -1) return false;
    collection[idx] = { ...collection[idx], ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(collection));
    lastWriteTime[key] = Date.now();
    syncToRemote(key, 'update', id, collection[idx], collection);
    return collection[idx];
  }

  /**
   * Delete an item from a collection by id
   */
  function deleteFromCollection(key, id) {
    const collection = getCollection(key);
    const filtered = collection.filter(item => item.id !== id);
    localStorage.setItem(key, JSON.stringify(filtered));
    lastWriteTime[key] = Date.now();
    syncToRemote(key, 'delete', id, null, filtered);
    return filtered.length < collection.length;
  }

  /**
   * Find an item by id in a collection
   */
  function findById(key, id) {
    const collection = getCollection(key);
    return collection.find(item => item.id === id) || null;
  }

  /**
   * Find items by a field value
   */
  function findWhere(key, field, value) {
    const collection = getCollection(key);
    return collection.filter(item => item[field] === value);
  }

  /**
   * Count items in a collection
   */
  function count(key) {
    return getCollection(key).length;
  }

  function getApiBase() {
    try {
      const settings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
      if (settings && settings.backendUrl) return settings.backendUrl;
    } catch (e) {}
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';
    return 'https://amn-backend.onrender.com';
  }

  function saveExamAttempt(data) {
    // Write-through wrapper to match legacy code
    return fetchWithTimeout(`${getApiBase()}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()).then(resData => {
      // Refresh local cache after attempt saves
      loadAllFromServer();
      return resData;
    });
  }

  function fetchExamArchive() {
    return fetchWithTimeout(`${getApiBase()}/api/exams`, { method: 'GET' })
      .then(res => res.json())
      .then(json => json.exams || []);
  }

  function deleteExamAttempt(id) {
    return fetchWithTimeout(`${getApiBase()}/api/exams?id=${id}`, { method: 'DELETE' })
      .then(res => res.json()).then(resData => {
        loadAllFromServer();
        return resData;
      });
  }

  function fetchRetakeRequests() {
    return fetchWithTimeout(`${getApiBase()}/api/retakes`, { method: 'GET' })
      .then(res => res.json())
      .then(json => json.requests || []);
  }

  function saveRetakeRequest(data) {
    return fetchWithTimeout(`${getApiBase()}/api/retakes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()).then(resData => {
      loadAllFromServer();
      return resData;
    });
  }

  function updateRetakeStatus(id, status, approved_by) {
    return fetchWithTimeout(`${getApiBase()}/api/retakes/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, approved_by })
    }).then(res => res.json()).then(resData => {
      loadAllFromServer();
      return resData;
    });
  }

  function fetchViolations() {
    return fetchWithTimeout(`${getApiBase()}/api/violations`, { method: 'GET' })
      .then(res => res.json())
      .then(json => json.violations || []);
  }

  function saveViolation(data) {
    return fetchWithTimeout(`${getApiBase()}/api/violations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()).then(resData => {
      loadAllFromServer();
      return resData;
    });
  }

  function deleteViolation(id) {
    return fetchWithTimeout(`${getApiBase()}/api/violations?id=${id}`, { method: 'DELETE' })
      .then(res => res.json()).then(resData => {
        loadAllFromServer();
        return resData;
      });
  }

  // --- Centralized Sync Helper Functions ---

  function syncToRemote(collection, action, id, item, data) {
    // Only link if not local session keys
    if (collection === keys.CURRENT_USER) return;

    const apiBase = getApiBase();

    fetchWithTimeout(`${apiBase}/api/db/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
      body: JSON.stringify({ collection, action, id, item, data }),
      timeout: 3000
    }).then(res => res.json())
      .then(resData => {
        if (!resData.success) {
          console.warn(`[Storage Sync] Failed to sync ${collection} remote action ${action}`);
        }
      }).catch(err => {
        console.warn(`[Storage Sync] Network error syncing ${collection} to server`);
      });
  }

  async function loadAllFromServer() {
    try {
      const apiBase = getApiBase();

      const res = await fetchWithTimeout(`${apiBase}/api/db/collections`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' },
        timeout: 2000
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && json.collections) {
          // Iterate through each collection and save to localStorage
          Object.keys(json.collections).forEach(key => {
            // Avoid overwriting active session on client
            if (key === keys.CURRENT_USER) return;
            
            // Skip overwriting if there was a local change within the last 5 seconds to prevent race conditions
            const lastWrite = lastWriteTime[key] || 0;
            if (Date.now() - lastWrite < 5000) {
              console.log(`[Storage Sync] Skipping overwrite for recently written key: ${key}`);
              return;
            }
            
            localStorage.setItem(key, JSON.stringify(json.collections[key]));
          });
          window.ps_storage_synced = true;
          window.dispatchEvent(new CustomEvent('storage_sync'));
          return true;
        }
      }
    } catch (err) {
      console.warn('[Storage Sync] Failed to load collections from server:', err);
    }
    return false;
  }

  let pollingInterval = null;
  function startRealTimePolling(intervalMs = 3000) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
      loadAllFromServer();
    }, intervalMs);
  }

  return {
    keys,
    get, set, remove, clearAll,
    getCollection, addToCollection, updateInCollection,
    deleteFromCollection, findById, findWhere, count,
    saveExamAttempt,
    fetchExamArchive,
    deleteExamAttempt,
    fetchRetakeRequests,
    saveRetakeRequest,
    updateRetakeStatus,
    fetchViolations,
    saveViolation,
    deleteViolation,
    loadAllFromServer,
    startRealTimePolling
  };
})();window.Storage = Storage;

// Global System Activity Logger
const Logger = {
  log: function(type, details) {
    try {
      const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
      let username = 'زائر (Guest)';
      let discord = '';
      if (currentUser) {
        username = currentUser.username || currentUser.globalName || 'عضو';
        discord = currentUser.discord || '';
      }
      const logItem = {
        type: type,
        username: username,
        discord: discord,
        details: details
      };
      
      // Save locally first
      if (typeof Storage !== 'undefined' && Storage.keys && Storage.keys.SYSTEM_LOGS) {
        Storage.addToCollection(Storage.keys.SYSTEM_LOGS, logItem);
      } else {
        const key = 'ps_system_logs';
        const logs = JSON.parse(localStorage.getItem(key) || '[]');
        const newItem = {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...logItem
        };
        logs.unshift(newItem);
        localStorage.setItem(key, JSON.stringify(logs));
      }

      // Send to server
      let backendUrl = '';
      try {
        const settings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
        if (settings && settings.backendUrl) {
          backendUrl = settings.backendUrl;
        }
      } catch (e) {}
      const logsApiUrl = backendUrl ? `${backendUrl}/api/logs` : '/api/logs';

      fetchWithTimeout(logsApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logItem)
      }).catch(err => console.warn('Failed to send log to server:', err));

    } catch (e) {
      console.error('Logging error:', e);
    }
  },
  getLogs: function() {
    if (typeof Storage !== 'undefined' && Storage.keys && Storage.keys.SYSTEM_LOGS) {
      return Storage.getCollection(Storage.keys.SYSTEM_LOGS);
    }
    return JSON.parse(localStorage.getItem('ps_system_logs') || '[]');
  },
  getRemoteLogs: async function() {
    try {
      let backendUrl = '';
      try {
        const settings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
        if (settings && settings.backendUrl) {
          backendUrl = settings.backendUrl;
        }
      } catch (e) {}
      const logsApiUrl = backendUrl ? `${backendUrl}/api/logs` : '/api/logs';

      const res = await fetchWithTimeout(logsApiUrl);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch logs from server, falling back to local storage:', e);
    }
    return this.getLogs();
  },
  clearLogs: function() {
    if (typeof Storage !== 'undefined' && Storage.keys && Storage.keys.SYSTEM_LOGS) {
      Storage.set(Storage.keys.SYSTEM_LOGS, []);
    } else {
      localStorage.setItem('ps_system_logs', '[]');
    }
  },
  clearRemoteLogs: async function() {
    this.clearLogs();
    try {
      let backendUrl = '';
      try {
        const settings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
        if (settings && settings.backendUrl) {
          backendUrl = settings.backendUrl;
        }
      } catch (e) {}
      const clearApiUrl = backendUrl ? `${backendUrl}/api/logs/clear` : '/api/logs/clear';

      await fetchWithTimeout(clearApiUrl, { method: 'POST' });
    } catch (e) {
      console.warn('Failed to clear logs on server:', e);
    }
  }
};
window.Logger = Logger;

