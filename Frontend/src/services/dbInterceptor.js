// dbInterceptor.js
// Transparent Network Interceptor for Karan Finance
// Automatically routes fetch() and axios calls through localSqliteDb
// Provides instant 0ms responses from local SQLite DB and synchronizes in the background.

import axios from 'axios';
import localSqliteDb from './localSqliteDb';

// Revalidation state tracking
const revalidatingSet = new Set();
const lastRevalidationTime = new Map();
const REVALIDATION_THROTTLE_MS = 10000; // Do not revalidate the same endpoint more than once every 10 seconds

/**
 * Check if a URL is an internal API endpoint that benefits from local database caching
 */
function isCacheableApiUrl(urlStr, method = 'GET') {
  if (method !== 'GET') return false;
  if (!urlStr || typeof urlStr !== 'string') return false;

  // Exclude auth / login / session checks from aggressive caching
  if (urlStr.includes('/auth/login') || urlStr.includes('/auth/face-login') || urlStr.includes('/auth/logout')) {
    return false;
  }

  // Endpoints that contain bulk data
  return (
    urlStr.includes('/api/clients') ||
    urlStr.includes('/api/payments') ||
    urlStr.includes('/api/agents') ||
    urlStr.includes('/api/admin') ||
    urlStr.includes('/api/managers')
  );
}

/**
 * Normalize URL to a consistent cache key
 */
function getCacheKey(urlStr) {
  try {
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
      const parsed = new URL(urlStr);
      return `${parsed.pathname}${parsed.search}`;
    }
    return urlStr;
  } catch (e) {
    return urlStr;
  }
}

/**
 * Detect mutations and invalidate corresponding local database tables
 */
async function handleMutation(urlStr, method, responseData) {
  const upperMethod = (method || '').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(upperMethod)) {
    const key = (urlStr || '').toLowerCase();

    if (key.includes('/payments')) {
      await localSqliteDb.invalidateCache('payments');
      await localSqliteDb.invalidateCache('clients');
      localSqliteDb.markSynced();
    } else if (key.includes('/clients')) {
      await localSqliteDb.invalidateCache('clients');
      localSqliteDb.markSynced();
    } else if (key.includes('/agents')) {
      await localSqliteDb.invalidateCache('agents');
      localSqliteDb.markSynced();
    }

    // Notify any listening components that data was mutated
    window.dispatchEvent(new CustomEvent('localDbMutation', {
      detail: { url: urlStr, method: upperMethod, data: responseData }
    }));
  }
}

/**
 * Background silent revalidation using original fetch
 */
function triggerBackgroundFetch(url, init, cacheKey, originalFetch) {
  const now = Date.now();
  const lastTime = lastRevalidationTime.get(cacheKey) || 0;

  if (revalidatingSet.has(cacheKey) || (now - lastTime < REVALIDATION_THROTTLE_MS)) {
    return; // Already revalidating or recently checked
  }

  revalidatingSet.add(cacheKey);
  lastRevalidationTime.set(cacheKey, now);
  localSqliteDb.markSyncing();

  originalFetch(url, init)
    .then(async (response) => {
      if (response && response.ok) {
        try {
          const freshData = await response.json();
          const prevData = await localSqliteDb.getCache(cacheKey);

          // Update cache with fresh server response
          await localSqliteDb.setCache(cacheKey, freshData);
          await localSqliteDb.markSynced();

          // If content changed meaningfully, notify components
          const prevStr = JSON.stringify(prevData);
          const freshStr = JSON.stringify(freshData);
          if (prevStr !== freshStr) {
            window.dispatchEvent(new CustomEvent('localDbSyncUpdated', {
              detail: { cacheKey, url }
            }));
          }
        } catch (e) {
          // JSON parse failed on background revalidation
        }
      }
    })
    .catch((err) => {
      // Background network failure (offline / timeout) - safe to ignore since cached data is already displayed
    })
    .finally(() => {
      revalidatingSet.delete(cacheKey);
    });
}

/**
 * Initialize Fetch Interceptor
 */
