import React, { useState } from 'react';
import { X, BrainCircuit, Trash2, Plus, Sparkles, Check } from 'lucide-react';
import { AIMemoryItem } from '../../types';

interface AIMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: AIMemoryItem[];
  onAddMemory: (statement: string, category: 'preference' | 'schedule' | 'strength' | 'weakness') => void;
  onDeleteMemory: (id: string) => void;
}

export const AIMemoryModal: React.FC<AIMemoryModalProps> = ({
  isOpen,
  onClose,
  memory,
  onAddMemory,
  onDeleteMemory,
}) => {
  const [newStatement, setNewStatement] = useState('');
  const [newCategory, setNewCategory] = useState<'preference' | 'schedule' | 'strength' | 'weakness'>('preference');

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatement.trim()) return;
    onAddMemory(newStatement.trim(), newCategory);
    setNewStatement('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-2" />

        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">AI Memory</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          StudyAI continuously remembers your study preferences and cognitive rhythm to optimize daily recommendations. You remain in full control.
        </p>

        {/* Memory List (Section 25) */}
        <div className="space-y-2">
          {memory.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  {item.category}
                </span>
                <p className="text-slate-800 dark:text-slate-200 font-medium leading-snug">
                  "{item.statement}"
                </p>
                <span className="text-[10px] text-slate-400 font-mono block">
                  Added {item.dateAdded}
                </span>
              </div>

              <button
                onClick={() => onDeleteMemory(item.id)}
                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                title="Forget this memory"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Memory Input */}
        <form onSubmit={handleAdd} className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
            Teach StudyAI a new preference:
          </label>
          <input
            type="text"
            placeholder="e.g. Needs a 5-minute stretch every 30 minutes..."
            value={newStatement}
            onChange={(e) => setNewStatement(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-purple-500"
          />

          <div className="flex items-center gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none capitalize"
            >
              <option value="preference">Preference</option>
              <option value="schedule">Schedule</option>
              <option value="strength">Strength</option>
              <option value="weakness">Weakness</option>
            </select>

            <button
              type="submit"
              className="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Remember</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
