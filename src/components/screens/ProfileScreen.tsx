import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Target,
  BarChart2,
  LogOut,
  Flame,
  Check,
  Cloud,
  Plus,
  X,
  Save,
  User,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { UserProfile, ProgressMetrics } from '../../types';

interface ProfileScreenProps {
  user: UserProfile;
  metrics: ProgressMetrics;
  onUpdateUser?: (patch: Partial<UserProfile>) => void;
  onBack: () => void;
  onOpenGoals: () => void;
  onOpenStats: () => void;
  onRestartOnboarding: () => void;
  onLoadDemoData?: () => void;
  onClearAllData?: () => void;
  onSignInWithGoogle?: () => void;
  onSignOut?: () => void;
  isFirebaseSynced?: boolean;
}

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', "Master's", 'PhD'];

const ENERGY_OPTIONS: { level: 1 | 2 | 3 | 4 | 5; label: string; icon: string }[] = [
  { level: 1, label: 'Very Low', icon: '😴' },
  { level: 2, label: 'Low', icon: '😐' },
  { level: 3, label: 'Okay', icon: '🙂' },
  { level: 4, label: 'Good', icon: '😃' },
  { level: 5, label: 'Excellent', icon: '🤩' },
];

interface ProfileForm {
  name: string;
  email: string;
  university: string;
  studyField: string;
  year: string;
  energyLevel: 1 | 2 | 3 | 4 | 5;
}

