// Bridge to the native Android wrapper (com.omar.lifeapp). The wrapper
// injects window.OmarNative with three methods:
//   scheduleOccasions(json)  — day-before local notifications for occasions
//   cancelOccasions()        — cancel everything we scheduled
//   updateWidget(json)       — push today's tasks + weather to the home widget
// In a plain browser everything here is a no-op.

import {EGYPT_OCCASIONS} from '../data/egyptOccasions';
import {isTaskDueToday, isTaskOverdue, isTaskUpcoming} from '../storage/localStore';
import type {TaskItem} from '../types';

interface OccasionAlarmSpec {
  id: string;
  title: string;
  body: string;
  triggerAt: number; // epoch millis, day before the occasion at 09:00 local
}

interface OmarNativeApi {
  scheduleOccasions(json: string): void;
  cancelOccasions(): void;
  updateWidget(json: string): void;
}

declare global {
  interface Window {
    OmarNative?: OmarNativeApi;
  }
}

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && typeof window.OmarNative === 'object';
}

export const WIDGET_WEATHER_CACHE_KEY = 'omars_life_widget_weather';

// Schedules a local notification at 09:00 the day before every occasion in
// the next 30 days. Re-running replaces the previous batch (native side
// cancels the stored ids first).
export function syncOccasionNotifications(todayIso: string): void {
  if (!isNativeApp()) return;
  try {
    const today = new Date(`${todayIso}T00:00:00`);
    const in30 = today.getTime() + 30 * 86_400_000;
    const specs: OccasionAlarmSpec[] = [];
    for (const occ of EGYPT_OCCASIONS) {
      const t = new Date(`${occ.dateIso}T00:00:00`).getTime();
      if (t < today.getTime() || t > in30) continue;
      const triggerAt = new Date(`${occ.dateIso}T09:00:00`).getTime() - 86_400_000;
      if (triggerAt <= Date.now()) continue;
      specs.push({
        id: `${occ.dateIso}:${occ.name}`,
        title: `بكرة: ${occ.name} ${occ.emoji}`,
        body: occ.tentative ? 'الموعد متوقع وبييتأكد برؤية الهلال' : 'جهّز نفسك من النهارده 😉',
        triggerAt,
      });
    }
    window.OmarNative!.scheduleOccasions(JSON.stringify(specs));
  } catch {
    // never break the app over notifications
  }
}

export interface WidgetPayload {
  weather: string;
  tasks: string[]; // up to 3 titles
  moreCount: number; // open tasks beyond the listed ones
  updatedAt: string;
}

export function buildWidgetPayload(tasks: TaskItem[], todayIso: string): WidgetPayload {
  const open = tasks.filter((t) => t.status !== 'خلصت' && !t.archivedAt);
  const dueToday = open.filter((t) => isTaskOverdue(t, todayIso) || isTaskDueToday(t, todayIso));
  const upcoming = open.filter((t) => isTaskUpcoming(t, todayIso));
  const listed = [...dueToday, ...upcoming].slice(0, 3).map((t) => t.title);
  let weather = '';
  try {
    weather = (typeof localStorage !== 'undefined' && localStorage.getItem(WIDGET_WEATHER_CACHE_KEY)) || '';
  } catch {
    weather = '';
  }
  return {
    weather,
    tasks: listed,
    moreCount: Math.max(0, open.length - listed.length),
    updatedAt: new Date().toISOString(),
  };
}

export function syncWidgetData(payload: WidgetPayload): void {
  if (!isNativeApp()) return;
  try {
    window.OmarNative!.updateWidget(JSON.stringify(payload));
  } catch {
    // ignore
  }
}
