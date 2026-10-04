import { useState, useEffect, useCallback } from 'react';
import { offlineSyncService } from '../services/offlineSyncService';
import { OfflineSyncStatus } from '../types';

export function useOfflineSync(userId?: string | null) {
  const [status, setStatus] = useState<OfflineSyncStatus>(() => offlineSyncService.getStatus());

  useEffect(() => {
    if (userId !== undefined) {
      offlineSyncService.setActiveUser(userId || null);
    }
  }, [userId]);

  useEffect(() => {
    const unsubscribe = offlineSyncService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  const syncNow = useCallback(async () => {
    return await offlineSyncService.syncNow();
  }, []);

  const clearQueue = useCallback(() => {
    offlineSyncService.clearQueue(userId || undefined);
  }, [userId]);

  return {
    ...status,
    syncNow,
    clearQueue,
    getPendingQueue: () => offlineSyncService.getPendingQueue(),
  };
}
