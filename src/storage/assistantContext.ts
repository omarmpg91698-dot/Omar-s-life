import {getTodayIso, isTaskOverdue} from './localStore';
import {computeGoalLinkedProgress, computeHabitStreak} from './productivityUtils';
import type {
  AssistantLifeProfile,
  AssistantMemoryCategory,
  AssistantMemoryItem,
  AssistantTone,
  OmarsLifeStore,
} from '../types';

export const DEFAULT_ASSISTANT_PROFILE: AssistantLifeProfile = {
  roleAndWork: '',
  dailyRoutine: '',
  topPriorities: '',
  personalNotes: '',
  tone: 'friendly',
  updatedAt: 0,
};

export const ASSISTANT_TONE_OPTIONS: Array<{
  id: AssistantTone;
  label: string;
  description: string;
}> = [
  {
    id: 'friendly',
    label: 'ودود وبالعامية المصرية',
    description: 'أسلوب قريب ومريح كأنك بتكلم صاحبك المنظم',
  },
  {
    id: 'direct',
    label: 'مختصر وعملي',
    description: 'إجابات مباشرة ونقاط واضحة بدون تطويل',
  },
  {
    id: 'coach',
    label: 'مدرب شخصي محفّز',
    description: 'يشجعك، يتابع التزامك، ويحاسبك بلطف على أهدافك',
  },
];

export const MEMORY_CATEGORIES: AssistantMemoryCategory[] = [
  'شخصي',
  'شغل',
  'روتين',
  'تفضيلات',
  'علاقات',
  'صحة',
];

export interface LifeContextSnapshot {
  todayIso: string;
  currentTime24: string;
  userName: string;
  profile: AssistantLifeProfile;
  memories: Array<{id: string; category: string; fact: string}>;
  tasks: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    priority: string;
    status: string;
    reminderTime: string | null;
    tags: string[];
    overdue: boolean;
  }>;
  goals: Array<{
    id: string;
    kind: string;
    title: string;
    description: string;
    targetDate: string | null;
    progress: number;
    linkedDone: number;
    linkedTotal: number;
  }>;
  habits: Array<{
    id: string;
    title: string;
    doneToday: boolean;
    currentStreak: number;
    bestStreak: number;
  }>;
  recentNotes: Array<{
    title: string;
    category: string;
    pinned: boolean;
    snippet: string;
  }>;
  stats: {
    activeTasksCount: number;
    overdueTasksCount: number;
    completedTodayCount: number;
    todayFocusMinutes: number;
  };
}

export function buildLifeContextSnapshot(
  store: Pick<
    OmarsLifeStore,
    'tasks' | 'notes' | 'goals' | 'habits' | 'focusSessions' | 'preferences' | 'assistantProfile' | 'assistantMemories'
  >,
  todayIso = getTodayIso(),
  currentTime24?: string,
): LifeContextSnapshot {
  const now = new Date();
  const resolvedTime =
    currentTime24 ??
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const activeTasks = store.tasks.filter((t) => !t.archivedAt);
  const openTasks = activeTasks.filter((t) => t.status !== 'خلصت');
  const overdueTasks = openTasks.filter((t) => isTaskOverdue(t, todayIso));
  const completedTodayCount = activeTasks.filter(
    (t) =>
      t.status === 'خلصت' &&
      (t.dueDate === todayIso ||
        (typeof t.completedAt === 'number' &&
          new Date(t.completedAt).toISOString().slice(0, 10) === todayIso)),
  ).length;

  // Prioritize overdue, due-today, and most recently updated open tasks + up to 8 recent done tasks
  const prioritizedTasks = [
    ...openTasks.sort((a, b) => {
      const aDate = a.dueDate ?? '9999-12-31';
      const bDate = b.dueDate ?? '9999-12-31';
      return aDate.localeCompare(bDate) || b.updatedAt - a.updatedAt;
    }).slice(0, 35),
    ...activeTasks
      .filter((t) => t.status === 'خلصت')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8),
  ];

  const goalsSnapshot = store.goals.slice(0, 20).map((g) => {
    const linked = computeGoalLinkedProgress(g.id, store.tasks);
    return {
      id: g.id,
      kind: g.kind,
      title: g.title,
      description: g.description.slice(0, 180),
      targetDate: g.targetDate,
      progress: linked.percent !== null ? linked.percent : g.progress,
      linkedDone: linked.doneCount,
      linkedTotal: linked.linkedCount,
    };
  });

  const habitsSnapshot = (store.habits ?? []).slice(0, 20).map((h) => {
    const streak = computeHabitStreak(h, todayIso);
    return {
      id: h.id,
      title: h.title,
      doneToday: streak.doneToday,
      currentStreak: streak.currentStreak,
      bestStreak: streak.bestStreak,
    };
  });

  const sortedNotes = [...store.notes].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  const recentNotes = sortedNotes.slice(0, 12).map((n) => ({
    title: n.title,
    category: n.category,
    pinned: Boolean(n.pinned),
    snippet: n.content.trim().slice(0, 180),
  }));

  const todayFocusMinutes = (store.focusSessions ?? [])
    .filter((s) => s.dateIso === todayIso)
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  const memories: AssistantMemoryItem[] = store.assistantMemories ?? [];

  return {
    todayIso,
    currentTime24: resolvedTime,
    userName: store.preferences.userName || 'عمر',
    profile: {
      ...DEFAULT_ASSISTANT_PROFILE,
      ...(store.assistantProfile ?? {}),
    },
    memories: memories.slice(0, 60).map((m) => ({
      id: m.id,
      category: m.category,
      fact: m.fact,
    })),
    tasks: prioritizedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
      reminderTime: t.reminderTime ?? null,
      tags: t.tags ?? [],
      overdue: isTaskOverdue(t, todayIso),
    })),
    goals: goalsSnapshot,
    habits: habitsSnapshot,
    recentNotes,
    stats: {
      activeTasksCount: openTasks.length,
      overdueTasksCount: overdueTasks.length,
      completedTodayCount,
      todayFocusMinutes,
    },
  };
}
