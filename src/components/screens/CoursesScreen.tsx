import React, { useState } from 'react';
import { BookOpen, ChevronRight, Plus, X, Layers, FileText, CheckCircle2, Clock } from 'lucide-react';
import { Course, CourseResource, Task } from '../../types';
import { computeCourseProgress, getCourseResources, getCourseTasks } from '../../utils/courses';

interface CoursesScreenProps {
  courses: Course[];
  tasks: Task[];
  resources: CourseResource[];
  onOpenCourse: (courseId: string) => void;
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activeCourses.map((course) => {
            const courseResources = getCourseResources(course, resources);
            const courseTasks = getCourseTasks(course, tasks);
            const progress = computeCourseProgress(course, tasks, resources);
            const nextTask = courseTasks.find((t) => !t.completed);

            return (
              <button
                key={course.id}
                onClick={() => onOpenCourse(course.id)}
                className="text-left p-5 rounded-[1.5rem] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: `${course.color}1A` }}
                    >
                      {course.coverEmoji || '📘'}
                    </div>
                    <div className="min-w-0">
                      <span
                        className="text-mobile-micro font-extrabold px-2 py-0.5 rounded-md text-white"
                        style={{ backgroundColor: course.color }}
                      >
                        {course.code}
                      </span>
                      <h2 className="text-sm font-bold truncate mt-1">{course.name}</h2>
                      <p className="text-[11px] text-slate-500 truncate">
                        {course.professor || 'No instructor'}{course.term ? ` · ${course.term}` : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <span>Course progress</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-1.5">
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress.percent}%`, backgroundColor: course.color }} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {progress.tasksCompleted}/{progress.tasksTotal} tasks
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {courseResources.length} resources
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" />
                    {course.modules.length} modules
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{nextTask ? `Next: ${nextTask.title}` : 'No open tasks — nice work!'}</span>
                </div>
              </button>
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