import React from 'react';
import { ChevronLeft, Sparkles, Clock, CheckCircle2, Play, ArrowRight, Zap, Flame } from 'lucide-react';
import { Task, ScheduleEvent, UserProfile } from '../../types';
import { AIOrchestrator } from '../../services/aiOrchestrator';

interface WhatToDoNowScreenProps {
  tasks: Task[];
  schedule: ScheduleEvent[];
  user: UserProfile;
  onBack: () => void;
  onStartFocus: (task: Task) => void;
  onAskAIAboutTask: (task: Task) => void;
}

export const WhatToDoNowScreen: React.FC<WhatToDoNowScreenProps> = ({
  tasks,
  schedule,
  user,
  onBack,
  onStartFocus,
  onAskAIAboutTask,
}) => {
  const recommendation = AIOrchestrator.getWhatToDoNowRecommendation(
    tasks,
    schedule,
    user.energyLevel
  );

  const mainTask = recommendation.recommendedTask;

  return (
    <div className="w-full flex flex-col space-y-5 pb-8 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between min-h-[44px]">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors flex items-center gap-1 text-xs font-semibold"
        >
          <ChevronLeft className="w-6 h-6" />
          <span>Back</span>
        </button>
        <span className="text-sm font-bold">Decision Assistant</span>
        <div className="w-12" />
      </div>

      {/* Main Title & Subtitle */}
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          What should I do right now?
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Based on your schedule, deadline, energy level ({user.energyLevel * 20}%), here's what I recommend:
        </p>
      </div>

      {/* Primary Recommendation Card */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-indigo-50/90 via-purple-50/50 to-white dark:from-indigo-950/70 dark:via-purple-950/40 dark:to-slate-900 border border-indigo-200/80 dark:border-indigo-900/80 shadow-xl shadow-indigo-500/5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-md"
              style={{ backgroundColor: mainTask.courseColor }}
            >
              {mainTask.courseCode}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">
                  {mainTask.priority} Priority
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400">
                  {mainTask.estimatedMinutes} min
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tracking-tight">
                {mainTask.title}
              </h2>
            </div>
          </div>
        </div>

        {/* Why Now Bullet Points (Matching Screen 7) */}
        <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-indigo-100 dark:border-indigo-900/60 space-y-2">
          <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Why now?</span>
          </h3>
          <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            {recommendation.reason.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold shrink-0 mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={() => onStartFocus(mainTask)}
            className="py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 active:scale-[0.98] transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Now</span>
          </button>

          <button
            onClick={() => onAskAIAboutTask(mainTask)}
            className="py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Ask AI</span>
          </button>
        </div>
      </div>

      {/* Alternatives Section (Matching Screen 7) */}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Alternatives
        </h3>

        <div className="space-y-2.5">
          {recommendation.alternatives.map((alt, index) => (
            <div
              key={alt.task.id}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {alt.task.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {alt.duration} min · {alt.reason}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onStartFocus(alt.task)}
                className="py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-semibold shrink-0 transition-colors"
              >
                Switch
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
