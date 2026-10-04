import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Bell,
  Volume2,
  VolumeX,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  BookOpen,
  Sun,
  BarChart2,
  Moon,
  Send,
  RotateCcw,
  Check,
} from 'lucide-react';
import { NotificationSettings } from '../../types';
import { playChime } from '../../utils/audio';

interface NotificationSettingsScreenProps {
  settings: NotificationSettings;
  onUpdateSettings: (updater: (prev: NotificationSettings) => NotificationSettings) => void;
  onSendTestNotification: () => void;
  onBack: () => void;
}

export const NotificationSettingsScreen: React.FC<NotificationSettingsScreenProps> = ({
  settings,
  onUpdateSettings,
  onSendTestNotification,
  onBack,
}) => {
  const [testNotificationSent, setTestNotificationSent] = useState(false);
  const [soundTested, setSoundTested] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<string>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const handleToggle = (key: keyof NotificationSettings) => {
    onUpdateSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectMinutes = (minutes: number) => {
    onUpdateSettings((prev) => ({
      ...prev,
      advanceNoticeMinutes: minutes,
    }));
  };

  const handleQuietHoursChange = (field: 'quietHoursStart' | 'quietHoursEnd', value: string) => {
    onUpdateSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRequestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Browser notifications are not supported in this environment.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission === 'granted') {
        onUpdateSettings((prev) => ({ ...prev, browserNotifications: true }));
      } else {
        onUpdateSettings((prev) => ({ ...prev, browserNotifications: false }));
      }
    } catch (e) {
      console.warn('Failed to request notification permission:', e);
    }
  };

  const handleTestChime = () => {
    playChime('reminder');
    setSoundTested(true);
    setTimeout(() => setSoundTested(false), 2000);
  };

  const handleTriggerTest = () => {
    onSendTestNotification();
    setTestNotificationSent(true);
    setTimeout(() => setTestNotificationSent(false), 3500);
  };

  const handleResetDefaults = () => {
    onUpdateSettings(() => ({
      inAppBanners: true,
      soundEnabled: true,
      browserNotifications: false,
      taskReminders: true,
      classReminders: true,
      deadlineAlerts: true,
      aiSuggestions: true,
      dailyBriefing: true,
      weeklySummary: true,
      advanceNoticeMinutes: 15,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    }));
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col space-y-5 pb-16 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between min-h-[44px] pt-1">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors flex items-center gap-1.5 text-xs font-semibold"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
          Preferences
        </span>

        <button
          onClick={handleResetDefaults}
          className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
          title="Restore default settings"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Screen Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Notification Settings
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure how StudyAI alerts you of tasks, lectures, and peak study slots.
        </p>
      </div>

      {/* Success banner when test notification triggered */}
      {testNotificationSent && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-medium flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Test notification created! Check the bell icon in your header.</span>
          </div>
        </div>
      )}

      {/* SECTION 1: Delivery Channels & Sound */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Delivery & Sound
        </h2>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-sm overflow-hidden">
          {/* Sound Chimes */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                {settings.soundEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Audio Chimes</span>
                  {settings.soundEnabled && (
                    <button
                      type="button"
                      onClick={handleTestChime}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 hover:bg-amber-200 transition-colors"
                      title="Play sample sound"
                    >
                      {soundTested ? 'Playing...' : 'Test Sound'}
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Play gentle acoustic tones for upcoming study sessions and deadlines
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.soundEnabled}
              onClick={() => handleToggle('soundEnabled')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.soundEnabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.soundEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* In-App Alerts */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  In-App Notification Feed
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Surface reminder badges and activity records in the top header bell
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.inAppBanners}
              onClick={() => handleToggle('inAppBanners')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.inAppBanners ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.inAppBanners ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Browser Push Notifications */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                <Globe className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Browser Notifications</span>
                  {browserPermission === 'granted' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Permission Granted
                    </span>
                  ) : browserPermission === 'denied' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                      Blocked in Browser
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Receive background desktop/mobile system notifications when tab is inactive
                </div>
              </div>
            </div>

            {browserPermission !== 'granted' ? (
              <button
                type="button"
                onClick={handleRequestBrowserPermission}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 text-xs font-bold transition-colors shrink-0"
              >
                Enable
              </button>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={settings.browserNotifications}
                onClick={() => handleToggle('browserNotifications')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  settings.browserNotifications ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.browserNotifications ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: Notification Categories */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Notification Categories
        </h2>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-sm overflow-hidden">
          {/* Task Reminders */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Task & Study Slot Reminders
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Alerts when scheduled study sessions and coursework tasks are starting
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.taskReminders}
              onClick={() => handleToggle('taskReminders')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.taskReminders ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.taskReminders ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Class Timetable Reminders */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Lecture & Class Reminders
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Alerts before lectures, discussions, and laboratory sections start
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.classReminders}
              onClick={() => handleToggle('classReminders')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.classReminders ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.classReminders ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Deadline Alerts */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Critical Deadline Warnings
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Priority warnings for assignments, problem sets, and exams due within 48h
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.deadlineAlerts}
              onClick={() => handleToggle('deadlineAlerts')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.deadlineAlerts ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.deadlineAlerts ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* AI Suggestions */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  AI Study Guidance & Suggestions
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Personalized suggestions when peak energy hours match pending assignments
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.aiSuggestions}
              onClick={() => handleToggle('aiSuggestions')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.aiSuggestions ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.aiSuggestions ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Daily Morning Briefing */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Sun className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Morning Study Briefing
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Daily overview of scheduled classes, top priorities, and optimal study blocks
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.dailyBriefing}
              onClick={() => handleToggle('dailyBriefing')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.dailyBriefing ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.dailyBriefing ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Weekly Summary */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Weekly Rhythm Recap
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  End-of-week summary of focus score, completed tasks, and study consistency
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.weeklySummary}
              onClick={() => handleToggle('weeklySummary')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.weeklySummary ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.weeklySummary ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: Timing & Quiet Hours */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Timing & Quiet Hours
        </h2>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-4 shadow-sm">
          {/* Advance notice pills */}
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                Advance Reminder Notice
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              How far in advance StudyAI alerts you before scheduled events
            </p>

            <div className="grid grid-cols-4 gap-2 mt-3">
              {[5, 10, 15, 30].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleSelectMinutes(mins)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    settings.advanceNoticeMinutes === mins
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <Moon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    Quiet Hours (Do Not Disturb)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Silence audio chimes and non-urgent popups during your sleep window
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.quietHoursEnabled}
                onClick={() => handleToggle('quietHoursEnabled')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  settings.quietHoursEnabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.quietHoursEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {settings.quietHoursEnabled && (
              <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-4">
                <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  Quiet window:
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={settings.quietHoursStart}
                    onChange={(e) => handleQuietHoursChange('quietHoursStart', e.target.value)}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="time"
                    value={settings.quietHoursEnd}
                    onChange={(e) => handleQuietHoursChange('quietHoursEnd', e.target.value)}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 4: Live Verification (Works!) */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Test Your Settings
        </h2>

        <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Verify In-App Notifications</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sends an immediate live test alert according to your current sound & alert preferences
            </div>
          </div>

          <button
            type="button"
            onClick={handleTriggerTest}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Test Notification</span>
          </button>
        </div>
      </div>
    </div>
  );
};
