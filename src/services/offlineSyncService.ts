import {
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  OfflineQueueItem,
  OfflineSyncAction,
  OfflineSyncCollection,
  OfflineSyncStatus,
} from '../types';

const QUEUE_STORAGE_KEY = 'chronopulse_firestore_offline_queue';
const LAST_SYNCED_KEY = 'chronopulse_firestore_last_synced_at';
const MAX_RETRIES = 5;

type StatusListener = (status: OfflineSyncStatus) => void;

class OfflineSyncService {
  private queue: OfflineQueueItem[] = [];
  private activeUserId: string | null = null;
  private isSyncing = false;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private listeners: Set<StatusListener> = new Set();
  private debounceTimer: any = null;
  private retryTimer: any = null;
  private flushPromise: Promise<{
    success: boolean;
    processed: number;
    remaining: number;
  }> | null = null;

  constructor() {
    this.loadFromStorage();
    this.setupNetworkListeners();
  }

  /**
   * Initializes the service with the currently authenticated user's ID
   */
  public init(userId: string | null) {
    this.activeUserId = userId;
    this.loadFromStorage();
    this.notifySubscribers();

    if (userId && this.isOnline && this.queue.length > 0) {
      this.scheduleFlush(200);
    }
  }

  public setActiveUser(userId: string | null) {
    this.activeUserId = userId;
    this.notifySubscribers();
    if (userId && this.isOnline && this.queue.length > 0) {
      this.scheduleFlush(200);
    }
  }

  /**
   * Subscribes to sync status changes
   */
  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getStatus(): OfflineSyncStatus {
    const userPendingCount = this.activeUserId
      ? this.queue.filter((item) => item.userId === this.activeUserId).length
      : this.queue.length;

    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: userPendingCount,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  public getPendingQueue(): OfflineQueueItem[] {
    return [...this.queue];
  }

  /**
   * Enqueues an upsert (create or update) operation for a Firestore document
   */
  public enqueueUpsert(
    userId: string,
    collection: OfflineSyncCollection,
    docId: string,
    data: any
  ) {
    this.enqueue({
      userId,
      collection,
      docId,
      action: 'upsert',
      data: { ...data, updatedAt: new Date().toISOString() },
    });
  }

  /**
   * Enqueues a delete operation for a Firestore document
   */
  public enqueueDelete(
    userId: string,
    collection: OfflineSyncCollection,
    docId: string
  ) {
    this.enqueue({
      userId,
      collection,
      docId,
      action: 'delete',
    });
  }

  /**
   * Enqueues a batch of documents for upsert
   */
  public enqueueBatchUpsert(
    userId: string,
    collection: OfflineSyncCollection,
    items: Array<{ id: string; [key: string]: any }>
  ) {
    if (!items || items.length === 0) return;

    items.forEach((item) => {
      this.enqueue({
        userId,
        collection,
        docId: item.id,
        action: 'upsert',
        data: { ...item, updatedAt: new Date().toISOString() },
      });
    });
  }

  /**
   * Low-level enqueue with intelligent coalescing and deduplication
   */
  private enqueue(
    item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retryCount'>
  ) {
    const now = new Date().toISOString();

    // Check if an operation for this exact document is already pending in the queue
    const existingIndex = this.queue.findIndex(
      (q) =>
        q.userId === item.userId &&
        q.collection === item.collection &&
        q.docId === item.docId
    );

    if (existingIndex >= 0) {
      const existing = this.queue[existingIndex];

      if (item.action === 'delete') {
        // Coalesce: if previously upserting, convert to delete
        this.queue[existingIndex] = {
          ...existing,
          action: 'delete',
          data: undefined,
          timestamp: now,
          retryCount: 0,
        };
      } else {
        // Coalesce: update the payload to the latest state
        this.queue[existingIndex] = {
          ...existing,
          action: 'upsert',
          data: item.data,
          timestamp: now,
          retryCount: 0,
        };
      }
    } else {
      // Append new queue item
      const newItem: OfflineQueueItem = {
        id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: item.userId,
        collection: item.collection,
        docId: item.docId,
        action: item.action,
        data: item.data,
        timestamp: now,
        retryCount: 0,
      };
      this.queue.push(newItem);
    }

    this.saveToStorage();
    this.notifySubscribers();

    // If we're online and user is active, schedule debounced flush
    if (this.isOnline && this.activeUserId) {
      this.scheduleFlush(600);
    }
  }

  /**
   * Triggers immediate synchronization of pending queue
   */
  public async syncNow(): Promise<{ success: boolean; processed: number; remaining: number }> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    return this.flush();
  }

  /**
   * Clears the pending queue (useful for testing or full resets)
   */
  public clearQueue(userId?: string) {
    if (userId) {
      this.queue = this.queue.filter((q) => q.userId !== userId);
    } else {
      this.queue = [];
    }
    this.saveToStorage();
    this.notifySubscribers();
  }

  /**
   * Main synchronization worker. Concurrent callers (debounced
   * flush, network-restored flush, manual syncNow, logout) all
   * coalesce onto the same in-flight run — a second flush()
   * while one is running now WAITS for it instead of returning
   * early. Logout depends on this: it must not sign the user
   * out while writes are still in flight, or the Firestore
   * token is invalidated mid-write and the item is lost.
   */
  private flush(): Promise<{ success: boolean; processed: number; remaining: number }> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.runFlush().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private async runFlush(): Promise<{ success: boolean; processed: number; remaining: number }> {
    if (this.isSyncing) {
      return { success: false, processed: 0, remaining: this.queue.length };
    }

    // Refresh online status
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!this.isOnline) {
      this.notifySubscribers();
      return { success: false, processed: 0, remaining: this.queue.length };
    }

