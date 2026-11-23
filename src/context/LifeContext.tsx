import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_TASK_TAGS,
  createEmptyStore,
  createSimpleId,
  loadStore,
  parseAndValidateBackup,
  saveStore,
} from '../storage/localStore';
import {
  DEFAULT_AUTO_ARCHIVE_DAYS,
  autoArchiveExpiredTasks,
  isTaskArchived,
} from '../storage/taskArchive';
import type {
  AppPreferences,
  GoalKind,
  GoalProjectItem,
  NavSection,
  NoteCategory,
  NoteImage,
  NoteItem,
  OmarsLifeStore,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../types';

export interface FocusedItemTarget {
  section: 'tasks' | 'notes' | 'goals' | 'archive';
  id: string;
}

interface LifeContextValue {
  activeSection: NavSection;
  setActiveSection: (section: NavSection) => void;
  focusedItem: FocusedItemTarget | null;
  navigateToItem: (section: 'tasks' | 'notes' | 'goals' | 'archive', id: string) => void;
  clearFocusedItem: () => void;
  store: OmarsLifeStore;
  /** Active (non-archived) tasks */
  tasks: TaskItem[];
  /** Archived tasks sorted newest archived first */
  archivedTasks: TaskItem[];
  /** All tasks (active + archived) for analytics, search, and export */
  allTasks: TaskItem[];
  lastAutoArchivedCount: number;
  dismissAutoArchiveNotice: () => void;
  notes: NoteItem[];
  goals: GoalProjectItem[];
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
  }) => void;
  updateTask: (id: string, patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>) => void;
  batchUpdateTasks: (
    updates: Array<{id: string; patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>}>,
  ) => void;
  archiveTask: (id: string) => void;
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
  }) => void;
  updateNote: (id: string, patch: Partial<Omit<NoteItem, 'id' | 'createdAt'>>) => void;
  deleteNote: (id: string) => void;
  addGoal: (input: {
    kind: GoalKind;
    title: string;
    description: string;
    targetDate: string | null;
    progress: number;
  }) => void;
  updateGoal: (id: string, patch: Partial<Omit<GoalProjectItem, 'id' | 'createdAt'>>) => void;
  deleteGoal: (id: string) => void;
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
  const [focusedItem, setFocusedItem] = useState<FocusedItemTarget | null>(null);

  const initialBootstrap = useMemo(() => sweepStoreAutoArchive(loadStore()), []);
  const [store, setStore] = useState<OmarsLifeStore>(() => initialBootstrap.store);
  const [lastAutoArchivedCount, setLastAutoArchivedCount] = useState<number>(
    () => initialBootstrap.archivedCount,
  );
  const [storageQuotaExceeded, setStorageQuotaExceeded] = useState(false);

  const navigateToItem = useCallback(
    (section: 'tasks' | 'notes' | 'goals' | 'archive', id: string) => {
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

  const addTask = useCallback(
    (input: {
      title: string;
      dueDate: string | null;
      priority: TaskPriority;
      status?: TaskStatus;
      tags?: string[];
      reminderEnabled?: boolean;
      reminderTime?: string | null;
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
        completedAt: status === 'خلصت' ? now : null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      setStore((prev) => ({...prev, tasks: [item, ...prev.tasks]}));
    },
    [],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>) => {
      const now = Date.now();
      setStore((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === id ? applyStatusTimestamps(t, patch, now) : t)),
      }));
    },
    [],
  );

  const batchUpdateTasks = useCallback(
    (updates: Array<{id: string; patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>}>) => {
      if (updates.length === 0) return;
      const now = Date.now();
      const patchMap = new Map(updates.map((u) => [u.id, u.patch]));
      setStore((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => {
          const patch = patchMap.get(t.id);
          return patch ? applyStatusTimestamps(t, patch, now) : t;
        }),
      }));
    },
    [],
  );

  const archiveTask = useCallback((id: string) => {
    const now = Date.now();
    setStore((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          status: 'خلصت',
          completedAt: t.completedAt ?? (t.status === 'خلصت' ? t.updatedAt : now),
          archivedAt: now,
          updatedAt: now,
        };
      }),
    }));
  }, []);

  const restoreArchivedTask = useCallback((id: string, reopen = false) => {
    const now = Date.now();
    setStore((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          status: reopen ? 'لسه' : 'خلصت',
          completedAt: reopen ? null : now,
          archivedAt: null,
          updatedAt: now,
        };
      }),
    }));
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
    setStore((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => !isTaskArchived(t)),
    }));
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
    setStore((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
    }));
  }, []);

  const addNote = useCallback(
    (input: {title: string; content: string; category: NoteCategory; images?: NoteImage[]}) => {
      const now = Date.now();
      const item: NoteItem = {
        id: createSimpleId(),
        title: input.title.trim(),
        content: input.content.trim(),
        category: input.category,
        images: input.images ?? [],
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

  const addGoal = useCallback(
    (input: {
      kind: GoalKind;
      title: string;
      description: string;
      targetDate: string | null;
      progress: number;
    }) => {
      const now = Date.now();
      const item: GoalProjectItem = {
        id: createSimpleId(),
        kind: input.kind,
        title: input.title.trim(),
        description: input.description.trim(),
        targetDate: input.targetDate || null,
        progress: Math.max(0, Math.min(100, Math.round(input.progress))),
        createdAt: now,
        updatedAt: now,
      };
      setStore((prev) => ({...prev, goals: [item, ...prev.goals]}));
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
    setStore((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== id),
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
        focusedItem,
        navigateToItem,
        clearFocusedItem,
        store,
        tasks: activeTasks,
        archivedTasks,
        allTasks: store.tasks,
        lastAutoArchivedCount,
        dismissAutoArchiveNotice,
        notes: store.notes,
        goals: store.goals,
        preferences: store.preferences,
        storageQuotaExceeded,
        addTask,
        updateTask,
        batchUpdateTasks,
        archiveTask,
        restoreArchivedTask,
        restoreAllArchivedTasks,
        clearArchive,
        runAutoArchiveNow,
        deleteTask,
        addNote,
        updateNote,
        deleteNote,
        addGoal,
        updateGoal,
        deleteGoal,
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
