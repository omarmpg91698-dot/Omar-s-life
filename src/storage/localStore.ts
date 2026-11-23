import {z} from 'zod';
import type {AppPreferences, OmarsLifeStore, TaskItem} from '../types';

export const STORAGE_KEY = 'omars_life_v1_data';

export const DEFAULT_TASK_TAGS: string[] = ['شغل', 'بيت', 'شخصي'];

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'light',
  accent: 'teal',
  userName: 'عمر',
  defaultPriority: 'متوسط',
  taskTags: [...DEFAULT_TASK_TAGS],
  remindersEnabled: true,
  autoArchiveEnabled: true,
  autoArchiveDays: 30,
};

export function createEmptyStore(): OmarsLifeStore {
  return {
    version: 1,
    tasks: [],
    notes: [],
    goals: [],
    preferences: {...DEFAULT_PREFERENCES},
  };
}

const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  dueDate: z.string().nullable(),
  priority: z.enum(['مهم', 'متوسط', 'عادي']),
  status: z.enum(['لسه', 'شغال عليها', 'خلصت']),
  tags: z.array(z.string()).default([]),
  reminderEnabled: z.boolean().default(true),
  reminderTime: z.string().nullable().default(null),
  plannerOrder: z.number().int().optional(),
  completedAt: z.number().nullable().optional(),
  archivedAt: z.number().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const noteImageSchema = z.object({
  id: z.string().min(1),
  dataUrl: z.string().min(1),
  name: z.string().default('صورة'),
});

const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  category: z.enum(['شخصي', 'شغل', 'أفكار', 'حاجات مهمة']),
  images: z.array(noteImageSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const goalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['هدف', 'مشروع']),
  title: z.string().min(1),
  description: z.string(),
  targetDate: z.string().nullable(),
  progress: z.number().min(0).max(100),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark']).default('light'),
  accent: z.enum(['teal', 'blue', 'indigo', 'emerald', 'violet']).default('teal'),
  userName: z.string().min(1).max(40).default('عمر'),
  defaultPriority: z.enum(['مهم', 'متوسط', 'عادي']).default('متوسط'),
  taskTags: z.array(z.string()).default([...DEFAULT_TASK_TAGS]),
  remindersEnabled: z.boolean().default(true),
  autoArchiveEnabled: z.boolean().default(true),
  autoArchiveDays: z.number().int().min(1).max(365).default(30),
});

export const storeBackupSchema = z.object({
  version: z.literal(1),
  tasks: z.array(taskSchema),
  notes: z.array(noteSchema),
  goals: z.array(goalSchema),
  preferences: preferencesSchema.optional(),
});

export function createSimpleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getOffsetIso(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isTaskOverdue(task: TaskItem, todayIso = getTodayIso()): boolean {
  return Boolean(task.dueDate && task.dueDate < todayIso && task.status !== 'خلصت');
}

export function isTaskDueToday(task: TaskItem, todayIso = getTodayIso()): boolean {
  return task.dueDate === todayIso && task.status !== 'خلصت';
}

export function isTaskUpcoming(task: TaskItem, todayIso = getTodayIso()): boolean {
  return Boolean(task.dueDate && task.dueDate > todayIso && task.status !== 'خلصت');
}

export function isTaskReminderDueToday(task: TaskItem, todayIso = getTodayIso()): boolean {
  return Boolean(
    task.status !== 'خلصت' &&
      task.dueDate === todayIso &&
      (task.reminderEnabled ?? true),
  );
}

export function formatReminderTime(time24: string | null | undefined): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 || 12;
  const mm = String(m).padStart(2, '0');
  return `${h12}:${mm} ${period}`;
}

export function formatFriendlyDate(isoDate: string | null): string {
  if (!isoDate) return 'من غير ميعاد';
  const today = getTodayIso();
  const tomorrow = getOffsetIso(1);
  const yesterday = getOffsetIso(-1);
  if (isoDate === today) return 'النهارده';
  if (isoDate === tomorrow) return 'بكره';
  if (isoDate === yesterday) return 'امبارح';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: y !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(new Date(y, m - 1, d));
}

function normalizeTagsList(tags: string[] | undefined): string[] {
  if (!tags) return [...DEFAULT_TASK_TAGS];
  return Array.from(
    new Set(tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)),
  );
}

export function loadStore(): OmarsLifeStore {
  if (typeof localStorage === 'undefined') return createEmptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyStore();
    const parsed = storeBackupSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return createEmptyStore();
    return {
      version: 1,
      tasks: parsed.data.tasks,
      notes: parsed.data.notes,
      goals: parsed.data.goals,
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...parsed.data.preferences,
        taskTags: normalizeTagsList(parsed.data.preferences?.taskTags),
      },
    };
  } catch {
    return createEmptyStore();
  }
}

export function saveStore(store: OmarsLifeStore): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function parseAndValidateBackup(rawJson: string): OmarsLifeStore {
  const raw = JSON.parse(rawJson);
  const parsed = storeBackupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('ملف النسخة الاحتياطية مش مظبوط أو مش تبع Omar\'s Life.');
  }
  return {
    version: 1,
    tasks: parsed.data.tasks,
    notes: parsed.data.notes,
    goals: parsed.data.goals,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...parsed.data.preferences,
      taskTags: normalizeTagsList(parsed.data.preferences?.taskTags),
    },
  };
}
