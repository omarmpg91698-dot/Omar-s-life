import type {TaskItem} from '../types';
import {getTodayIso} from './localStore';

export type WeeklyRangeMode = 'current_week' | 'last_7_days';

export interface WeeklyDayBucket {
  iso: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  completed: number;
  remaining: number;
  total: number;
  rate: number;
}

export interface WeeklyTasksStats {
  days: WeeklyDayBucket[];
  weeklyCompleted: number;
  weeklyRemaining: number;
  weeklyTotal: number;
  weeklyPercent: number;
  overallCompleted: number;
  overallRemaining: number;
  overallTotal: number;
  overallPercent: number;
}

const ARABIC_WEEKDAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

function parseIsoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDateToIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortArabicDate(date: Date): string {
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function getTaskBucketIso(task: TaskItem): string {
  if (task.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) {
    return task.dueDate;
  }
  const ts = task.status === 'خلصت' ? task.updatedAt : task.createdAt;
  return formatDateToIso(new Date(ts));
}

export function computeWeeklyTaskStats(
  tasks: TaskItem[],
  todayIso = getTodayIso(),
  mode: WeeklyRangeMode = 'current_week',
): WeeklyTasksStats {
  const todayDate = parseIsoToLocalDate(todayIso);
  const startDate = new Date(todayDate);

  if (mode === 'current_week') {
    // Egypt week starts on Saturday (day 6).
    const dayOfWeek = todayDate.getDay(); // 0=Sun..6=Sat
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    startDate.setDate(todayDate.getDate() - daysSinceSaturday);
  } else {
    // Rolling 7 days ending today
    startDate.setDate(todayDate.getDate() - 6);
  }

  const days: WeeklyDayBucket[] = [];
  const bucketMap = new Map<string, WeeklyDayBucket>();

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const iso = formatDateToIso(d);
    const bucket: WeeklyDayBucket = {
      iso,
      dayLabel: ARABIC_WEEKDAYS[d.getDay()],
      dateLabel: formatShortArabicDate(d),
      isToday: iso === todayIso,
      completed: 0,
      remaining: 0,
      total: 0,
      rate: 0,
    };
    days.push(bucket);
    bucketMap.set(iso, bucket);
  }

  let overallCompleted = 0;
  let overallRemaining = 0;

  for (const task of tasks) {
    const isDone = task.status === 'خلصت';
    if (isDone) {
      overallCompleted += 1;
    } else {
      overallRemaining += 1;
    }

    const bucketIso = getTaskBucketIso(task);
    const bucket = bucketMap.get(bucketIso);
    if (bucket) {
      if (isDone) {
        bucket.completed += 1;
      } else {
        bucket.remaining += 1;
      }
    }
  }

  let weeklyCompleted = 0;
  let weeklyRemaining = 0;

  for (const day of days) {
    day.total = day.completed + day.remaining;
    day.rate = day.total === 0 ? 0 : Math.round((day.completed / day.total) * 100);
    weeklyCompleted += day.completed;
    weeklyRemaining += day.remaining;
  }

  const weeklyTotal = weeklyCompleted + weeklyRemaining;
  const weeklyPercent =
    weeklyTotal === 0 ? 0 : Math.round((weeklyCompleted / weeklyTotal) * 100);

  const overallTotal = overallCompleted + overallRemaining;
  const overallPercent =
    overallTotal === 0 ? 0 : Math.round((overallCompleted / overallTotal) * 100);

  return {
    days,
    weeklyCompleted,
    weeklyRemaining,
    weeklyTotal,
    weeklyPercent,
    overallCompleted,
    overallRemaining,
    overallTotal,
    overallPercent,
  };
}
