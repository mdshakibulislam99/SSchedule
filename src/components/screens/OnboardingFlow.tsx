import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Sparkles,
  User,
  ChevronLeft,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { MascotAvatar } from '../mobile/MascotAvatar';
import { UserProfile } from '../../types';
import { registerBackHandler } from '../../lib/native';
import {
  signInWithGoogle,
  createAccountWithEmail,
  signInWithEmail,
} from '../../lib/firebase';

interface OnboardingFlowProps {
  onComplete: (user: UserProfile) => void;
  initialUser: UserProfile;
}

const STUDY_FIELDS = [
  { id: 'Computer Science', label: 'Computer Science', icon: '💻' },
  { id: 'Business', label: 'Business', icon: '📊' },
  { id: 'Engineering', label: 'Engineering', icon: '⚙️' },
  { id: 'Medicine', label: 'Medicine', icon: '🩺' },
  { id: 'Other', label: 'Other', icon: '📚' },
];

const STUDY_GOALS = [
  { id: 'Finish assignments', label: 'Finish assignments', icon: '📝' },
  { id: 'Study for exams', label: 'Study for exams', icon: '🎯' },
  { id: 'Work on projects', label: 'Work on projects', icon: '🚀' },
  { id: 'Improve grades', label: 'Improve grades', icon: '📈' },
  { id: 'Other', label: 'Other', icon: '💡' },
];

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete, initialUser }) => {
  const [step, setStep] = useState<number>(1);
  const [selectedField, setSelectedField] = useState<string>(initialUser.studyField || 'Computer Science');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(initialUser.goals || ['Finish assignments']);
  const [name, setName] = useState<string>(initialUser.name || '');
  const [university, setUniversity] = useState<string>(initialUser.university || '');
  const [year, setYear] = useState<string>(initialUser.year || '1st Year');

  // Firebase Auth State
  const [authEmail, setAuthEmail] = useState<string>(initialUser.email || '');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authMode, setAuthMode] = useState<'create' | 'login'>('create');
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [firebaseUid, setFirebaseUid] = useState<string | undefined>(initialUser.firebaseUid);
  const [photoURL, setPhotoURL] = useState<string | undefined>(initialUser.photoURL);

  // Mirror the in-app back chevron on the Android hardware back button. Returning
  // false on the first step lets the press fall through and exit the app.
  useEffect(() => {
    return registerBackHandler(() => {
      if (step <= 1) return false;
      setStep(step - 1);
      return true;
    });
  }, [step]);

  const toggleGoal = (goal: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  // Google Sign-In handler
  const handleGoogleAuth = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMsg(null);
    try {
      const fUser = await signInWithGoogle();
      if (fUser) {
        setFirebaseUid(fUser.uid);
        if (fUser.email) setAuthEmail(fUser.email);
        if (fUser.displayName) setName(fUser.displayName);
        if (fUser.photoURL) setPhotoURL(fUser.photoURL);
        setAuthSuccessMsg(`Connected with Google as ${fUser.displayName || fUser.email}!`);
        setTimeout(() => {
          setStep(5);
        }, 800);
      }
    } catch (err: any) {
      console.warn('Onboarding Google Auth error:', err);
      const code = String(err?.code || err?.message || '');
      if (code.includes('popup-closed-by-user') || code.includes('cancelled')) {
        setAuthError('Sign-in popup was closed. Please try again.');
      } else if (code.includes('unauthorized-domain')) {
        setAuthError('Domain authorization pending. You can create an email account below.');
      } else {
        setAuthError(err?.message || 'Google sign-in could not be completed. You can use email below.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Email/Password Auth handler
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please enter both your student email and password.');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMsg(null);

    try {
      if (authMode === 'create') {
        const fUser = await createAccountWithEmail(authEmail.trim(), authPassword, name.trim());
        setFirebaseUid(fUser.uid);
        setAuthSuccessMsg('Account created successfully!');
      } else {
        const fUser = await signInWithEmail(authEmail.trim(), authPassword);
        setFirebaseUid(fUser.uid);
        if (fUser.displayName) setName(fUser.displayName);
        setAuthSuccessMsg('Signed in successfully!');
      }
      setTimeout(() => {
        setStep(5);
      }, 700);
    } catch (err: any) {
      console.warn('Email Auth error:', err);
      const code = String(err?.code || '');
      if (code.includes('email-already-in-use')) {
        setAuthError('An account with this email already exists. Switch to Sign In.');
      } else if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        setAuthError('Invalid email or password. Please verify and try again.');
      } else if (code.includes('invalid-email')) {
        setAuthError('Please enter a valid email address.');
      } else {
        setAuthError(err?.message || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleFinish = () => {
    onComplete({
      ...initialUser,
      name: name.trim() || 'Student',
      email: authEmail.trim() || initialUser.email,
      university: university.trim() || 'University',
      studyField: selectedField,
      year,
      goals: selectedGoals,
      isOnboarded: true,
      firebaseUid,
      photoURL,
      isFirebaseSynced: Boolean(firebaseUid),
    });
  };

  return (
    <div className="w-full h-full flex flex-col justify-between p-6 bg-white dark:bg-slate-950 text-slate-900 dark:text-white select-none animate-fade-in overflow-y-auto no-scrollbar">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between min-h-[44px] shrink-0">
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-8" />
        )}

        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 bg-indigo-600'
                  : i < step
                  ? 'w-2 bg-indigo-300 dark:bg-indigo-800'
                  : 'w-1.5 bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        {step < 5 ? (
          <button
            onClick={() => setStep(5)}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
          >
            Skip
          </button>
        ) : (
          <div className="w-8" />
        )}
      </div>

      {/* Screen 1: Welcome & Mascot (Fixed Aspect Ratio to Prevent Stretching) */}
      {step === 1 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center my-auto py-6 space-y-6">
          <div className="relative shrink-0 flex items-center justify-center">
            <div className="w-44 h-44 sm:w-48 sm:h-48 aspect-square shrink-0 rounded-full bg-gradient-to-b from-indigo-100 to-purple-50 dark:from-indigo-950/60 dark:to-purple-950/40 flex items-center justify-center p-4 shadow-inner">
              <MascotAvatar size={110} className="shadow-2xl shadow-indigo-500/40 shrink-0" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-2 rounded-2xl bg-white dark:bg-slate-900 shadow-md border border-slate-100 dark:border-slate-800 shrink-0">
              <Sparkles className="w-5 h-5 text-indigo-500" />
            </div>
          </div>

          <div className="space-y-2 max-w-xs shrink-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Your AI Study Companion
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Plan your day. Master your goals. Let AI handle the schedule and tell you what to study next.
            </p>
          </div>
        </div>
      )}

      {/* Screen 2: Study Field */}
      {step === 2 && (
        <div className="flex-1 flex flex-col justify-center my-auto py-4 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Tell us about you
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              What are you currently studying at university?
            </p>
          </div>

          <div className="space-y-2.5">
            {STUDY_FIELDS.map((f) => {
              const isSelected = selectedField === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedField(f.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-500 text-indigo-900 dark:text-white ring-1 ring-indigo-500/40'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{f.icon}</span>
                    <span className="text-sm font-semibold">{f.label}</span>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Screen 3: Goals */}
      {step === 3 && (
        <div className="flex-1 flex flex-col justify-center my-auto py-4 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Add your goals
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              What are you working towards this semester?
            </p>
          </div>

          <div className="space-y-2.5">
            {STUDY_GOALS.map((g) => {
              const isSelected = selectedGoals.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => toggleGoal(g.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-500 text-indigo-900 dark:text-white ring-1 ring-indigo-500/40'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{g.icon}</span>
                    <span className="text-sm font-semibold">{g.label}</span>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Screen 4: Real Firebase Auth (Google & Email, No Apple) */}
      {step === 4 && (
        <div className="flex-1 flex flex-col justify-center my-auto py-2 space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Connect your account
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sync your schedule, courses, and flashcards securely with Firebase.
            </p>
          </div>

          {/* Feedback alerts */}
          {authError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{authSuccessMsg}</span>
            </div>
          )}

          {/* 1. Official Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={isAuthLoading}
            className="w-full py-3.5 px-4 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-white font-bold text-xs flex items-center justify-center gap-3 shadow-xs hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
          >
            {isAuthLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{isAuthLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>

          {/* Divider */}
          <div className="relative py-1 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <span className="relative px-3 bg-white dark:bg-slate-950 text-[11px] font-semibold text-slate-400">
              or use student email
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-2.5">
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 text-xs">
              <button
                type="button"
                onClick={() => setAuthMode('create')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  authMode === 'create'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Sign In
              </button>
            </div>

            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="student@university.edu"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isAuthLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{authMode === 'create' ? 'Create Student Account' : 'Sign In'}</span>
            </button>
          </form>

          {/* Guest option */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setStep(5)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium underline underline-offset-2 cursor-pointer"
            >
              Continue as Guest (Setup later in Settings)
            </button>
          </div>
        </div>
      )}

      {/* Screen 5: Profile Setup */}
      {step === 5 && (
        <div className="flex-1 flex flex-col justify-center my-auto py-4 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Complete your profile
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Personalize your study partner and schedule engine.
            </p>
          </div>

          <div className="flex justify-center py-2 shrink-0">
            <div className="relative shrink-0">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={name}
                  className="w-20 h-20 aspect-square shrink-0 rounded-full object-cover shadow-lg border-2 border-indigo-500"
                />
              ) : (
                <div className="w-20 h-20 aspect-square shrink-0 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                  {name.trim() ? name.trim().charAt(0).toUpperCase() : <User className="w-8 h-8 opacity-80 shrink-0" />}
                </div>
              )}
              <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-indigo-600 text-white shadow-sm border-2 border-white dark:border-slate-950 shrink-0">
                <User className="w-3.5 h-3.5 shrink-0" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Carter"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                University / College
              </label>
              <input
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="Stanford University"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Year of Study
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="1st Year">1st Year (Freshman)</option>
                <option value="2nd Year">2nd Year (Sophomore)</option>
                <option value="3rd Year">3rd Year (Junior)</option>
                <option value="4th Year">4th Year (Senior)</option>
                <option value="Graduate">Graduate / Master's</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Bottom CTA Button */}
      <div className="pt-4 shrink-0">
        {step < 5 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>{step === 1 ? 'Get Started' : 'Next'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleFinish}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>Start Studying with ChronoPulse</span>
            <Sparkles className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
