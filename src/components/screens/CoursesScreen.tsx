import React, { useState } from 'react';
import { BookOpen, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react';
import { Course, CourseResource, Task } from '../../types';
import { computeCourseProgress, getCourseResources, getCourseTasks } from '../../utils/courses';

interface CoursesScreenProps {
  courses: Course[];
  tasks: Task[];
  resources: CourseResource[];
  onOpenCourse: (courseId: string, initialTab?: 'overview' | 'tasks' | 'resources' | 'ai' | 'progress') => void;
  onCreateCourse: (data: { name: string; code: string; color: string }) => void;
  onDeleteCourse?: (courseId: string, deleteAssociatedData?: boolean) => void;
}

const COLOR_CHOICES = ['#EF4444', '#F59E0B', '#10B981', '#6366F1', '#0EA5E9', '#EC4899', '#8B5CF6'];

export const CoursesScreen: React.FC<CoursesScreenProps> = ({
  courses,
  tasks,
  resources,
  onOpenCourse,
  onCreateCourse,
  onDeleteCourse,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [deleteAssociatedData, setDeleteAssociatedData] = useState(true);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(COLOR_CHOICES[3]);

  const activeCourses = courses.filter((c) => !c.isArchived);

  const filteredCourses = activeCourses.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.professor && c.professor.toLowerCase().includes(q))
    );
  });

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
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-5 pb-8 animate-fade-in text-slate-900 dark:text-white">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Courses</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {activeCourses.length} active {activeCourses.length === 1 ? 'workspace' : 'workspaces'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeCourses.length > 2 && (
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search courses..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New course</span>
          </button>
        </div>
      </header>

      {/* Courses Content */}
      {activeCourses.length === 0 ? (
        <div className="p-12 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/40">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">No courses yet</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Create your first course workspace to organize syllabus milestones, assignments, and study materials.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            Create Course
          </button>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs font-semibold text-slate-500">No courses match &ldquo;{searchQuery}&rdquo;</p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          {filteredCourses.map((course) => {
            const progress = computeCourseProgress(course, tasks, resources);

            return (
              <div
                key={course.id}
                onClick={() => onOpenCourse(course.id)}
                className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3 p-3.5 pr-3">
                  {/* Course emoji tile */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 transition-transform group-hover:scale-105"
                    style={{ backgroundColor: `${course.color}15` }}
                  >
                    {course.coverEmoji || '📘'}
                  </div>

                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {course.name}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                      <span
                        className="font-extrabold uppercase tracking-wide font-mono shrink-0"
                        style={{ color: course.color }}
                      >
                        {course.code}
                      </span>
                      {course.term && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="truncate">{course.term}</span>
                        </>
                      )}
                      {course.professor && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="truncate">{course.professor}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress summary */}
                  <div
                    className="flex flex-col items-end shrink-0"
                    title={`${progress.tasksCompleted} of ${progress.tasksTotal} tasks done`}
                  >
                    <span className="text-sm font-extrabold font-mono tabular-nums" style={{ color: course.color }}>
                      {progress.percent}%
                    </span>
                    <span className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
                      {progress.tasksCompleted}/{progress.tasksTotal} tasks
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {onDeleteCourse && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCourseToDelete(course);
                          setDeleteAssociatedData(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                        title="Delete course"
                        aria-label={`Delete course ${course.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-all" />
                  </div>
                </div>

                {/* Slim progress accent along the bottom edge */}
                <div className="h-1 w-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${progress.percent}%`, backgroundColor: course.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Page New Course Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-50 dark:bg-slate-950 animate-fade-in">
          {/* Header */}
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

          {/* Form body */}
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
                    <span className="inline-flex px-2 py-0.5 rounded-md bg-white/20 text-xs font-extrabold tracking-wide font-mono">
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
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm uppercase focus:outline-none focus:border-indigo-500 font-mono"
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

      {/* Delete Course Confirmation Modal */}
      {courseToDelete && (() => {
        const linkedTasks = getCourseTasks(courseToDelete, tasks);
        const linkedResources = getCourseResources(courseToDelete, resources);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Delete course</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Remove course workspace</p>
                </div>
              </div>

              {/* Course Identity Card */}
              <div
                className="p-3.5 rounded-xl text-white flex items-center gap-2.5 shadow-xs"
                style={{ backgroundColor: courseToDelete.color }}
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg shrink-0">
                  {courseToDelete.coverEmoji || '📘'}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white/20 uppercase font-mono">
                    {courseToDelete.code}
                  </span>
                  <p className="font-bold text-xs truncate mt-0.5">{courseToDelete.name}</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to delete <b className="text-slate-900 dark:text-white">{courseToDelete.name}</b>?
              </p>

              {(linkedTasks.length > 0 || linkedResources.length > 0) && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteAssociatedData}
                    onChange={(e) => setDeleteAssociatedData(e.target.checked)}
                    className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Delete associated tasks & study materials
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 block mt-0.5">
                      {linkedTasks.length} task{linkedTasks.length === 1 ? '' : 's'} and {linkedResources.length} reading{linkedResources.length === 1 ? '' : 's'}. If unchecked, tasks are kept as personal tasks.
                    </span>
                  </div>
                </label>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCourseToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (courseToDelete && onDeleteCourse) {
                      onDeleteCourse(courseToDelete.id, deleteAssociatedData);
                    }
                    setCourseToDelete(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Course</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};