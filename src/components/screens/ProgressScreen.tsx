import React, { useState } from 'react';
import {
  TrendingUp,
  Sparkles,
  Clock,
  ChevronLeft,
  Calendar,
} from 'lucide-react';
import { ProgressMetrics } from '../../types';

interface ProgressScreenProps {
  metrics: ProgressMetrics;
  onBack: () => void;
  onAskAIHowDoing: () => void;
  onOpenGoals: () => void;
}

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  metrics,
  onBack,
  onAskAIHowDoing,
  onOpenGoals,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'time' | 'goals'>('overview');

  return (
    <div className="w-full flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center gap-1 pt-2">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors shrink-0"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Analytics</span>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Progress & Insights
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('time')}
          className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'time'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Study Time
        </button>
        <button
          onClick={onOpenGoals}
          className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'goals'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Goals
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {/* Circular Progress & Key Stats Grid */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
            <div className="flex items-center justify-between gap-4">
              {/* Circular Progress Ring */}
              <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="text-slate-100 dark:text-slate-800 stroke-current"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="text-indigo-600 stroke-current transition-all duration-700"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray="264"
                    strokeDashoffset={264 - (264 * metrics.weeklyGoalPercentage) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
                    {metrics.weeklyGoalPercentage}%
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                    Weekly Goal
                  </span>
                </div>
              </div>

              {/* Right Metrics Columns */}
              <div className="flex-1 space-y-2.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Study Time</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                      {metrics.studyTimeFormatted}
                    </span>
                    <span className="text-xs font-semibold text-emerald-500 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" />
                      {metrics.studyTimeDelta}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Tasks Completed</span>
                  <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                    {metrics.tasksCompleted}/{metrics.tasksTotal}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Focus Score</span>
                  <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    {metrics.focusScore}/10
                  </span>
                </div>
              </div>
            </div>

            {/* AI Feedback Button */}
            <button
              onClick={onAskAIHowDoing}
              className="w-full py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center gap-2 border border-indigo-100 dark:border-indigo-900/60 transition-colors shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ask AI how I'm doing</span>
            </button>

            {/* Study Activity Heatmap (Last 28 Days) */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Study Activity (Last 4 Weeks)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {metrics.dayStreak} Day Streak 🔥
                </span>
              </div>
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/30 px-4 py-6 text-center">
                <Calendar className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Daily activity history is not available yet
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  This view will fill in when daily study tracking is available.
                </p>
              </div>
            </div>
          </div>

          {/* Subject Breakdown */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3.5">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Subject Breakdown
            </h3>

            {metrics.subjectBreakdown.length > 0 ? (
              <div className="space-y-3">
                {metrics.subjectBreakdown.map((subj) => (
                <div key={subj.course} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-800 dark:text-slate-200">{subj.course}</span>
                    <span className="font-mono text-slate-500">{subj.percentage}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${subj.percentage}%`, backgroundColor: subj.color }}
                    />
                  </div>
                </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 dark:bg-slate-950/30 px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                Subject insights will appear after study activity is recorded.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: STUDY TIME (Detailed distribution & peak hours) */}
      {activeTab === 'time' && (
        <div className="space-y-4 animate-fade-in">
          {/* Daily Study Time Chart */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Weekly Rhythm</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Daily Focus Hours</h3>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {metrics.studyTimeFormatted} total
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/30 px-4 py-8 text-center">
              <Clock className="w-5 h-5 mx-auto mb-2 text-slate-400" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Daily breakdown unavailable
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Your total study time is shown above. Daily focus hours are not tracked yet.
              </p>
            </div>
          </div>

          {/* Time of Day Peak Productivity */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3.5">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Time of Day</span>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Peak Productivity by Time of Day
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/30 px-4 py-6 text-center">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Time-of-day insights are not available yet
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Study sessions are not currently grouped by time of day.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
