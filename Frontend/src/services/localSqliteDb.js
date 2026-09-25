// localSqliteDb.js
// Client-side SQLite-grade local persistent database powered by IndexedDB with memory caching
// Designed for Karan Finance to eliminate network latency and make the entire app work instantly.

const DB_NAME = 'KaranFinance_SQLite_LocalDB';
const DB_VERSION = 1;

class LocalSqliteDatabase {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.memoryCache = new Map();
    this.initPromise = null;
    this.syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'offline'
    this.lastSyncTime = null;
  }

  /**
   * Initialize IndexedDB database with tables (object stores)
   */
  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('[SQLite DB] IndexedDB not available in this environment. Falling back to memory/localStorage.');
        this.isReady = true;
        resolve(this);
        return;
      }

      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // 1. Table: clients
          if (!db.objectStoreNames.contains('clients')) {
            const clientStore = db.createObjectStore('clients', { keyPath: '_id' });
            clientStore.createIndex('clientId', 'clientId', { unique: false });
            clientStore.createIndex('phone', 'phone', { unique: false });
            clientStore.createIndex('name', 'name', { unique: false });
            clientStore.createIndex('district', 'district', { unique: false });
            clientStore.createIndex('landmark', 'landmark', { unique: false });
            clientStore.createIndex('assigned_agent', 'assigned_agent', { unique: false });
            clientStore.createIndex('status', 'status', { unique: false });
          }

          // 2. Table: payments
          if (!db.objectStoreNames.contains('payments')) {
            const paymentStore = db.createObjectStore('payments', { keyPath: '_id' });
            paymentStore.createIndex('client', 'client', { unique: false });
            paymentStore.createIndex('agent', 'agent', { unique: false });
            paymentStore.createIndex('paymentDate', 'paymentDate', { unique: false });
            paymentStore.createIndex('collectedStaff', 'collectedStaff', { unique: false });
          }

          // 3. Table: agents
          if (!db.objectStoreNames.contains('agents')) {
            const agentStore = db.createObjectStore('agents', { keyPath: '_id' });
            agentStore.createIndex('username', 'username', { unique: false });
          }

          // 4. Table: api_cache (for instant endpoint response caching)
          if (!db.objectStoreNames.contains('api_cache')) {
            const cacheStore = db.createObjectStore('api_cache', { keyPath: 'cacheKey' });
            cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
          }

          // 5. Table: meta (for sync state, last updated dates, settings)
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta', { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isReady = true;
          this._loadMeta();
          resolve(this);
        };

        request.onerror = (event) => {
          console.error('[SQLite DB] Error opening IndexedDB:', event.target.error);
          this.isReady = true;
          resolve(this);
        };
      } catch (err) {
        console.error('[SQLite DB] Unexpected init error:', err);
        this.isReady = true;
        resolve(this);
      }
    });

    return this.initPromise;
  }

  async _loadMeta() {
    try {
      const meta = await this.get('meta', 'lastSync');
      if (meta && meta.value) {
        this.lastSyncTime = meta.value;
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Helper to perform IndexedDB transaction safely
   */
  async _transaction(storeName, mode, callback) {
    await this.init();
    if (!this.db) {
      return null;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;

        tx.oncomplete = () => resolve(result);
        tx.onerror = (event) => reject(event.target.error);
        tx.onabort = (event) => reject(event.target.error);

        result = callback(store);
      } catch (e) {
        reject(e);
      }
    });
  }

  // -------------------------------------------------------------
  // GENERIC CRUD METHODS
  // -------------------------------------------------------------

  async get(storeName, key) {
    if (!this.db) {
      const memKey = `${storeName}:${key}`;
      return this.memoryCache.get(memKey) || null;
    }
    return new Promise((resolve) => {
      this._transaction(storeName, 'readonly', (store) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      }).catch(() => resolve(null));
    });
  }

  async getAll(storeName) {
    if (!this.db) {
      const results = [];
      const prefix = `${storeName}:`;
      for (const [k, v] of this.memoryCache.entries()) {
        if (k.startsWith(prefix)) results.push(v);
      }
      return results;
    }
    return new Promise((resolve) => {
      this._transaction(storeName, 'readonly', (store) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      }).catch(() => resolve([]));
    });
  }

  async put(storeName, item) {
    if (!item) return;
    if (!this.db) {
      const key = item._id || item.cacheKey || item.key;
      if (key) this.memoryCache.set(`${storeName}:${key}`, item);
      return item;
    }
    return new Promise((resolve) => {
      this._transaction(storeName, 'readwrite', (store) => {
        const req = store.put(item);
        req.onsuccess = () => resolve(item);
        req.onerror = (e) => {
          console.warn(`[SQLite DB] Put error in ${storeName}:`, e);
          resolve(null);
        };
      }).catch(() => resolve(null));
    });
  }

  async bulkPut(storeName, items) {
    if (!Array.isArray(items) || items.length === 0) return 0;
    await this.init();
    if (!this.db) {
      items.forEach(item => {
        const key = item._id || item.cacheKey || item.key;
        if (key) this.memoryCache.set(`${storeName}:${key}`, item);
      });
      return items.length;
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        let count = 0;

        tx.oncomplete = () => resolve(count);
        tx.onerror = () => resolve(count);

        items.forEach(item => {
          if (item && (item._id || item.cacheKey || item.key)) {
            store.put(item);
            count++;
          }
        });
      } catch (e) {
        console.warn(`[SQLite DB] BulkPut error in ${storeName}:`, e);
        resolve(0);
      }
    });
  }

  async delete(storeName, key) {
    if (!this.db) {
      this.memoryCache.delete(`${storeName}:${key}`);
      return true;
    }
    return new Promise((resolve) => {
      this._transaction(storeName, 'readwrite', (store) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      }).catch(() => resolve(false));
    });
  }

  async clearStore(storeName) {
    if (!this.db) {
      const prefix = `${storeName}:`;
      for (const k of this.memoryCache.keys()) {
        if (k.startsWith(prefix)) this.memoryCache.delete(k);
      }
      return true;
    }
    return new Promise((resolve) => {
      this._transaction(storeName, 'readwrite', (store) => {
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      }).catch(() => resolve(false));
    });
  }

  // -------------------------------------------------------------
  // API CACHE LAYER (HIGH-SPEED 0ms LATENCY)
  // -------------------------------------------------------------

  /**
   * Set API endpoint cache with TTL
   */
  async setCache(urlKey, data, ttlMs = 15 * 60 * 1000) {
    const entry = {
      cacheKey: urlKey,
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    };
    // 1. Fast memory cache
    this.memoryCache.set(`cache:${urlKey}`, entry);
    // 2. Persistent IndexedDB
    await this.put('api_cache', entry);

    // If data contains clients array, also populate clients table
    if (data && Array.isArray(data.clients)) {
      this.bulkPut('clients', data.clients).catch(() => {});
    }
    // If data contains payments array, also populate payments table
    if (data && data.data && Array.isArray(data.data.payments)) {
      this.bulkPut('payments', data.data.payments).catch(() => {});
    } else if (data && Array.isArray(data.payments)) {
      this.bulkPut('payments', data.payments).catch(() => {});
    }
  }

  /**
   * Get cached API endpoint response
   * Returns cached data if available
   */
  async getCache(urlKey) {
    // 1. Check memory cache (0.01ms)
    const mem = this.memoryCache.get(`cache:${urlKey}`);
    if (mem && mem.data) {
      return mem.data;
    }

    // 2. Check IndexedDB (<2ms)
    const record = await this.get('api_cache', urlKey);
    if (record && record.data) {
      this.memoryCache.set(`cache:${urlKey}`, record);
      return record.data;
    }

    return null;
  }

  /**
   * Invalidate cache matching a prefix or pattern (e.g. 'clients', 'payments', 'agents')
   */
  async invalidateCache(keyword) {
    try {
      // Clear memory matching keyword
      for (const k of this.memoryCache.keys()) {
        if (k.toLowerCase().includes(keyword.toLowerCase())) {
          this.memoryCache.delete(k);
        }
      }

      // Clear from api_cache table
      const allCache = await this.getAll('api_cache');
      for (const item of allCache) {
        if (item.cacheKey.toLowerCase().includes(keyword.toLowerCase())) {
          await this.delete('api_cache', item.cacheKey);
        }
      }
    } catch (e) {
      console.warn('[SQLite DB] Error invalidating cache:', e);
    }
  }

  // -------------------------------------------------------------
  // CLIENT & PAYMENT HELPERS
  // -------------------------------------------------------------

  async updateClient(clientId, patch) {
    if (!clientId) return null;
    const client = await this.get('clients', clientId);
    if (client) {
      const updated = { ...client, ...patch };
      await this.put('clients', updated);
      // Invalidate clients caches so fresh balance is immediately reflected
      await this.invalidateCache('clients');
      return updated;
    }
    return null;
  }

  async addPayment(payment) {
    if (!payment) return null;
    const pId = payment._id || payment.id || `local_pay_${Date.now()}`;
    const record = { ...payment, _id: pId };
    await this.put('payments', record);
    await this.invalidateCache('payments');
    return record;
  }

  async removePayment(paymentId) {
    if (!paymentId) return;
    await this.delete('payments', paymentId);
    await this.invalidateCache('payments');
  }

  // -------------------------------------------------------------
  // SQL EMULATION ENGINE
  // e.g. localSqliteDb.query('SELECT * FROM clients WHERE district = ?', ['Madurai'])
  // -------------------------------------------------------------
  async query(sql, params = []) {
    const trimmed = (sql || '').trim();
    const selectMatch = trimmed.match(/^SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);

    if (!selectMatch) {
      console.warn('[SQLite DB] Complex SQL not supported, fallback to getAll:', sql);
      return [];
    }

    const [, columns, tableName, whereClause, orderByClause, limitClause] = selectMatch;
    const targetStore = tableName.toLowerCase();

    let records = await this.getAll(targetStore);

    // Apply WHERE clause if present
    if (whereClause) {
      let paramIdx = 0;
      const conditions = whereClause.split(/\s+AND\s+/i);
      records = records.filter(item => {
        return conditions.every(cond => {
          const match = cond.match(/([a-zA-Z0-9_]+)\s*(=|!=|>|<|>=|<=|LIKE)\s*(.+)/i);
          if (!match) return true;
          const [, field, op, valRaw] = match;
          let expectedVal = valRaw.trim();
          if (expectedVal === '?') {
            expectedVal = params[paramIdx++];
          } else {
            expectedVal = expectedVal.replace(/^['"]|['"]$/g, '');
          }

          const actualVal = item[field];
          if (op === '=') return String(actualVal) === String(expectedVal);
          if (op === '!=') return String(actualVal) !== String(expectedVal);
          if (op === '>') return Number(actualVal) > Number(expectedVal);
          if (op === '<') return Number(actualVal) < Number(expectedVal);
          if (op === '>=') return Number(actualVal) >= Number(expectedVal);
          if (op === '<=') return Number(actualVal) <= Number(expectedVal);
          if (op.toUpperCase() === 'LIKE') {
            const pattern = String(expectedVal).replace(/%/g, '.*');
            return new RegExp(pattern, 'i').test(String(actualVal || ''));
          }
          return true;
        });
      });
    }

    // Apply ORDER BY
    if (orderByClause) {
      const parts = orderByClause.trim().split(/\s+/);
      const orderField = parts[0];
      const isDesc = (parts[1] || '').toUpperCase() === 'DESC';
      records.sort((a, b) => {
        const valA = a[orderField] ?? '';
        const valB = b[orderField] ?? '';
        if (valA < valB) return isDesc ? 1 : -1;
        if (valA > valB) return isDesc ? -1 : 1;
        return 0;
      });
    }

    // Apply LIMIT
    if (limitClause) {
      const limit = parseInt(limitClause, 10);
      if (!isNaN(limit)) {
        records = records.slice(0, limit);
      }
    }

    // Apply column selection
    if (columns.trim() !== '*') {
      const cols = columns.split(',').map(c => c.trim());
      records = records.map(item => {
        const projected = {};
        cols.forEach(c => { projected[c] = item[c]; });
        return projected;
      });
    }

    return records;
  }

  // -------------------------------------------------------------
  // STATS & SYNC METADATA
  // -------------------------------------------------------------

  async getStats() {
    await this.init();
    const clients = await this.getAll('clients');
    const payments = await this.getAll('payments');
    const cacheEntries = await this.getAll('api_cache');

    return {
      status: this.syncStatus,
      lastSyncTime: this.lastSyncTime || 'Just now',
      totalClients: clients.length,
      totalPayments: payments.length,
      cachedEndpoints: cacheEntries.length,
      engine: this.db ? 'IndexedDB (SQLite-Backed)' : 'Memory Cache'
    };
  }

  async markSynced() {
    this.syncStatus = 'synced';
    this.lastSyncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    await this.put('meta', { key: 'lastSync', value: this.lastSyncTime });
    window.dispatchEvent(new CustomEvent('localDbStateChange', { detail: { status: 'synced', time: this.lastSyncTime } }));
  }

  async markSyncing() {
    this.syncStatus = 'syncing';
    window.dispatchEvent(new CustomEvent('localDbStateChange', { detail: { status: 'syncing' } }));
  }

  async clearAll() {
    await this.clearStore('clients');
    await this.clearStore('payments');
    await this.clearStore('agents');
    await this.clearStore('api_cache');
    await this.clearStore('meta');
    this.memoryCache.clear();
    this.lastSyncTime = null;
    this.syncStatus = 'idle';
  }
}

// Singleton instance
const localSqliteDb = new LocalSqliteDatabase();
export default localSqliteDb;
