import React, { useState } from 'react';
import {
  Award,
  TrendingUp,
  Sparkles,
  Clock,
  CheckCircle2,
  ChevronRight,
  BarChart2,
  ChevronLeft,
  Calendar,
  Flame,
  Sun,
  Sunset,
  Moon,
  Zap,
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

  // Daily study distribution data (Hours per day for current week)
  const weeklyDistribution = [
    { day: 'Mon', hours: 3.5, label: '3h 30m' },
    { day: 'Tue', hours: 4.2, label: '4h 12m' },
    { day: 'Wed', hours: 2.8, label: '2h 48m' },
    { day: 'Thu', hours: 5.0, label: '5h 00m' },
    { day: 'Fri', hours: 3.2, label: '3h 12m' },
    { day: 'Sat', hours: 1.5, label: '1h 30m' },
    { day: 'Sun', hours: 2.2, label: '2h 15m' },
  ];
  const maxHours = Math.max(...weeklyDistribution.map((d) => d.hours), 5);

  const timeOfDayBreakdown = [
    { period: 'Morning', time: '6am – 12pm', pct: 35, icon: Sun, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/60' },
    { period: 'Afternoon', time: '12pm – 5pm', pct: 45, icon: Zap, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60' },
    { period: 'Evening', time: '5pm – 10pm', pct: 15, icon: Sunset, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/60' },
    { period: 'Night', time: '10pm – 2am', pct: 5, icon: Moon, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/60' },
  ];

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
          </div>

          {/* Subject Breakdown */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3.5">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Subject Breakdown
            </h3>

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
                <span className="text-[10px] text-slate-400 block">Avg 3.2h / day</span>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="pt-4 pb-2">
              <div className="flex items-end justify-between gap-2 h-36 border-b border-slate-100 dark:border-slate-800 pb-2">
                {weeklyDistribution.map((item) => {
                  const heightPercent = Math.min(100, Math.round((item.hours / maxHours) * 100));
                  return (
                    <div key={item.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                      <span className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {item.hours}h
                      </span>
                      <div className="w-full max-w-[28px] bg-indigo-50 dark:bg-indigo-950/40 rounded-t-lg relative flex items-end overflow-hidden h-full">
                        <div
                          className="w-full bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 rounded-t-lg transition-all duration-500"
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        {item.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Time of Day Peak Productivity */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3.5">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Focus Heatmap</span>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Peak Productivity by Time of Day
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {timeOfDayBreakdown.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.period}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-extrabold font-mono text-slate-900 dark:text-white">
                        {item.pct}%
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.period}</div>
                      <div className="text-[10px] text-slate-400">{item.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
