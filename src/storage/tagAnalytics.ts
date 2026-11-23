import type {TaskItem} from '../types';

export type TagScopeMode = 'completed' | 'all' | 'active';
export type TagTimeframe = 'all_time' | '30d' | '7d';

export interface TagDistributionBucket {
  tag: string;
  label: string;
  isUntagged: boolean;
  total: number;
  completed: number;
  remaining: number;
  sharePercent: number;
  completionRate: number;
  color: string;
}

export interface TagDistributionSummary {
  scope: TagScopeMode;
  timeframe: TagTimeframe;
  totalTasksInScope: number;
  totalAssignments: number;
  activeTagCount: number;
  buckets: TagDistributionBucket[];
  topTag: TagDistributionBucket | null;
}

export const UNTAGGED_LABEL = 'بدون تصنيف';

const TAG_PALETTE = [
  '#0d9488', // teal
  '#2563eb', // blue
  '#4f46e5', // indigo
  '#d97706', // amber
  '#059669', // emerald
  '#7c3aed', // violet
  '#e11d48', // rose
  '#0284c7', // sky
];

const UNTAGGED_COLOR = '#94a3b8';

const DAY_MS = 24 * 60 * 60 * 1000;

function isTaskWithinTimeframe(
  task: TaskItem,
  timeframe: TagTimeframe,
  nowMs: number,
): boolean {
  if (timeframe === 'all_time') return true;
  const days = timeframe === '7d' ? 7 : 30;
  const cutoffMs = nowMs - days * DAY_MS;

  // Prefer updatedAt for completed tasks (completion moment); fall back to dueDate/createdAt
  const refMs = task.updatedAt || task.createdAt;
  if (refMs >= cutoffMs) return true;

  if (task.dueDate) {
    const parsedDue = Date.parse(`${task.dueDate}T23:59:59`);
    if (!Number.isNaN(parsedDue) && parsedDue >= cutoffMs && parsedDue <= nowMs + DAY_MS) {
      return true;
    }
  }
  return false;
}

export function computeTagDistribution(
  tasks: TaskItem[],
  scope: TagScopeMode = 'completed',
  timeframe: TagTimeframe = 'all_time',
  nowMs = Date.now(),
): TagDistributionSummary {
  const scopedTasks = tasks.filter((task) => {
    if (scope === 'active' && task.status === 'خلصت') return false;
    if (scope === 'completed' && task.status !== 'خلصت') return false;
    return isTaskWithinTimeframe(task, timeframe, nowMs);
  });

  // Also compute overall completion rate per tag across all tasks (within timeframe)
  const overallByTag = new Map<string, {total: number; completed: number}>();
  for (const task of tasks) {
    if (!isTaskWithinTimeframe(task, timeframe, nowMs)) continue;
    const cleanTags = Array.from(
      new Set((task.tags ?? []).map((t) => t.trim()).filter(Boolean)),
    );
    const keys = cleanTags.length === 0 ? ['__untagged__'] : cleanTags;
    const isDone = task.status === 'خلصت';
    for (const key of keys) {
      const prev = overallByTag.get(key) ?? {total: 0, completed: 0};
      prev.total += 1;
      if (isDone) prev.completed += 1;
      overallByTag.set(key, prev);
    }
  }

  const bucketMap = new Map<
    string,
    {tag: string; isUntagged: boolean; total: number; completed: number; remaining: number}
  >();

  let totalAssignments = 0;

  for (const task of scopedTasks) {
    const cleanTags = Array.from(
      new Set((task.tags ?? []).map((t) => t.trim()).filter(Boolean)),
    );
    const isDone = task.status === 'خلصت';

    if (cleanTags.length === 0) {
      const prev = bucketMap.get('__untagged__') ?? {
        tag: UNTAGGED_LABEL,
        isUntagged: true,
        total: 0,
        completed: 0,
        remaining: 0,
      };
      prev.total += 1;
      if (isDone) prev.completed += 1;
      else prev.remaining += 1;
      bucketMap.set('__untagged__', prev);
      totalAssignments += 1;
      continue;
    }

    for (const tag of cleanTags) {
      const prev = bucketMap.get(tag) ?? {
        tag,
        isUntagged: false,
        total: 0,
        completed: 0,
        remaining: 0,
      };
      prev.total += 1;
      if (isDone) prev.completed += 1;
      else prev.remaining += 1;
      bucketMap.set(tag, prev);
      totalAssignments += 1;
    }
  }

  const sortedRaw = Array.from(bucketMap.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (a.isUntagged !== b.isUntagged) return a.isUntagged ? 1 : -1;
    return a.tag.localeCompare(b.tag, 'ar');
  });

  let colorIdx = 0;
  const buckets: TagDistributionBucket[] = sortedRaw.map((entry) => {
    const color = entry.isUntagged
      ? UNTAGGED_COLOR
      : TAG_PALETTE[colorIdx++ % TAG_PALETTE.length];
    const sharePercent =
      totalAssignments > 0 ? Math.round((entry.total / totalAssignments) * 100) : 0;

    const overallKey = entry.isUntagged ? '__untagged__' : entry.tag;
    const overall = overallByTag.get(overallKey);
    const completionRate =
      scope === 'completed' && overall && overall.total > 0
        ? Math.round((overall.completed / overall.total) * 100)
        : entry.total > 0
          ? Math.round((entry.completed / entry.total) * 100)
          : 0;

    return {
      tag: entry.tag,
      label: entry.isUntagged ? UNTAGGED_LABEL : `#${entry.tag}`,
      isUntagged: entry.isUntagged,
      total: entry.total,
      completed: entry.completed,
      remaining: entry.remaining,
      sharePercent,
      completionRate,
      color,
    };
  });

  const topTagged = buckets.find((b) => !b.isUntagged) ?? buckets[0] ?? null;
  const activeTagCount = buckets.filter((b) => !b.isUntagged).length;

  return {
    scope,
    timeframe,
    totalTasksInScope: scopedTasks.length,
    totalAssignments,
    activeTagCount,
    buckets,
    topTag: topTagged,
  };
}
