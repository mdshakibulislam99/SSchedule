import React, { useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Link2Off,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { GoogleCalendarSyncState } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface GoogleCalendarSyncScreenProps {
  calendarSync: GoogleCalendarSyncState;
  isSyncing: boolean;
  onBack: () => void;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onSyncNow: () => Promise<void>;
}

function formatLastSynced(iso?: string): string {
  if (!iso) return 'Not synced yet';
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return 'Not synced yet';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Synced ${hours} h ago`;
  return `Synced ${Math.floor(hours / 24)} d ago`;
}

export const GoogleCalendarSyncScreen: React.FC<GoogleCalendarSyncScreenProps> = ({
  calendarSync,
  isSyncing,
  onBack,
  onConnect,
  onDisconnect,
  onSyncNow,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      const msg = String(err?.message || err || '').toLowerCase();
      if (
        !msg.includes('popup_closed') &&
        !msg.includes('closed') &&
        !msg.includes('cancel') &&
        !msg.includes('popup window closed')
      ) {
        setError('Could not connect. Check the setup steps below and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const needReconnect = calendarSync.connected && calendarSync.lastSyncError === 'reconnect';

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col space-y-4 pb-8 animate-fade-in text-slate-900 dark:text-white">
      <header className="flex items-center gap-3 pt-2">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Google Calendar</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Two-way sync for your scheduled blocks
          </p>
        </div>
      </header>

      {/* Status card */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              calendarSync.connected
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            <CalendarClock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold">
              {calendarSync.connected ? 'Connected' : 'Not connected'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {calendarSync.connected
                ? calendarSync.email || 'Google Account'
                : 'Connect to sync events both ways'}
            </div>
          </div>
          {calendarSync.connected && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-1 rounded-full shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              Active
            </span>
          )}
        </div>

        {calendarSync.connected && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{formatLastSynced(calendarSync.lastSyncedAt)}</span>
            <span className="inline-flex items-center gap-1">
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing…' : 'Auto-sync every 2 min'}
            </span>
          </div>
        )}

        {needReconnect && (
          <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Google access expired. Reconnect to resume syncing.</span>
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {calendarSync.connected ? (
          <>
            <button
              onClick={() => run(onSyncNow)}
              disabled={busy || isSyncing}
              className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy || isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>{needReconnect ? 'Reconnect & Sync' : 'Sync now'}</span>
            </button>
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              disabled={busy}
              className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Link2Off className="w-4 h-4" />
              <span>Disconnect</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => run(onConnect)}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            <span>{busy ? 'Connecting…' : 'Connect Google Calendar'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-700 dark:text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* How it works */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-bold">How sync works</h2>
        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 font-bold">•</span>
            Blocks you add, edit, or delete here are written to your Google Calendar.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 font-bold">•</span>
            Events you add or change in Google Calendar appear here automatically.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 font-bold">•</span>
            Syncing runs every 2 minutes and whenever you return to the app.
          </li>
        </ul>
      </section>

      {/* Setup checklist */}
      <section className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold">One-time setup (Google Cloud)</h2>
        </div>
        <ol className="space-y-2 text-[11px] text-slate-600 dark:text-slate-300 list-decimal list-inside">
          <li>Enable the <b>Google Calendar API</b> in your Google Cloud project.</li>
          <li>
            On the OAuth consent screen add the scope{' '}
            <code className="font-mono text-[10px] bg-slate-200/70 dark:bg-slate-800 px-1 py-0.5 rounded">
              .../auth/calendar.events
            </code>{' '}
            and add your Google account as a test user.
          </li>
          <li>Add your app origin (e.g. <code className="font-mono text-[10px] bg-slate-200/70 dark:bg-slate-800 px-1 py-0.5 rounded">http://localhost:3000</code>) to the OAuth client's authorized JavaScript origins.</li>
        </ol>
      </section>

      <ConfirmDialog
        isOpen={showDisconnectConfirm}
        title="Disconnect Google Calendar?"
        description="Syncing between StudyAI and your Google Calendar will stop. Your existing calendar events are not deleted."
        confirmLabel="Disconnect"
        variant="warning"
        icon="alert"
        onConfirm={() => {
          setShowDisconnectConfirm(false);
          run(onDisconnect);
        }}
        onCancel={() => setShowDisconnectConfirm(false)}
      />
    </div>
  );
};
