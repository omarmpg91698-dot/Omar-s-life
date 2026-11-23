export type NavSection = 'home' | 'tasks' | 'notes' | 'goals' | 'archive' | 'settings';

export type TaskPriority = 'مهم' | 'متوسط' | 'عادي';
export type TaskStatus = 'لسه' | 'شغال عليها' | 'خلصت';

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  priority: TaskPriority;
  status: TaskStatus;
  tags: string[];
  reminderEnabled: boolean;
  reminderTime: string | null; // HH:MM
  plannerOrder?: number;
  completedAt?: number | null;
  archivedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type NoteCategory = 'شخصي' | 'شغل' | 'أفكار' | 'حاجات مهمة';

export interface NoteImage {
  id: string;
  dataUrl: string;
  name: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: NoteCategory;
  images: NoteImage[];
  createdAt: number;
  updatedAt: number;
}

export type GoalKind = 'هدف' | 'مشروع';

export interface GoalProjectItem {
  id: string;
  kind: GoalKind;
  title: string;
  description: string;
  targetDate: string | null; // YYYY-MM-DD
  progress: number; // 0 - 100
  createdAt: number;
  updatedAt: number;
}

export type AccentColor = 'teal' | 'blue' | 'indigo' | 'emerald' | 'violet';

export interface AppPreferences {
  theme: 'light' | 'dark';
  accent: AccentColor;
  userName: string;
  defaultPriority: TaskPriority;
  taskTags: string[];
  remindersEnabled: boolean;
  autoArchiveEnabled: boolean;
  autoArchiveDays: number;
}

export interface OmarsLifeStore {
  version: 1;
  tasks: TaskItem[];
  notes: NoteItem[];
  goals: GoalProjectItem[];
  preferences: AppPreferences;
}
