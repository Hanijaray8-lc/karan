// prewarmService.js
// Background pre-warming and manual sync utility for Karan Finance

import localSqliteDb from './localSqliteDb';

const API_BASE = 'https://karanfinance.com/api';

/**
 * Pre-warm the local SQLite database in the background when the app starts or after login
 */
export async function prewarmLocalDatabase() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    localSqliteDb.markSyncing();

    // Silently pre-load clients and payments in parallel
    const headers = { 'Authorization': `Bearer ${token}` };

    const fetches = [
      fetch(`${API_BASE}/clients/all`, { headers }).catch(() => null),
      fetch(`${API_BASE}/payments/test/all`).catch(() => null),
      fetch(`${API_BASE}/clients/test/all`).catch(() => null)
    ];

    await Promise.allSettled(fetches);
    await localSqliteDb.markSynced();
  } catch (err) {
    console.warn('[Prewarm] Background pre-warm note:', err.message);
  }
}

/**
 * Force a fresh manual sync from the server to local SQLite DB
 */
export async function forceSyncAll() {
  const token = localStorage.getItem('token');
  localSqliteDb.markSyncing();

  try {
    // 1. Invalidate current caches to force fresh download
    await localSqliteDb.invalidateCache('clients');
    await localSqliteDb.invalidateCache('payments');
    await localSqliteDb.invalidateCache('agents');

    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    // 2. Fetch fresh data
    const [clientsRes, payRes] = await Promise.all([
      fetch(`${API_BASE}/clients/all`, { headers }).catch(() => null),
      fetch(`${API_BASE}/payments/test/all`).catch(() => null)
    ]);

    if (clientsRes && clientsRes.ok) {
      const cData = await clientsRes.json();
      await localSqliteDb.setCache('/api/clients/all', cData);
    }

    if (payRes && payRes.ok) {
      const pData = await payRes.json();
      await localSqliteDb.setCache('/api/payments/test/all', pData);
    }

    await localSqliteDb.markSynced();

    // Notify all open components to update their view with fresh data
    window.dispatchEvent(new CustomEvent('localDbSyncUpdated', { detail: { fullSync: true } }));

    return { success: true, message: 'Sync complete' };
  } catch (error) {
    console.error('[Sync] Force sync error:', error);
    return { success: false, message: error.message };
  }
}
