import React from 'react';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  User,
  Sliders,
  Bell,
  Moon,
  Shield,
  HelpCircle,
  BrainCircuit,
  CalendarClock,
  LogOut,
  RotateCcw,
} from 'lucide-react';
import { UserProfile, AIProviderConfig, GoogleCalendarSyncState } from '../../types';

interface SettingsScreenProps {
  user: UserProfile;
  config: AIProviderConfig;
  calendarSync: GoogleCalendarSyncState;
  onBack: () => void;
  onOpenAIProvider: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenAIMemory: () => void;
  onOpenCalendarSync: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
  onResetData: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  user,
  config,
  calendarSync,
  onBack,
  onOpenAIProvider,
  onOpenNotifications,
  onOpenProfile,
  onOpenAIMemory,
  onOpenCalendarSync,
  onToggleTheme,
  isDark,
  onResetData,
}) => {
  return (
    <div className="w-full flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center gap-1 pt-2">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
      </div>

      {/* User Profile Card (Matching Screen 16 in reference image) */}
      <div
        onClick={onOpenProfile}
        className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-all"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold font-mono">
              {user.university} · {user.year}
            </span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400" />
      </div>

      {/* Settings Menu List (Matching Screen 16) */}
      <div className="space-y-2">
        {/* AI Provider */}
        <button
          onClick={onOpenAIProvider}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">AI Provider</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                {config.activeProvider === 'puter' ? 'Puter.js (Free)' : config.activeProvider}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* AI Memory (Section 25) */}
        <button
          onClick={onOpenAIMemory}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">AI Memory</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                View what StudyAI remembers about your study rhythm
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* Notifications */}
        <button
          onClick={onOpenNotifications}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Notifications</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Task reminders, class alerts, daily recommendations
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* Google Calendar Sync */}
        <button
          onClick={onOpenCalendarSync}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Google Calendar</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {calendarSync.connected
                  ? `Synced${calendarSync.email ? ` · ${calendarSync.email}` : ''}`
                  : 'Two-way sync with your Google Calendar'}
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-full ${
              calendarSync.connected
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {calendarSync.connected ? 'On' : 'Off'}
          </span>
        </button>

        {/* Appearance (Theme) */}
        <button
          onClick={onToggleTheme}
          className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-slate-300 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Appearance</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {isDark ? 'Dark Mode Active' : 'Light Mode Active'}
              </div>
            </div>
          </div>
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {isDark ? 'Switch Light' : 'Switch Dark'}
          </span>
        </button>
      </div>

      {/* Reset Seed Demo Data Button */}
      <div className="pt-2">
        <button
          onClick={onResetData}
          className="w-full py-3 rounded-2xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Sample Demo Data</span>
        </button>
      </div>
    </div>
  );
};
