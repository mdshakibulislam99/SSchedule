import React, { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle, ChevronRight, X } from 'lucide-react';
import { useOfflineSync } from '../hooks/useOfflineSync';

interface OfflineSyncBadgeProps {
  userId?: string | null;
  compact?: boolean;
}

export const OfflineSyncBadge: React.FC<OfflineSyncBadgeProps> = ({ userId, compact = false }) => {
  const { isOnline, isSyncing, pendingCount, lastSyncedAt, lastError, syncNow } = useOfflineSync(userId);
  const [isOpen, setIsOpen] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);

  const handleManualSync = async () => {
    setManualSyncing(true);
    try {
      await syncNow();
    } finally {
      setManualSyncing(false);
    }
  };

  const formattedLastSync = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Not yet';

  if (compact) {
    if (!isOnline) {
      return (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer"
          title="Offline Mode — Changes queued locally"
        >
          <CloudOff className="w-3.5 h-3.5 animate-pulse" />
          <span>Offline{pendingCount > 0 ? ` (${pendingCount})` : ''}</span>
        </button>
      );
    }

    if (isSyncing || manualSyncing) {
      return (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all cursor-pointer"
          title="Syncing changes with Firestore..."
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
          <span>Syncing{pendingCount > 0 ? ` (${pendingCount})` : ''}</span>
        </button>
      );
    }

    if (pendingCount > 0) {
      return (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-all cursor-pointer"
          title="Pending changes queued"
        >
          <Cloud className="w-3.5 h-3.5" />
          <span>{pendingCount} Queued</span>
        </button>
      );
    }

    // Default clean state
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer"
        title={`All changes synced (Last: ${formattedLastSync})`}
      >
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        <span className="hidden sm:inline">Synced</span>
      </button>
    );
  }

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
          !isOnline
            ? 'bg-amber-500/5 border-amber-500/30 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200'
            : isSyncing || manualSyncing
            ? 'bg-indigo-500/5 border-indigo-500/30 dark:bg-indigo-500/10 text-indigo-900 dark:text-indigo-200'
            : pendingCount > 0
            ? 'bg-sky-500/5 border-sky-500/30 dark:bg-sky-500/10 text-sky-900 dark:text-sky-200'
            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              !isOnline
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : isSyncing || manualSyncing
                ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                : pendingCount > 0
                ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {!isOnline ? (
              <CloudOff className="w-5 h-5" />
            ) : isSyncing || manualSyncing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : pendingCount > 0 ? (
              <Cloud className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              {!isOnline
                ? 'Offline Mode Active'
                : isSyncing || manualSyncing
                ? 'Syncing with Firestore...'
                : pendingCount > 0
                ? `${pendingCount} Changes Queued`
                : 'Cloud Data In Sync'}
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                  {pendingCount}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {!isOnline
                ? 'Changes are safely stored offline and will auto-sync when online.'
                : pendingCount > 0
                ? 'Changes are in queue and syncing to your cloud database.'
                : `Last synchronized: ${formattedLastSync}`}
            </p>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
      </div>

      {/* Details & Actions Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    !isOnline
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {!isOnline ? <CloudOff className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Offline Resilience & Sync
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Firestore Auto-Synchronization Engine
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Connection Status</span>
                  <span className={`font-semibold flex items-center gap-1.5 ${isOnline ? 'text-emerald-500' : 'text-amber-500'}`}>
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    {isOnline ? 'Online (Connected)' : 'Offline (Disconnected)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Pending Changes in Queue</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {pendingCount} items
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Last Synced</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formattedLastSync}
                  </span>
                </div>
                {lastError && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-start gap-1.5 text-xs text-rose-500">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{lastError}</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                <p className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  🛡️ Zero Data Loss Guarantee
                </p>
                <p>
                  Any tasks, schedule adjustments, course updates, and notes you create while offline are securely queued in local persistent storage. As soon as your internet connection is restored, the queue will automatically synchronize everything with Firestore.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleManualSync}
                disabled={!isOnline || isSyncing || manualSyncing}
                className="flex-1 py-2.5 px-4 rounded-xl font-medium text-xs text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || manualSyncing ? 'animate-spin' : ''}`} />
                {isSyncing || manualSyncing ? 'Synchronizing...' : 'Sync Now'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="py-2.5 px-4 rounded-xl font-medium text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
