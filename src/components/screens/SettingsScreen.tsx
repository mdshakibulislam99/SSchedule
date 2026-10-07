import React, { useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  User,
  Sliders,
  Bell,
  Moon,
  Sun,
  Shield,
  HelpCircle,
  BrainCircuit,
  CalendarClock,
  Clock,
  LogOut,
  RotateCcw,
  Download,
  UploadCloud,
  Check,
  Smartphone,
  RefreshCw,
  DownloadCloud,
  AlertTriangle,
} from 'lucide-react';
import { UserProfile, AIProviderConfig, GoogleCalendarSyncState, NotificationSettings, AppUpdateCheckResult } from '../../types';
import { StudyStorage, ThemeMode } from '../../utils/storage';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PasswordResetPanel } from '../common/PasswordResetPanel';
import { CURRENT_APP_VERSION, CURRENT_BUILD_NUMBER, getActiveAppVersion, setSimulatedAppVersion } from '../../utils/version';
import { AppUpdateService } from '../../services/appUpdateService';
import { OfflineSyncBadge } from '../OfflineSyncBadge';
import { GoogleIcon } from './OnboardingFlow';

interface SettingsScreenProps {
  user: UserProfile;
  config: AIProviderConfig;
  calendarSync: GoogleCalendarSyncState;
  notificationSettings?: NotificationSettings;
  updateInfo?: AppUpdateCheckResult | null;
  onCheckUpdates?: () => Promise<void>;
  onBack: () => void;
  onOpenAIProvider: () => void;
  onOpenNotifications: () => void;
  onOpenAIMemory: () => void;
  onOpenCalendarSync: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  isDark: boolean;
  onResetData: () => void;
  isFirebaseSynced: boolean;
  firebaseEmail?: string | null;
  onGoogleSignIn: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  user,
  config,
  calendarSync,
  notificationSettings,
  updateInfo,
  onCheckUpdates,
  onBack,
  onOpenAIProvider,
  onOpenNotifications,
  onOpenAIMemory,
  onOpenCalendarSync,
  themeMode,
  onThemeModeChange,
  isDark,
  onResetData,
  isFirebaseSynced,
  firebaseEmail,
  onGoogleSignIn,
}) => {
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetPasswordPanel, setShowResetPasswordPanel] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);
  const [showDevVersionControls, setShowDevVersionControls] = useState(false);
  const activeVersion = getActiveAppVersion();

  const handleManualCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateFeedback(null);
    try {
      if (onCheckUpdates) {
        await onCheckUpdates();
      } else {
        const res = await AppUpdateService.checkAppVersion();
        if (res.isUpdateRequired) {
          setUpdateFeedback(`Update required! v${res.latestVersion} is mandatory.`);
        } else if (res.isUpdateAvailable) {
          setUpdateFeedback(`Update available: v${res.latestVersion}`);
        } else {
          setUpdateFeedback(`App is up to date (v${res.currentVersion}).`);
        }
      }
    } catch {
      setUpdateFeedback('Could not check for updates.');
    } finally {
      setIsCheckingUpdate(false);
      setTimeout(() => setUpdateFeedback(null), 4000);
    }
  };

  const handleSimulateVersion = async (version: string | null) => {
    setSimulatedAppVersion(version);
    if (onCheckUpdates) {
      await onCheckUpdates();
    }
  };

  const handleToggleGraceExpired = async (expired: boolean) => {
    AppUpdateService.setSimulatedGraceExpired(expired);
    if (onCheckUpdates) {
      await onCheckUpdates();
    }
  };

  const handleResetGracePeriod = async () => {
    AppUpdateService.resetGracePeriod(updateInfo?.latestVersion || '2.0.0');
    if (onCheckUpdates) {
      await onCheckUpdates();
    }
  };

  const handleToggleForcePolicy = async (force: boolean) => {
    setIsCheckingUpdate(true);
    if (force) {
      // Local sandbox override: the packaged app reads GitHub Releases, so
      // "a server requiring v2.0.0" is simulated on-device instead of POSTed.
      AppUpdateService.setPolicyOverride({
        latestVersion: '2.0.0',
        minRequiredVersion: '2.0.0',
        forceUpdate: true,
        gracePeriodDays: 7,
      });
    } else {
      // Restore the real GitHub feed (clears latest/min/force override).
      AppUpdateService.clearPolicyOverride();
    }
    if (onCheckUpdates) {
      await onCheckUpdates();
    }
    setIsCheckingUpdate(false);
  };

  const handleDownloadBackup = () => {
    const jsonStr = StudyStorage.exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronopulse_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupSuccess('Backup downloaded successfully!');
    setTimeout(() => setBackupSuccess(null), 3500);
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const success = StudyStorage.importBackup(text);
      if (success) {
        setBackupSuccess('Backup restored successfully! Reloading workspace...');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setBackupError('Invalid backup file. Please select a valid ChronoPulse backup JSON file.');
        setTimeout(() => setBackupError(null), 4000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-full flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center gap-1 pt-2">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
      </div>

      {/* Settings Menu List (Matching Screen 16) */}
      <div className="space-y-2">
        {/* Account: sign-in state + in-app password reset */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{user.name}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {isFirebaseSynced
                    ? `Signed in as ${firebaseEmail || user.email}`
                    : 'Not signed in — your data stays on this device'}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${isFirebaseSynced ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
              {isFirebaseSynced ? 'Synced' : 'Offline'}
            </span>
          </div>

          {!isFirebaseSynced && !showResetPasswordPanel && (
            <div className="space-y-2">
              <button
                onClick={onGoogleSignIn}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <GoogleIcon className="w-4 h-4" />
                Sign in with Google
              </button>
              <button
                onClick={() => setShowResetPasswordPanel(true)}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer"
              >
                Forgot password? Send reset link
              </button>
            </div>
          )}

          {showResetPasswordPanel && (
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
              <PasswordResetPanel
                initialEmail={user.email}
                backLabel="Close"
                onBack={() => setShowResetPasswordPanel(false)}
              />
            </div>
          )}
        </div>
        {/* AI Provider */}
        <button
          onClick={onOpenAIProvider}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">AI Provider</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                {config.activeProvider === 'puter' ? 'Puter.js (Free)' : config.activeProvider}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* AI Memory (Section 25) */}
        <button
          onClick={onOpenAIMemory}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">AI Memory</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                View what StudyAI remembers about your study rhythm
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* Notifications */}
        <button
          onClick={onOpenNotifications}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Notification Settings</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {notificationSettings
                  ? `${notificationSettings.soundEnabled ? 'Audio Chime' : 'Silent'} · ${notificationSettings.advanceNoticeMinutes}m advance notice · ${notificationSettings.taskReminders ? 'Active' : 'Muted'}`
                  : 'Task reminders, class alerts, quiet hours & audio chimes'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                notificationSettings?.taskReminders || notificationSettings?.deadlineAlerts
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {notificationSettings?.soundEnabled ? 'Chime On' : 'Active'}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </button>

        {/* Google Calendar Sync */}
        <button
          onClick={onOpenCalendarSync}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Google Calendar</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {calendarSync.connected
                  ? `Synced${calendarSync.email ? ` · ${calendarSync.email}` : ''}`
                  : 'Two-way sync with your Google Calendar'}
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-full ${
              calendarSync.connected
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {calendarSync.connected ? 'On' : 'Off'}
          </span>
        </button>

        {/* Appearance (Theme) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                isDark
                  ? 'bg-indigo-950/60 text-indigo-400'
                  : 'bg-amber-100 text-amber-600'
              }`}
            >
              {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Appearance (Theme)</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {themeMode === 'default'
                  ? `Auto — currently ${isDark ? 'Night 🌙' : 'Bright ☀️'}`
                  : themeMode === 'bright'
                    ? 'Always Bright ☀️'
                    : 'Always Night 🌙'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { mode: 'default' as const, label: 'Default', desc: 'Auto by time', Icon: Clock },
                { mode: 'bright' as const, label: 'Bright', desc: 'Always day', Icon: Sun },
                { mode: 'night' as const, label: 'Night', desc: 'Always dark', Icon: Moon },
              ]
            ).map(({ mode, label, desc, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => onThemeModeChange(mode)}
                aria-pressed={themeMode === mode}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  themeMode === mode
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300'
                    : 'border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                <span className="text-[10px] font-normal opacity-70">{desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* App Version & Mandatory Updates */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">App Version & Updates</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Installed: <span className="font-mono font-semibold">v{activeVersion}</span> (Build {CURRENT_BUILD_NUMBER})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualCheckUpdates}
            disabled={isCheckingUpdate}
            className="py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>{isCheckingUpdate ? 'Checking...' : 'Check'}</span>
          </button>
        </div>

        {updateFeedback && (
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{updateFeedback}</span>
          </div>
        )}

        {/* Developer / Simulation Mode */}
        <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowDevVersionControls(!showDevVersionControls)}
            className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-between w-full pt-1"
          >
            <span>Update Policy & Simulation Controls</span>
            <span>{showDevVersionControls ? '▲' : '▼'}</span>
          </button>

          {showDevVersionControls && (
            <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2 text-xs">
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                Test the mandatory force-update system as a student or adjust the local update policy:
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSimulateVersion('0.9.0')}
                  className="py-2 px-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 font-medium text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Simulate Old (v0.9.0)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulateVersion(null)}
                  className="py-2 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 font-medium text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>Reset to v{CURRENT_APP_VERSION}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleToggleGraceExpired(false)}
                  className="py-2 px-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 font-medium text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>⏱️ Active 7-Day Grace</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleGraceExpired(true)}
                  className="py-2 px-2.5 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-900 font-medium text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>🛑 Grace Expired (Block)</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleToggleForcePolicy(true)}
                  className="py-1.5 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <DownloadCloud className="w-3 h-3" />
                  <span>Require v2.0.0 (7-Day Grace)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleForcePolicy(false)}
                  className="py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Restore GitHub Feed</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Firestore Cloud & Offline Resilience */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Cloud Sync & Offline Resilience
          </h3>
        </div>
        <OfflineSyncBadge userId={user.firebaseUid} />
      </div>

      {/* Data Backup & Restore */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Workspace Backup & Restore</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Export your study data as a JSON file or restore from a previous backup.
            </p>
          </div>
        </div>

        {backupSuccess && (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{backupSuccess}</span>
          </div>
        )}

        {backupError && (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1.5 animate-fade-in">
            <AlertTriangle className="w-4 h-4" />
            <span>{backupError}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Backup (.json)</span>
          </button>

          <label className="flex-1 py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-indigo-200/60 dark:border-indigo-800">
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Restore Backup</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Reset Seed Demo Data Button */}
      <div className="pt-2">
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full py-3 rounded-2xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Sample Demo Data</span>
        </button>
      </div>

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset all app data?"
        description="This clears every saved task, course, schedule event, note, and preference on this device and reloads the app. This can't be undone."
        confirmLabel="Reset everything"
        onConfirm={onResetData}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
