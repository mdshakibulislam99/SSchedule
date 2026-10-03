import React, { useState } from 'react';
import { BookOpen, ChevronRight, Plus, X, Layers, FileText, CheckCircle2, Clock, Sparkles, Bot, ListChecks } from 'lucide-react';
import { Course, CourseResource, Task } from '../../types';
import { computeCourseProgress, getCourseResources, getCourseTasks } from '../../utils/courses';

interface CoursesScreenProps {
  courses: Course[];
  tasks: Task[];
  resources: CourseResource[];
  onOpenCourse: (courseId: string, initialTab?: 'overview' | 'tasks' | 'resources' | 'ai' | 'progress') => void;
  onCreateCourse: (data: { name: string; code: string; color: string }) => void;
}

const COLOR_CHOICES = ['#EF4444', '#F59E0B', '#10B981', '#6366F1', '#0EA5E9', '#EC4899', '#8B5CF6'];

export const CoursesScreen: React.FC<CoursesScreenProps> = ({
  courses,
  tasks,
  resources,
  onOpenCourse,
  onCreateCourse,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(COLOR_CHOICES[3]);

  const activeCourses = courses.filter((c) => !c.isArchived);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    onCreateCourse({ name: name.trim(), code: code.trim().toUpperCase(), color });
    setName('');
    setCode('');
    setColor(COLOR_CHOICES[3]);
    setIsModalOpen(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 pb-8 animate-fade-in text-slate-900 dark:text-white">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-mobile-micro uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Learning</p>
          <h1 className="text-2xl font-extrabold tracking-tight">Courses</h1>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          New course
        </button>
      </header>

      {activeCourses.length === 0 ? (
        <div className="p-8 rounded-[1.5rem] border border-dashed border-slate-200 dark:border-slate-800 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold">No courses yet</h2>
          <p className="text-xs text-slate-500 mt-1">Create your first course workspace to organize tasks, resources, and AI learning.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
          {activeCourses.map((course) => {
            const courseResources = getCourseResources(course, resources);
            const courseTasks = getCourseTasks(course, tasks);
            const progress = computeCourseProgress(course, tasks, resources);
            const nextTask = courseTasks.find((t) => !t.completed);

            return (
              <div
                key={course.id}
                className="w-full p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800 transition-all flex flex-col justify-between"
              >
                <div
                  onClick={() => onOpenCourse(course.id)}
                  className="cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ backgroundColor: `${course.color}1A` }}
                      >
                        {course.coverEmoji || '📘'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md text-white uppercase"
                            style={{ backgroundColor: course.color }}
                          >
                            {course.code}
                          </span>
                          {courseResources.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                              <Sparkles className="w-2.5 h-2.5" />
                              AI Ready
                            </span>
                          )}
                        </div>
                        <h2 className="text-xs sm:text-sm font-bold truncate mt-0.5 text-slate-900 dark:text-white">{course.name}</h2>
                        <p className="text-[10px] text-slate-400 truncate">
                          {course.professor || 'No instructor'}{course.term ? ` · ${course.term}` : ''}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>

                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                      <span>Course progress</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{progress.percent}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-1">
                      <div className="h-full rounded-full transition-all" style={{ width: `${progress.percent}%`, backgroundColor: course.color }} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 mt-2 text-[10px] text-slate-500 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-slate-400" />
                      {progress.tasksCompleted}/{progress.tasksTotal} tasks
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3 h-3 text-slate-400" />
                      {courseResources.length} readings
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3 h-3 text-slate-400" />
                      {course.modules.length} modules
                    </span>
                  </div>

                  {nextTask && (
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                      <Clock className="w-3 h-3 shrink-0 text-slate-400" />
                      <span className="truncate">Next: <b className="text-slate-700 dark:text-slate-200">{nextTask.title}</b></span>
                    </div>
                  )}
                </div>

                {/* Quick AI Action Pills */}
                <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCourse(course.id, 'overview');
                    }}
                    className="flex-1 py-1 px-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    <span>Overview</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCourse(course.id, 'tasks');
                    }}
                    className="flex-1 py-1 px-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <ListChecks className="w-3 h-3 text-indigo-600" />
                    <span>Tasks</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCourse(course.id, 'ai');
                    }}
                    className="flex-1 py-1 px-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer active:scale-95"
                  >
                    <Bot className="w-3 h-3" />
                    <span>AI Learn</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-50 dark:bg-slate-950 animate-fade-in">
          {/* Full-page header */}
          <header className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex items-center gap-1 p-2 -ml-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
            <h2 className="text-base font-bold">New course</h2>
            <button
              type="submit"
              form="new-course-form"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-sm active:scale-95 transition-all"
            >
              Create
            </button>
          </header>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto">
            <form
              id="new-course-form"
              onSubmit={handleCreate}
              className="w-full max-w-lg mx-auto px-4 sm:px-6 py-6 pb-16 space-y-6"
            >
              {/* Live preview */}
              <div
                className="rounded-[1.5rem] p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
                style={{ backgroundColor: color }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shrink-0">
                    📘
                  </div>
                  <div className="min-w-0">
                    <span className="inline-flex px-2 py-0.5 rounded-md bg-white/20 text-xs font-extrabold tracking-wide">
                      {code.trim().toUpperCase() || 'CODE'}
                    </span>
                    <h3 className="text-lg font-extrabold truncate mt-1">{name.trim() || 'Course name'}</h3>
                  </div>
                </div>
                <p className="text-[11px] text-white/75 mt-3">Preview · this is how your course card will look.</p>
              </div>

              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Course name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Linear Algebra"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Course code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MATH201"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm uppercase focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Used to link this course to your existing tasks (e.g. CS101).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Colour
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {COLOR_CHOICES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`w-9 h-9 rounded-full transition-transform ${
                          color === c
                            ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900 scale-110'
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Colour ${c}`}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
              >
                Create course
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};