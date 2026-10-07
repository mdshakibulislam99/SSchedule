import React, { useState, useEffect } from 'react';
import { X, Mic, Volume2 } from 'lucide-react';

interface VoiceAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitVoice: (transcript: string) => void;
}

export const VoiceAIModal: React.FC<VoiceAIModalProps> = ({
  isOpen,
  onClose,
  onSubmitVoice,
}) => {
  const [isListening, setIsListening] = useState(true);
  const [transcript, setTranscript] = useState('Listening to your voice...');

  useEffect(() => {
    if (!isOpen) return;
    setIsListening(true);
    setTranscript('Listening to your voice...');

    // Simulate speech recognition transcription for demo fidelity
    const phrases = [
      'How should I prepare for my CS101 exam next week?',
      'Schedule 2 hours of study tomorrow afternoon.',
      'What are the key topics in my uploaded syllabus?',
      'What should I study right now before my lunch break?',
    ];
    const picked = phrases[Math.floor(Math.random() * phrases.length)];

    const t = setTimeout(() => {
      setTranscript(`"${picked}"`);
    }, 2200);

    return () => clearTimeout(t);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFinish = () => {
    onSubmitVoice(transcript.replace(/^"|"$/g, ''));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-between bg-white dark:bg-slate-950 px-6 pt-safe-6 pb-24 sm:pb-6 animate-fade-in">
      {/* Top Bar */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
        >
          <X className="w-6 h-6" />
        </button>
        <span className="text-sm font-bold text-slate-900 dark:text-white">Voice StudyAI</span>
        <div className="w-8" />
      </div>

      {/* Center Animated Orb */}
      <div className="flex flex-col items-center justify-center my-auto space-y-6">
        <div className="relative flex items-center justify-center">
          {/* Animated Pulsing Rings */}
          <div className="absolute w-44 h-44 rounded-full bg-indigo-500/20 animate-ping duration-1000" />
          <div className="absolute w-36 h-36 rounded-full bg-indigo-500/30 animate-pulse" />

          {/* Central Mic Button */}
          <button
            onClick={handleFinish}
            className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-xl shadow-indigo-500/40 active:scale-95 transition-transform"
          >
            <Mic className="w-10 h-10" />
          </button>
        </div>

        <div className="text-center px-4">
          <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            {isListening ? 'Tap orb when finished speaking' : 'Speech recognized'}
          </p>
          <h3 className="text-base font-medium text-slate-800 dark:text-slate-200 mt-2 min-h-[48px]">
            {transcript}
          </h3>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="space-y-3 pb-4 max-w-sm mx-auto w-full">
        {transcript.startsWith('"') && (
          <button
            onClick={handleFinish}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
          >
            Send to StudyAI
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
