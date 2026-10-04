import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Sparkles, User, GraduationCap, ChevronLeft, Apple } from 'lucide-react';
import { MascotAvatar } from '../mobile/MascotAvatar';
import { UserProfile } from '../../types';
import { registerBackHandler } from '../../lib/native';

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
  const [name, setName] = useState<string>(initialUser.name || 'Alex Carter');
  const [university, setUniversity] = useState<string>(initialUser.university || 'Stanford University');
  const [year, setYear] = useState<string>(initialUser.year || '2nd Year');

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

  const handleFinish = () => {
    onComplete({
      ...initialUser,
      name,
      university,
      studyField: selectedField,
      year,
      goals: selectedGoals,
      isOnboarded: true,
    });
  };

  return (
    <div className="w-full h-full flex flex-col justify-between p-6 bg-white dark:bg-slate-950 text-slate-900 dark:text-white select-none animate-fade-in">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between min-h-[44px]">
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors"
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
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            Skip
          </button>
        ) : (
          <div className="w-8" />
        )}
      </div>

      {/* Screen 1: Welcome & Mascot */}
      {step === 1 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center my-auto space-y-6">
          <div className="relative">
            <div className="w-48 h-48 rounded-full bg-gradient-to-b from-indigo-100 to-purple-50 dark:from-indigo-950/60 dark:to-purple-950/40 flex items-center justify-center p-4">
              <MascotAvatar size={110} className="shadow-2xl shadow-indigo-500/40" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-2 rounded-2xl bg-white dark:bg-slate-900 shadow-md border border-slate-100 dark:border-slate-800">
              <Sparkles className="w-5 h-5 text-indigo-500" />
            </div>
          </div>

          <div className="space-y-2 max-w-xs">
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
        <div className="flex-1 flex flex-col justify-center my-auto space-y-5">
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
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
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
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white">
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
        <div className="flex-1 flex flex-col justify-center my-auto space-y-5">
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
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
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
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Screen 4: Sign In / Auth Mockup */}
      {step === 4 && (
        <div className="flex-1 flex flex-col justify-center my-auto space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Welcome to StudyAI!
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sign in with your student account to sync across devices.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Email or Student ID
              </label>
              <input
                type="email"
                defaultValue={initialUser.email || 'alex@example.com'}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Password
              </label>
              <input
                type="password"
                defaultValue="••••••••••••"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="relative py-2 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800" /></div>
            <span className="relative px-3 bg-white dark:bg-slate-950 text-xs text-slate-400">or continue with</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStep(5)}
              className="py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              <span>Google</span>
            </button>
            <button
              onClick={() => setStep(5)}
              className="py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              <Apple className="w-4 h-4" />
              <span>Apple</span>
            </button>
          </div>
        </div>
      )}

      {/* Screen 5: Profile Setup */}
      {step === 5 && (
        <div className="flex-1 flex flex-col justify-center my-auto space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Complete your profile
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Personalize your study partner and schedule engine.
            </p>
          </div>

          <div className="flex justify-center py-2">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                {name.charAt(0) || 'A'}
              </div>
              <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-indigo-600 text-white shadow-sm border-2 border-white dark:border-slate-950">
                <User className="w-3.5 h-3.5" />
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
      <div className="pt-4">
        {step < 5 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
          >
            <span>{step === 1 ? 'Get Started' : 'Next'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleFinish}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
          >
            <span>Start Studying with StudyAI</span>
            <Sparkles className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
