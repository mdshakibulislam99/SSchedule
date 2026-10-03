import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  Sparkles,
  Route,
  MessageSquare,
  ListChecks,
  Layers,
  Send,
  CheckCircle2,
  RotateCcw,
  Gauge,
} from 'lucide-react';
import {
  AIProviderConfig,
  Course,
  CourseFlashcard,
  CourseQuiz,
  CourseQuizAttempt,
  CourseQuizQuestion,
  CourseResource,
  CourseTutorMessage,
  Task,
} from '../../types';
import { AIOrchestrator } from '../../services/aiOrchestrator';
import { computeCourseProgress, getCourseResources, getCourseTasks } from '../../utils/courses';

interface CourseTutorScreenProps {
  course: Course;
  resources: CourseResource[];
  tasks: Task[];
  quizzes: CourseQuiz[];
  flashcards: CourseFlashcard[];
  config: AIProviderConfig;
  initialPrompt?: string;
  initialQuizResourceId?: string;
  onBack: () => void;
  onSaveQuiz: (quiz: CourseQuiz) => void;
  onSaveFlashcards: (cards: CourseFlashcard[]) => void;
}

type TutorTab = 'learn' | 'tutor' | 'quiz' | 'cards';

export const CourseTutorScreen: React.FC<CourseTutorScreenProps> = ({
  course,
  resources,
  tasks,
  quizzes,
  flashcards,
  config,
  initialPrompt,
  initialQuizResourceId,
  onBack,
  onSaveQuiz,
  onSaveFlashcards,
}) => {
  const courseResources = useMemo(() => getCourseResources(course, resources), [course, resources]);
  const courseQuizzes = useMemo(() => quizzes.filter((q) => q.courseId === course.id), [quizzes, course.id]);
  const courseCards = useMemo(() => flashcards.filter((c) => c.courseId === course.id), [flashcards, course.id]);
  const progress = useMemo(() => computeCourseProgress(course, tasks, resources), [course, tasks, resources]);
  const courseTasks = useMemo(() => getCourseTasks(course, tasks), [course, tasks]);

  const [tab, setTab] = useState<TutorTab>(initialQuizResourceId ? 'quiz' : 'learn');

  // Learn tab
  const [learningPath, setLearningPath] = useState<{ steps: string[]; reason: string } | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Tutor tab
  const [messages, setMessages] = useState<CourseTutorMessage[]>([
    {
      id: 'greet',
      sender: 'ai',
      text: `Hi! I'm your tutor for ${course.name}. Ask me anything about the course, its resources, or your upcoming tasks.`,
      timestamp: 'Now',
    },
  ]);
  const [chatInput, setChatInput] = useState(initialPrompt || '');
  const [chatLoading, setChatLoading] = useState(false);

  // Quiz tab
  const [quizResourceId, setQuizResourceId] = useState(initialQuizResourceId || courseResources[0]?.id || '');
  const [quiz, setQuiz] = useState<CourseQuiz | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [quizDone, setQuizDone] = useState(false);

  // Cards tab
  const [cardsResourceId, setCardsResourceId] = useState(courseResources[0]?.id || '');
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const generatePath = async () => {
    setPathLoading(true);
    try {
      const result = await AIOrchestrator.generateCourseLearningPath(course, courseResources, courseTasks, config);
      setLearningPath(result);
    } finally {
      setPathLoading(false);
    }
  };

  const generateInsight = async () => {
    setInsightLoading(true);
    try {
      const text = await AIOrchestrator.courseProgressInsight(course, progress, config);
      setInsight(text);
    } finally {
      setInsightLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, sender: 'user', text, timestamp: 'Now' }]);
    setChatInput('');
    setChatLoading(true);

    const systemInstruction = `You are StudyAI, a focused tutor for the course "${course.name}" (${course.code}).
Course objectives: ${course.objectives.join('; ') || 'n/a'}.
Modules: ${course.modules.map((m) => `${m.title}${m.completed ? ' (done)' : ''}`).join('; ') || 'n/a'}.
Available resources: ${courseResources.map((r) => r.title).join('; ') || 'none'}.
Open tasks: ${courseTasks.filter((t) => !t.completed).map((t) => t.title).join('; ') || 'none'}.
Student progress: ${progress.percent}%.
Answer with accurate, course-specific help. Keep replies clear and concise.`;

    try {
      const provider = AIOrchestrator.getProvider(config, 'routine');
      const history = messages.slice(-6).map((m) => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
      const reply = await provider.generateText(`${history}\nStudent: ${text}\nTutor:`, systemInstruction);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, sender: 'ai', text: reply?.trim() || 'Let me think about that differently — try rephrasing.', timestamp: 'Now' },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, sender: 'ai', text: 'I could not reach the AI provider just now. Check your AI provider settings and try again.', timestamp: 'Now' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const startQuiz = async () => {
    const resource = courseResources.find((r) => r.id === quizResourceId);
    if (!resource) return;
    setQuizLoading(true);
    setQuiz(null);
    setQuizIndex(0);
    setAnswers([]);
    setQuizDone(false);
    try {
      const questions: CourseQuizQuestion[] = await AIOrchestrator.generateQuizForResource(resource, config);
      setQuiz({
        id: `quiz-${Date.now()}`,
        courseId: course.id,
        resourceId: resource.id,
        title: `Quiz · ${resource.title}`,
        questions,
        attempts: [],
        createdAt: new Date().toISOString(),
      });
    } finally {
      setQuizLoading(false);
    }
  };

  const answerQuestion = (optionIndex: number) => {
    if (!quiz || quizDone) return;
    const nextAnswers = [...answers, optionIndex];
    setAnswers(nextAnswers);
    if (quizIndex + 1 >= quiz.questions.length) {
      setQuizDone(true);
      const correctCount = quiz.questions.reduce((acc, q, i) => acc + (nextAnswers[i] === q.correctIndex ? 1 : 0), 0);
      const attempt: CourseQuizAttempt = {
        id: `attempt-${Date.now()}`,
        score: Math.round((correctCount / quiz.questions.length) * 100),
        correctCount,
        totalQuestions: quiz.questions.length,
        takenAt: new Date().toISOString(),
      };
      onSaveQuiz({ ...quiz, attempts: [...quiz.attempts, attempt] });
    } else {
      setQuizIndex((i) => i + 1);
    }
  };

  const generateCards = async () => {
    const resource = courseResources.find((r) => r.id === cardsResourceId);
    if (!resource) return;
    setCardsLoading(true);
    try {
      const raw = await AIOrchestrator.generateFlashcards(resource, config);
      const newCards: CourseFlashcard[] = raw.map((c, i) => ({
        id: `card-${Date.now()}-${i}`,
        courseId: course.id,
        resourceId: resource.id,
        front: c.front,
        back: c.back,
        mastered: false,
        createdAt: new Date().toISOString(),
      }));
      onSaveFlashcards(newCards);
      setCardIndex(0);
      setFlipped(false);
    } finally {
      setCardsLoading(false);
    }
  };

  const toggleMastered = (card: CourseFlashcard) => {
    onSaveFlashcards([{ ...card, mastered: !card.mastered }]);
  };

  const tabs: { id: TutorTab; label: string; icon: typeof Sparkles }[] = [
    { id: 'learn', label: 'Learn', icon: Route },
    { id: 'tutor', label: 'Tutor', icon: MessageSquare },
    { id: 'quiz', label: 'Quiz', icon: ListChecks },
    { id: 'cards', label: 'Cards', icon: Layers },
  ];

  const passedAttempts = courseQuizzes.flatMap((q) => q.attempts);
  const avgScore = passedAttempts.length
    ? Math.round(passedAttempts.reduce((a, b) => a + b.score, 0) / passedAttempts.length)
    : null;

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 pb-8 animate-fade-in text-slate-900 dark:text-white">
      <header className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 p-2 -ml-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="truncate max-w-[120px]">{course.code}</span>
        </button>
        <span className="text-sm font-bold">AI Learning</span>
        <div className="w-16" />
      </header>

      <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all ${
                tab === t.id ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* LEARN */}
      {tab === 'learn' && (
        <div className="space-y-4">
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold">AI study path</h2>
              </div>
              <button
                onClick={generatePath}
                disabled={pathLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {pathLoading ? 'Building…' : learningPath ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {learningPath ? (
              <div className="space-y-2">
                <ol className="space-y-1.5">
                  {learningPath.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                      <span className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-slate-500 italic">{learningPath.reason}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Generate a personalized order for studying this course's modules, resources, and tasks.</p>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold">Progress coaching</h2>
              </div>
              <button
                onClick={generateInsight}
                disabled={insightLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {insightLoading ? 'Thinking…' : 'Coach me'}
              </button>
            </div>
            {insight ? (
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{insight}</p>
            ) : (
              <p className="text-xs text-slate-500">You are {progress.percent}% through this course. Get a specific next-step suggestion.</p>
            )}
          </section>

          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 text-center">
              <p className="text-lg font-extrabold">{progress.percent}%</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Progress</p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 text-center">
              <p className="text-lg font-extrabold">{avgScore !== null ? `${avgScore}%` : '—'}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Quiz avg</p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 text-center">
              <p className="text-lg font-extrabold">{courseCards.filter((c) => c.mastered).length}/{courseCards.length}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Cards</p>
            </div>
          </section>
        </div>
      )}

      {/* TUTOR */}
      {tab === 'tutor' && (
        <div className="flex flex-col gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4">
          <div className="space-y-3 max-h-[52vh] overflow-y-auto no-scrollbar pr-1">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 animate-pulse">
                  Tutor is thinking…
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendMessage();
              }}
              placeholder={`Ask about ${course.code}…`}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={sendMessage}
              disabled={chatLoading || !chatInput.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* QUIZ */}
      {tab === 'quiz' && (
        <div className="space-y-4">
          {courseResources.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              Add a resource to this course to generate quizzes.
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 flex flex-wrap items-center gap-3">
                <select
                  value={quizResourceId}
                  onChange={(e) => setQuizResourceId(e.target.value)}
                  className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                >
                  {courseResources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={startQuiz}
                  disabled={quizLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-60"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {quizLoading ? 'Creating…' : 'Generate quiz'}
                </button>
              </div>

              {quiz && !quizDone && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                    <span>Question {quizIndex + 1} of {quiz.questions.length}</span>
                    <span className="truncate max-w-[55%]">{quiz.title}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{quiz.questions[quizIndex].question}</p>
                  <div className="space-y-2">
                    {quiz.questions[quizIndex].options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => answerQuestion(i)}
                        className="w-full text-left px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {quiz && quizDone && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
                  <div className="text-center">
                    <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {Math.round((answers.reduce((acc, a, i) => acc + (a === quiz.questions[i].correctIndex ? 1 : 0), 0) / quiz.questions.length) * 100)}%
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {answers.reduce((acc, a, i) => acc + (a === quiz.questions[i].correctIndex ? 1 : 0), 0)} of {quiz.questions.length} correct
                    </p>
                  </div>
                  <div className="space-y-2">
                    {quiz.questions.map((q, i) => {
                      const ok = answers[i] === q.correctIndex;
                      return (
                        <div key={q.id} className={`p-3 rounded-xl border text-xs ${ok ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30' : 'border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30'}`}>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${ok ? 'text-emerald-600' : 'text-rose-500'}`} />
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-100">{q.question}</p>
                              {!ok && q.explanation && <p className="text-slate-500 mt-1">{q.explanation}</p>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={startQuiz}
                    className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retake quiz
                  </button>
                </div>
              )}

              {courseQuizzes.some((q) => q.attempts.length > 0) && (
                <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-2">
                  <h2 className="text-sm font-bold">Recent attempts</h2>
                  {courseQuizzes
                    .flatMap((q) => q.attempts.map((a) => ({ ...a, title: q.title })))
                    .slice(-5)
                    .reverse()
                    .map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                        <span className="truncate max-w-[60%]">{a.title}</span>
                        <span className="font-bold">{a.score}% ({a.correctCount}/{a.totalQuestions})</span>
                      </div>
                    ))}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* CARDS */}
      {tab === 'cards' && (
        <div className="space-y-4">
          {courseResources.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              Add a resource to this course to generate flashcards.
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 flex flex-wrap items-center gap-3">
              <select
                value={cardsResourceId}
                onChange={(e) => setCardsResourceId(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
              >
                {courseResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <button
                onClick={generateCards}
                disabled={cardsLoading}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {cardsLoading ? 'Creating…' : 'Generate cards'}
              </button>
            </div>
          )}

          {courseCards.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No flashcards yet. Generate a set from one of your resources above.
            </div>
          ) : (
            (() => {
              const idx = Math.min(cardIndex, courseCards.length - 1);
              const card = courseCards[idx];
              return (
                <div className="space-y-3">
                  <button
                    onClick={() => setFlipped((f) => !f)}
                    className="w-full min-h-[180px] p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center text-center"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                        {flipped ? 'Answer' : 'Question'} · card {idx + 1}/{courseCards.length}
                      </p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{flipped ? card.back : card.front}</p>
                      <p className="text-[11px] text-slate-400 mt-3">Tap to {flipped ? 'hide' : 'reveal'}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setFlipped(false);
                        setCardIndex((i) => (i - 1 + courseCards.length) % courseCards.length);
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => toggleMastered(card)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold ${card.mastered ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
                    >
                      {card.mastered ? 'Mastered ✓' : 'Mark mastered'}
                    </button>
                    <button
                      onClick={() => {
                        setFlipped(false);
                        setCardIndex((i) => (i + 1) % courseCards.length);
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
};