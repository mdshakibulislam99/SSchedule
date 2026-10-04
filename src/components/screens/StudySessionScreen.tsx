import React, { useState, useEffect } from 'react';
import { X, Play, Pause, RotateCcw, CheckCircle2, Sparkles, Volume2, VolumeX, ArrowLeft, Headphones } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Task } from '../../types';
import { playChime, startAmbientSound, stopAmbientSound, AmbientSoundType } from '../../utils/audio';

interface StudySessionScreenProps {
  task: Task;
  onClose: () => void;
  onAskAIHelp: (task: Task) => void;
  onCompleteSession: (task: Task, minutes: number) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
}

export const StudySessionScreen: React.FC<StudySessionScreenProps> = ({
  task,
  onClose,
  onAskAIHelp,
  onCompleteSession,
  onToggleSubtask,
}) => {
  const [mode, setMode] = useState<'pomodoro' | 'custom' | 'break'>('custom');
  const [totalMinutes, setTotalMinutes] = useState(task.estimatedMinutes || 45);
  const [secondsLeft, setSecondsLeft] = useState((task.estimatedMinutes || 45) * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [ambientSound, setAmbientSound] = useState<AmbientSoundType>('none');

  useEffect(() => {
    if (isRunning && ambientSound !== 'none') {
      startAmbientSound(ambientSound, 0.25);
    } else {
      stopAmbientSound();
    }
    return () => {
      stopAmbientSound();
    };
  }, [isRunning, ambientSound]);

  useEffect(() => {
    let t: any = null;
    if (isRunning && secondsLeft > 0) {
      t = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && secondsLeft === 0) {
      setIsRunning(false);
      playChime('success');
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    }
    return () => clearInterval(t);
  }, [isRunning, secondsLeft]);

  const switchMode = (newMode: 'pomodoro' | 'custom' | 'break') => {
    setIsRunning(false);
    setMode(newMode);
    const mins = newMode === 'pomodoro' ? 25 : newMode === 'break' ? 5 : task.estimatedMinutes || 45;
    setTotalMinutes(mins);
    setSecondsLeft(mins * 60);
  };

  const totalSecs = totalMinutes * 60;
  const progressPercent = Math.min(100, Math.round(((totalSecs - secondsLeft) / totalSecs) * 100));

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStartPause = () => {
    if (!isRunning) playChime('focus');
    setIsRunning(!isRunning);
  };

  const handleFinish = () => {
    const elapsedMinutes = Math.max(1, Math.round((totalSecs - secondsLeft) / 60));
    playChime('success');
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    onCompleteSession(task, elapsedMinutes);
    onClose();
  };

  return (
    <div className="w-full flex-1 flex flex-col justify-between py-2 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between min-h-[44px]">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Exit Focus</span>
        </button>

        <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          Focus Mode
        </span>

        <button
          onClick={() => onAskAIHelp(task)}
          className="flex items-center gap-1.5 py-1 px-3 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Need help?</span>
        </button>
      </div>

      {/* Target Title */}
      <div className="text-center space-y-1 my-2">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {task.title}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {task.courseCode || 'Personal'} · Due {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </p>
      </div>

      {/* Circular Timer (Matching Screen 24 in reference image) */}
      <div className="flex flex-col items-center justify-center my-auto py-4">
        <div className="relative w-56 h-56 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="44"
              className="text-slate-100 dark:text-slate-800 stroke-current"
              strokeWidth="6"
              fill="transparent"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              className="text-indigo-600 stroke-current transition-all duration-300"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray="276"
              strokeDashoffset={276 - (276 * progressPercent) / 100}
              strokeLinecap="round"
            />
          </svg>

          <div className="absolute flex flex-col items-center text-center">
            <span className="text-5xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums tracking-tight">
              {formatTimer(secondsLeft)}
            </span>
            <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
              {isRunning ? 'Flow state active' : 'Session paused'}
            </span>
          </div>
        </div>

        {/* Mode Selector (Matching Screen 24: Pomodoro / Custom / Break) */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold mt-4">
          {(['pomodoro', 'custom', 'break'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`py-1.5 px-3 rounded-xl transition-all capitalize ${
                mode === m
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Control Buttons (Matching Screen 24) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => {
              setIsRunning(false);
              setSecondsLeft(totalMinutes * 60);
            }}
            className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={handleStartPause}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl active:scale-95 transition-all ${
              isRunning
                ? 'bg-amber-500 shadow-amber-500/30'
                : 'bg-indigo-600 shadow-indigo-600/40'
            }`}
          >
            {isRunning ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
          </button>

          <button
            onClick={handleFinish}
            className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-100 transition-colors cursor-pointer"
            title="Finish & Save"
          >
            <CheckCircle2 className="w-6 h-6" />
          </button>
        </div>

        {/* Ambient Sound Selector */}
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <Headphones className="w-3.5 h-3.5" />
            <span>Ambient Focus Audio</span>
            {ambientSound !== 'none' && isRunning && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1" />
            )}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px]">
            {[
              { id: 'none', label: 'Off' },
              { id: 'rain', label: '🌧️ Rain' },
              { id: 'white', label: '💨 White Noise' },
              { id: 'binaural', label: '🧠 Alpha Beats' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setAmbientSound(s.id as AmbientSoundType)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  ambientSound === s.id
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subtask Quick Progress */}
        {task.subtasks.length > 0 && (
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Active Checklist
            </span>
            <div className="space-y-1.5 max-h-28 overflow-y-auto">
              {task.subtasks.map((s) => (
                <div
                  key={s.id}
                  onClick={() => onToggleSubtask(task.id, s.id)}
                  className="flex items-center gap-2 text-xs cursor-pointer select-none"
                >
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                    s.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-400'
                  }`}>
                    {s.completed && <CheckCircle2 className="w-3 h-3" />}
                  </span>
                  <span className={`truncate ${s.completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                    {s.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
