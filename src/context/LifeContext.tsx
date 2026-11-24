import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_TASK_TAGS,
  createEmptyStore,
  createSimpleId,
  getTodayIso,
  loadStore,
  parseAndValidateBackup,
  saveStore,
} from '../storage/localStore';
import {
  DEFAULT_AUTO_ARCHIVE_DAYS,
  autoArchiveExpiredTasks,
  isTaskArchived,
} from '../storage/taskArchive';
import {
  computeGoalLinkedProgress,
  computeNextRecurrenceDate,
} from '../storage/productivityUtils';
import {DEFAULT_ASSISTANT_PROFILE} from '../storage/assistantContext';
import type {
  AppPreferences,
  AssistantChatMessage,
  AssistantLifeProfile,
  AssistantMemoryCategory,
  AssistantMemoryItem,
  DocumentCategory,
  DocumentItem,
  DocumentReminderLead,
  FocusSessionItem,
  GoalColor,
  GoalKind,
  GoalProjectItem,
  HabitItem,
  NavSection,
  NoteCategory,
  NoteImage,
  NoteItem,
  OmarsLifeStore,
  TaskItem,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  TaskSubtask,
} from '../types';

export interface FocusedItemTarget {
  section: 'tasks' | 'notes' | 'documents' | 'goals' | 'archive';
  id: string;
}

export type TasksViewMode = 'list' | 'calendar';
export type FocusPresetMode = 'focus' | 'short' | 'break';

export const FOCUS_PRESETS: Record<
  FocusPresetMode,
  {label: string; minutes: number; seconds: number; isBreak: boolean}
> = {
  focus: {label: 'تركيز ٢٥ د', minutes: 25, seconds: 25 * 60, isBreak: false},
  short: {label: 'جولة ١٥ د', minutes: 15, seconds: 15 * 60, isBreak: false},
  break: {label: 'راحة ٥ د', minutes: 5, seconds: 5 * 60, isBreak: true},
};

export interface FocusTimerState {
  mode: FocusPresetMode;
  secondsLeft: number;
  totalSeconds: number;
  running: boolean;
  taskId: string | null;
  taskTitle: string | null;
  lastCompletedNotice: string | null;
}

interface LifeContextValue {
  activeSection: NavSection;
  setActiveSection: (section: NavSection) => void;
  tasksViewMode: TasksViewMode;
  setTasksViewMode: (mode: TasksViewMode) => void;
  focusedItem: FocusedItemTarget | null;
  navigateToItem: (
    section: 'tasks' | 'notes' | 'documents' | 'goals' | 'archive',
    id: string,
  ) => void;
  clearFocusedItem: () => void;
  isAppLocked: boolean;
  lockApp: () => void;
  unlockApp: () => void;
  store: OmarsLifeStore;
  /** Active (non-archived) tasks */
  tasks: TaskItem[];
  /** Archived tasks sorted newest archived first */
  archivedTasks: TaskItem[];
  /** All tasks (active + archived) for analytics, search, and export */
  allTasks: TaskItem[];
  lastAutoArchivedCount: number;
  dismissAutoArchiveNotice: () => void;
  lastRecurringNotice: string | null;
  dismissRecurringNotice: () => void;
  notes: NoteItem[];
  documents: DocumentItem[];
  goals: GoalProjectItem[];
  habits: HabitItem[];
  focusSessions: FocusSessionItem[];
  todayFocusMinutes: number;
  focusState: FocusTimerState;
  startFocusForTask: (task: {id: string; title: string}) => void;
  toggleFocusRunning: () => void;
  resetFocusTimer: () => void;
  setFocusPreset: (mode: FocusPresetMode) => void;
  clearFocusTask: () => void;
  completeFocusEarly: () => void;
  dismissFocusNotice: () => void;
  preferences: AppPreferences;
  storageQuotaExceeded: boolean;
  addTask: (input: {
    title: string;
    dueDate: string | null;
    priority: TaskPriority;
    status?: TaskStatus;
    tags?: string[];
    reminderEnabled?: boolean;
    reminderTime?: string | null;
    recurrence?: TaskRecurrence;
    subtasks?: TaskSubtask[];
    goalId?: string | null;
  }) => void;
  updateTask: (id: string, patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>) => void;
  batchUpdateTasks: (
    updates: Array<{id: string; patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>}>,
  ) => void;
  archiveTask: (id: string) => void;
  bulkAddTagToTasks: (ids: string[], tag: string) => void;
  bulkArchiveTasks: (ids: string[]) => void;
  bulkDeleteTasks: (ids: string[]) => void;
  restoreArchivedTask: (id: string, reopen?: boolean) => void;
  restoreAllArchivedTasks: () => void;
  clearArchive: () => void;
  runAutoArchiveNow: () => number;
  deleteTask: (id: string) => void;
  addNote: (input: {
    title: string;
    content: string;
    category: NoteCategory;
    images?: NoteImage[];
    pinned?: boolean;
  }) => void;
  updateNote: (id: string, patch: Partial<Omit<NoteItem, 'id' | 'createdAt'>>) => void;
  deleteNote: (id: string) => void;
  addDocument: (input: {
    title: string;
    category: DocumentCategory;
    documentNumber?: string;
    expiryDate: string;
    reminderLead: DocumentReminderLead;
    notes?: string;
  }) => void;
  updateDocument: (id: string, patch: Partial<Omit<DocumentItem, 'id' | 'createdAt'>>) => void;
  deleteDocument: (id: string) => void;
  addGoal: (input: {
    kind: GoalKind;
    title: string;
    description: string;
    targetDate: string | null;
    progress: number;
    color?: GoalColor;
  }) => void;
  addGoalWithTasks: (input: {
    kind: GoalKind;
    title: string;
    description: string;
    targetDate: string | null;
    color?: GoalColor;
    taskTitles: string[];
  }) => void;
  updateGoal: (id: string, patch: Partial<Omit<GoalProjectItem, 'id' | 'createdAt'>>) => void;
  deleteGoal: (id: string) => void;
  addHabit: (title: string) => void;
  deleteHabit: (id: string) => void;
  toggleHabitDate: (id: string, dateIso?: string) => void;
  assistantProfile: AssistantLifeProfile;
  assistantMemories: AssistantMemoryItem[];
  assistantMessages: AssistantChatMessage[];
  updateAssistantProfile: (patch: Partial<Omit<AssistantLifeProfile, 'updatedAt'>>) => void;
  addAssistantMemory: (input: {category: AssistantMemoryCategory; fact: string}) => boolean;
  deleteAssistantMemory: (id: string) => void;
  appendAssistantMessages: (messages: AssistantChatMessage[]) => void;
  clearAssistantChat: () => void;
  recordFocusSession: (input: {
    taskId: string | null;
    taskTitle: string;
    durationMinutes: number;
  }) => void;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  addTaskTag: (rawName: string) => {ok: boolean; error?: string; tag?: string};
  renameTaskTag: (
    oldName: string,
    newRawName: string,
  ) => {ok: boolean; error?: string; tag?: string};
  deleteTaskTag: (tagName: string) => void;
  resetDefaultTaskTags: () => void;
  exportBackupJson: () => string;
  restoreFromBackupJson: (rawJson: string) => void;
  replaceStore: (nextStore: OmarsLifeStore) => void;
  clearAllData: () => void;
}