function installFetchInterceptor() {
  if (typeof window === 'undefined' || !window.fetch) return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

    // Check if this is a cacheable API GET request
    if (isCacheableApiUrl(url, method)) {
      const cacheKey = getCacheKey(url);

      try {
        const cachedData = await localSqliteDb.getCache(cacheKey);

        if (cachedData !== null && cachedData !== undefined) {
          // INSTANT CACHE HIT: Return standard Response immediately (<1ms)
          const responseBody = JSON.stringify(cachedData);
          const cachedResponse = new Response(responseBody, {
            status: 200,
            statusText: 'OK',
            headers: new Headers({
              'Content-Type': 'application/json',
              'X-SQLite-Local': 'HIT',
              'X-Cache-Key': cacheKey
            })
          });

          // Trigger background silent revalidation
          triggerBackgroundFetch(url, init, cacheKey, originalFetch);

          return cachedResponse;
        }
      } catch (err) {
        console.warn('[SQLite Interceptor] Cache lookup failed, falling back to network:', err);
      }
    }

    // Network execution
    try {
      const response = await originalFetch(input, init);

      // Handle mutations (POST/PUT/DELETE)
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && url.includes('/api/')) {
        try {
          const clone = response.clone();
          clone.json().then(data => handleMutation(url, method, data)).catch(() => handleMutation(url, method, null));
        } catch (e) {
          handleMutation(url, method, null);
        }
      }

      // Handle successful GET response caching
      if (response && response.ok && isCacheableApiUrl(url, method)) {
        try {
          const cacheKey = getCacheKey(url);
          const clone = response.clone();
          clone.json().then(data => {
            localSqliteDb.setCache(cacheKey, data);
            localSqliteDb.markSynced();
          }).catch(() => {});
        } catch (e) {}
      }

      return response;
    } catch (networkError) {
      // In case of network failure (offline / server sleeping), try returning stale cache
      if (isCacheableApiUrl(url, method)) {
        const cacheKey = getCacheKey(url);
        const staleData = await localSqliteDb.getCache(cacheKey);
        if (staleData) {
          console.warn('[SQLite Interceptor] Network failed, serving offline cache for:', url);
          return new Response(JSON.stringify(staleData), {
            status: 200,
            statusText: 'OK (Offline Cache)',
            headers: new Headers({
              'Content-Type': 'application/json',
              'X-SQLite-Local': 'OFFLINE-HIT'
            })
          });
        }
      }
      throw networkError;
    }
  };
}

/**
 * Initialize Axios Interceptor
 */
function installAxiosInterceptor() {
  if (!axios) return;

  // Resolve base adapter
  let baseAdapter;
  if (typeof axios.getAdapter === 'function') {
    baseAdapter = axios.getAdapter(axios.defaults.adapter);
  } else if (typeof axios.defaults.adapter === 'function') {
    baseAdapter = axios.defaults.adapter;
  }

  if (baseAdapter) {
    axios.defaults.adapter = async (config) => {
      const method = (config.method || 'get').toUpperCase();
      const url = config.url || '';

      if (isCacheableApiUrl(url, method)) {
        const cacheKey = getCacheKey(url);
        try {
          const cachedData = await localSqliteDb.getCache(cacheKey);
          if (cachedData !== null && cachedData !== undefined) {
            // Trigger background revalidation with base adapter
            const now = Date.now();
            const lastTime = lastRevalidationTime.get(cacheKey) || 0;
            if (!revalidatingSet.has(cacheKey) && (now - lastTime >= REVALIDATION_THROTTLE_MS)) {
              revalidatingSet.add(cacheKey);
              lastRevalidationTime.set(cacheKey, now);
              localSqliteDb.markSyncing();

              baseAdapter(config)
                .then(async (freshRes) => {
                  if (freshRes && freshRes.status >= 200 && freshRes.status < 300) {
                    await localSqliteDb.setCache(cacheKey, freshRes.data);
                    await localSqliteDb.markSynced();
                  }
                })
                .catch(() => {})
                .finally(() => {
                  revalidatingSet.delete(cacheKey);
                });
            }

            // Return cached response instantly in Axios format
            return {
              data: cachedData,
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json', 'x-sqlite-local': 'HIT' },
              config,
              request: {}
            };
          }
        } catch (e) {
          // fallback to baseAdapter
        }
      }

      // Execute network request
      try {
        const response = await baseAdapter(config);

        if (response && response.status >= 200 && response.status < 300) {
          if (isCacheableApiUrl(url, method)) {
            const cacheKey = getCacheKey(url);
            localSqliteDb.setCache(cacheKey, response.data);
            localSqliteDb.markSynced();
          } else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            handleMutation(url, method, response.data);
          }
        }

        return response;
      } catch (err) {
        // Offline fallback for Axios
        if (isCacheableApiUrl(url, method)) {
          const cacheKey = getCacheKey(url);
          const staleData = await localSqliteDb.getCache(cacheKey);
          if (staleData) {
            return {
              data: staleData,
              status: 200,
              statusText: 'OK (Offline Cache)',
              headers: { 'content-type': 'application/json', 'x-sqlite-local': 'OFFLINE-HIT' },
              config,
              request: {}
            };
          }
        }
        throw err;
      }
    };
  }
}

// Auto-install immediately on script evaluation
installFetchInterceptor();
installAxiosInterceptor();
localSqliteDb.init().catch(console.error);

export { installFetchInterceptor, installAxiosInterceptor };
export default localSqliteDb;
