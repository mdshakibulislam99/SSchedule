import React, { useState } from 'react';
import { ArrowRight, BookOpen, Calendar, CheckCircle2, ChevronLeft, FileText, Plus, Target } from 'lucide-react';
import { Course, ScheduleEvent, StudyFile, Task } from '../../types';

interface CourseWorkspaceScreenProps {
  course: Course;
  tasks: Task[];
  files: StudyFile[];
  schedule: ScheduleEvent[];
  onBack: () => void;
  onSelectTask: (task: Task) => void;
  onOpenFiles: () => void;
  onOpenCalendar: () => void;
  onAddPlanStep: (courseId: string, step: string) => void;
}

export const CourseWorkspaceScreen: React.FC<CourseWorkspaceScreenProps> = ({
  course,
  tasks,
  files,
  schedule,
  onBack,
  onSelectTask,
  onOpenFiles,
  onOpenCalendar,
  onAddPlanStep,
}) => {
  const [newPlanStep, setNewPlanStep] = useState('');
  const courseTasks = tasks.filter((task) => task.courseCode === course.code);
  const courseFiles = files.filter(
    (file) => file.courseCode === course.code || course.materialsFileIds.includes(file.id)
  );
  const courseEvents = schedule.filter((event) => event.courseCode === course.code);
  const completedTasks = courseTasks.filter((task) => task.completed).length;
  const progress = courseTasks.length ? Math.round((completedTasks / courseTasks.length) * 100) : 0;

  const handleAddPlanStep = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPlanStep.trim()) return;
    onAddPlanStep(course.id, newPlanStep.trim());
    setNewPlanStep('');
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 pb-8 animate-fade-in text-slate-900 dark:text-white">
      <header className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 p-2 -ml-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Courses</span>
        </button>
        <span className="text-sm font-bold">Course workspace</span>
        <div className="w-16" />
      </header>

      <section className="rounded-[1.75rem] p-6 sm:p-8 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]" style={{ backgroundColor: course.color }}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <span className="inline-flex px-2.5 py-1 rounded-lg bg-white/20 text-xs font-extrabold tracking-wide">
              {course.code}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-3">{course.name}</h1>
            <p className="text-sm text-white/80 mt-1">
              {course.term || 'Current term'}{course.professor ? ` · ${course.professor}` : ''}
            </p>
          </div>
          <div className="min-w-[150px]">
            <div className="flex items-center justify-between text-xs font-semibold text-white/80">
              <span>Course progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/20 overflow-hidden mt-2">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[11px] text-white/70 mt-2">
              {completedTasks} of {courseTasks.length} tasks complete
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold">Study plan</h2>
            </div>
            <span className="text-[11px] text-slate-400">{course.studyPlan.length} steps</span>
          </div>
          <div className="space-y-2">
            {course.studyPlan.map((step, index) => (
              <div key={`${step}-${index}`} className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs">
                <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold">
                  {index + 1}
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{step}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddPlanStep} className="flex items-center gap-2">
            <input
              value={newPlanStep}
              onChange={(event) => setNewPlanStep(event.target.value)}
              placeholder="Add a course milestone..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            />
            <button type="submit" className="p-2.5 rounded-xl bg-indigo-600 text-white" aria-label="Add course milestone">
              <Plus className="w-4 h-4" />
            </button>
          </form>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold">Course tasks</h2>
            </div>
            <span className="text-[11px] text-slate-400">{courseTasks.length} total</span>
          </div>
          {courseTasks.length === 0 ? (
            <p className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500">No tasks linked to this course yet.</p>
          ) : (
            <div className="space-y-2">
              {courseTasks.slice(0, 5).map((task) => (
                <button
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className={`text-xs font-semibold truncate ${task.completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    {task.title}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold">Course materials</h2>
            </div>
            <button onClick={onOpenFiles} className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Open files</button>
          </div>
          {courseFiles.length === 0 ? (
            <p className="text-xs text-slate-500">No materials linked yet.</p>
          ) : (
            courseFiles.slice(0, 4).map((file) => (
              <div key={file.id} className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
                <FileText className="w-4 h-4 text-slate-400" />
                <span className="truncate">{file.name}</span>
              </div>
            ))
          )}
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold">Course schedule</h2>
            </div>
            <button onClick={onOpenCalendar} className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Open calendar</button>
          </div>
          <p className="text-xs text-slate-500">{course.schedulePattern || 'No recurring class time set.'}</p>
          <p className="text-xs text-slate-500">{courseEvents.length} linked calendar events</p>
        </section>
      </div>
    </div>
  );
};