const LifeContext = createContext<LifeContextValue | null>(null);

function playFocusChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5 soft chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.14 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.5);
    });
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // Audio playback can be blocked without user interaction; fail silently.
  }
}

function applyStatusTimestamps(
  existing: TaskItem,
  patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>,
  now: number,
): TaskItem {
  const nextStatus = patch.status ?? existing.status;
  let completedAt =
    patch.completedAt !== undefined ? patch.completedAt : existing.completedAt ?? null;
  let archivedAt =
    patch.archivedAt !== undefined ? patch.archivedAt : existing.archivedAt ?? null;

  if (patch.status !== undefined) {
    if (nextStatus === 'خلصت' && existing.status !== 'خلصت') {
      completedAt = patch.completedAt ?? now;
    } else if (nextStatus !== 'خلصت') {
      completedAt = null;
      archivedAt = null;
    }
  }

  return {
    ...existing,
    ...patch,
    completedAt,
    archivedAt,
    updatedAt: now,
  };
}

function syncLinkedGoalsProgress(
  tasks: TaskItem[],
  goals: GoalProjectItem[],
  now: number,
): GoalProjectItem[] {
  let changed = false;
  const nextGoals = goals.map((goal) => {
    const linked = computeGoalLinkedProgress(goal.id, tasks);
    if (linked.linkedCount > 0 && linked.percent !== null && linked.percent !== goal.progress) {
      changed = true;
      return {...goal, progress: linked.percent, updatedAt: now};
    }
    return goal;
  });
  return changed ? nextGoals : goals;
}

function maybeSpawnNextRecurrence(
  existing: TaskItem,
  updated: TaskItem,
  now: number,
): {updatedTask: TaskItem; spawnedTask: TaskItem | null} {
  const recurrence = updated.recurrence ?? 'none';
  const transitionedToDone = updated.status === 'خلصت' && existing.status !== 'خلصت';
  if (!transitionedToDone || recurrence === 'none' || existing.recurrenceSpawned) {
    return {updatedTask: updated, spawnedTask: null};
  }
  const nextDue = computeNextRecurrenceDate(updated.dueDate, recurrence);
  const spawnedTask: TaskItem = {
    id: createSimpleId(),
    title: updated.title,
    dueDate: nextDue,
    priority: updated.priority,
    status: 'لسه',
    tags: [...(updated.tags ?? [])],
    reminderEnabled: updated.reminderEnabled,
    reminderTime: updated.reminderTime,
    recurrence,
    recurrenceSpawned: false,
    subtasks: (updated.subtasks ?? []).map((st) => ({
      id: createSimpleId(),
      title: st.title,
      done: false,
    })),
    goalId: updated.goalId ?? null,
    completedAt: null,
    archivedAt: null,
    createdAt: now + 1,
    updatedAt: now + 1,
  };
  return {
    updatedTask: {...updated, recurrenceSpawned: true},
    spawnedTask,
  };
}

function sweepStoreAutoArchive(rawStore: OmarsLifeStore): {
  store: OmarsLifeStore;
  archivedCount: number;
} {
  const enabled = rawStore.preferences.autoArchiveEnabled ?? true;
  if (!enabled) {
    return {store: rawStore, archivedCount: 0};
  }
  const days = rawStore.preferences.autoArchiveDays ?? DEFAULT_AUTO_ARCHIVE_DAYS;
  const result = autoArchiveExpiredTasks(rawStore.tasks, Date.now(), days);
  if (result.archivedCount === 0) {
    return {store: rawStore, archivedCount: 0};
  }
  return {
    store: {
      ...rawStore,
      tasks: result.tasks,
    },
    archivedCount: result.archivedCount,
  };
}

