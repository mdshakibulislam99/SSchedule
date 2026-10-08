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
import { PasswordResetPanel } from '../common/PasswordResetPanel';
import { UserProfile } from '../../types';
import { registerBackHandler } from '../../lib/native';
import {
  signInWithGoogle,
  createAccountWithEmail,
  signInWithEmail,
  fetchUserDataFromFirestore,
} from '../../lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';

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

export const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
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
);

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete, initialUser }) => {
  // Steps: 1 = Sign in, 2 = Sign up, 3 = Study field, 4 = Goals, 5 = Profile
  const [step, setStep] = useState<number>(1);
  const [selectedField, setSelectedField] = useState<string>(initialUser.studyField || 'Computer Science');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(initialUser.goals || ['Finish assignments']);
  const [name, setName] = useState<string>(initialUser.name || '');
  const [university, setUniversity] = useState<string>(initialUser.university || '');
  const [year, setYear] = useState<string>(initialUser.year || '1st Year');

  // Firebase Auth State
  const [authEmail, setAuthEmail] = useState<string>(initialUser.email || '');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authConfirm, setAuthConfirm] = useState<string>('');
  const [isResetMode, setIsResetMode] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [firebaseUid, setFirebaseUid] = useState<string | undefined>(initialUser.firebaseUid);
  const [photoURL, setPhotoURL] = useState<string | undefined>(initialUser.photoURL);

  // Back targets: sign-up -> sign-in, study field -> sign-in, then straight back
  const backTarget = step === 2 || step === 3 ? 1 : step - 1;

  // Mirror the in-app back chevron on the Android hardware back button. Returning
  // false on the first step lets the press fall through and exit the app.
  useEffect(() => {
    return registerBackHandler(() => {
      if (step <= 1) return false;
      setStep(backTarget);
      return true;
    });
  }, [step, backTarget]);

  const toggleGoal = (goal: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  // After any successful sign-in (Google or email): a returning account that
  // already completed onboarding skips the setup steps entirely and lands in
  // the app with its cloud profile restored (tasks/courses/etc. are restored
  // by App's auth listener). Brand-new accounts continue into the study setup
  // steps. There is no guest path.
  const proceedAfterAuth = async (fUser: FirebaseUser, message: string) => {
    setFirebaseUid(fUser.uid);
    if (fUser.email) setAuthEmail(fUser.email);
    if (fUser.displayName) setName(fUser.displayName);
    if (fUser.photoURL) setPhotoURL(fUser.photoURL);
    setAuthSuccessMsg(message);

    // Does this account already have an onboarded profile — or any study data —
    // in Firestore? Either signal means a returning user who should skip setup.
    // We don't rely on isOnboarded alone: if it was ever lost or left unset, the
    // presence of synced data still proves the account is established.
    let cloudProfile: Partial<UserProfile> | null = null;
    let hasCloudData = false;
    try {
      const cloud = await fetchUserDataFromFirestore(fUser.uid);
      cloudProfile = cloud.profile;
      hasCloudData =
        cloud.tasks.length +
          cloud.courses.length +
          cloud.goals.length +
          cloud.schedule.length > 0;
    } catch (err) {
      console.warn('Could not load existing cloud profile:', err);
    }

    const isReturning = Boolean(cloudProfile?.isOnboarded) || hasCloudData;

    if (isReturning) {
      // Returning user — skip setup and restore their saved profile choices.
      const restored: UserProfile = {
        ...initialUser,
        ...cloudProfile,
        id: cloudProfile?.id || initialUser.id,
        name: cloudProfile?.name || fUser.displayName || initialUser.name,
        email: cloudProfile?.email || fUser.email || initialUser.email,
        avatarUrl: cloudProfile?.avatarUrl || initialUser.avatarUrl,
        university: cloudProfile?.university || initialUser.university,
        studyField: cloudProfile?.studyField || initialUser.studyField,
        year: cloudProfile?.year || initialUser.year,
        goals:
          cloudProfile?.goals && cloudProfile.goals.length > 0
            ? cloudProfile.goals
            : initialUser.goals,
        energyLevel: cloudProfile?.energyLevel ?? initialUser.energyLevel,
        photoURL: cloudProfile?.photoURL || fUser.photoURL || undefined,
        firebaseUid: fUser.uid,
        isFirebaseSynced: true,
        isOnboarded: true,
      };
      // Brief "Signed in!" feedback, then straight into the restored app.
      window.setTimeout(() => onComplete(restored), 700);
      return;
    }

    window.setTimeout(() => setStep(3), 700);
  };

  // Google Sign-In handler: Authentic Google Sign-In with Account Selection
  const handleGoogleAuth = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMsg(null);
    try {
      const fUser = await signInWithGoogle();
      if (fUser) {
        await proceedAfterAuth(fUser, 'Signed in with Google!');
      }
    } catch (err: any) {
      console.warn('Onboarding Google Auth error:', err);
      const msg = String(err?.message || '');
      if (!msg.includes('cancelled') && !msg.includes('closed')) {
        setAuthError(msg || 'Google sign-in could not be completed.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Email/Password Auth handler (login on step 1, sign-up on step 2)
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const isSignup = step === 2;
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please enter both your email and password.');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }
    if (isSignup && authConfirm.trim() !== authPassword) {
      setAuthError('Passwords do not match. Please try again.');
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMsg(null);

    try {
      const fUser = isSignup
        ? await createAccountWithEmail(authEmail.trim(), authPassword)
        : await signInWithEmail(authEmail.trim(), authPassword);
      await proceedAfterAuth(fUser, isSignup ? 'Account created!' : 'Signed in!');
    } catch (err: any) {
      console.warn('Email Auth error:', err);
      const code = String(err?.code || '');
      if (code.includes('email-already-in-use')) {
        setAuthError('An account with this email already exists. Switch to Log in.');
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

  const switchAuthScreen = (target: 1 | 2) => {
    setStep(target);
    setAuthError(null);
    setAuthSuccessMsg(null);
    setAuthConfirm('');
    setIsResetMode(false);
  };

  const openReset = () => {
    setIsResetMode(true);
    setAuthError(null);
    setAuthSuccessMsg(null);
  };

  const inputClass =
    'w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:outline-none focus:border-indigo-500';

  return (
    <div className="w-full h-full flex flex-col justify-between p-6 bg-white dark:bg-slate-950 text-slate-900 dark:text-white select-none animate-fade-in overflow-y-auto no-scrollbar">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between min-h-[44px] shrink-0">
        {step > 1 ? (
          <button
            onClick={() => setStep(backTarget)}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-8" />
        )}

        {/* Progress dots only appear during the study setup (after sign-in) */}
        {step >= 3 ? (
          <div className="flex items-center gap-1.5">
            {[3, 4, 5].map((i) => (
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
        ) : (
          <div className="w-8" />
        )}

        <div className="w-8" />
      </div>

      {/* Screens 1 & 2: Sign in / Sign up */}
      {step <= 2 && (
        <div className="flex-1 flex flex-col items-center justify-center my-auto py-4 gap-6">
          {/* Brand */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div className="w-20 h-20 rounded-full bg-gradient-to-b from-indigo-100 to-purple-50 dark:from-indigo-950/60 dark:to-purple-950/40 flex items-center justify-center p-3 shadow-inner">
              <MascotAvatar size={52} className="shrink-0" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              SShedule
            </h1>
          </div>

          <div className="w-full max-w-sm space-y-4">
            {step === 1 && isResetMode ? (
              <PasswordResetPanel
                initialEmail={authEmail}
                showBack={false}
                onBack={() => {
                  setIsResetMode(false);
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
              />
            ) : (
              <>
                <div className="space-y-1 text-center">
                  <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                    {step === 1 ? 'Welcome back' : 'Create your account'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {step === 1
                      ? 'Log in to pick up right where you left off.'
                      : 'Sign up to sync your schedule, tasks and courses across all your devices.'}
                  </p>
                </div>

                {authError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                    <span>{authError}</span>
                  </div>
                )}

                {authSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{authSuccessMsg}</span>
                  </div>
                )}

                <form onSubmit={handleEmailAuth} className="space-y-2.5 animate-fade-in">
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="student@university.edu"
                    autoComplete="email"
                    className={inputClass}
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
                    autoComplete={step === 2 ? 'new-password' : 'current-password'}
                    className={inputClass}
                  />
                </div>

                {step === 2 && (
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={authConfirm}
                      onChange={(e) => setAuthConfirm(e.target.value)}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                >
                  {isAuthLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{step === 1 ? 'Sign in' : 'Sign up'}</span>
                </button>
              </form>
              </>
            )}

            {!isResetMode && (
              <>
                {/* Divider */}
                <div className="relative py-0.5 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                  </div>
                  <span className="relative px-3 bg-white dark:bg-slate-950 text-[11px] font-semibold text-slate-400">
                    or {step === 1 ? 'sign in' : 'sign up'} with
                  </span>
                </div>

                {/* Google — the only one-click provider */}
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={isAuthLoading}
                  className="w-full py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-sm flex items-center justify-center gap-3 shadow-xs active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                >
                  {isAuthLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  ) : (
                    <GoogleIcon className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isAuthLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Screen 3: Study Field */}
      {step === 3 && (
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

      {/* Screen 4: Goals */}
      {step === 4 && (
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

      {/* Bottom CTA Buttons */}
      <div className="pt-4 shrink-0 space-y-2.5">
        {step === 1 ? (
          <div className="space-y-2">
            {isResetMode ? (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(false);
                    setAuthError(null);
                    setAuthSuccessMsg(null);
                  }}
                  className="font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer"
                >
                  Back to sign in
                </button>
              </p>
            ) : (
              <>
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={openReset}
                    className="font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </p>
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchAuthScreen(2)}
                    className="font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer"
                  >
                    Sign up
                  </button>
                </p>
              </>
            )}
          </div>
        ) : step === 2 ? (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => switchAuthScreen(1)}
              className="font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer"
            >
              Log in
            </button>
          </p>
        ) : step < 5 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>Next</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleFinish}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>Start Studying with SShedule</span>
            <Sparkles className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
