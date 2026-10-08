import React, { useEffect, useState } from 'react';
import {
  DownloadCloud,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { AppUpdateCheckResult } from '../../types';
import { registerBackHandler } from '../../lib/native';
import { MascotAvatar } from './MascotAvatar';

interface ForceUpdateModalProps {
  updateInfo: AppUpdateCheckResult | null;
  onCheckAgain: () => Promise<void>;
  onContinueWithGrace?: () => void;
  onDismissOptional?: () => void;
}

export const ForceUpdateModal: React.FC<ForceUpdateModalProps> = ({
  updateInfo,
  onCheckAgain,
  onContinueWithGrace,
  onDismissOptional,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If there is no update needed, do not render
  if (!updateInfo || (!updateInfo.isUpdateRequired && !updateInfo.isUpdateAvailable)) {
    return null;
  }

  const isHardBlocked = updateInfo.isHardBlocked;
  const isGraceActive = updateInfo.isGracePeriodActive;
  const daysLeft = updateInfo.daysRemaining;

  // Intercept Android hardware back button ONLY when hard-blocked
  // (when grace period is active, back button can dismiss the prompt)
  useEffect(() => {
    if (!isHardBlocked) return;

    const unregister = registerBackHandler(() => {
      // Consumes back press so user cannot bypass when hard blocked
      return true;
    });

    return () => {
      unregister();
    };
  }, [isHardBlocked]);

  const handleOpenUpdate = () => {
    try {
      const url = updateInfo.downloadUrl;
      if (typeof window !== 'undefined') {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch {
      setErrorMessage('Could not open update link directly. Please visit your app store.');
    }
  };

  const handleRecheck = async () => {
    setIsChecking(true);
    setErrorMessage(null);
    try {
      await onCheckAgain();
    } catch {
      setErrorMessage('Verification check failed. Please check your internet connection.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4">
        {/* Mascot & Status Badge */}
        <div className="relative">
          <div
            className={`w-20 h-20 rounded-2xl border flex items-center justify-center p-2 shadow-inner ${
              isHardBlocked
                ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/80'
                : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/80'
            }`}
          >
            <MascotAvatar size={56} />
          </div>
          <div
            className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md ${
              isHardBlocked ? 'bg-rose-600' : 'bg-amber-500'
            }`}
          >
            {isHardBlocked ? (
              <ShieldAlert className="w-4 h-4 text-white" />
            ) : (
              <Clock className="w-4 h-4 text-white animate-pulse" />
            )}
          </div>
        </div>

        {/* Title & Version Comparison */}
        <div className="space-y-1.5 w-full">
          {isHardBlocked ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Grace Period Expired</span>
            </div>
          ) : isGraceActive ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left in grace period
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60">
              <Sparkles className="w-3.5 h-3.5" />
              <span>New Version Available</span>
            </div>
          )}

          <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-1">
            {isHardBlocked ? 'Update Required to Continue' : 'New Update Available'}
          </h2>

          <div className="flex items-center justify-center gap-2 pt-0.5">
            <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-mono font-medium">
              Installed: v{updateInfo.currentVersion}
            </span>
            <span className="text-slate-400 text-xs font-bold">➔</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-bold border border-indigo-200 dark:border-indigo-800">
              Latest: v{updateInfo.latestVersion}
            </span>
          </div>
        </div>

        {/* 7-Day Grace Period Progress Visual (when grace active) */}
        {isGraceActive && (
          <div className="w-full bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl p-3 space-y-1.5 text-left">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-200">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>7-Day Update Window</span>
              </span>
              <span className="font-bold">
                {daysLeft} of 7 days left
              </span>
            </div>
            {/* Visual countdown track */}
            <div className="w-full bg-amber-200/60 dark:bg-amber-900/50 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(10, (daysLeft / 7) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-tight pt-0.5">
              You can continue using SSchedule right now. After {daysLeft} {daysLeft === 1 ? 'day' : 'days'}, updating will become mandatory.
            </p>
          </div>
        )}

        {/* Hard-block notice */}
        {isHardBlocked && (
          <div className="w-full bg-rose-50/80 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-2xl p-3 text-xs text-rose-700 dark:text-rose-300 text-left space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>Your 7-day grace window has ended</span>
            </p>
            <p className="text-[11px] leading-relaxed text-rose-600/90 dark:text-rose-300/90">
              To safeguard your study data and sync with the latest AI schedule features, please install the update to continue.
            </p>
          </div>
        )}

        {/* Release Notes */}
        {updateInfo.releaseNotes && updateInfo.releaseNotes.length > 0 && (
          <div className="w-full text-left bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
              What's New in v{updateInfo.latestVersion}
            </span>
            <ul className="space-y-1">
              {updateInfo.releaseNotes.map((note, index) => (
                <li key={index} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="leading-snug">{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorMessage && (
          <div className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 w-full text-center">
            {errorMessage}
          </div>
        )}

        {/* Actions */}
        <div className="w-full space-y-2 pt-1">
          {/* Primary Update Button */}
          <button
            type="button"
            onClick={handleOpenUpdate}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <DownloadCloud className="w-4 h-4" />
            <span>Update Now</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>

          {/* Grace Period Continue Button (active during 7 days) */}
          {isGraceActive && onContinueWithGrace && (
            <button
              type="button"
              onClick={onContinueWithGrace}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Continue Using App ({daysLeft} {daysLeft === 1 ? 'day' : 'days'} left)</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
            </button>
          )}

          {/* Re-check button */}
          <button
            type="button"
            onClick={handleRecheck}
            disabled={isChecking}
            className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors font-medium flex items-center justify-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking...' : 'I have already updated'}</span>
          </button>

          {/* Optional update dismiss */}
          {!updateInfo.isUpdateRequired && onDismissOptional && (
            <button
              type="button"
              onClick={onDismissOptional}
              className="w-full py-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors font-medium cursor-pointer"
            >
              Remind Me Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
