import React, { useEffect, useState } from 'react';
import {
  DownloadCloud,
  RefreshCw,
  ExternalLink,
  X,
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

  const isHardBlocked = Boolean(updateInfo?.isHardBlocked);

  // Intercept Android hardware back button ONLY when hard-blocked
  useEffect(() => {
    if (!isHardBlocked) return;

    const unregister = registerBackHandler(() => {
      return true;
    });

    return () => {
      unregister();
    };
  }, [isHardBlocked]);

  // If there is no update needed, do not render
  if (!updateInfo || (!updateInfo.isUpdateRequired && !updateInfo.isUpdateAvailable)) {
    return null;
  }

  const handleDismiss = () => {
    if (isHardBlocked) return;
    if (onContinueWithGrace) {
      onContinueWithGrace();
    } else if (onDismissOptional) {
      onDismissOptional();
    }
  };

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
      className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col items-center text-center space-y-4 relative animate-scale-in">
        {/* Dismiss 'X' Button when not hard-blocked */}
        {!isHardBlocked && (
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Clean Avatar Icon */}
        <div className="pt-1">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center p-2 shadow-inner">
            <MascotAvatar size={48} />
          </div>
        </div>

        {/* Title & Version */}
        <div className="space-y-1.5 w-full">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {isHardBlocked ? 'Update Required' : 'Update Available'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed px-2">
            {isHardBlocked
              ? 'Please update SSchedule to the latest version to continue.'
              : 'A new version of SSchedule is available to install.'}
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300">
            <span>v{updateInfo?.currentVersion || '3.1.0'}</span>
            <span className="text-slate-400">→</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">v{updateInfo?.latestVersion || '3.1.0'}</span>
          </div>
        </div>

        {errorMessage && (
          <div className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 w-full text-center">
            {errorMessage}
          </div>
        )}

        {/* Actions: Clean & Simple with Single-Line Buttons */}
        <div className="w-full space-y-2 pt-1">
          <div className="flex items-center gap-2.5 w-full">
            {!isHardBlocked && (
              <button
                type="button"
                onClick={handleDismiss}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap text-center"
              >
                Later
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenUpdate}
              className={`py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                isHardBlocked ? 'w-full' : 'flex-1'
              }`}
            >
              <DownloadCloud className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Update Now</span>
            </button>
          </div>

          {/* Subtle recheck link */}
          <button
            type="button"
            onClick={handleRecheck}
            disabled={isChecking}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors py-0.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking...' : 'Already updated? Check again'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
