export type NavSection =
  | 'home'
  | 'assistant'
  | 'tasks'
  | 'calendar'
  | 'notes'
  | 'documents'
  | 'goals'
  | 'baby'
  | 'coach'
  | 'archive'
  | 'settings';

export type TaskPriority = 'مهم' | 'متوسط' | 'عادي';
export type TaskStatus = 'لسه' | 'شغال عليها' | 'خلصت';
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface TaskSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  priority: TaskPriority;
  status: TaskStatus;
  tags: string[];
  reminderEnabled: boolean;
  reminderTime: string | null; // HH:MM
  recurrence?: TaskRecurrence;
  recurrenceSpawned?: boolean;
  subtasks?: TaskSubtask[];
  goalId?: string | null;
  plannerOrder?: number;
  completedAt?: number | null;
  archivedAt?: number | null;
  icon?: string | null;
  deletedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type NoteCategory = 'شخصي' | 'شغل' | 'أفكار' | 'حاجات مهمة';

export interface NoteImage {
  id: string;
  dataUrl: string;
  name: string;
  storage?: 'idb';
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: NoteCategory;
  images: NoteImage[];
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type DocumentCategory =
  | 'بطاقة وهوية'
  | 'جواز سفر'
  | 'رخصة'
  | 'عقد وإيجار'
  | 'تأمين'
  | 'أوراق رسمية'
  | 'أخرى';

export type DocumentReminderLead = 'month' | 'week' | 'day';

export interface DocumentItem {
  id: string;
  title: string;
  category: DocumentCategory;
  documentNumber?: string;
  expiryDate: string; // YYYY-MM-DD
  reminderLead: DocumentReminderLead;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type GoalKind = 'هدف' | 'مشروع';
export type GoalColor = 'auto' | 'teal' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet';

export interface GoalProjectItem {
  id: string;
  kind: GoalKind;
  title: string;
  description: string;
  targetDate: string | null; // YYYY-MM-DD
  progress: number; // 0 - 100
  color?: GoalColor;
  createdAt: number;
  updatedAt: number;
}

export interface HabitItem {
  id: string;
  title: string;
  completedDates: string[]; // YYYY-MM-DD[]
  createdAt: number;
  updatedAt: number;
}

export interface FocusSessionItem {
  id: string;
  taskId: string | null;
  taskTitle: string;
  durationMinutes: number;
  completedAt: number;
  dateIso: string; // YYYY-MM-DD
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
  pinLockEnabled?: boolean;
  pinHash?: string | null;
}

export type AssistantTone = 'friendly' | 'direct' | 'coach';

export type AssistantMemoryCategory =
  | 'شخصي'
  | 'شغل'
  | 'روتين'
  | 'تفضيلات'
  | 'علاقات'
  | 'صحة';

export interface AssistantLifeProfile {
  roleAndWork: string;
  dailyRoutine: string;
  topPriorities: string;
  personalNotes: string;
  tone: AssistantTone;
  updatedAt: number;
}

export interface AssistantMemoryItem {
  id: string;
  category: AssistantMemoryCategory;
  fact: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantActionLog {
  kind:
    | 'add_task'
    | 'complete_task'
    | 'schedule_task'
    | 'add_goal'
    | 'add_note'
    | 'add_habit'
    | 'save_memory';
  summary: string;
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  hasImage?: boolean;
  fileName?: string;
  actions?: AssistantActionLog[];
  suggestedFollowUps?: string[];
  createdAt: number;
}

export interface BabyAppointment {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  notes: string;
  done: boolean;
  createdAt: number;
}

export interface BabyBagCustomItem {
  id: string;
  title: string;
  done: boolean;
}

export interface BabyProfile {
  babyName: string;
  dueDate: string | null; // YYYY-MM-DD
  birthDate: string | null; // YYYY-MM-DD, set when the baby is born
  appointments: BabyAppointment[];
  bagDone: string[];
  bagCustom: BabyBagCustomItem[];
  vaccinesDone: string[];
  milestonesDone: string[];
  updatedAt: number;
}

export interface OmarsLifeStore {
  version: 1;
  tasks: TaskItem[];
  notes: NoteItem[];
  documents?: DocumentItem[];
  goals: GoalProjectItem[];
  habits?: HabitItem[];
  focusSessions?: FocusSessionItem[];
  assistantProfile?: AssistantLifeProfile;
  assistantMemories?: AssistantMemoryItem[];
  assistantMessages?: AssistantChatMessage[];
  baby?: BabyProfile;
  preferences: AppPreferences;
}
