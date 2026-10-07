import React, { useState } from 'react';
import { Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { resetPasswordWith } from '../../lib/firebase';

interface PasswordResetPanelProps {
  onBack: () => void;
  backLabel?: string;
  initialEmail?: string;
  showBack?: boolean;
}

// Password reset via Firebase's own reset-email link (no external services):
// enter the account email -> Firebase emails a reset link -> tap it to reset.
export const PasswordResetPanel: React.FC<PasswordResetPanelProps> = ({
  onBack,
  backLabel = 'Back to sign in',
  initialEmail = '',
  showBack = true,
}) => {
  const [email, setEmail] = useState<string>(initialEmail);
  const [sent, setSent] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    'w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:outline-none focus:border-indigo-500';

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your account email.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await resetPasswordWith(email.trim());
      setSent(true);
    } catch (err: any) {
      const code = String(err?.code || '');
      // Firebase returns "success" (and simply doesn't send) for emails that
      // aren't on the account, so user-not-found -> treat as sent (security
      // best practice: don't reveal whether an email is registered).
      if (code.includes('invalid-email')) {
        setError('Please enter a valid email address.');
      } else if (code.includes('user-not-found')) {
        setSent(true);
      } else if (code.includes('too-many-requests')) {
        setError('Too many requests. Please wait a moment and try again.');
      } else if (code.includes('unauthorized') || code.includes('invalid-continue')) {
        setError(`Could not send the reset email (${code}). Try Google sign-in instead.`);
      } else {
        const reason = String(err?.message || '').replace(/^Firebase:?\s*/, '').replace(/\s*\([^)]*\)$/, '').trim();
        setError(`Could not send the reset email (${code || 'error'}${reason ? ': ' + reason : ''}).`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="space-y-1 text-center">
        <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
          Reset your password
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {sent
            ? 'Check your inbox and tap the reset link to set a new password.'
            : "We'll email you a reset link — tap it to reset your password."}
        </p>
      </div>

      {sent ? (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>
            Reset link sent to <span className="font-bold">{email.trim()}</span>. Check your inbox
            (and spam folder).
          </span>
        </div>
      ) : (
        <>
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-2.5">
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@university.edu"
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isLoading ? 'Sending...' : 'Send reset link'}</span>
            </button>
          </form>
        </>
      )}

      {showBack && (
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={onBack}
            className="font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer"
          >
            {backLabel}
          </button>
        </p>
      )}
    </div>
  );
};