export const LifeProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  const [tasksViewMode, setTasksViewMode] = useState<TasksViewMode>('list');
  const [focusedItem, setFocusedItem] = useState<FocusedItemTarget | null>(null);

  const initialBootstrap = useMemo(() => sweepStoreAutoArchive(loadStore()), []);
  const [store, setStore] = useState<OmarsLifeStore>(() => initialBootstrap.store);
  const [lastAutoArchivedCount, setLastAutoArchivedCount] = useState<number>(
    () => initialBootstrap.archivedCount,
  );
  const [lastRecurringNotice, setLastRecurringNotice] = useState<string | null>(null);
  const [storageQuotaExceeded, setStorageQuotaExceeded] = useState(false);

  const [isAppLocked, setIsAppLocked] = useState<boolean>(() =>
    Boolean(
      initialBootstrap.store.preferences.pinLockEnabled &&
        initialBootstrap.store.preferences.pinHash,
    ),
  );

  const [focusState, setFocusState] = useState<FocusTimerState>({
    mode: 'focus',
    secondsLeft: FOCUS_PRESETS.focus.seconds,
    totalSeconds: FOCUS_PRESETS.focus.seconds,
    running: false,
    taskId: null,
    taskTitle: null,
    lastCompletedNotice: null,
  });

  const lockApp = useCallback(() => {
    if (store.preferences.pinLockEnabled && store.preferences.pinHash) {
      setIsAppLocked(true);
    }
  }, [store.preferences.pinLockEnabled, store.preferences.pinHash]);

  const unlockApp = useCallback(() => {
    setIsAppLocked(false);
  }, []);

  const navigateToItem = useCallback(
    (section: 'tasks' | 'notes' | 'documents' | 'goals' | 'archive', id: string) => {
      if (section === 'tasks') {
        setTasksViewMode('list');
      }
      setFocusedItem({section, id});
      setActiveSection(section);
    },
    [],
  );

  const clearFocusedItem = useCallback(() => {
    setFocusedItem(null);
  }, []);

  const dismissAutoArchiveNotice = useCallback(() => {
    setLastAutoArchivedCount(0);
  }, []);

  const dismissRecurringNotice = useCallback(() => {
    setLastRecurringNotice(null);
  }, []);

  const dismissFocusNotice = useCallback(() => {
    setFocusState((prev) => ({...prev, lastCompletedNotice: null}));
  }, []);

  useEffect(() => {
    const saved = saveStore(store);
    setStorageQuotaExceeded(!saved);
  }, [store]);

  // Periodic background sweep while the app remains open (once per hour)
  useEffect(() => {
    if (!(store.preferences.autoArchiveEnabled ?? true)) return;
    const days = store.preferences.autoArchiveDays ?? DEFAULT_AUTO_ARCHIVE_DAYS;
    const sweep = () => {
      setStore((prev) => {
        const res = autoArchiveExpiredTasks(prev.tasks, Date.now(), days);
        if (res.archivedCount === 0) return prev;
        setLastAutoArchivedCount((c) => c + res.archivedCount);
        return {...prev, tasks: res.tasks};
      });
    };
    const timer = window.setInterval(sweep, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [store.preferences.autoArchiveEnabled, store.preferences.autoArchiveDays]);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = 'ar';
    html.dir = 'rtl';
    html.dataset.accent = store.preferences.accent;
    if (store.preferences.theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute(
        'content',
        store.preferences.theme === 'dark' ? '#0F172A' : '#F7F9FB',
      );
    }
  }, [store.preferences.theme, store.preferences.accent]);

  const recordFocusSession = useCallback(
    (input: {taskId: string | null; taskTitle: string; durationMinutes: number}) => {
      const minutes = Math.max(1, Math.min(240, Math.round(input.durationMinutes)));
      const now = Date.now();
      const item: FocusSessionItem = {
        id: createSimpleId(),
        taskId: input.taskId,
        taskTitle: input.taskTitle.trim() || 'جلسة تركيز',
        durationMinutes: minutes,
        completedAt: now,
        dateIso: getTodayIso(),
      };
      setStore((prev) => ({
        ...prev,
        focusSessions: [item, ...(prev.focusSessions ?? [])],
      }));
    },
    [],
  );

  // Ref keeps latest recordFocusSession for interval completion
  const recordFocusRef = useRef(recordFocusSession);
  recordFocusRef.current = recordFocusSession;

  // Focus / Pomodoro ticker across all tabs
  useEffect(() => {
    if (!focusState.running) return;
    const interval = window.setInterval(() => {
      setFocusState((prev) => {
        if (!prev.running) return prev;
        if (prev.secondsLeft > 1) {
          return {...prev, secondsLeft: prev.secondsLeft - 1};
        }
        // Finished!
        playFocusChime();
        const preset = FOCUS_PRESETS[prev.mode];
        if (!preset.isBreak) {
          const mins = Math.max(1, Math.round(prev.totalSeconds / 60));
          recordFocusRef.current({
            taskId: prev.taskId,
            taskTitle: prev.taskTitle || 'جلسة تركيز',
            durationMinutes: mins,
          });
        }
        return {
          ...prev,
          running: false,
          secondsLeft: prev.totalSeconds,
          lastCompletedNotice: preset.isBreak
            ? 'الراحة خلصت! جاهز لجولة تركيز جديدة.'
            : `عاش! خلصت ${Math.round(prev.totalSeconds / 60)} دقيقة تركيز${
                prev.taskTitle ? ` على "${prev.taskTitle}"` : ''
              }.`,
        };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [focusState.running]);

  const startFocusForTask = useCallback((task: {id: string; title: string}) => {
    setFocusState((prev) => {
      const nextMode: FocusPresetMode = prev.mode === 'break' ? 'focus' : prev.mode;
      const preset = FOCUS_PRESETS[nextMode];
      const sameTask = prev.taskId === task.id && prev.mode === nextMode;
      return {
        mode: nextMode,
        totalSeconds: preset.seconds,
        secondsLeft: sameTask && prev.secondsLeft > 0 ? prev.secondsLeft : preset.seconds,
        running: true,
        taskId: task.id,
        taskTitle: task.title,
        lastCompletedNotice: null,
      };
    });
  }, []);

  const toggleFocusRunning = useCallback(() => {
    setFocusState((prev) => ({
      ...prev,
      running: !prev.running,
      lastCompletedNotice: null,
    }));
  }, []);

  const resetFocusTimer = useCallback(() => {
    setFocusState((prev) => ({
      ...prev,
      running: false,
      secondsLeft: prev.totalSeconds,
      lastCompletedNotice: null,
    }));
  }, []);

  const setFocusPreset = useCallback((mode: FocusPresetMode) => {
    const preset = FOCUS_PRESETS[mode];
    setFocusState((prev) => ({
      ...prev,
      mode,
      running: false,
      totalSeconds: preset.seconds,
      secondsLeft: preset.seconds,
      lastCompletedNotice: null,
    }));
  }, []);

  const clearFocusTask = useCallback(() => {
    setFocusState((prev) => ({
      ...prev,
      taskId: null,
      taskTitle: null,
    }));
  }, []);

  const completeFocusEarly = useCallback(() => {
    setFocusState((prev) => {
      const elapsedSeconds = prev.totalSeconds - prev.secondsLeft;
      const elapsedMinutes = Math.floor(elapsedSeconds / 60);
      const preset = FOCUS_PRESETS[prev.mode];
      if (!preset.isBreak && elapsedMinutes >= 1) {
        recordFocusRef.current({
          taskId: prev.taskId,
          taskTitle: prev.taskTitle || 'جلسة تركيز',
          durationMinutes: elapsedMinutes,
        });
      }
      return {
        ...prev,
        running: false,
        secondsLeft: prev.totalSeconds,
        lastCompletedNotice:
          !preset.isBreak && elapsedMinutes >= 1
            ? `اتسجل ${elapsedMinutes} دقيقة تركيز بنجاح.`
            : null,
      };
    });
  }, []);

  const activeTasks = useMemo(
    () => store.tasks.filter((t) => !isTaskArchived(t)),
    [store.tasks],
  );

  const archivedTasks = useMemo(
    () =>
      store.tasks
        .filter((t) => isTaskArchived(t))
        .sort((a, b) => (b.archivedAt ?? b.updatedAt) - (a.archivedAt ?? a.updatedAt)),
    [store.tasks],
  );

  const documents = useMemo(() => store.documents ?? [], [store.documents]);
  const habits = useMemo(() => store.habits ?? [], [store.habits]);
  const focusSessions = useMemo(() => store.focusSessions ?? [], [store.focusSessions]);
  const assistantProfile = useMemo(
    () => ({...DEFAULT_ASSISTANT_PROFILE, ...(store.assistantProfile ?? {})}),
    [store.assistantProfile],
  );
  const assistantMemories = useMemo(
    () => store.assistantMemories ?? [],
    [store.assistantMemories],
  );
  const assistantMessages = useMemo(
    () => store.assistantMessages ?? [],
    [store.assistantMessages],
  );

  const todayFocusMinutes = useMemo(() => {
    const today = getTodayIso();
    return focusSessions
      .filter((s) => s.dateIso === today)
      .reduce((sum, s) => sum + s.durationMinutes, 0);
  }, [focusSessions]);

  const addTask = useCallback(
    (input: {
      title: string;
      dueDate: string | null;
      priority: TaskPriority;
      status?: TaskStatus;
      tags?: string[];
      reminderEnabled?: boolean;
      reminderTime?: string | null;
      recurrence?: TaskRecurrence;
      subtasks?: TaskSubtask[];
      goalId?: string | null;
    }) => {
      const now = Date.now();
      const status = input.status ?? 'لسه';
      const item: TaskItem = {
        id: createSimpleId(),
        title: input.title.trim(),
        dueDate: input.dueDate || null,
        priority: input.priority,
        status,
        tags: Array.from(new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
        reminderEnabled: input.reminderEnabled ?? true,
        reminderTime: input.reminderTime || null,
        recurrence: input.recurrence ?? 'none',
        recurrenceSpawned: false,
        subtasks: input.subtasks ?? [],
        goalId: input.goalId || null,
        completedAt: status === 'خلصت' ? now : null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      setStore((prev) => {
        const nextTasks = [item, ...prev.tasks];
        const nextGoals = syncLinkedGoalsProgress(nextTasks, prev.goals, now);
        return {...prev, tasks: nextTasks, goals: nextGoals};
      });
    },
    [],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>) => {
      const now = Date.now();
      let spawnedMessage: string | null = null;
      setStore((prev) => {
        const spawned: TaskItem[] = [];
        const updatedTasks = prev.tasks.map((t) => {
          if (t.id !== id) return t;
          const next = applyStatusTimestamps(t, patch, now);
          const {updatedTask, spawnedTask} = maybeSpawnNextRecurrence(t, next, now);
          if (spawnedTask) {
            spawned.push(spawnedTask);
            spawnedMessage = `اتجدولت المهمة المتكررة "${spawnedTask.title}" تلقائياً للميعاد الجاي.`;
          }
          return updatedTask;
        });
        const nextTasks = spawned.length > 0 ? [...spawned, ...updatedTasks] : updatedTasks;
        const nextGoals = syncLinkedGoalsProgress(nextTasks, prev.goals, now);
        return {...prev, tasks: nextTasks, goals: nextGoals};
      });
      if (spawnedMessage) {
        setLastRecurringNotice(spawnedMessage);
      }
    },
    [],
  );

  const batchUpdateTasks = useCallback(
    (updates: Array<{id: string; patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>}>) => {
      if (updates.length === 0) return;
      const now = Date.now();
      const patchMap = new Map(updates.map((u) => [u.id, u.patch]));
      let spawnedCount = 0;
      setStore((prev) => {
        const spawned: TaskItem[] = [];
        const updatedTasks = prev.tasks.map((t) => {
          const patch = patchMap.get(t.id);
          if (!patch) return t;
          const next = applyStatusTimestamps(t, patch, now);
          const {updatedTask, spawnedTask} = maybeSpawnNextRecurrence(t, next, now);
          if (spawnedTask) {
            spawned.push(spawnedTask);
            spawnedCount += 1;
          }
          return updatedTask;
        });
        const nextTasks = spawned.length > 0 ? [...spawned, ...updatedTasks] : updatedTasks;
        const nextGoals = syncLinkedGoalsProgress(nextTasks, prev.goals, now);
        return {...prev, tasks: nextTasks, goals: nextGoals};
      });
      if (spawnedCount > 0) {
        setLastRecurringNotice(
          spawnedCount === 1
            ? 'اتجدولت مهمة متكررة تلقائياً للميعاد الجاي.'
            : `اتجدولت ${spawnedCount} مهام متكررة تلقائياً للمواعيد الجاية.`,
        );
      }
    },
    [],
  );

  const archiveTask = useCallback((id: string) => {
    const now = Date.now();
    setStore((prev) => {
      const nextTasks = prev.tasks.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          status: 'خلصت' as const,
          completedAt: t.completedAt ?? (t.status === 'خلصت' ? t.updatedAt : now),
          archivedAt: now,
          updatedAt: now,
        };
      });
      return {
        ...prev,
        tasks: nextTasks,
        goals: syncLinkedGoalsProgress(nextTasks, prev.goals, now),
      };
    });
  }, []);

  const bulkAddTagToTasks = useCallback((ids: string[], rawTag: string) => {
    const clean = rawTag.trim().replace(/^#/, '');
    if (ids.length === 0 || !clean) return;
    const idSet = new Set(ids);
    const now = Date.now();
    setStore((prev) => {
      const hasPrefTag = prev.preferences.taskTags.some(
        (t) => t.toLowerCase() === clean.toLowerCase(),
      );
      const canonicalTag =
        prev.preferences.taskTags.find((t) => t.toLowerCase() === clean.toLowerCase()) ?? clean;
      const nextTasks = prev.tasks.map((t) => {
        if (!idSet.has(t.id)) return t;
        const currentTags = t.tags ?? [];
        if (currentTags.includes(canonicalTag)) return t;
        return {...t, tags: [...currentTags, canonicalTag], updatedAt: now};
      });
      return {
        ...prev,
        tasks: nextTasks,
        preferences: hasPrefTag
          ? prev.preferences
          : {
              ...prev.preferences,
              taskTags: [...prev.preferences.taskTags, canonicalTag],
            },
      };
    });
  }, []);

  const bulkArchiveTasks = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const now = Date.now();
    setStore((prev) => {
      const nextTasks = prev.tasks.map((t) => {
        if (!idSet.has(t.id)) return t;
        return {
          ...t,
          status: 'خلصت' as const,
          completedAt: t.completedAt ?? (t.status === 'خلصت' ? t.updatedAt : now),
          archivedAt: now,
          updatedAt: now,
        };
      });
      return {
        ...prev,
        tasks: nextTasks,
        goals: syncLinkedGoalsProgress(nextTasks, prev.goals, now),
      };
    });
  }, []);

  const bulkDeleteTasks = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const now = Date.now();
    setStore((prev) => {
      const nextTasks = prev.tasks.filter((t) => !idSet.has(t.id));
      return {
        ...prev,
        tasks: nextTasks,
        goals: syncLinkedGoalsProgress(nextTasks, prev.goals, now),
      };
    });
  }, []);

  const restoreArchivedTask = useCallback((id: string, reopen = false) => {
    const now = Date.now();
    setStore((prev) => {
      const nextTasks = prev.tasks.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          status: reopen ? ('لسه' as const) : ('خلصت' as const),
          completedAt: reopen ? null : now,
          archivedAt: null,
          updatedAt: now,
        };
      });
      return {
        ...prev,
        tasks: nextTasks,
        goals: syncLinkedGoalsProgress(nextTasks, prev.goals, now),
      };
    });
  }, []);

  const restoreAllArchivedTasks = useCallback(() => {
    const now = Date.now();
    setStore((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        isTaskArchived(t)
          ? {
              ...t,
              archivedAt: null,
              completedAt: t.status === 'خلصت' ? now : null,
              updatedAt: now,
            }
          : t,
      ),
    }));
  }, []);

  const clearArchive = useCallback(() => {
    const now = Date.now();
    setStore((prev) => {
      const nextTasks = prev.tasks.filter((t) => !isTaskArchived(t));
      return {
        ...prev,
        tasks: nextTasks,
        goals: syncLinkedGoalsProgress(nextTasks, prev.goals, now),
      };
    });
  }, []);

  const runAutoArchiveNow = useCallback((): number => {
    const days = store.preferences.autoArchiveDays ?? DEFAULT_AUTO_ARCHIVE_DAYS;
    const res = autoArchiveExpiredTasks(store.tasks, Date.now(), days);
    if (res.archivedCount > 0) {
      setStore((prev) => ({...prev, tasks: res.tasks}));
      setLastAutoArchivedCount(res.archivedCount);
    }
    return res.archivedCount;
  }, [store.tasks, store.preferences.autoArchiveDays]);

  const deleteTask = useCallback((id: string) => {
    const now = Date.now();
    setStore((prev) => {
      const nextTasks = prev.tasks.filter((t) => t.id !== id);
      return {
        ...prev,
        tasks: nextTasks,
        goals: syncLinkedGoalsProgress(nextTasks, prev.goals, now),
      };
    });
  }, []);

  const addNote = useCallback(
    (input: {
      title: string;
      content: string;
      category: NoteCategory;
      images?: NoteImage[];
      pinned?: boolean;
    }) => {
      const now = Date.now();
      const item: NoteItem = {
        id: createSimpleId(),
        title: input.title.trim(),
        content: input.content.trim(),
        category: input.category,
        images: input.images ?? [],
        pinned: Boolean(input.pinned),
        createdAt: now,
        updatedAt: now,
      };
      setStore((prev) => ({...prev, notes: [item, ...prev.notes]}));
    },
    [],
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<Omit<NoteItem, 'id' | 'createdAt'>>) => {
      const now = Date.now();
      setStore((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === id ? {...n, ...patch, updatedAt: now} : n)),
      }));
    },
    [],
  );

  const deleteNote = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      notes: prev.notes.filter((n) => n.id !== id),
    }));
  }, []);

  const addDocument = useCallback(
    (input: {
      title: string;
      category: DocumentCategory;
      documentNumber?: string;
      expiryDate: string;
      reminderLead: DocumentReminderLead;
      notes?: string;
    }) => {
      const now = Date.now();
      const item: DocumentItem = {
        id: createSimpleId(),
        title: input.title.trim(),
        category: input.category,
        documentNumber: input.documentNumber?.trim() ?? '',
        expiryDate: input.expiryDate,
        reminderLead: input.reminderLead,
        notes: input.notes?.trim() ?? '',
        createdAt: now,
        updatedAt: now,
      };
      setStore((prev) => ({
        ...prev,
        documents: [item, ...(prev.documents ?? [])],
      }));
    },
    [],
  );

  const updateDocument = useCallback(
    (id: string, patch: Partial<Omit<DocumentItem, 'id' | 'createdAt'>>) => {
      const now = Date.now();
      setStore((prev) => ({
        ...prev,
        documents: (prev.documents ?? []).map((doc) =>
          doc.id === id ? {...doc, ...patch, updatedAt: now} : doc,
        ),
      }));
    },
    [],
  );

  const deleteDocument = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      documents: (prev.documents ?? []).filter((doc) => doc.id !== id),
    }));
  }, []);

  const addGoal = useCallback(
    (input: {
      kind: GoalKind;
      title: string;
      description: string;
      targetDate: string | null;
      progress: number;
      color?: GoalColor;
    }) => {
      const now = Date.now();
      const item: GoalProjectItem = {
        id: createSimpleId(),
        kind: input.kind,
        title: input.title.trim(),
        description: input.description.trim(),
        targetDate: input.targetDate || null,
        progress: Math.max(0, Math.min(100, Math.round(input.progress))),
        color: input.color ?? 'auto',
        createdAt: now,
        updatedAt: now,
      };
      setStore((prev) => ({...prev, goals: [item, ...prev.goals]}));
    },
    [],
  );

  const addGoalWithTasks = useCallback(
    (input: {
      kind: GoalKind;
      title: string;
      description: string;
      targetDate: string | null;
      color?: GoalColor;
      taskTitles: string[];
    }) => {
      const now = Date.now();
      const goalId = createSimpleId();
      const goalItem: GoalProjectItem = {
        id: goalId,
        kind: input.kind,
        title: input.title.trim(),
        description: input.description.trim(),
        targetDate: input.targetDate || null,
        progress: 0,
        color: input.color ?? 'auto',
        createdAt: now,
        updatedAt: now,
      };
      const createdTasks: TaskItem[] = input.taskTitles
        .map((t) => t.trim())
        .filter(Boolean)
        .map((taskTitle, idx) => ({
          id: createSimpleId(),
          title: taskTitle,
          dueDate: input.targetDate || getTodayIso(),
          priority: 'متوسط',
          status: 'لسه',
          tags: [],
          reminderEnabled: true,
          reminderTime: null,
          recurrence: 'none',
          recurrenceSpawned: false,
          subtasks: [],
          goalId,
          completedAt: null,
          archivedAt: null,
          createdAt: now + idx + 1,
          updatedAt: now + idx + 1,
        }));

      setStore((prev) => ({
        ...prev,
        goals: [goalItem, ...prev.goals],
        tasks: [...createdTasks, ...prev.tasks],
      }));
    },
    [],
  );

  const updateGoal = useCallback(
    (id: string, patch: Partial<Omit<GoalProjectItem, 'id' | 'createdAt'>>) => {
      const now = Date.now();
      setStore((prev) => ({
        ...prev,
        goals: prev.goals.map((g) => {
          if (g.id !== id) return g;
          const nextProgress =
            typeof patch.progress === 'number'
              ? Math.max(0, Math.min(100, Math.round(patch.progress)))
              : g.progress;
          return {...g, ...patch, progress: nextProgress, updatedAt: now};
        }),
      }));
    },
    [],
  );

  const deleteGoal = useCallback((id: string) => {
    const now = Date.now();
    setStore((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== id),
      tasks: prev.tasks.map((t) =>
        t.goalId === id ? {...t, goalId: null, updatedAt: now} : t,
      ),
    }));
  }, []);

  const addHabit = useCallback((rawTitle: string) => {
    const title = rawTitle.trim();
    if (!title) return;
    const now = Date.now();
    const item: HabitItem = {
      id: createSimpleId(),
      title,
      completedDates: [],
      createdAt: now,
      updatedAt: now,
    };
    setStore((prev) => ({
      ...prev,
      habits: [item, ...(prev.habits ?? [])],
    }));
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      habits: (prev.habits ?? []).filter((h) => h.id !== id),
    }));
  }, []);

  const toggleHabitDate = useCallback((id: string, dateIso?: string) => {
    const targetIso = dateIso || getTodayIso();
    const now = Date.now();
    setStore((prev) => ({
      ...prev,
      habits: (prev.habits ?? []).map((h) => {
        if (h.id !== id) return h;
        const exists = h.completedDates.includes(targetIso);
        const nextDates = exists
          ? h.completedDates.filter((d) => d !== targetIso)
          : [...h.completedDates, targetIso].sort();
        return {...h, completedDates: nextDates, updatedAt: now};
      }),
    }));
  }, []);

  const updateAssistantProfile = useCallback(
    (patch: Partial<Omit<AssistantLifeProfile, 'updatedAt'>>) => {
      const now = Date.now();
      setStore((prev) => ({
        ...prev,
        assistantProfile: {
          ...DEFAULT_ASSISTANT_PROFILE,
          ...(prev.assistantProfile ?? {}),
          ...patch,
          updatedAt: now,
        },
      }));
    },
    [],
  );

  const addAssistantMemory = useCallback(
    (input: {category: AssistantMemoryCategory; fact: string}): boolean => {
      const clean = input.fact.trim();
      if (!clean) return false;
      const now = Date.now();
      let added = false;
      setStore((prev) => {
        const current = prev.assistantMemories ?? [];
        const duplicate = current.some(
          (m) => m.fact.trim().toLowerCase() === clean.toLowerCase(),
        );
        if (duplicate) return prev;
        added = true;
        const item: AssistantMemoryItem = {
          id: createSimpleId(),
          category: input.category,
          fact: clean,
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...prev,
          assistantMemories: [item, ...current].slice(0, 80),
        };
      });
      return added;
    },
    [],
  );

  const deleteAssistantMemory = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      assistantMemories: (prev.assistantMemories ?? []).filter((m) => m.id !== id),
    }));
  }, []);

  const appendAssistantMessages = useCallback((messages: AssistantChatMessage[]) => {
    if (messages.length === 0) return;
    setStore((prev) => ({
      ...prev,
      assistantMessages: [...(prev.assistantMessages ?? []), ...messages].slice(-60),
    }));
  }, []);

  const clearAssistantChat = useCallback(() => {
    setStore((prev) => ({
      ...prev,
      assistantMessages: [],
    }));
  }, []);

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    setStore((prev) => {
      const nextPrefs = {...prev.preferences, ...patch};
      const nextStore = {...prev, preferences: nextPrefs};
      if (patch.autoArchiveEnabled === true || patch.autoArchiveDays !== undefined) {
        const swept = sweepStoreAutoArchive(nextStore);
        if (swept.archivedCount > 0) {
          setLastAutoArchivedCount(swept.archivedCount);
        }
        return swept.store;
      }
      return nextStore;
    });
  }, []);

  const addTaskTag = useCallback(
    (rawName: string): {ok: boolean; error?: string; tag?: string} => {
      const clean = rawName.trim().replace(/^#/, '');
      if (!clean) {
        return {ok: false, error: 'اكتب اسم التصنيف الأول.'};
      }
      if (clean.length > 30) {
        return {ok: false, error: 'اسم التصنيف طويل شوية، خليه ٣٠ حرف بالكتير.'};
      }
      const duplicate = store.preferences.taskTags.some(
        (existing) => existing.toLowerCase() === clean.toLowerCase(),
      );
      if (duplicate) {
        return {ok: false, error: 'التصنيف ده موجود فعلاً.'};
      }
      setStore((prev) => {
        if (prev.preferences.taskTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
          return prev;
        }
        return {
          ...prev,
          preferences: {
            ...prev.preferences,
            taskTags: [...prev.preferences.taskTags, clean],
          },
        };
      });
      return {ok: true, tag: clean};
    },
    [store.preferences.taskTags],
  );

  const renameTaskTag = useCallback(
    (
      oldName: string,
      newRawName: string,
    ): {ok: boolean; error?: string; tag?: string} => {
      const clean = newRawName.trim().replace(/^#/, '');
      if (!clean) {
        return {ok: false, error: 'اكتب اسم التصنيف الجديد الأول.'};
      }
      if (clean.length > 30) {
        return {ok: false, error: 'اسم التصنيف طويل شوية، خليه ٣٠ حرف بالكتير.'};
      }
      if (clean === oldName) {
        return {ok: true, tag: clean};
      }
      const duplicate = store.preferences.taskTags.some(
        (existing) => existing !== oldName && existing.toLowerCase() === clean.toLowerCase(),
      );
      if (duplicate) {
        return {ok: false, error: 'فيه تصنيف تاني بنفس الاسم ده فعلاً.'};
      }
      const now = Date.now();
      setStore((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => {
          const tTags = t.tags ?? [];
          if (!tTags.includes(oldName)) return t;
          const nextTags = Array.from(
            new Set(tTags.map((tag) => (tag === oldName ? clean : tag))),
          );
          return {...t, tags: nextTags, updatedAt: now};
        }),
        preferences: {
          ...prev.preferences,
          taskTags: Array.from(
            new Set(
              prev.preferences.taskTags.map((tag) => (tag === oldName ? clean : tag)),
            ),
          ),
        },
      }));
      return {ok: true, tag: clean};
    },
    [store.preferences.taskTags],
  );

  const deleteTaskTag = useCallback((tagName: string) => {
    const now = Date.now();
    setStore((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        (t.tags ?? []).includes(tagName)
          ? {...t, tags: t.tags.filter((tag) => tag !== tagName), updatedAt: now}
          : t,
      ),
      preferences: {
        ...prev.preferences,
        taskTags: prev.preferences.taskTags.filter((tag) => tag !== tagName),
      },
    }));
  }, []);

  const resetDefaultTaskTags = useCallback(() => {
    setStore((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        taskTags: Array.from(new Set([...DEFAULT_TASK_TAGS, ...prev.preferences.taskTags])),
      },
    }));
  }, []);

  const exportBackupJson = useCallback(() => {
    return JSON.stringify(store, null, 2);
  }, [store]);

  const restoreFromBackupJson = useCallback((rawJson: string) => {
    const validated = parseAndValidateBackup(rawJson);
    const swept = sweepStoreAutoArchive(validated);
    setStore(swept.store);
    if (swept.archivedCount > 0) {
      setLastAutoArchivedCount(swept.archivedCount);
    }
  }, []);

  const replaceStore = useCallback((nextStore: OmarsLifeStore) => {
    const swept = sweepStoreAutoArchive(nextStore);
    setStore(swept.store);
    if (swept.archivedCount > 0) {
      setLastAutoArchivedCount(swept.archivedCount);
    }
  }, []);

  const clearAllData = useCallback(() => {
    setStore((prev) => ({
      ...createEmptyStore(),
      preferences: prev.preferences,
    }));
    setLastAutoArchivedCount(0);
  }, []);

  return (
    <LifeContext.Provider
      value={{
        activeSection,
        setActiveSection,
        tasksViewMode,
        setTasksViewMode,
        focusedItem,
        navigateToItem,
        clearFocusedItem,
        isAppLocked,
        lockApp,
        unlockApp,
        store,
        tasks: activeTasks,
        archivedTasks,
        allTasks: store.tasks,
        lastAutoArchivedCount,
        dismissAutoArchiveNotice,
        lastRecurringNotice,
        dismissRecurringNotice,
        notes: store.notes,
        documents,
        goals: store.goals,
        habits,
        focusSessions,
        todayFocusMinutes,
        focusState,
        startFocusForTask,
        toggleFocusRunning,
        resetFocusTimer,
        setFocusPreset,
        clearFocusTask,
        completeFocusEarly,
        dismissFocusNotice,
        preferences: store.preferences,
        storageQuotaExceeded,
        addTask,
        updateTask,
        batchUpdateTasks,
        archiveTask,
        bulkAddTagToTasks,
        bulkArchiveTasks,
        bulkDeleteTasks,
        restoreArchivedTask,
        restoreAllArchivedTasks,
        clearArchive,
        runAutoArchiveNow,
        deleteTask,
        addNote,
        updateNote,
        deleteNote,
        addDocument,
        updateDocument,
        deleteDocument,
        addGoal,
        addGoalWithTasks,
        updateGoal,
        deleteGoal,
        addHabit,
        deleteHabit,
        toggleHabitDate,
        assistantProfile,
        assistantMemories,
        assistantMessages,
        updateAssistantProfile,
        addAssistantMemory,
        deleteAssistantMemory,
        appendAssistantMessages,
        clearAssistantChat,
        recordFocusSession,
        updatePreferences,
        addTaskTag,
        renameTaskTag,
        deleteTaskTag,
        resetDefaultTaskTags,
        exportBackupJson,
        restoreFromBackupJson,
        replaceStore,
        clearAllData,
      }}
    >
      {children}
    </LifeContext.Provider>
  );
};

export function useLife(): LifeContextValue {
  const ctx = useContext(LifeContext);
  if (!ctx) {
    throw new Error('useLife must be used inside LifeProvider');
  }
  return ctx;
}
