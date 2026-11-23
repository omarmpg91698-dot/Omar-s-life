import type {TaskItem} from '../types';

export const DEFAULT_AUTO_ARCHIVE_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function isTaskArchived(task: TaskItem): boolean {
  return typeof task.archivedAt === 'number' && task.archivedAt > 0;
}

export function getTaskCompletionTimestamp(task: TaskItem): number | null {
  if (task.status !== 'خلصت') return null;
  if (typeof task.completedAt === 'number' && task.completedAt > 0) {
    return task.completedAt;
  }
  return task.updatedAt;
}

export function isEligibleForAutoArchive(
  task: TaskItem,
  nowMs = Date.now(),
  archiveAfterDays = DEFAULT_AUTO_ARCHIVE_DAYS,
): boolean {
  if (isTaskArchived(task)) return false;
  const completedAt = getTaskCompletionTimestamp(task);
  if (completedAt === null) return false;
  const thresholdMs = Math.max(1, archiveAfterDays) * DAY_MS;
  return nowMs - completedAt > thresholdMs;
}

export interface AutoArchiveResult {
  tasks: TaskItem[];
  archivedCount: number;
  archivedIds: string[];
}

export function autoArchiveExpiredTasks(
  tasks: TaskItem[],
  nowMs = Date.now(),
  archiveAfterDays = DEFAULT_AUTO_ARCHIVE_DAYS,
): AutoArchiveResult {
  const archivedIds: string[] = [];
  let changed = false;

  const nextTasks = tasks.map((task) => {
    if (!isEligibleForAutoArchive(task, nowMs, archiveAfterDays)) {
      return task;
    }
    changed = true;
    archivedIds.push(task.id);
    const completedAt = getTaskCompletionTimestamp(task) ?? task.updatedAt;
    return {
      ...task,
      completedAt,
      archivedAt: nowMs,
      updatedAt: nowMs,
    };
  });

  return {
    tasks: changed ? nextTasks : tasks,
    archivedCount: archivedIds.length,
    archivedIds,
  };
}

export function daysSinceCompletion(task: TaskItem, nowMs = Date.now()): number | null {
  const completedAt = getTaskCompletionTimestamp(task);
  if (completedAt === null) return null;
  return Math.max(0, Math.floor((nowMs - completedAt) / DAY_MS));
}

export function daysUntilAutoArchive(
  task: TaskItem,
  nowMs = Date.now(),
  archiveAfterDays = DEFAULT_AUTO_ARCHIVE_DAYS,
): number | null {
  if (isTaskArchived(task)) return null;
  const elapsed = daysSinceCompletion(task, nowMs);
  if (elapsed === null) return null;
  return Math.max(0, archiveAfterDays - elapsed);
}

export function formatArchiveDate(timestampMs: number | null | undefined): string {
  if (!timestampMs) return '—';
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(timestampMs));
  } catch {
    return new Date(timestampMs).toISOString().slice(0, 10);
  }
}
