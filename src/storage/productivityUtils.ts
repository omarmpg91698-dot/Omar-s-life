import type {GoalProjectItem, HabitItem, TaskItem, TaskRecurrence} from '../types';
import {getTodayIso} from './localStore';

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  none: 'مرة واحدة',
  daily: 'يومياً',
  weekly: 'أسبوعياً',
  monthly: 'شهرياً',
};

function parseIsoParts(isoDate: string): {y: number; m: number; d: number} | null {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return {y, m, d};
}

export function formatIsoParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDaysToIso(isoDate: string, deltaDays: number): string {
  const parsed = parseIsoParts(isoDate);
  if (!parsed) return isoDate;
  const date = new Date(parsed.y, parsed.m - 1, parsed.d + deltaDays);
  return formatIsoParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Computes the next due date for a recurring task when it is completed.
 * Handles month-end clamping (e.g. Jan 31 -> Feb 28/29).
 */
export function computeNextRecurrenceDate(
  currentDueDate: string | null,
  recurrence: TaskRecurrence | undefined,
  todayIso = getTodayIso(),
): string | null {
  if (!recurrence || recurrence === 'none') return null;
  const baseIso = currentDueDate && currentDueDate >= todayIso ? currentDueDate : todayIso;
  const parsed = parseIsoParts(baseIso);
  if (!parsed) return todayIso;

  if (recurrence === 'daily') {
    return addDaysToIso(baseIso, 1);
  }
  if (recurrence === 'weekly') {
    return addDaysToIso(baseIso, 7);
  }
  // monthly with safe day-of-month clamping
  const targetMonthIndex = parsed.m; // 0-indexed next month = parsed.m (since m is 1..12)
  const targetYear = parsed.y + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = (targetMonthIndex % 12) + 1;
  const daysInTargetMonth = new Date(targetYear, normalizedMonth, 0).getDate();
  const clampedDay = Math.min(parsed.d, daysInTargetMonth);
  return formatIsoParts(targetYear, normalizedMonth, clampedDay);
}

export interface GoalLinkedProgress {
  linkedCount: number;
  doneCount: number;
  percent: number | null;
}

export function computeGoalLinkedProgress(
  goalId: string,
  allTasks: TaskItem[],
): GoalLinkedProgress {
  const linked = allTasks.filter((t) => t.goalId === goalId);
  if (linked.length === 0) {
    return {linkedCount: 0, doneCount: 0, percent: null};
  }
  const doneCount = linked.filter((t) => t.status === 'خلصت').length;
  return {
    linkedCount: linked.length,
    doneCount,
    percent: Math.round((doneCount / linked.length) * 100),
  };
}

export interface HabitStreakSummary {
  currentStreak: number;
  bestStreak: number;
  doneToday: boolean;
  last7Days: Array<{dateIso: string; dayShort: string; done: boolean}>;
}

const SHORT_AR_WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export function computeHabitStreak(
  habit: Pick<HabitItem, 'completedDates'>,
  todayIso = getTodayIso(),
): HabitStreakSummary {
  const dateSet = new Set(habit.completedDates ?? []);
  const doneToday = dateSet.has(todayIso);

  // Current streak counts consecutively backward from today (or yesterday if not done today yet)
  let currentStreak = 0;
  let cursor = doneToday ? todayIso : addDaysToIso(todayIso, -1);
  while (dateSet.has(cursor)) {
    currentStreak += 1;
    cursor = addDaysToIso(cursor, -1);
  }

  // Best streak across all recorded dates
  const sortedDates = Array.from(dateSet).sort();
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const iso of sortedDates) {
    if (prev && addDaysToIso(prev, 1) === iso) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > bestStreak) bestStreak = run;
    prev = iso;
  }

  // Last 7 days ending today (oldest -> newest)
  const last7Days: Array<{dateIso: string; dayShort: string; done: boolean}> = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const iso = addDaysToIso(todayIso, offset);
    const parsed = parseIsoParts(iso);
    const dow = parsed ? new Date(parsed.y, parsed.m - 1, parsed.d).getDay() : 0;
    last7Days.push({
      dateIso: iso,
      dayShort: SHORT_AR_WEEKDAYS[dow] ?? '',
      done: dateSet.has(iso),
    });
  }

  return {
    currentStreak,
    bestStreak,
    doneToday,
    last7Days,
  };
}

export interface CalendarCell {
  dateIso: string;
  dayNumber: number;
  inCurrentMonth: boolean;
}

/**
 * Generates a 6-week (42 cells) or 5-week (35 cells) Saturday-first calendar grid for Arabic locales.
 */
export function buildArabicMonthGrid(year: number, month1Based: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month1Based - 1, 1);
  const daysInMonth = new Date(year, month1Based, 0).getDate();
  // Saturday = 6 -> index 0, Sunday = 0 -> index 1, ..., Friday = 5 -> index 6
  const startOffset = (firstOfMonth.getDay() + 1) % 7;

  const totalCells = startOffset + daysInMonth > 35 ? 42 : 35;
  const cells: CalendarCell[] = [];

  for (let i = 0; i < totalCells; i += 1) {
    const dayOffset = i - startOffset;
    const d = new Date(year, month1Based - 1, 1 + dayOffset);
    cells.push({
      dateIso: formatIsoParts(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      dayNumber: d.getDate(),
      inCurrentMonth: d.getMonth() === month1Based - 1 && d.getFullYear() === year,
    });
  }

  return cells;
}

export interface CalendarMonthStats {
  monthPrefix: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  goalsCount: number;
  busyDaysCount: number;
  completionRate: number;
}

export function computeCalendarMonthStats(
  year: number,
  month1Based: number,
  tasks: TaskItem[],
  goals: GoalProjectItem[],
  todayIso = getTodayIso(),
): CalendarMonthStats {
  const monthPrefix = `${year}-${String(month1Based).padStart(2, '0')}`;
  const busyDays = new Set<string>();

  let totalTasks = 0;
  let completedTasks = 0;
  let pendingTasks = 0;
  let overdueTasks = 0;

  for (const t of tasks) {
    if (!t.dueDate || !t.dueDate.startsWith(monthPrefix)) continue;
    totalTasks += 1;
    busyDays.add(t.dueDate);
    if (t.status === 'خلصت') {
      completedTasks += 1;
    } else {
      pendingTasks += 1;
      if (t.dueDate < todayIso) {
        overdueTasks += 1;
      }
    }
  }

  let goalsCount = 0;
  for (const g of goals) {
    if (!g.targetDate || !g.targetDate.startsWith(monthPrefix)) continue;
    goalsCount += 1;
    busyDays.add(g.targetDate);
  }

  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    monthPrefix,
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    goalsCount,
    busyDaysCount: busyDays.size,
    completionRate,
  };
}

/**
 * Hashes a 4-digit PIN locally with a fixed app salt so the raw PIN is never stored in plain text.
 */
export function hashLocalPin(pin: string): string {
  const salted = `omars_life_pin_v1::${pin.trim()}`;
  let h1 = 0xdeadbeef ^ salted.length;
  let h2 = 0x41c6ce57 ^ salted.length;
  for (let i = 0; i < salted.length; i += 1) {
    const ch = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `pin1:${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export function verifyLocalPin(pin: string, expectedHash: string | null | undefined): boolean {
  if (!expectedHash) return true;
  return hashLocalPin(pin) === expectedHash;
}
