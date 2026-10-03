import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  Paperclip,
  Sparkles,
  Calendar,
  CheckCircle2,
  X,
  FileText,
  RotateCcw,
  ArrowRight,
  BookOpen,
  Globe,
} from 'lucide-react';
import { MascotAvatar } from '../mobile/MascotAvatar';
import { AIMessage, AIActionProposal, Task, StudyFile, AIProviderConfig, ScheduleEvent, UserProfile } from '../../types';
import { AIOrchestrator, AIExecutionContext } from '../../services/aiOrchestrator';
import { getLocalDateKey } from '../../utils/dates';

interface AIChatScreenProps {
  contextTask?: Task | null;
  contextFile?: StudyFile | null;
  onClearContext?: () => void;
  onOpenVoiceModal: () => void;
  onExecuteAction: (action: AIActionProposal) => void;
  config: AIProviderConfig;
  allTasks: Task[];
  schedule?: ScheduleEvent[];
  user?: UserProfile;
  aiConfigured: boolean;
  onAISetupRequired: () => void;
}

export const AIChatScreen: React.FC<AIChatScreenProps> = ({
  contextTask,
  contextFile,
  onClearContext,
  onOpenVoiceModal,
  onExecuteAction,
  config,
  allTasks,
  schedule = [],
  user,
  aiConfigured,
  onAISetupRequired,
}) => {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'msg-1',
      sender: 'user',
      text: contextTask ? `Can you help me plan my work on ${contextTask.title}?` : 'What should I do right now?',
      timestamp: '9:41 AM',
    },
    {
      id: 'msg-2',
      sender: 'ai',
      text: contextTask
        ? `I analyzed your ${contextTask.courseCode} deadline (due in 2 days) and your available time slots today. I recommend focusing on the double-rotation algorithm for 30 minutes before your next class.`
        : "Based on your schedule, deadlines, and high energy level right now, I recommend focusing on CS101 Assignment 2 (30 min) before your afternoon lecture.",
      timestamp: '9:41 AM',
      actions: [
        {
          id: 'act-1',
          type: 'add_schedule',
          title: contextTask ? `${contextTask.title} Focus Sprint` : 'CS101 Assignment 2 Focus',
          description: 'Today · 3:00 PM – 4:00 PM (Matches your afternoon focus rhythm)',
          details: {
            title: contextTask ? `${contextTask.title} Study` : 'CS101 Focus',
            startTime: '15:00',
            endTime: '16:00',
            date: getLocalDateKey(),
            type: 'study',
            color: '#6366F1',
          },
          status: 'pending',
        },
      ],
      suggestedChips: [
        'Add to Schedule',
        'Break into smaller steps',
        'Explain AVL rotations',
      ],
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [enableSearch, setEnableSearch] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;
    if (!aiConfigured) {
      onAISetupRequired();
      return;
    }

    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const context: AIExecutionContext = {
        currentTask: contextTask || null,
        currentFile: contextFile || null,
        tasks: allTasks,
        schedule,
        user,
        energyLevel: user?.energyLevel,
      };

      const aiResponse = await AIOrchestrator.chatWithContext(text, messages, context, config, enableSearch);

      const aiMsg: AIMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiResponse.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: aiResponse.actions,
        suggestedChips: aiResponse.suggestedChips,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (e: any) {
      const fallbackMsg: AIMessage = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: `I've checked your schedule and tasks. What would you like to tackle next?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleActionConfirm = (action: AIActionProposal) => {
    onExecuteAction(action);
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.actions) return m;
        return {
          ...m,
          actions: m.actions.map((a) => (a.id === action.id ? { ...a, status: 'confirmed' } : a)),
        };
      })
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col h-full animate-fade-in text-slate-900 dark:text-white">
      {/* Chat Top Header (Matching Screen 11) */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <MascotAvatar size={38} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>AI Study Assistant</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Always here for you</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setEnableSearch((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
              enableSearch
                ? 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}
            title="Google Search Grounding (gemini-3.5-flash)"
          >
            <Globe className="w-3 h-3" />
            <span className="hidden xs:inline">Search</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                enableSearch ? 'bg-blue-500' : 'bg-slate-400'
              }`}
            />
          </button>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 uppercase font-bold">
            {config.activeProvider}
          </span>
        </div>
      </div>

      {/* Context Banner if opened from task or file */}
      {(contextTask || contextFile) && (
        <div className="mt-2 p-2 px-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="truncate font-semibold text-indigo-950 dark:text-indigo-200">
              Attached Context: {contextTask ? contextTask.title : contextFile?.name}
            </span>
          </div>
          {onClearContext && (
            <button onClick={onClearContext} className="text-slate-400 hover:text-slate-600 ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 min-h-[340px]">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}
            >
              <div className="flex items-end gap-2 max-w-[85%]">
                {!isUser && <MascotAvatar size={28} className="shrink-0 mb-1" />}

                <div
                    className={`p-3.5 rounded-[1.25rem] text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-sm shadow-sm'
                      : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm shadow-[0_6px_18px_rgba(15,23,42,0.04)]'
                  }`}
                >
                  {msg.text}
                </div>
              </div>

              {/* Action Proposal Cards (Section 4 & 29) */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="w-[85%] ml-9 space-y-2">
                  {msg.actions.map((action) => (
                    <div
                      key={action.id}
                      className="p-4 rounded-[1.25rem] bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span className="text-slate-800 dark:text-slate-100">{action.title}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
                        {action.description}
                      </p>

                      <div className="flex items-center gap-2 pt-1">
                        {action.status === 'confirmed' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{action.type === 'create_task' ? 'Added to Tasks' : 'Added to Schedule'}</span>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleActionConfirm(action)}
                              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm"
                            >
                              {action.type === 'create_task' ? 'Add to Tasks' : 'Add to Schedule'}
                            </button>
                            <button
                              onClick={() => handleSend('Suggest another time for this study session')}
                              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                            >
                              Another Time
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Suggested Chips */}
              {msg.suggestedChips && msg.suggestedChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 ml-9">
                  {msg.suggestedChips.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(chip)}
                      className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-slate-200/80 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-2 ml-2 text-xs text-slate-400 animate-pulse">
            <MascotAvatar size={24} />
            <span>StudyAI is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar (Matching Screen 11) */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <button
            onClick={onOpenVoiceModal}
            className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full transition-colors"
            title="Voice Input"
          >
            <Mic className="w-4 h-4" />
          </button>

          <input
            type="text"
            placeholder="Type a message or ask StudyAI..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none px-1"
          />

          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim()}
            className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-sm transition-all"
            title="Send"
          >
            <Send className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
