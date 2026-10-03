import React, { useState } from 'react';
import { ChevronLeft, Bell, CheckCircle2, AlertCircle, Sparkles, Smartphone } from 'lucide-react';
import { NotificationItem } from '../../types';

interface NotificationsScreenProps {
  notifications: NotificationItem[];
  onBack: () => void;
  onSimulateLockscreen: () => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  notifications,
  onBack,
  onSimulateLockscreen,
}) => {
  const [taskReminders, setTaskReminders] = useState(true);
  const [classReminders, setClassReminders] = useState(true);
  const [deadlineAlerts, setDeadlineAlerts] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);

  const toggles = [
    { label: 'Task reminders', desc: 'Get notified about upcoming tasks', value: taskReminders, set: setTaskReminders },
    { label: 'Class reminders', desc: 'Remind before your lectures start', value: classReminders, set: setClassReminders },
    { label: 'Deadline alerts', desc: 'Critical assignment & exam deadlines', value: deadlineAlerts, set: setDeadlineAlerts },
    { label: 'AI suggestions', desc: 'Personalized next-step guidance', value: aiSuggestions, set: setAiSuggestions },
    { label: 'Weekly summary', desc: 'Your study rhythm and focus score recap', value: weeklySummary, set: setWeeklySummary },
  ];

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

        <span className="text-sm font-bold">Notifications</span>
        <div className="w-12" />
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Notifications
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Control how and when StudyAI alerts you of classes, study slots, and deadlines.
        </p>
      </div>

      {/* Toggles List (Matching Screen 18 in reference image) */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        {toggles.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</div>
            </div>
            <input
              type="checkbox"
              checked={item.value}
              onChange={(e) => item.set(e.target.checked)}
              className="w-5 h-5 rounded text-indigo-600 focus:ring-0 cursor-pointer"
            />
          </div>
        ))}
      </div>

      {/* Lockscreen Preview Button (Matching Screen 27) */}
      <div className="p-4 rounded-3xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-indigo-600" />
            <span>Lockscreen Notification Preview</span>
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
            Simulate native iOS/Android lockscreen banner
          </span>
        </div>

        <button
          onClick={onSimulateLockscreen}
          className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-all"
        >
          Preview Alert
        </button>
      </div>

      {/* Notification Activity History */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Recent Notifications
        </h3>

        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {n.title}
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">{n.timestamp}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                  {n.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