const formFromUser = (user: UserProfile): ProfileForm => ({
  name: user.name || '',
  email: user.email || '',
  university: user.university || '',
  studyField: user.studyField || '',
  year: user.year || '',
  energyLevel: user.energyLevel || 3,
});

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  metrics,
  onUpdateUser,
  onBack,
  onOpenGoals,
  onOpenStats,
  onRestartOnboarding,
  onLoadDemoData,
  onClearAllData,
  onSignInWithGoogle,
  onSignOut,
  isFirebaseSynced = false,
}) => {
  const [form, setForm] = useState<ProfileForm>(() => formFromUser(user));
  const [goals, setGoals] = useState<string[]>(user.goals || []);
  const [newGoal, setNewGoal] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  // Keep the form in sync when the profile changes elsewhere (e.g. Google sign-in).
  useEffect(() => {
    setForm(formFromUser(user));
    setGoals(user.goals || []);
  }, [user]);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isDirty =
    form.name !== user.name ||
    form.email !== user.email ||
    form.university !== user.university ||
    form.studyField !== user.studyField ||
    form.year !== user.year ||
    form.energyLevel !== user.energyLevel ||
    JSON.stringify(goals) !== JSON.stringify(user.goals || []);

  const handleSave = () => {
    if (!onUpdateUser) return;
    onUpdateUser({
      name: form.name.trim() || user.name,
      email: form.email.trim() || user.email,
      university: form.university.trim(),
      studyField: form.studyField.trim(),
      year: form.year,
      energyLevel: form.energyLevel,
      goals,
    });
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  };

  const handleReset = () => {
    setForm(formFromUser(user));
    setGoals(user.goals || []);
  };

  const addGoal = () => {
    const value = newGoal.trim();
    if (!value) return;
    setGoals((prev) => [...prev, value]);
    setNewGoal('');
  };

  const yearOptions = YEAR_OPTIONS.includes(form.year) || !form.year
    ? YEAR_OPTIONS
    : [form.year, ...YEAR_OPTIONS];

  return (
    <div className="w-full flex flex-col space-y-5 pb-8 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between min-h-[44px]">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors flex items-center gap-1 text-xs font-semibold"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6" />
          <span>Back</span>
        </button>

        <span className="text-sm font-bold">Profile Settings</span>
        <div className="w-12" />
      </div>

      {/* User Header */}
      <div className="flex flex-col items-center text-center space-y-2 py-2">
        <div className="relative">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.name}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-indigo-500/20 shadow-md"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-extrabold shadow-lg shadow-indigo-500/20">
              {user.name.charAt(0)}
            </div>
          )}
          <span
            className={`absolute bottom-0 right-0 w-4 h-4 rounded-full ring-2 ring-white dark:ring-slate-950 ${
              isFirebaseSynced ? 'bg-emerald-500' : 'bg-amber-400'
            }`}
          />
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{user.name}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
            {user.university} · {user.studyField} ({user.year})
          </p>
        </div>
      </div>

      {/* Editable Account Details */}
      <section className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-white">Account Details</span>
          </div>
          {isDirty && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Unsaved
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              Full name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            />
            {isFirebaseSynced && (
              <p className="text-[10px] text-slate-400 mt-1">
                Synced with your Google account email.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              University / School
            </label>
            <input
              type="text"
              value={form.university}
              onChange={(e) => update('university', e.target.value)}
              placeholder="e.g. Stanford University"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                Study field
              </label>
              <input
                type="text"
                value={form.studyField}
                onChange={(e) => update('studyField', e.target.value)}
                placeholder="e.g. Computer Science"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                Year
              </label>
              <select
                value={form.year}
                onChange={(e) => update('year', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
              >
                {yearOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Energy level */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              Typical energy level
            </label>
            <div className="flex items-center gap-1.5">
              {ENERGY_OPTIONS.map((option) => (
                <button
                  key={option.level}
                  type="button"
                  onClick={() => update('energyLevel', option.level)}
                  title={option.label}
                  className={`flex-1 py-2 rounded-xl border text-sm transition-all ${
                    form.energyLevel === option.level
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 scale-105'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                  }`}
                >
                  <span className="block text-base leading-none">{option.icon}</span>
                  <span className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-1">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Study goals */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              Study goals
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {goals.length === 0 && (
                <span className="text-[11px] text-slate-400">No goals added yet.</span>
              )}
              {goals.map((goal, index) => (
                <span
                  key={`${goal}-${index}`}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                >
                  {goal}
                  <button
                    type="button"
                    onClick={() => setGoals((prev) => prev.filter((_, i) => i !== index))}
                    className="p-0.5 rounded text-slate-400 hover:text-rose-500"
                    aria-label={`Remove goal ${goal}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addGoal();
                  }
                }}
                placeholder="Add a goal and press Enter"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addGoal}
                className="p-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 active:scale-95 transition-all"
                aria-label="Add goal"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save changes</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Reset
          </button>
        </div>

        {justSaved && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" />
            <span>Profile updated</span>
          </div>
        )}
      </section>

      {/* Cloud Account Sync Card */}
      <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className={`w-4 h-4 ${isFirebaseSynced ? 'text-emerald-500' : 'text-slate-400'}`} />
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Cloud Persistence & Auth
            </span>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isFirebaseSynced
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
            }`}
          >
            {isFirebaseSynced ? 'Firestore Active' : 'Local Storage'}
          </span>
        </div>

        {isFirebaseSynced ? (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tasks, schedule, and goals are automatically synced to Google Cloud Firestore.
            </p>
            <button
              onClick={onSignOut}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline shrink-0 ml-2"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sign in with Google to backup your deadlines, schedule, and study metrics across all your devices.
            </p>
            <button
              onClick={onSignInWithGoogle}
              className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 flex items-center justify-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              <span>Connect with Google Account</span>
            </button>
          </div>
        )}
      </div>

      {/* 3 Metric Badges */}
      <div className="grid grid-cols-3 gap-2 p-3.5 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center">
        <div>
          <div className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
            {metrics.tasksCompleted}
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
            Tasks Done
          </div>
        </div>

        <div className="border-x border-slate-200 dark:border-slate-800">
          <div className="text-base font-extrabold font-mono text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1">
            <Flame className="w-4 h-4 fill-current" />
            <span>{user.streak || 5}</span>
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
            Day Streak
          </div>
        </div>

        <div>
          <div className="text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
            {metrics.productivityScore || 8.4}
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
            Focus Score
          </div>
        </div>
      </div>

      {/* Menu Navigation Items */}
      <div className="space-y-2">
        <button
          onClick={onOpenGoals}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-white">Study Goals</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={onOpenStats}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <BarChart2 className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-white">Statistics & Trends</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={onRestartOnboarding}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Edit3 className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-white">Restart Onboarding Flow</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Development & Testing Data Management */}
      <div className="pt-2 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
          Development & Testing
        </div>

        {onLoadDemoData && (
          <button
            onClick={onLoadDemoData}
            className="w-full p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 flex items-center justify-between shadow-2xs hover:border-indigo-300 text-left transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-indigo-950 dark:text-indigo-200 block">
                  Load Sample Demo Data
                </span>
                <span className="text-[11px] text-indigo-600/90 dark:text-indigo-400 block mt-0.5">
                  Populates CS101, assignments, schedule & study materials for testing
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0" />
          </button>
        )}

        {onClearAllData && (
          <button
            onClick={() => {
              if (window.confirm('Reset app to a clean state? This removes sample data and opens the onboarding wizard for new students.')) {
                onClearAllData();
              }
            }}
            className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-2xs hover:border-slate-300 text-left transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white block">
                  Start Clean (Simulate New Student)
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Clears all mock data and opens initial student onboarding
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        )}
      </div>

      {/* Log Out / Profile Reset */}
      <div className="pt-2">
        <button
          onClick={isFirebaseSynced ? onSignOut : onRestartOnboarding}
          className="w-full py-3.5 rounded-2xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>{isFirebaseSynced ? 'Sign Out of Google' : 'Reset Student Profile'}</span>
        </button>
      </div>
    </div>
  );
};
