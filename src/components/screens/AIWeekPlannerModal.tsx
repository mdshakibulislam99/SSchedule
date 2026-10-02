import React, { useState } from 'react';
import { X, Sparkles, Calendar, Check, ArrowRight } from 'lucide-react';
import { Task, ScheduleEvent } from '../../types';
import { AIOrchestrator } from '../../services/aiOrchestrator';

interface AIWeekPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  schedule: ScheduleEvent[];
  onAddPlanToSchedule: (sessions: { title: string; day: string; duration: string; color: string }[]) => void;
}

export const AIWeekPlannerModal: React.FC<AIWeekPlannerModalProps> = ({
  isOpen,
  onClose,
  tasks,
  schedule,
  onAddPlanToSchedule,
}) => {
  const [activeTab, setActiveTab] = useState<'this_week' | 'next_week'>('this_week');
  const [isAdded, setIsAdded] = useState(false);

  if (!isOpen) return null;

  const plan = AIOrchestrator.generateWeekPlan(tasks, schedule);

  const handleApply = () => {
    const flatSessions: { title: string; day: string; duration: string; color: string }[] = [];
    plan.forEach((p) => {
      p.sessions.forEach((s) => {
        flatSessions.push({
          title: s.title,
          day: p.day,
          duration: s.duration,
          color: s.color,
        });
      });
    });
    onAddPlanToSchedule(flatSessions);
    setIsAdded(true);
    setTimeout(() => {
      setIsAdded(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">AI Study Plan</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle (Matching Screen 25: This Week / Next Week) */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 my-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('this_week')}
            className={`py-2 rounded-xl transition-all ${
              activeTab === 'this_week'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setActiveTab('next_week')}
            className={`py-2 rounded-xl transition-all ${
              activeTab === 'next_week'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500'
            }`}
          >
            Next Week
          </button>
        </div>

        {/* Generated Days List (Matching Screen 25) */}
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          {plan.map((dayItem) => (
            <div
              key={dayItem.day}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {dayItem.day}
              </div>

              <div className="space-y-1.5">
                {dayItem.sessions.map((sess, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: sess.color }}
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {sess.title}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0 ml-2">
                      {sess.duration}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Actions */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <button
            onClick={handleApply}
            disabled={isAdded}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all disabled:opacity-80"
          >
            {isAdded ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Added to Calendar!</span>
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                <span>Add All to Schedule</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
