import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  Bell,
  CheckCheck,
  Trash2,
  Sliders,
  Sparkles,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Check,
} from 'lucide-react';
import { NotificationItem } from '../../types';

interface NotificationsScreenProps {
  notifications: NotificationItem[];
  onBack: () => void;
  onUpdateNotifications: (
    updater: NotificationItem[] | ((prev: NotificationItem[]) => NotificationItem[])
  ) => void;
  onOpenSettings?: () => void;
  onSelectTaskById?: (taskId: string) => void;
}

type FilterTab = 'all' | 'unread' | 'reminder' | 'deadline' | 'insight';

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  notifications,
  onBack,
  onUpdateNotifications,
  onOpenSettings,
  onSelectTaskById,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeFilter === 'unread') return !n.read;
      if (activeFilter === 'reminder') return n.type === 'reminder';
      if (activeFilter === 'deadline') return n.type === 'deadline';
      if (activeFilter === 'insight') return n.type === 'insight';
      return true;
    });
  }, [notifications, activeFilter]);

  const handleMarkAllAsRead = () => {
    onUpdateNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleToggleRead = (id: string) => {
    onUpdateNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
    );
  };

  const handleDelete = (id: string) => {
    onUpdateNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearAll = () => {
    onUpdateNotifications([]);
    setShowClearConfirm(false);
  };

  const getNotificationIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'deadline':
        return (
          <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-2xs">
            <AlertTriangle className="w-4 h-4" />
          </div>
        );
      case 'insight':
        return (
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Sparkles className="w-4 h-4" />
          </div>
        );
      case 'reschedule':
        return (
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Calendar className="w-4 h-4" />
          </div>
        );
      case 'reminder':
      default:
        return (
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Bell className="w-4 h-4" />
          </div>
        );
    }
  };

  const getCategoryLabel = (type: NotificationItem['type']) => {
    switch (type) {
      case 'deadline':
        return 'Urgent Deadline';
      case 'insight':
        return 'StudyAI Insight';
      case 'reschedule':
        return 'Schedule Update';
      case 'reminder':
      default:
        return 'Task Reminder';
    }
  };

  const handleNotificationAction = (item: NotificationItem) => {
    // If it's a task reminder, try extracting task ID
    if (onSelectTaskById && item.id.startsWith('task-reminder-')) {
      const parts = item.id.split('-');
      // format: task-reminder-{taskId}-{dateKey}
      if (parts.length >= 3) {
        const taskId = parts[2];
        onSelectTaskById(taskId);
        return;
      }
    }
    // Mark as read when actioned
    handleToggleRead(item.id);
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col space-y-4 pb-12 animate-fade-in text-slate-900 dark:text-white">
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

        <div className="flex items-center gap-2">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs transition-colors"
              title="Notification Settings"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          )}

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}

          {notifications.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Clear all notifications"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Title & Badge */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Notifications
            </h1>
            {unreadCount > 0 ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-2xs animate-pulse">
                {unreadCount} new
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                All caught up
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time study alerts, class reminders, and intelligent schedule updates.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setActiveFilter('unread')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
            activeFilter === 'unread'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          {unreadCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
          Unread ({unreadCount})
        </button>
        <button
          onClick={() => setActiveFilter('reminder')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
            activeFilter === 'reminder'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          Reminders
        </button>
        <button
          onClick={() => setActiveFilter('deadline')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
            activeFilter === 'deadline'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          Deadlines
        </button>
        <button
          onClick={() => setActiveFilter('insight')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
            activeFilter === 'insight'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          AI Insights
        </button>
      </div>

      {/* Confirmation Modal for Clear All */}
      {showClearConfirm && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div>
            <div className="text-sm font-bold text-rose-900 dark:text-rose-200">
              Clear all notifications?
            </div>
            <div className="text-xs text-rose-700 dark:text-rose-300">
              This will remove all {notifications.length} notification entries from your history.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
            >
              Yes, Clear All
            </button>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-2.5">
        {filteredNotifications.length === 0 ? (
          <div className="py-16 px-6 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="max-w-xs">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {activeFilter === 'unread' ? 'No unread notifications' : 'No notifications'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {activeFilter === 'unread'
                  ? "You've read all your recent alerts and study reminders."
                  : 'Study reminders, AI schedule adaptations, and upcoming deadlines will appear here.'}
              </p>
            </div>
            {activeFilter !== 'all' && (
              <button
                onClick={() => setActiveFilter('all')}
                className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                View all notifications
              </button>
            )}
          </div>
        ) : (
          filteredNotifications.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-2xl transition-all border ${
                item.read
                  ? 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 opacity-90'
                  : 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-200/80 dark:border-indigo-800/80 shadow-xs'
              } flex items-start gap-3.5 group`}
            >
              {getNotificationIcon(item.type)}

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {getCategoryLabel(item.type)}
                    </span>
                    {!item.read && (
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium shrink-0">
                    {item.timestamp}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {item.message}
                </p>

                {/* Bottom Actions Row */}
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div>
                    {item.actionLabel && (
                      <button
                        onClick={() => handleNotificationAction(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors"
                      >
                        <span>{item.actionLabel}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggleRead(item.id)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
                      title={item.read ? 'Mark as unread' : 'Mark as read'}
                    >
                      <Check className="w-3 h-3" />
                      <span>{item.read ? 'Mark unread' : 'Mark read'}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Delete notification"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
