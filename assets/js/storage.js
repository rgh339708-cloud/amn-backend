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
          backendUrl = 'https://amn-backend-euhi.onrender.com';
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

  // IDs of old/renamed system pages that must NEVER be stored in ps_pages
  const OLD_PAGE_IDS = new Set(['leadership','managers','centers','guide','inventory','vehicles','college','attendance-reports','exams','field-title','uniform','apply','database','wings','aviation-document','counter-terrorism-wing','pursuit-assault-wing','shooting-skills-wing','roads-document','traffic-document','rapid-intervention-document','special-tasks-document','officers-document','staff-document','ops-document','regulations-document','investigation-document','narcotics-document','thunderbolt-document','district-officers-document','amn90-r']);

  // Immediately purge old page IDs from localStorage on script load
  (function purgeOldPagesFromLocalStorage() {
    try {
      const raw = localStorage.getItem('ps_pages');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const cleaned = parsed.filter(p => p && p.id && !OLD_PAGE_IDS.has(p.id));
      if (cleaned.length !== parsed.length) {
        localStorage.setItem('ps_pages', JSON.stringify(cleaned));
        // Also remove from unsynced list so server copy wins
        try {
          const unsynced = JSON.parse(localStorage.getItem('ps_unsynced_keys') || '[]');
          const idx = unsynced.indexOf('ps_pages');
          if (idx !== -1) { unsynced.splice(idx, 1); localStorage.setItem('ps_unsynced_keys', JSON.stringify(unsynced)); }
        } catch(e) {}
        console.log('[Storage] Purged old page IDs from ps_pages localStorage.');
      }
    } catch(e) {}
  })();

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
    QBANK_REQUESTS: `${PREFIX}qbank_requests`,
    DOC_ACCESS_LOGS: `${PREFIX}doc_access_logs`,
  };

  const lastWriteTime = {};
  const activeSyncs = {};

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
  function set(key, value, syncRemote = true) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      lastWriteTime[key] = Date.now();
      if (syncRemote) {
        syncToRemote(key, 'set', null, null, value);
      }
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
  function addToCollection(key, item, syncRemote = true) {
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
    if (syncRemote) {
      syncToRemote(key, 'add', newItem.id, newItem, collection);
    }
    return newItem;
  }

  /**
   * Update an item in a collection by id
   */
  function updateInCollection(key, id, updates, syncRemote = true) {
    const collection = getCollection(key);
    const idx = collection.findIndex(item => item.id === id);
    if (idx === -1) return false;
    collection[idx] = { ...collection[idx], ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(collection));
    lastWriteTime[key] = Date.now();
    if (syncRemote) {
      syncToRemote(key, 'update', id, collection[idx], collection);
    }
    return collection[idx];
  }

  /**
   * Delete an item from a collection by id
   */
  function deleteFromCollection(key, id, syncRemote = true) {
    const collection = getCollection(key);
    const filtered = collection.filter(item => item.id !== id);
    localStorage.setItem(key, JSON.stringify(filtered));
    lastWriteTime[key] = Date.now();
    if (syncRemote) {
      syncToRemote(key, 'delete', id, null, filtered);
    }
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

  let detectedBackendUrl = sessionStorage.getItem('detected_backend_url');

  function getApiBase() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';
    if (detectedBackendUrl) return detectedBackendUrl;
    
    try {
      const settings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
      if (settings && settings.backendUrl) return settings.backendUrl;
    } catch (e) {}
    return 'https://amn-backend-euhi.onrender.com';
  }

  // Auto-detect if Node is running on current server (Hostinger)
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    fetch(`${window.location.origin}/api/healthz`)
      .then(r => r.json())
      .then(data => {
        if (data && data.status === 'ok') {
          sessionStorage.setItem('detected_backend_url', window.location.origin);
          detectedBackendUrl = window.location.origin;
        }
      })
      .catch(() => {});
  }

  // In-memory cache for exam archive to avoid redundant network requests
  let _examArchiveCache = null;
  let _examArchiveCacheTime = 0;
  const EXAM_ARCHIVE_CACHE_TTL = 10000; // 10 seconds

  function invalidateExamArchiveCache() {
    _examArchiveCache = null;
    _examArchiveCacheTime = 0;
  }

  function saveExamAttempt(data) {
    // Write-through wrapper to match legacy code
    return fetchWithTimeout(`${getApiBase()}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()).then(resData => {
      // Invalidate local caches + force fresh fetch on next poll
      invalidateExamArchiveCache();
      _lastCollectionsEtag = null; // Force re-fetch on next poll
      loadAllFromServer();
      return resData;
    });
  }

  function fetchExamArchive() {
    const now = Date.now();
    // Return cached data if it's still fresh
    if (_examArchiveCache && (now - _examArchiveCacheTime) < EXAM_ARCHIVE_CACHE_TTL) {
      return Promise.resolve(_examArchiveCache);
    }
    return fetchWithTimeout(`${getApiBase()}/api/exams`, { method: 'GET' })
      .then(res => res.json())
      .then(json => {
        _examArchiveCache = json.exams || [];
        _examArchiveCacheTime = Date.now();
        return _examArchiveCache;
      });
  }

  function deleteExamAttempt(id) {
    return fetchWithTimeout(`${getApiBase()}/api/exams?id=${id}`, { method: 'DELETE' })
      .then(res => res.json()).then(resData => {
        invalidateExamArchiveCache();
        _lastCollectionsEtag = null; // Force next poll to fetch fresh state since database changed
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
      _lastCollectionsEtag = null; // Force next poll to fetch fresh state since database changed
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
      _lastCollectionsEtag = null; // Force next poll to fetch fresh state since database changed
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
    const apiBase = getApiBase();
    const url = `${apiBase}/api/violations`;
    const headers = { 'Content-Type': 'application/json' };
    if (url.startsWith('http')) {
      headers['Bypass-Tunnel-Reminder'] = 'true';
    }
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
      keepalive: true
    }).then(res => res.json()).then(resData => {
      _lastCollectionsEtag = null; // Force next poll to fetch fresh state since database changed
      loadAllFromServer();
      return resData;
    });
  }

  function deleteViolation(id) {
    return fetchWithTimeout(`${getApiBase()}/api/violations?id=${id}`, { method: 'DELETE' })
      .then(res => res.json()).then(resData => {
        _lastCollectionsEtag = null; // Force next poll to fetch fresh state since database changed
        loadAllFromServer();
        return resData;
      });
  }

  // --- Centralized Sync Helper Functions ---

  function getUnsyncedKeys() {
    try {
      return JSON.parse(localStorage.getItem('ps_unsynced_keys') || '[]');
    } catch {
      return [];
    }
  }

  function markKeyUnsynced(key) {
    const list = getUnsyncedKeys();
    if (!list.includes(key)) {
      list.push(key);
      localStorage.setItem('ps_unsynced_keys', JSON.stringify(list));
    }
  }

  function markKeySynced(key) {
    const list = getUnsyncedKeys();
    const index = list.indexOf(key);
    if (index !== -1) {
      list.splice(index, 1);
      localStorage.setItem('ps_unsynced_keys', JSON.stringify(list));
      // Sync success toast removed - syncing happens silently in background
    }
  }

  function isKeyUnsynced(key) {
    return getUnsyncedKeys().includes(key);
  }

  function syncToRemote(collection, action, id, item, data) {
    // Only link if not local session keys
    if (collection === keys.CURRENT_USER) return;

    const apiBase = getApiBase();
    activeSyncs[collection] = (activeSyncs[collection] || 0) + 1;
    
    // Mark as unsynced initially in case it fails
    markKeyUnsynced(collection);

    fetchWithTimeout(`${apiBase}/api/db/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
      body: JSON.stringify({ collection, action, id, item, data }),
      timeout: 60000 // 60 seconds to allow Render cold start
    }).then(res => res.json())
      .then(resData => {
        activeSyncs[collection] = Math.max(0, (activeSyncs[collection] || 0) - 1);
        if (resData.success) {
          _lastCollectionsEtag = null; // Force next poll to fetch fresh state since we just mutated it
          markKeySynced(collection);
        } else {
          console.warn(`[Storage Sync] Failed to sync ${collection} remote action ${action}`);
          // Silent - no toast, retry will handle it automatically
        }
      }).catch(err => {
        activeSyncs[collection] = Math.max(0, (activeSyncs[collection] || 0) - 1);
        console.warn(`[Storage Sync] Network error syncing ${collection} to server`, err);
        // Silent - no toast, retry will handle it automatically
      });
  }

  async function retryUnsyncedSyncs() {
    const list = getUnsyncedKeys();
    if (list.length === 0) return;
    
    console.log('[Storage Sync] Found unsynced keys. Retrying sync for:', list);
    
    for (const key of list) {
      // If we are currently syncing this key through a direct mutation, skip retry
      if (activeSyncs[key] > 0) continue;
      
      const data = get(key);
      if (data === null) continue;
      
      const isArrayKey = key.startsWith('ps_') && 
                         key !== keys.SETTINGS && 
                         key !== keys.CURRENT_USER && 
                         key !== keys.INITIALIZED;
      
      let payloadData = isArrayKey ? getCollection(key) : data;

      // Purge old page IDs before retrying sync for ps_pages
      if (key === 'ps_pages' && Array.isArray(payloadData)) {
        const before = payloadData.length;
        payloadData = payloadData.filter(p => p && p.id && !OLD_PAGE_IDS.has(p.id));
        if (payloadData.length !== before) {
          localStorage.setItem('ps_pages', JSON.stringify(payloadData));
          console.log('[Storage Sync] Purged old page IDs from ps_pages before retry sync.');
        }
        // If no custom pages remain, nothing to sync — just mark as synced
        if (payloadData.length === 0) { markKeySynced(key); continue; }
      }
      
      try {
        const apiBase = getApiBase();
        const res = await fetchWithTimeout(`${apiBase}/api/db/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
          body: JSON.stringify({ 
            collection: key, 
            action: 'set', 
            id: null, 
            item: null, 
            data: payloadData 
          }),
          timeout: 60000 // 60 seconds
        });
        
        if (res.ok) {
          const resData = await res.json();
          if (resData.success) {
            console.log(`[Storage Sync] Successfully retried and synced key: ${key}`);
            _lastCollectionsEtag = null; // Force next poll to fetch fresh state since we just mutated it
            markKeySynced(key);
          } else {
            console.warn(`[Storage Sync] Retry sync failed on server for key: ${key}`);
          }
        }
      } catch (err) {
        console.warn(`[Storage Sync] Retry sync network error for key: ${key}`, err);
      }
    }
  }

  let _lastCollectionsEtag = null; // Track ETag for 304 support

  async function loadAllFromServer() {
    try {
      const apiBase = getApiBase();
      const fetchStartTime = Date.now();

      const headers = { 'Bypass-Tunnel-Reminder': 'true' };
      if (_lastCollectionsEtag) {
        headers['If-None-Match'] = _lastCollectionsEtag;
      }

      const res = await fetchWithTimeout(`${apiBase}/api/db/collections`, {
        headers,
        timeout: 15000
      });

      // 304 Not Modified: data unchanged, skip localStorage update
      if (res.status === 304) {
        return true;
      }

      // Store new ETag for next request
      const etag = res.headers.get('ETag');
      if (etag) _lastCollectionsEtag = etag;

      if (res.ok) {
        const json = await res.json();
        if (json && json.success && json.collections) {
          // Iterate through each collection and save to localStorage
          Object.keys(json.collections).forEach(key => {
            // Avoid overwriting active session on client
            if (key === keys.CURRENT_USER) return;
            
            // Special smart merge protection for Question Bank Requests
            if (key === keys.QBANK_REQUESTS) {
              const serverArr = json.collections[key];
              const localArr = getCollection(key);
              if (Array.isArray(serverArr) && serverArr.length > 0) {
                const map = new Map();
                localArr.forEach(item => { if (item && item.id) map.set(item.id, item); });
                serverArr.forEach(item => { if (item && item.id) map.set(item.id, item); });
                const merged = Array.from(map.values()).sort((a,b) => (b.id > a.id ? 1 : -1));
                localStorage.setItem(key, JSON.stringify(merged));
              } else if (!serverArr || serverArr.length === 0) {
                if (localArr && localArr.length > 0) {
                  // Keep local data intact if server collection is empty or uninitialized
                  return;
                }
              }
              return;
            }

            // Skip overwriting if a local write occurred after this fetch started
            const lastWrite = lastWriteTime[key] || 0;
            if (lastWrite >= fetchStartTime) {
              console.log(`[Storage Sync] Skipping overwrite for key ${key} because a local write occurred after the fetch started.`);
              return;
            }

            // Skip overwriting if there is an active sync request in flight, if it was modified recently (8s), or if it is unsynced (dirty)
            const hasActiveSync = activeSyncs[key] > 0;
            const isUnsynced = isKeyUnsynced(key);
            if (hasActiveSync || isUnsynced || (Date.now() - lastWrite < 8000)) {
              console.log(`[Storage Sync] Skipping overwrite for recently written/syncing/unsynced key: ${key} (activeSync: ${hasActiveSync}, unsynced: ${isUnsynced})`);
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
  let retryInterval = null;
  function startRealTimePolling(intervalMs = 10000) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
      invalidateExamArchiveCache(); // Invalidate cache so next fetchExamArchive() fetches fresh data
      loadAllFromServer();
    }, intervalMs);

    // Also start a retry poll every 15 seconds
    if (retryInterval) clearInterval(retryInterval);
    retryInterval = setInterval(() => {
      retryUnsyncedSyncs();
    }, 15000);
    // Trigger immediately on start
    retryUnsyncedSyncs();
  }

  return {
    keys,
    get, set, remove, clearAll,
    getCollection, addToCollection, updateInCollection,
    deleteFromCollection, findById, findWhere, count,
    saveExamAttempt,
    fetchExamArchive,
    invalidateExamArchiveCache,
    deleteExamAttempt,
    fetchRetakeRequests,
    saveRetakeRequest,
    updateRetakeStatus,
    fetchViolations,
    saveViolation,
    deleteViolation,
    loadAllFromServer,
    startRealTimePolling,
    getApiBase
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

      const headers = { 'Content-Type': 'application/json' };
      if (logsApiUrl.startsWith('http')) {
        headers['Bypass-Tunnel-Reminder'] = 'true';
      }
      fetch(logsApiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(logItem),
        keepalive: true
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

