import React, { useState } from 'react';
import { X, Home, CheckSquare, Sparkles, Calendar, FileText, BarChart2, Settings, Target, LogOut, GraduationCap } from 'lucide-react';
import { MascotAvatar } from '../mobile/MascotAvatar';
import { UserProfile } from '../../types';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
  user: UserProfile;
  onSignOut: () => void;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
  user,
  onSignOut,
}) => {
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);

  if (!isOpen) return null;

  const links = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'courses', label: 'Courses', icon: GraduationCap },
    { id: 'ai', label: 'AI Chat', icon: Sparkles },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'files', label: 'Files & Notes', icon: FileText },
    { id: 'progress', label: 'Progress', icon: BarChart2 },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in bg-black/60 backdrop-blur-sm">
      <div
        className="w-80 max-w-[86vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-2xl animate-slide-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-6">
          {/* Header (Matching Screen 28) */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <MascotAvatar size={32} />
              <span className="text-sm font-bold text-slate-900 dark:text-white">Student Mode</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Links */}
          <div className="space-y-1">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.id}
                  onClick={() => {
                    onClose();
                    onNavigate(link.id);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold text-xs transition-colors text-left"
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* User Footer */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {user.name}
            </div>
            <div className="text-[10px] text-slate-400 truncate">{user.university}</div>
          </div>
          <button
            onClick={() => setIsConfirmingSignOut(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isConfirmingSignOut && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-5"
          onClick={() => setIsConfirmingSignOut(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Sign out?</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              Your local tasks stay on this device. Google cloud sync will stop until you sign in again.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setIsConfirmingSignOut(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsConfirmingSignOut(false);
                  onSignOut();
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop tap to dismiss */}
      <div className="flex-1" onClick={onClose} />
    </div>
  );
};
