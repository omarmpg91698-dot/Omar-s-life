import {formatReminderTime, getTodayIso, isTaskOverdue} from './localStore';
import type {TaskItem} from '../types';

export interface PlannerHourSlot {
  hour: number;
  time24: string; // "08:00"
  label: string; // "8:00 ص"
}

export interface DayPlannerPartition {
  scheduledByHour: Record<string, TaskItem[]>;
  orderedScheduledTasks: TaskItem[];
  scheduledCount: number;
  completedScheduledCount: number;
  unscheduledTasks: TaskItem[];
}

export type DropPosition = 'before' | 'after';

export interface PlannerTaskPatch {
  id: string;
  patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>;
}

export function buildPlannerHours(startHour = 8, endHour = 22): PlannerHourSlot[] {
  const slots: PlannerHourSlot[] = [];
  for (let h = startHour; h <= endHour; h += 1) {
    const time24 = `${String(h).padStart(2, '0')}:00`;
    slots.push({
      hour: h,
      time24,
      label: formatReminderTime(time24),
    });
  }
  return slots;
}

export function getSlotHourKey(time24: string | null | undefined): string | null {
  if (!time24) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:00`;
}

export function shiftTimeByHours(
  time24: string | null | undefined,
  deltaHours: number,
  minHour = 6,
  maxHour = 23,
): string | null {
  const slotKey = getSlotHourKey(time24);
  if (!slotKey) return null;
  const currentHour = Number(slotKey.slice(0, 2));
  const minutes = time24?.trim().slice(3, 5) ?? '00';
  const nextHour = Math.max(minHour, Math.min(maxHour, currentHour + deltaHours));
  if (nextHour === currentHour) return null;
  return `${String(nextHour).padStart(2, '0')}:${minutes}`;
}

function compareOptionalOrder(a: TaskItem, b: TaskItem): number {
  const hasA = typeof a.plannerOrder === 'number';
  const hasB = typeof b.plannerOrder === 'number';
  if (hasA && hasB && a.plannerOrder !== b.plannerOrder) {
    return (a.plannerOrder as number) - (b.plannerOrder as number);
  }
  if (hasA && !hasB) return -1;
  if (!hasA && hasB) return 1;
  return 0;
}

export function partitionDayPlannerTasks(
  tasks: TaskItem[],
  selectedDateIso: string,
  todayIso = getTodayIso(),
  includeAllOpen = false,
): DayPlannerPartition {
  const scheduledByHour: Record<string, TaskItem[]> = {};
  const unscheduledTasks: TaskItem[] = [];
  let scheduledCount = 0;
  let completedScheduledCount = 0;

  const isViewingToday = selectedDateIso === todayIso;

  const priorityRank: Record<TaskItem['priority'], number> = {
    مهم: 0,
    متوسط: 1,
    عادي: 2,
  };

  for (const task of tasks) {
    const slotKey = getSlotHourKey(task.reminderTime);

    if (task.dueDate === selectedDateIso && slotKey) {
      if (!scheduledByHour[slotKey]) {
        scheduledByHour[slotKey] = [];
      }
      scheduledByHour[slotKey].push(task);
      scheduledCount += 1;
      if (task.status === 'خلصت') {
        completedScheduledCount += 1;
      }
      continue;
    }

    if (task.status === 'خلصت') {
      continue;
    }

    if (includeAllOpen) {
      unscheduledTasks.push(task);
      continue;
    }

    const dueSelectedDayWithoutTime = task.dueDate === selectedDateIso && !slotKey;
    const overdueForToday = isViewingToday && isTaskOverdue(task, todayIso);
    const undatedForToday = isViewingToday && !task.dueDate;

    if (dueSelectedDayWithoutTime || overdueForToday || undatedForToday) {
      unscheduledTasks.push(task);
    }
  }

  for (const key of Object.keys(scheduledByHour)) {
    scheduledByHour[key].sort((a, b) => {
      const orderDiff = compareOptionalOrder(a, b);
      if (orderDiff !== 0) return orderDiff;
      if (a.status === 'خلصت' && b.status !== 'خلصت') return 1;
      if (a.status !== 'خلصت' && b.status === 'خلصت') return -1;
      const tA = a.reminderTime ?? '';
      const tB = b.reminderTime ?? '';
      if (tA !== tB) return tA.localeCompare(tB);
      return priorityRank[a.priority] - priorityRank[b.priority];
    });
  }

  unscheduledTasks.sort((a, b) => {
    const orderDiff = compareOptionalOrder(a, b);
    if (orderDiff !== 0) return orderDiff;
    const aSelected = a.dueDate === selectedDateIso ? 0 : isTaskOverdue(a, todayIso) ? 1 : 2;
    const bSelected = b.dueDate === selectedDateIso ? 0 : isTaskOverdue(b, todayIso) ? 1 : 2;
    if (aSelected !== bSelected) return aSelected - bSelected;
    if (priorityRank[a.priority] !== priorityRank[b.priority]) {
      return priorityRank[a.priority] - priorityRank[b.priority];
    }
    return b.createdAt - a.createdAt;
  });

  const sortedSlotKeys = Object.keys(scheduledByHour).sort((a, b) => a.localeCompare(b));
  const orderedScheduledTasks: TaskItem[] = [];
  for (const key of sortedSlotKeys) {
    orderedScheduledTasks.push(...scheduledByHour[key]);
  }

  return {
    scheduledByHour,
    orderedScheduledTasks,
    scheduledCount,
    completedScheduledCount,
    unscheduledTasks,
  };
}

/**
 * Computes atomic patches to insert or reorder `draggedTaskId` inside a target
 * hour slot (optionally before/after a specific `targetTaskId`).
 */
export function computeSlotReorderUpdates(params: {
  draggedTaskId: string;
  slotTasks: TaskItem[];
  slotTime24: string;
  selectedDateIso: string;
  targetTaskId?: string | null;
  position?: DropPosition;
}): PlannerTaskPatch[] {
  const {
    draggedTaskId,
    slotTasks,
    slotTime24,
    selectedDateIso,
    targetTaskId = null,
    position = 'after',
  } = params;

  const remainingIds = slotTasks.map((t) => t.id).filter((id) => id !== draggedTaskId);

  let insertIndex = remainingIds.length;
  if (targetTaskId && targetTaskId !== draggedTaskId) {
    const targetIdx = remainingIds.indexOf(targetTaskId);
    if (targetIdx !== -1) {
      insertIndex = position === 'before' ? targetIdx : targetIdx + 1;
    }
  }

  const nextOrder = [
    ...remainingIds.slice(0, insertIndex),
    draggedTaskId,
    ...remainingIds.slice(insertIndex),
  ];

  return nextOrder.map((id, idx) => {
    if (id === draggedTaskId) {
      return {
        id,
        patch: {
          dueDate: selectedDateIso,
          reminderTime: slotTime24,
          reminderEnabled: true,
          plannerOrder: idx,
        },
      };
    }
    return {
      id,
      patch: {
        plannerOrder: idx,
      },
    };
  });
}

/**
 * Computes atomic patches to reorder tasks inside the unscheduled queue
 * (or drop a scheduled task at a specific index in the unscheduled queue).
 */
export function computeQueueReorderUpdates(params: {
  draggedTaskId: string;
  queueTasks: TaskItem[];
  targetTaskId?: string | null;
  position?: DropPosition;
}): PlannerTaskPatch[] {
  const {draggedTaskId, queueTasks, targetTaskId = null, position = 'after'} = params;

  const remainingIds = queueTasks.map((t) => t.id).filter((id) => id !== draggedTaskId);

  let insertIndex = remainingIds.length;
  if (targetTaskId && targetTaskId !== draggedTaskId) {
    const targetIdx = remainingIds.indexOf(targetTaskId);
    if (targetIdx !== -1) {
      insertIndex = position === 'before' ? targetIdx : targetIdx + 1;
    }
  }

  const nextOrder = [
    ...remainingIds.slice(0, insertIndex),
    draggedTaskId,
    ...remainingIds.slice(insertIndex),
  ];

  return nextOrder.map((id, idx) => {
    if (id === draggedTaskId) {
      return {
        id,
        patch: {
          reminderTime: null,
          plannerOrder: idx,
        },
      };
    }
    return {
      id,
      patch: {
        plannerOrder: idx,
      },
    };
  });
}