    if (this.queue.length === 0) {
      this.notifySubscribers();
      return { success: true, processed: 0, remaining: 0 };
    }

    this.isSyncing = true;
    // NOTE: lastError is deliberately NOT cleared here. Clearing it
    // upfront let a flush that only dropped failing items report a
    // clean state afterwards, so the badge showed green "Synced"
    // right after data had been lost. It is cleared only when at
    // least one item actually syncs (see processedCount below).
    this.notifySubscribers();

    let processedCount = 0;
    const itemsToProcess = [...this.queue];
    let sawPermissionError = false;

    for (const item of itemsToProcess) {
      // If we went offline mid-sync, halt
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.isOnline = false;
        break;
      }

      try {
        await this.syncItem(item);
        // On success, dequeue this item
        this.queue = this.queue.filter((q) => q.id !== item.id);
        this.saveToStorage();
        processedCount++;
        this.notifySubscribers();
      } catch (err: any) {
        console.warn(`[OfflineSync] Failed to sync item ${item.collection}/${item.docId}:`, err);
        const errMsg = err?.message || String(err);
        this.lastError = errMsg;

        // Check if error is network/offline related
        const isNetworkErr =
          errMsg.includes('client is offline') ||
          errMsg.includes('network-request-failed') ||
          errMsg.includes('unavailable') ||
          errMsg.includes('Failed to fetch');

        if (isNetworkErr) {
          this.isOnline = false;
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastError = errMsg;
          this.saveToStorage();
          break; // Stop loop and wait for connection restoration
        }

        // Permission errors are permanent until the Firestore rules
        // are fixed — and logout wipes the device copy, so dropping
        // the item would silently lose the data. Keep it queued
        // instead: it syncs automatically once rules are corrected,
        // and the badge keeps showing the error in the meantime.
        // Stop this pass since every remaining write fails identically.
        const isPermissionErr =
          errMsg.includes('permission-denied') ||
          errMsg.includes('PERMISSION_DENIED') ||
          errMsg.includes('insufficient permissions') ||
          errMsg.includes('Missing or insufficient permissions');
        if (isPermissionErr) {
          sawPermissionError = true;
          item.lastError = errMsg;
          this.saveToStorage();
          break;
        }

        // Increment retry count
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = errMsg;

        if (item.retryCount >= MAX_RETRIES) {
          console.error(`[OfflineSync] Dropping item after ${MAX_RETRIES} failures:`, item);
          this.queue = this.queue.filter((q) => q.id !== item.id);
        }
        this.saveToStorage();
      }
    }

    this.isSyncing = false;
    if (processedCount > 0) {
      this.lastSyncedAt = new Date().toISOString();
      // At least one write reached Firestore, so any earlier
      // error is resolved. (A flush that processed nothing keeps
      // its error visible — see the note above.)
      this.lastError = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_SYNCED_KEY, this.lastSyncedAt);
      }
    }

    this.notifySubscribers();

    // If items still remain and we are online, schedule a backoff retry.
    // Permission errors are permanent until rules change, so they back
    // off to once a minute instead of hammering Firestore every 5s.
    if (this.queue.length > 0 && this.isOnline) {
      this.retryTimer = setTimeout(() => {
        void this.flush();
      }, sawPermissionError ? 60_000 : 5_000);
    }

    return {
      success: this.queue.length === 0,
      processed: processedCount,
      remaining: this.queue.length,
    };
  }

  /**
   * Dispatches a single mutation to Firestore
   */
  private async syncItem(item: OfflineQueueItem): Promise<void> {
    const { userId, collection, docId, action, data } = item;

    if (action === 'delete') {
      const docRef = doc(db, 'users', userId, collection, docId);
      await deleteDoc(docRef);
      return;
    }

    // Upsert
    if (collection === 'profile') {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        ...data,
        id: userId,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return;
    }

    if (collection === 'integrations') {
      const intRef = doc(db, 'users', userId, 'integrations', docId);
      await setDoc(intRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return;
    }

    const docRef = doc(db, 'users', userId, collection, docId);
    await setDoc(docRef, { ...data, userId }, { merge: true });
  }

  private scheduleFlush(delayMs = 500) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, delayMs);
  }

  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('[OfflineSync] Network connection restored. Auto-flushing offline queue...');
      this.isOnline = true;
      this.notifySubscribers();
      this.scheduleFlush(300);
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineSync] Network connection lost. Queuing all Firestore mutations offline.');
      this.isOnline = false;
      this.isSyncing = false;
      this.notifySubscribers();
    });

    // Window focus / visibility change flush
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.isOnline = navigator.onLine;
        if (this.isOnline && this.queue.length > 0 && this.activeUserId) {
          this.scheduleFlush(300);
        }
      }
    });

    window.addEventListener('focus', () => {
      this.isOnline = navigator.onLine;
      if (this.isOnline && this.queue.length > 0 && this.activeUserId) {
        this.scheduleFlush(500);
      }
    });
  }

  private loadFromStorage() {
    if (typeof localStorage === 'undefined') return;

    try {
      const storedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (storedQueue) {
        this.queue = JSON.parse(storedQueue);
      }
      const storedLastSync = localStorage.getItem(LAST_SYNCED_KEY);
      if (storedLastSync) {
        this.lastSyncedAt = storedLastSync;
      }
    } catch (e) {
      console.warn('[OfflineSync] Error reading queue from storage:', e);
      this.queue = [];
    }
  }

  private saveToStorage() {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('[OfflineSync] Error writing queue to storage:', e);
    }
  }

  private notifySubscribers() {
    const status = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (e) {
        console.error('[OfflineSync] Error in listener callback:', e);
      }
    });
  }
}

export const offlineSyncService = new OfflineSyncService();
