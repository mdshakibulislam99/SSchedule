import { Course, CourseProgress, CourseResource, Task } from '../types';

/**
 * Resources that belong to a course, matched by id or (for resilience) by code.
 */
export function getCourseResources(course: Course, resources: CourseResource[]): CourseResource[] {
  return resources.filter((r) => r.courseId === course.id || r.courseCode === course.code);
}

/**
 * Tasks linked to a course. Tasks stay a separate system but are linked here by courseCode.
 */
export function getCourseTasks(course: Course, tasks: Task[]): Task[] {
  return tasks.filter((t) => t.courseCode === course.code);
}

/**
 * Derives a course progress snapshot from its tasks, resources, and modules.
 * The overall percent weights tasks (40%), resources (35%), and modules (25%),
 * averaging only the components that actually have items so an empty course is 0%.
 */
export function computeCourseProgress(
  course: Course,
  tasks: Task[],
  resources: CourseResource[]
): CourseProgress {
  const courseTasks = getCourseTasks(course, tasks);
  const courseResources = getCourseResources(course, resources);

  const tasksCompleted = courseTasks.filter((t) => t.completed).length;
  const resourcesRead = courseResources.filter((r) => r.reading.completed).length;
  const modulesCompleted = course.modules.filter((m) => m.completed).length;

  const tasksTotal = courseTasks.length;
  const resourcesTotal = courseResources.length;
  const modulesTotal = course.modules.length;

  const parts: number[] = [];
  if (tasksTotal > 0) parts.push((tasksCompleted / tasksTotal) * 0.4);
  if (resourcesTotal > 0) parts.push((resourcesRead / resourcesTotal) * 0.35);
  if (modulesTotal > 0) parts.push((modulesCompleted / modulesTotal) * 0.25);

  const weightUsed = (tasksTotal > 0 ? 0.4 : 0) + (resourcesTotal > 0 ? 0.35 : 0) + (modulesTotal > 0 ? 0.25 : 0);
  const percent = weightUsed > 0 ? Math.round((parts.reduce((a, b) => a + b, 0) / weightUsed) * 100) : 0;

  const readDates = courseResources
    .map((r) => r.reading.lastReadAt)
    .filter(Boolean) as string[];
  const lastActivityAt = readDates.sort().slice(-1)[0];

  return {
    percent,
    tasksCompleted,
    tasksTotal,
    resourcesRead,
    resourcesTotal,
    modulesCompleted,
    modulesTotal,
    lastActivityAt,
  };
}