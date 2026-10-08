import React, { useEffect, useRef } from 'react';
import { LogOut, Cloud, ShieldCheck, X, Loader2 } from 'lucide-react';
import { registerBackHandler } from '../../lib/native';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isLoggingOut?: boolean;
  userName?: string;
  userEmail?: string;
  isCloudSynced?: boolean;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoggingOut = false,
  userName,
  userEmail,
  isCloudSynced = false,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoggingOut) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const unregisterBack = registerBackHandler(() => {
      if (!isLoggingOut) {
        onClose();
        return true;
      }
      return true;
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unregisterBack();
    };
  }, [isOpen, isLoggingOut, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-dialog-title"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in"
      onClick={() => {
        if (!isLoggingOut) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-scale-in text-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dismiss Button */}
        {!isLoggingOut && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header Icon */}
        <div className="flex justify-center pt-1">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-inner">
            <LogOut className="w-8 h-8 ml-0.5" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 id="logout-dialog-title" className="text-lg font-bold text-slate-900 dark:text-white">
            Log Out of SSchedule?
          </h2>
          {userEmail && (
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate px-4">
              {userName ? `${userName} (${userEmail})` : userEmail}
            </p>
          )}
        </div>

        {/* Context / Cloud Status Notice */}
        {isCloudSynced ? (
          <div className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-left space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Cloud className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>Cloud Backup Active</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              Your tasks, courses, schedule, and study goals are safely stored in Google Cloud Firestore. They will automatically restore when you sign back in.
            </p>
            <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>Device cache will be cleared to protect your privacy.</span>
            </div>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 px-2">
            Are you sure you want to log out and return to the welcome screen?
          </p>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoggingOut}
            className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing Out...</span>
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4" />
                <span>Yes, Log Out</span>
              </>
            )}
          </button>

          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            disabled={isLoggingOut}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            Stay Signed In
          </button>
        </div>
      </div>
    </div>
  );
};
