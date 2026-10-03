import React, { useState } from 'react';
import { Target, Plus, ChevronRight, CheckCircle2, Sparkles, X } from 'lucide-react';
import { Goal } from '../../types';

interface GoalsScreenProps {
  goals: Goal[];
  onAddGoal: (goal: Omit<Goal, 'id'>) => void;
  onSelectGoal?: (goal: Goal) => void;
}

export const GoalsScreen: React.FC<GoalsScreenProps> = ({ goals, onAddGoal, onSelectGoal }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Assignments');
  const [targetDate, setTargetDate] = useState('Apr 28');

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddGoal({
      title: title.trim(),
      category,
      targetDate,
      progress: 0,
      completed: false,
      aiPlanSteps: ['Set milestone objectives', 'Schedule weekly focus slots', 'Review progress with StudyAI'],
    });
    setTitle('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="w-full flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Study Goals
        </h1>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md active:scale-95"
          title="Add Goal"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Goals List (Matching Screen 15 in reference image) */}
      <div className="space-y-3">
        {goals.map((goal) => (
          <div
            key={goal.id}
            onClick={() => onSelectGoal && onSelectGoal(goal)}
            className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2.5 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {goal.title}
                </h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Due {goal.targetDate} · {goal.category}
                </div>
              </div>
              <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {goal.progress}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                style={{ width: `${goal.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Floating/Fixed CTA (Matching Screen 15) */}
      <div className="pt-2">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add New Goal</span>
        </button>
      </div>

      {/* Add Goal Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in pb-24 sm:pb-6">
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Create Study Goal</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-4 py-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Goal Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Calculus III Integration"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Assignments">Assignments</option>
                    <option value="Exams">Exams</option>
                    <option value="Projects">Projects</option>
                    <option value="Academic">Academic / GPA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Target Date
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. May 15"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30"
              >
                Create Goal
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
