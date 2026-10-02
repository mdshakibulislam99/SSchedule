import React from 'react';
import { X, Home, CheckSquare, Sparkles, Calendar, FileText, BarChart2, Settings, Target, User } from 'lucide-react';
import { MascotAvatar } from '../mobile/MascotAvatar';
import { UserProfile } from '../../types';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
  user: UserProfile;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
  user,
}) => {
  if (!isOpen) return null;

  const links = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'ai', label: 'AI Chat', icon: Sparkles },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'files', label: 'Files & Notes', icon: FileText },
    { id: 'progress', label: 'Progress', icon: BarChart2 },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in bg-black/60 backdrop-blur-sm">
      <div
        className="w-72 max-w-[80vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between shadow-2xl animate-slide-right"
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
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold text-xs transition-colors text-left"
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
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {user.name}
            </div>
            <div className="text-[10px] text-slate-400 truncate">{user.university}</div>
          </div>
        </div>
      </div>

      {/* Backdrop tap to dismiss */}
      <div className="flex-1" onClick={onClose} />
    </div>
  );
};
