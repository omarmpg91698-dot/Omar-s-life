import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  Archive,
  Bell,
  BellOff,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  CircleDot,
  Clock,
  Flag,
  Layers,
  List,
  ListChecks,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Square,
  Tag,
  Target,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import {CalendarMonthView} from '../components/CalendarMonthView';
import {FilterDropdown, type FilterDropdownOption} from '../components/FilterDropdown';
import {SmartTagSuggestionsBar} from '../components/SmartTagSuggestionsBar';
import {useLife} from '../context/LifeContext';
import {
  createSimpleId,
  formatFriendlyDate,
  formatReminderTime,
  getOffsetIso,
  getTodayIso,
  isTaskDueToday,
  isTaskOverdue,
  isTaskReminderDueToday,
} from '../storage/localStore';
import {RECURRENCE_LABELS} from '../storage/productivityUtils';
import {
  suggestSmartTaskTags,
  type SmartTagSuggestion,
} from '../storage/smartTagSuggestions';
import {DEFAULT_AUTO_ARCHIVE_DAYS, daysUntilAutoArchive} from '../storage/taskArchive';
import type {
  TaskItem,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  TaskSubtask,
} from '../types';

type TaskFilterTab = 'الكل' | 'النهارده' | TaskStatus | 'اتأجلت';

const PRIORITY_ORDER: TaskPriority[] = ['مهم', 'متوسط', 'عادي'];

const PRIORITY_META: Record<
  TaskPriority,
  {
    label: string;
    dotClass: string;
    textClass: string;
    activeButtonClass: string;
    icon: React.ComponentType<{className?: string}>;
  }
> = {
  مهم: {
    label: 'مهم',
    dotClass: 'bg-red-500 dark:bg-red-400',
    textClass: 'text-red-600 dark:text-red-400 font-semibold',
    activeButtonClass:
      'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300',
    icon: AlertTriangle,
  },
  متوسط: {
    label: 'متوسط',
    dotClass: 'bg-amber-500 dark:bg-amber-400',
    textClass: 'text-amber-700 dark:text-amber-400 font-medium',
    activeButtonClass:
      'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    icon: Flag,
  },
  عادي: {
    label: 'عادي',
    dotClass: 'bg-sky-500 dark:bg-sky-400',
    textClass: 'text-sky-700 dark:text-sky-400 font-medium',
    activeButtonClass:
      'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
    icon: CircleDot,
  },
};

const PRIORITY_SORT_ORDER: Record<TaskPriority, number> = {مهم: 0, متوسط: 1, عادي: 2};

function compareTasksByNearestDate(a: TaskItem, b: TaskItem): number {
  const aDone = a.status === 'خلصت';
  const bDone = b.status === 'خلصت';
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (aDone) {
    return (b.completedAt ?? b.updatedAt ?? 0) - (a.completedAt ?? a.updatedAt ?? 0);
  }
  if (a.dueDate && b.dueDate) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return (PRIORITY_SORT_ORDER[a.priority] ?? 1) - (PRIORITY_SORT_ORDER[b.priority] ?? 1);
  }
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  const byPriority =
    (PRIORITY_SORT_ORDER[a.priority] ?? 1) - (PRIORITY_SORT_ORDER[b.priority] ?? 1);
  if (byPriority !== 0) return byPriority;
  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}

function getTaskDeadlineMs(task: TaskItem): number | null {
  if (!task.dueDate) return null;
  const time = /^\d{2}:\d{2}$/.test(task.reminderTime ?? '') ? (task.reminderTime as string) : '23:59';
  const ms = new Date(`${task.dueDate}T${time}:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatRemainingTime(msDiff: number): string {
  let rest = Math.abs(msDiff);
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  if (days > 0) return `${days} يوم و${hours} ساعة و${minutes} دقيقة`;
  if (hours > 0) return `${hours} ساعة و${minutes} دقيقة`;
  return `${minutes} دقيقة`;
}

export const TasksView: React.FC = () => {
  const {
    tasks,
    archivedTasks,
    goals,
    preferences,
    tasksViewMode,
    setTasksViewMode,
    lastRecurringNotice,
    dismissRecurringNotice,
    startFocusForTask,
    addTask,
    updateTask,
    archiveTask,
    bulkAddTagToTasks,
    bulkArchiveTasks,
    bulkDeleteTasks,
    deleteTask,
    addTaskTag,
    setActiveSection,
    focusedItem,
    clearFocusedItem,
  } = useLife();
  const todayIso = getTodayIso();
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Add form state
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(todayIso);
  const [priority, setPriority] = useState<TaskPriority>(preferences.defaultPriority);
  const [status, setStatus] = useState<TaskStatus>('لسه');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dismissedCreateTags, setDismissedCreateTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [goalId, setGoalId] = useState<string>('');
  const [draftSubtasks, setDraftSubtasks] = useState<TaskSubtask[]>([]);
  const [draftSubtaskInput, setDraftSubtaskInput] = useState('');
  const [formError, setFormError] = useState('');

  // Inline subtasks expansion state per task
  const [expandedSubtasksIds, setExpandedSubtasksIds] = useState<Record<string, boolean>>({});
  const [inlineSubtaskInputs, setInlineSubtaskInputs] = useState<Record<string, string>>({});

  // Filters & grouping
  const [statusTab, setStatusTab] = useState<TaskFilterTab>('الكل');
  const [tagFilter, setTagFilter] = useState<string>('الكل');
  const [priorityFilter, setPriorityFilter] = useState<'الكل' | TaskPriority>('الكل');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByTag, setGroupByTag] = useState(false);
  const [priorityAlertDismissed, setPriorityAlertDismissed] = useState(false);

  // Multi-select bulk actions state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkTagChoice, setBulkTagChoice] = useState('');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Quick swipe gesture state (swipe right = done, swipe left = postpone to tomorrow)
  const [swipeState, setSwipeState] = useState<{id: string; dx: number} | null>(null);
  const swipeTouchRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    locked: 'horizontal' | 'vertical' | null;
  } | null>(null);
  const [swipeNotice, setSwipeNotice] = useState<{
    message: string;
    undo: () => void;
  } | null>(null);

  // Edit modal state
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('متوسط');
  const [editStatus, setEditStatus] = useState<TaskStatus>('لسه');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCustomTag, setEditCustomTag] = useState('');
  const [editReminderEnabled, setEditReminderEnabled] = useState(true);
  const [editReminderTime, setEditReminderTime] = useState('');
  const [editRecurrence, setEditRecurrence] = useState<TaskRecurrence>('none');
  const [editGoalId, setEditGoalId] = useState<string>('');
  const [editSubtasks, setEditSubtasks] = useState<TaskSubtask[]>([]);
  const [editSubtaskInput, setEditSubtaskInput] = useState('');

  const goalsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of goals) map.set(g.id, g.title);
    return map;
  }, [goals]);

  useEffect(() => {
    if (!focusedItem || focusedItem.section !== 'tasks') return;
    setStatusTab('الكل');
    setTagFilter('الكل');
    setPriorityFilter('الكل');
    setSearchQuery('');
    setGroupByTag(false);
    setHighlightedTaskId(focusedItem.id);
    clearFocusedItem();

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`life-item-${focusedItem.id}`)
        ?.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
    const timer = window.setTimeout(() => setHighlightedTaskId(null), 2600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusedItem, clearFocusedItem]);

  const availableTags = useMemo(() => {
    const set = new Set<string>(preferences.taskTags);
    for (const t of tasks) {
      for (const tag of t.tags ?? []) {
        if (tag.trim()) set.add(tag.trim());
      }
    }
    for (const tag of selectedTags) {
      if (tag.trim()) set.add(tag.trim());
    }
    return Array.from(set);
  }, [preferences.taskTags, tasks, selectedTags]);

  const smartTagSuggestions = useMemo(
    () =>
      suggestSmartTaskTags({
        title,
        availableTags,
        selectedTags,
        dismissedTags: dismissedCreateTags,
        existingTasks: tasks,
      }),
    [title, availableTags, selectedTags, dismissedCreateTags, tasks],
  );

  const editSmartTagSuggestions = useMemo(
    () =>
      editingTask
        ? suggestSmartTaskTags({
            title: editTitle,
            availableTags,
            selectedTags: editTags,
            existingTasks: tasks.filter((t) => t.id !== editingTask.id),
          })
        : [],
    [editingTask, editTitle, availableTags, editTags, tasks],
  );

  const handleAcceptSmartTag = (suggestion: SmartTagSuggestion) => {
    if (suggestion.isNewTag) {
      addTaskTag(suggestion.tag);
    }
    setSelectedTags((prev) =>
      prev.includes(suggestion.tag) ? prev : [...prev, suggestion.tag],
    );
  };

  const handleAcceptAllSmartTags = () => {
    for (const suggestion of smartTagSuggestions) {
      if (suggestion.isNewTag) {
        addTaskTag(suggestion.tag);
      }
    }
    setSelectedTags((prev) =>
      Array.from(new Set([...prev, ...smartTagSuggestions.map((s) => s.tag)])),
    );
  };

  const handleAcceptEditSmartTag = (suggestion: SmartTagSuggestion) => {
    if (suggestion.isNewTag) {
      addTaskTag(suggestion.tag);
    }
    setEditTags((prev) =>
      prev.includes(suggestion.tag) ? prev : [...prev, suggestion.tag],
    );
  };

  const effectiveTagFilter =
    tagFilter === 'الكل' || tagFilter === 'من غير تصنيف' || availableTags.includes(tagFilter)
      ? tagFilter
      : 'الكل';

  const toggleCreateTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const handleAddCustomCreateTag = () => {
    const clean = customTagInput.trim().replace(/^#/, '');
    if (!clean) return;
    const existing = availableTags.find((t) => t.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (!selectedTags.includes(existing)) {
        setSelectedTags((prev) => [...prev, existing]);
      }
      setCustomTagInput('');
      setFormError('');
      return;
    }
    const res = addTaskTag(clean);
    if (!res.ok) {
      setFormError(res.error ?? 'اسم التصنيف مش مظبوط.');
      return;
    }
    const tagToUse = res.tag ?? clean;
    if (!selectedTags.includes(tagToUse)) {
      setSelectedTags((prev) => [...prev, tagToUse]);
    }
    setCustomTagInput('');
    setFormError('');
  };

  const toggleEditTag = (tag: string) => {
    setEditTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const handleAddCustomEditTag = () => {
    const clean = editCustomTag.trim().replace(/^#/, '');
    if (!clean) return;
    const existing = availableTags.find((t) => t.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (!editTags.includes(existing)) {
        setEditTags((prev) => [...prev, existing]);
      }
      setEditCustomTag('');
      return;
    }
    const res = addTaskTag(clean);
    if (!res.ok) return;
    const tagToUse = res.tag ?? clean;
    if (!editTags.includes(tagToUse)) {
      setEditTags((prev) => [...prev, tagToUse]);
    }
    setEditCustomTag('');
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('اكتب اسم المهمة الأول عشان نقدر نحفظها.');
      return;
    }
    let tagsToSave = [...selectedTags];
    const pendingTag = customTagInput.trim().replace(/^#/, '');
    if (pendingTag) {
      const existing = availableTags.find((t) => t.toLowerCase() === pendingTag.toLowerCase());
      if (existing) {
        if (!tagsToSave.includes(existing)) tagsToSave.push(existing);
      } else {
        const res = addTaskTag(pendingTag);
        if (!res.ok) {
          setFormError(res.error ?? 'اسم التصنيف مش مظبوط.');
          return;
        }
        const tagToUse = res.tag ?? pendingTag;
        if (!tagsToSave.includes(tagToUse)) tagsToSave.push(tagToUse);
      }
    }
    const finalSubtasks = [...draftSubtasks];
    if (draftSubtaskInput.trim()) {
      finalSubtasks.push({
        id: createSimpleId(),
        title: draftSubtaskInput.trim(),
        done: false,
      });
    }
    setFormError('');
    addTask({
      title: title.trim(),
      dueDate: dueDate || null,
      priority,
      status,
      tags: tagsToSave,
      reminderEnabled,
      reminderTime: reminderEnabled && reminderTime ? reminderTime : null,
      recurrence,
      goalId: goalId || null,
      subtasks: finalSubtasks,
    });
    setTitle('');
    setDueDate(todayIso);
    setStatus('لسه');
    setSelectedTags([]);
    setDismissedCreateTags([]);
    setCustomTagInput('');
    setReminderEnabled(true);
    setReminderTime('');
    setRecurrence('none');
    setGoalId('');
    setDraftSubtasks([]);
    setDraftSubtaskInput('');
  };

  const handleAddDraftSubtask = () => {
    const clean = draftSubtaskInput.trim();
    if (!clean) return;
    setDraftSubtasks((prev) => [...prev, {id: createSimpleId(), title: clean, done: false}]);
    setDraftSubtaskInput('');
  };

  const handleToggleInlineSubtask = (task: TaskItem, subtaskId: string) => {
    const next = (task.subtasks ?? []).map((st) =>
      st.id === subtaskId ? {...st, done: !st.done} : st,
    );
    updateTask(task.id, {subtasks: next});
  };

  const handleAddInlineSubtask = (task: TaskItem) => {
    const text = (inlineSubtaskInputs[task.id] ?? '').trim();
    if (!text) return;
    const next: TaskSubtask[] = [
      ...(task.subtasks ?? []),
      {id: createSimpleId(), title: text, done: false},
    ];
    updateTask(task.id, {subtasks: next});
    setInlineSubtaskInputs((prev) => ({...prev, [task.id]: ''}));
  };

  const handleDeleteInlineSubtask = (task: TaskItem, subtaskId: string) => {
    const next = (task.subtasks ?? []).filter((st) => st.id !== subtaskId);
    updateTask(task.id, {subtasks: next});
  };

  const startEdit = (task: TaskItem) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDueDate(task.dueDate ?? '');
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditTags(task.tags ?? []);
    setEditCustomTag('');
    setEditReminderEnabled(task.reminderEnabled ?? true);
    setEditReminderTime(task.reminderTime ?? '');
    setEditRecurrence(task.recurrence ?? 'none');
    setEditGoalId(task.goalId ?? '');
    setEditSubtasks(task.subtasks ?? []);
    setEditSubtaskInput('');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;
    const finalEditSubtasks = [...editSubtasks];
    if (editSubtaskInput.trim()) {
      finalEditSubtasks.push({
        id: createSimpleId(),
        title: editSubtaskInput.trim(),
        done: false,
      });
    }
    updateTask(editingTask.id, {
      title: editTitle.trim(),
      dueDate: editDueDate || null,
      priority: editPriority,
      status: editStatus,
      tags: editTags,
      reminderEnabled: editReminderEnabled,
      reminderTime: editReminderEnabled && editReminderTime ? editReminderTime : null,
      recurrence: editRecurrence,
      goalId: editGoalId || null,
      subtasks: finalEditSubtasks,
    });
    setEditingTask(null);
  };

  const overdueCount = tasks.filter((t) => isTaskOverdue(t, todayIso)).length;
  const dueTodayCount = tasks.filter((t) => isTaskDueToday(t, todayIso)).length;
  const openHighPriorityTasks = tasks.filter(
    (t) => t.priority === 'مهم' && t.status !== 'خلصت',
  );
  const priorityCounts = useMemo(() => {
    const counts: Record<TaskPriority, number> = {مهم: 0, متوسط: 0, عادي: 0};
    for (const t of tasks) {
      counts[t.priority] = (counts[t.priority] ?? 0) + 1;
    }
    return counts;
  }, [tasks]);

  const tasksMatchingNonTagFilters = useMemo(() => {
    return tasks
      .filter((t) => {
        if (statusTab === 'النهارده') return isTaskDueToday(t, todayIso);
        if (statusTab === 'اتأجلت') return isTaskOverdue(t, todayIso);
        if (statusTab !== 'الكل') return t.status === statusTab;
        return true;
      })
      .filter((t) => (priorityFilter === 'الكل' ? true : t.priority === priorityFilter))
      .filter((t) =>
        searchQuery.trim()
          ? t.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
            (t.tags ?? []).some((tag) =>
              tag.toLowerCase().includes(searchQuery.trim().toLowerCase()),
            )
          : true,
      );
  }, [tasks, statusTab, todayIso, priorityFilter, searchQuery]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let untagged = 0;
    for (const t of tasksMatchingNonTagFilters) {
      const tTags = t.tags ?? [];
      if (tTags.length === 0) {
        untagged += 1;
      } else {
        for (const tag of tTags) {
          const clean = tag.trim();
          if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
        }
      }
    }
    return {counts, untagged};
  }, [tasksMatchingNonTagFilters]);

  const filteredTasks = useMemo(() => {
    return tasksMatchingNonTagFilters
      .filter((t) => {
        if (effectiveTagFilter === 'الكل') return true;
        if (effectiveTagFilter === 'من غير تصنيف') return (t.tags ?? []).length === 0;
        return (t.tags ?? []).includes(effectiveTagFilter);
      })
      .sort(compareTasksByNearestDate);
  }, [tasksMatchingNonTagFilters, effectiveTagFilter]);

  const hasActiveFilters =
    statusTab !== 'الكل' ||
    effectiveTagFilter !== 'الكل' ||
    priorityFilter !== 'الكل' ||
    searchQuery.trim() !== '';

  const resetAllFilters = () => {
    setStatusTab('الكل');
    setTagFilter('الكل');
    setPriorityFilter('الكل');
    setSearchQuery('');
  };

  const tagDropdownOptions: FilterDropdownOption[] = useMemo(() => {
    const opts: FilterDropdownOption[] = [
      {value: 'الكل', label: 'الكل', count: tasksMatchingNonTagFilters.length},
      ...availableTags.map((tag) => ({
        value: tag,
        label: tag,
        count: tagCounts.counts.get(tag) ?? 0,
      })),
    ];
    if (tagCounts.untagged > 0 || effectiveTagFilter === 'من غير تصنيف') {
      opts.push({
        value: 'من غير تصنيف',
        label: 'من غير تصنيف',
        count: tagCounts.untagged,
      });
    }
    return opts;
  }, [availableTags, effectiveTagFilter, tagCounts, tasksMatchingNonTagFilters.length]);

  const priorityDropdownOptions: FilterDropdownOption[] = useMemo(
    () => [
      {value: 'الكل', label: 'الكل', count: tasks.length},
      ...PRIORITY_ORDER.map((level) => {
        const meta = PRIORITY_META[level];
        return {
          value: level,
          label: meta.label,
          count: priorityCounts[level],
          dotClass: meta.dotClass,
        };
      }),
    ],
    [priorityCounts, tasks.length],
  );

  // Keep selected IDs pruned to currently existing active tasks
  const activeTaskIdSet = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const effectiveSelectedIds = useMemo(
    () => selectedTaskIds.filter((id) => activeTaskIdSet.has(id)),
    [selectedTaskIds, activeTaskIdSet],
  );
  const selectedIdSet = useMemo(() => new Set(effectiveSelectedIds), [effectiveSelectedIds]);

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedTaskIds([]);
        setConfirmBulkDelete(false);
      }
      return !prev;
    });
  };

  const toggleSelectTask = (id: string) => {
    setConfirmBulkDelete(false);
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleToggleSelectAllFiltered = () => {
    setConfirmBulkDelete(false);
    const filteredIds = filteredTasks.map((t) => t.id);
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedIdSet.has(id));
    if (allSelected) {
      setSelectedTaskIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedTaskIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleBulkApplyTag = () => {
    const tagToApply = bulkTagChoice || availableTags[0];
    if (!tagToApply || effectiveSelectedIds.length === 0) return;
    bulkAddTagToTasks(effectiveSelectedIds, tagToApply);
    setBulkFeedback(`تم إضافة التصنيف #${tagToApply} لـ ${effectiveSelectedIds.length} مهام.`);
    setSelectedTaskIds([]);
    setSelectionMode(false);
  };

  const handleBulkArchive = () => {
    if (effectiveSelectedIds.length === 0) return;
    const count = effectiveSelectedIds.length;
    bulkArchiveTasks(effectiveSelectedIds);
    setBulkFeedback(`تم نقل ${count} مهام إلى الأرشيف.`);
    setSelectedTaskIds([]);
    setSelectionMode(false);
  };

  const handleBulkDelete = () => {
    if (effectiveSelectedIds.length === 0) return;
    const count = effectiveSelectedIds.length;
    bulkDeleteTasks(effectiveSelectedIds);
    setBulkFeedback(`تم حذف ${count} مهام بنجاح.`);
    setSelectedTaskIds([]);
    setConfirmBulkDelete(false);
    setSelectionMode(false);
  };

  const handleRowTouchStart = (task: TaskItem, e: React.TouchEvent<HTMLDivElement>) => {
    if (selectionMode || e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, a')) return;
    const touch = e.touches[0];
    swipeTouchRef.current = {
      id: task.id,
      startX: touch.clientX,
      startY: touch.clientY,
      locked: null,
    };
  };

  const handleRowTouchMove = (task: TaskItem, e: React.TouchEvent<HTMLDivElement>) => {
    const ref = swipeTouchRef.current;
    if (!ref || ref.id !== task.id || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - ref.startX;
    const dy = touch.clientY - ref.startY;
    if (!ref.locked) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        ref.locked = 'vertical';
        return;
      }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        ref.locked = 'horizontal';
      } else {
        return;
      }
    }
    if (ref.locked !== 'horizontal') return;
    const clamped = Math.max(-110, Math.min(110, dx));
    setSwipeState({id: task.id, dx: clamped});
  };

  const handleRowTouchEnd = (task: TaskItem) => {
    const ref = swipeTouchRef.current;
    const currentSwipe = swipeState;
    swipeTouchRef.current = null;
    setSwipeState(null);
    if (!ref || ref.id !== task.id || !currentSwipe || currentSwipe.id !== task.id) return;

    const SWIPE_THRESHOLD = 72;
    if (currentSwipe.dx >= SWIPE_THRESHOLD) {
      // Swipe right => mark task completed
      const prevStatus = task.status;
      if (prevStatus !== 'خلصت') {
        updateTask(task.id, {status: 'خلصت'});
        setSwipeNotice({
          message: `تم تعليم «${task.title}» خلصت.`,
          undo: () => {
            updateTask(task.id, {status: prevStatus});
            setSwipeNotice(null);
          },
        });
      }
    } else if (currentSwipe.dx <= -SWIPE_THRESHOLD) {
      // Swipe left => postpone to tomorrow
      const prevDueDate = task.dueDate;
      const tomorrowIso = getOffsetIso(1);
      updateTask(task.id, {dueDate: tomorrowIso});
      setSwipeNotice({
        message: `تم تأجيل «${task.title}» لبكرة.`,
        undo: () => {
          updateTask(task.id, {dueDate: prevDueDate});
          setSwipeNotice(null);
        },
      });
    }
  };

  const groupedByTagSections = useMemo(() => {
    if (!groupByTag) return [];
    const sections: Array<{key: string; label: string; items: TaskItem[]}> = [];

    for (const tag of availableTags) {
      const items = filteredTasks.filter((t) => (t.tags ?? []).includes(tag));
      if (items.length > 0) {
        sections.push({key: tag, label: tag, items});
      }
    }

    const untagged = filteredTasks.filter((t) => (t.tags ?? []).length === 0);
    if (untagged.length > 0) {
      sections.push({key: '__untagged__', label: 'من غير تصنيف', items: untagged});
    }

    return sections;
  }, [groupByTag, availableTags, filteredTasks]);

  const renderTaskRow = (task: TaskItem) => {
    const overdue = isTaskOverdue(task, todayIso);
    const dueToday = isTaskDueToday(task, todayIso);
    const reminderOn = task.reminderEnabled ?? true;
    const reminderDueToday = isTaskReminderDueToday(task, todayIso);
    const taskTags = task.tags ?? [];
    const taskSubtasks = task.subtasks ?? [];
    const doneSubtasksCount = taskSubtasks.filter((st) => st.done).length;
    const subtasksExpanded = Boolean(expandedSubtasksIds[task.id]);
    const linkedGoalTitle = task.goalId ? goalsById.get(task.goalId) : undefined;
    const priorityInfo = PRIORITY_META[task.priority] ?? PRIORITY_META['متوسط'];
    const PriorityIcon = priorityInfo.icon;
    const isHighOpen = task.priority === 'مهم' && task.status !== 'خلصت';
    const isSelected = selectedIdSet.has(task.id);
    const activeSwipeDx = swipeState?.id === task.id ? swipeState.dx : 0;

    return (
      <div
        key={task.id}
        id={`life-item-${task.id}`}
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-800/90"
      >
        {/* Quick swipe reveal backdrop (right = done, left = postpone tomorrow) */}
        {activeSwipeDx !== 0 && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 flex items-center px-5 text-xs font-bold text-white ${
              activeSwipeDx > 0
                ? 'justify-end bg-emerald-500/90'
                : 'justify-start bg-amber-500/90'
            }`}
          >
            {activeSwipeDx > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                <span>خلصت</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                <span>تأجيل لبكرة</span>
              </span>
            )}
          </div>
        )}

        <div
          onTouchStart={(e) => handleRowTouchStart(task, e)}
          onTouchMove={(e) => handleRowTouchMove(task, e)}
          onTouchEnd={() => handleRowTouchEnd(task)}
          onTouchCancel={() => {
            swipeTouchRef.current = null;
            setSwipeState(null);
          }}
          style={
            activeSwipeDx !== 0
              ? {transform: `translateX(${activeSwipeDx}px)`}
              : undefined
          }
          className={`relative bg-white p-4 transition-transform dark:bg-slate-800/90 ${
            activeSwipeDx === 0 ? 'duration-150' : 'duration-0'
          } ${
            highlightedTaskId === task.id
              ? '!bg-accent-soft/60 ring-2 ring-inset ring-accent'
              : isSelected
                ? '!bg-accent-soft/45 dark:!bg-accent-soft/20'
                : dueToday
                  ? '!bg-amber-50/45 dark:!bg-amber-950/15'
                  : isHighOpen
                    ? '!bg-red-50/30 dark:!bg-red-950/10'
                    : ''
          }`}
        >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {selectionMode && (
              <button
                type="button"
                onClick={() => toggleSelectTask(task.id)}
                aria-label={isSelected ? `إلغاء تحديد ${task.title}` : `تحديد ${task.title}`}
                aria-pressed={isSelected}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  isSelected
                    ? 'border-accent bg-accent text-white'
                    : 'border-slate-300 bg-white text-transparent hover:border-accent dark:border-slate-600 dark:bg-slate-900'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                updateTask(task.id, {status: task.status === 'خلصت' ? 'لسه' : 'خلصت'})
              }
              aria-label={`تبديل حالة ${task.title}`}
              className={`flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                task.status === 'خلصت'
                  ? 'border-emerald-500/40 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900'
              }`}
            >
              <CheckCircle2 className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  title={`أولوية: ${priorityInfo.label}`}
                  aria-label={`أولوية ${priorityInfo.label}`}
                  className={`inline-flex shrink-0 items-center gap-1.5 ${
                    task.status === 'خلصت' ? 'opacity-45' : ''
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${priorityInfo.dotClass}`} />
                  <PriorityIcon className={`h-3.5 w-3.5 ${priorityInfo.textClass}`} />
                </span>

                <button
                  type="button"
                  onClick={() => setDetailTaskId(task.id)}
                  aria-label={`تفاصيل ${task.title}`}
                  className={`text-start text-sm font-medium underline-offset-4 ${
                    task.status === 'خلصت'
                      ? 'text-slate-400 line-through dark:text-slate-500'
                      : 'text-slate-900 hover:text-accent hover:underline dark:text-slate-100'
                  }`}
                >
                  {task.title}
                </button>
                {task.recurrence && task.recurrence !== 'none' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                    <Repeat className="h-3 w-3" />
                    <span>{RECURRENCE_LABELS[task.recurrence]}</span>
                  </span>
                )}
                {dueToday && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <BellRing className="h-3.5 w-3.5" />
                    <span>
                      ميعادها النهارده
                      {task.reminderTime ? ` · ${formatReminderTime(task.reminderTime)}` : ''}
                    </span>
                  </span>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className={`inline-flex items-center gap-1 ${priorityInfo.textClass}`}>
                  <span>{priorityInfo.label}</span>
                </span>
                {isHighOpen && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      تنبيه أولوية عالية
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span
                  className={
                    overdue
                      ? 'font-medium text-red-600 dark:text-red-400'
                      : dueToday
                        ? 'font-medium text-amber-700 dark:text-amber-400'
                        : ''
                  }
                >
                  {overdue
                    ? `اتأجلت (${formatFriendlyDate(task.dueDate)})`
                    : formatFriendlyDate(task.dueDate)}
                </span>
                {task.status !== 'خلصت' &&
                  task.dueDate &&
                  (() => {
                    const deadline = getTaskDeadlineMs(task);
                    if (deadline === null) return null;
                    const diff = deadline - nowTick;
                    const late = diff < 0;
                    const soon = !late && diff < 24 * 3_600_000;
                    return (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            late
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                              : soon
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                                : 'bg-accent-soft text-accent'
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          <span>
                            {late
                              ? `اتأخر ${formatRemainingTime(diff)}`
                              : `باقي ${formatRemainingTime(diff)}`}
                          </span>
                        </span>
                      </>
                    );
                  })()}
                {linkedGoalTitle && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setActiveSection('goals')}
                      className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline dark:text-amber-400"
                    >
                      <Target className="h-3 w-3" />
                      <span className="max-w-[140px] truncate">{linkedGoalTitle}</span>
                    </button>
                  </>
                )}
                {!dueToday && task.status !== 'خلصت' && task.dueDate && reminderOn && task.reminderTime && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <Bell className="h-3 w-3 text-accent" />
                      <span>تنبيه {formatReminderTime(task.reminderTime)}</span>
                    </span>
                  </>
                )}
                {taskTags.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {taskTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setTagFilter((prev) => (prev === tag ? 'الكل' : tag))}
                          className={`font-medium transition-colors hover:underline ${
                            effectiveTagFilter === tag
                              ? 'text-accent underline'
                              : 'text-accent/90 hover:text-accent'
                          }`}
                        >
                          #{tag}
                        </button>
                      ))}
                    </span>
                  </>
                )}
                {task.status === 'خلصت' && preferences.autoArchiveEnabled && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-400 dark:text-slate-500">
                      تُؤرشف تلقائياً بعد{' '}
                      {daysUntilAutoArchive(
                        task,
                        Date.now(),
                        preferences.autoArchiveDays ?? DEFAULT_AUTO_ARCHIVE_DAYS,
                      )}{' '}
                      يوم
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setExpandedSubtasksIds((prev) => ({...prev, [task.id]: !prev[task.id]}))
              }
              title="الخطوات الفرعية"
              aria-label="الخطوات الفرعية"
              className={`inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors ${
                subtasksExpanded || taskSubtasks.length > 0
                  ? 'bg-slate-100 text-accent dark:bg-slate-700/80'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700'
              }`}
            >
              <ListChecks className="h-4 w-4" />
              {taskSubtasks.length > 0 && (
                <span className="font-mono text-[11px] tabular-nums">
                  {doneSubtasksCount}/{taskSubtasks.length}
                </span>
              )}
            </button>
            {task.status !== 'خلصت' && (
              <button
                type="button"
                onClick={() => startFocusForTask({id: task.id, title: task.title})}
                aria-label={`ابدأ جلسة تركيز على ${task.title}`}
                title="ابدأ مؤقت التركيز (بومودورو)"
                className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-500 hover:bg-accent-soft hover:text-accent dark:hover:bg-slate-700"
              >
                <Timer className="h-4 w-4" />
              </button>
            )}
            {task.status === 'خلصت' && (
              <button
                type="button"
                onClick={() => archiveTask(task.id)}
                aria-label={`نقل ${task.title} إلى الأرشيف`}
                title="نقل إلى الأرشيف"
                className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700"
              >
                <Archive className="h-4 w-4" />
              </button>
            )}
            {task.status !== 'خلصت' && task.dueDate && (
              <button
                type="button"
                onClick={() => updateTask(task.id, {reminderEnabled: !reminderOn})}
                aria-label={reminderOn ? 'كتم تنبيه المهمة' : 'تفعيل تنبيه المهمة'}
                title={reminderOn ? 'التنبيه مفعّل — اضغط للكتم' : 'التنبيه مقفول — اضغط للتفعيل'}
                className={`flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg transition-colors ${
                  reminderDueToday
                    ? 'bg-amber-100/80 text-amber-700 hover:bg-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300'
                    : reminderOn
                      ? 'text-accent hover:bg-slate-100 dark:hover:bg-slate-700'
                      : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {reminderOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </button>
            )}
            <select
              value={task.status}
              onChange={(e) => updateTask(task.id, {status: e.target.value as TaskStatus})}
              aria-label="حالة المهمة"
              className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="لسه">لسه</option>
              <option value="شغال عليها">شغال عليها</option>
              <option value="خلصت">خلصت</option>
            </select>
            <button
              type="button"
              onClick={() => startEdit(task)}
              aria-label="تعديل المهمة"
              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => deleteTask(task.id)}
              aria-label="مسح المهمة"
              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Inline Subtasks Drawer */}
        {subtasksExpanded && (
          <div className="mt-3 ms-12 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-900/50">
            {taskSubtasks.length > 0 && (
              <div className="space-y-1.5">
                {taskSubtasks.map((st) => (
                  <div key={st.id} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleInlineSubtask(task, st.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-start"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          st.done
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                        }`}
                      >
                        {st.done && <Check className="h-3 w-3" />}
                      </span>
                      <span
                        className={`truncate text-xs ${
                          st.done
                            ? 'text-slate-400 line-through dark:text-slate-500'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {st.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInlineSubtask(task, st.id)}
                      aria-label={`حذف الخطوة ${st.title}`}
                      className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={inlineSubtaskInputs[task.id] ?? ''}
                onChange={(e) =>
                  setInlineSubtaskInputs((prev) => ({...prev, [task.id]: e.target.value}))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInlineSubtask(task);
                  }
                }}
                placeholder="أضف خطوة فرعية..."
                className="min-h-[34px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => handleAddInlineSubtask(task)}
                className="min-h-[34px] rounded-lg bg-accent px-3 text-xs font-semibold text-white whitespace-nowrap"
              >
                + خطوة
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">مهامي</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            إجمالي {tasks.length} · النهارده {dueTodayCount} · متأخرة {overdueCount}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTasksViewMode('list')}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                tasksViewMode === 'list'
                  ? 'bg-accent text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>القائمة</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('calendar')}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>التقويم</span>
            </button>
          </div>

          {archivedTasks.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveSection('archive')}
              className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Archive className="h-3.5 w-3.5 text-accent" />
              <span>الأرشيف</span>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                ({archivedTasks.length})
              </span>
            </button>
          )}
        </div>
      </div>

      {lastRecurringNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <span className="flex items-center gap-2">
            <Repeat className="h-4 w-4 shrink-0" />
            <span>{lastRecurringNotice}</span>
          </span>
          <button
            type="button"
            onClick={dismissRecurringNotice}
            aria-label="إغلاق الإشعار"
            className="rounded-lg p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {tasksViewMode === 'calendar' ? (
        <CalendarMonthView onSelectTaskToEdit={startEdit} />
      ) : (
        <>

      {/* High-Priority Visual Alert */}
      {openHighPriorityTasks.length > 0 && !priorityAlertDismissed && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200/80 bg-red-50/70 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/25"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-xs font-medium text-red-900 dark:text-red-200 sm:text-sm">
              {openHighPriorityTasks.length === 1
                ? `تنبيه أولوية: عندك مهمة واحدة مهمة «${openHighPriorityTasks[0].title}» محتاجة تركيزك.`
                : `تنبيه أولوية: عندك ${openHighPriorityTasks.length} مهام مهمة لسه مفتوحة ومحتاجة تركيزك الأول.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPriorityFilter((prev) => (prev === 'مهم' ? 'الكل' : 'مهم'))}
              className="min-h-[34px] rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300"
            >
              {priorityFilter === 'مهم' ? 'عرض كل الأولويات' : 'اعرض المهام المهمة'}
            </button>
            <button
              type="button"
              onClick={() => setPriorityAlertDismissed(true)}
              aria-label="إخفاء تنبيه الأولوية"
              className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add Task Form */}
      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (formError) setFormError('');
            }}
            placeholder="عايز تفتكر إيه النهارده؟"
            className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-6"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="تاريخ التنفيذ"
            className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            aria-label="الحالة"
            className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
          >
            <option value="لسه">لسه</option>
            <option value="شغال عليها">شغال عليها</option>
            <option value="خلصت">خلصت</option>
          </select>
        </div>

        <SmartTagSuggestionsBar
          suggestions={smartTagSuggestions}
          onAcceptTag={handleAcceptSmartTag}
          onAcceptAll={handleAcceptAllSmartTags}
          onDismissTag={(tag) =>
            setDismissedCreateTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))
          }
        />

        {/* Visual Priority Selector */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            الأولوية:
          </span>
          {PRIORITY_ORDER.map((level) => {
            const meta = PRIORITY_META[level];
            const Icon = meta.icon;
            const active = priority === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setPriority(level)}
                aria-pressed={active}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                  active
                    ? meta.activeButtonClass
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                <Icon className="h-3.5 w-3.5" />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tags selector */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Tag className="h-3.5 w-3.5 text-accent" />
            <span>التصنيف:</span>
          </span>
          {availableTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleCreateTag(tag)}
                className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-accent bg-accent text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                }`}
              >
                {tag}
              </button>
            );
          })}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomCreateTag();
                }
              }}
              placeholder="تصنيف جديد..."
              className="min-h-[34px] w-28 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleAddCustomCreateTag}
              className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              + ضيف
            </button>
          </div>
        </div>

        {/* Recurrence, Goal Link & Optional Subtasks */}
        <div className="grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-3 dark:border-slate-700 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
              <Repeat className="h-3.5 w-3.5 text-accent" />
              <span>التكرار:</span>
            </span>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
              aria-label="تكرار المهمة"
              className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="none">مرة واحدة</option>
              <option value="daily">يومياً</option>
              <option value="weekly">أسبوعياً</option>
              <option value="monthly">شهرياً</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
              <Target className="h-3.5 w-3.5 text-amber-500" />
              <span>ربط بهدف:</span>
            </span>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              aria-label="ربط المهمة بهدف أو مشروع"
              className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">بدون هدف مرتبط</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title} ({g.kind})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Subtasks Builder (Create) */}
        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
              <ListChecks className="h-3.5 w-3.5 text-accent" />
              <span>خطوات فرعية (اختياري):</span>
            </span>
            <input
              type="text"
              value={draftSubtaskInput}
              onChange={(e) => setDraftSubtaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddDraftSubtask();
                }
              }}
              placeholder="اكتب خطوة واضغط +..."
              className="min-h-[34px] flex-1 min-w-[160px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleAddDraftSubtask}
              className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap"
            >
              + خطوة
            </button>
          </div>
          {draftSubtasks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {draftSubtasks.map((st) => (
                <span
                  key={st.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <span>{st.title}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSubtasks((prev) => prev.filter((item) => item.id !== st.id))
                    }
                    aria-label={`حذف ${st.title}`}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {formError && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{formError}</p>
        )}

        {/* Reminder & Submit row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setReminderEnabled((v) => !v)}
              aria-pressed={reminderEnabled}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                reminderEnabled
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
              }`}
            >
              {reminderEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              <span>{reminderEnabled ? 'تنبيه مفعّل' : 'من غير تنبيه'}</span>
            </button>
            {reminderEnabled && (
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="new-task-reminder-time"
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  الساعة (اختياري):
                </label>
                <input
                  id="new-task-reminder-time"
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>ضيف مهمة</span>
          </button>
        </div>
      </form>

      {/* Filter & Tag Grouping Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-800/90">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['الكل', 'النهارده', 'لسه', 'شغال عليها', 'خلصت', 'اتأجلت'] as const).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setStatusTab(tabKey)}
                className={`min-h-[36px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                  statusTab === tabKey
                    ? 'bg-accent text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {tabKey === 'اتأجلت'
                  ? `اتأجلت (${overdueCount})`
                  : tabKey === 'النهارده'
                    ? `النهارده (${dueTodayCount})`
                    : tabKey}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={toggleSelectionMode}
              aria-pressed={selectionMode}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                selectionMode
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {selectionMode ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              <span>تحديد متعدد</span>
            </button>

            <button
              type="button"
              onClick={() => setGroupByTag((v) => !v)}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                groupByTag
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>تجميع بالتصنيف</span>
            </button>
          </div>
        </div>

        {/* Compact Filter Dropdowns Row (Tag + Priority side-by-side) & Search */}
        <div
          role="region"
          aria-label="فلاتر المهام"
          className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-700"
        >
          <FilterDropdown
            label="التصنيف"
            value={effectiveTagFilter}
            options={tagDropdownOptions}
            onChange={setTagFilter}
            icon={<Tag className="h-3.5 w-3.5 text-accent" />}
            ariaLabel="فلتر بالتصنيف"
          />

          <FilterDropdown
            label="الأولوية"
            value={priorityFilter}
            options={priorityDropdownOptions}
            onChange={(val) => setPriorityFilter(val as 'الكل' | TaskPriority)}
            icon={<Flag className="h-3.5 w-3.5 text-accent" />}
            ariaLabel="فلتر بالأولوية"
          />

          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 start-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="دوّر في مهامك أو تصنيفاتها..."
              className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 ps-8 pe-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex min-h-[38px] items-center gap-1 whitespace-nowrap rounded-xl px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              <span>مسح الفلاتر</span>
            </button>
          )}
        </div>

        {/* Multi-Select Bulk Action Bar */}
        {selectionMode && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                المحدد: {effectiveSelectedIds.length} من {filteredTasks.length}
              </span>
              <button
                type="button"
                onClick={handleToggleSelectAllFiltered}
                className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {filteredTasks.length > 0 &&
                filteredTasks.every((t) => selectedIdSet.has(t.id))
                  ? 'إلغاء تحديد الكل'
                  : 'تحديد الكل'}
              </button>
            </div>

            {effectiveSelectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {availableTags.length > 0 && (
                  <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
                    <select
                      value={bulkTagChoice || availableTags[0]}
                      onChange={(e) => setBulkTagChoice(e.target.value)}
                      aria-label="اختيار تصنيف جماعي"
                      className="min-h-[30px] bg-transparent px-2 text-xs text-slate-700 outline-none dark:text-slate-200"
                    >
                      {availableTags.map((tag) => (
                        <option
                          key={tag}
                          value={tag}
                          className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                        >
                          #{tag}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleBulkApplyTag}
                      className="min-h-[30px] rounded-lg bg-accent px-2.5 text-xs font-semibold text-white whitespace-nowrap"
                    >
                      تصنيف
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleBulkArchive}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span>أرشفة ({effectiveSelectedIds.length})</span>
                </button>

                {confirmBulkDelete ? (
                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1 dark:border-red-900/60 dark:bg-red-950/40">
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      className="min-h-[28px] rounded-lg bg-red-600 px-2.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      تأكيد حذف ({effectiveSelectedIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmBulkDelete(false)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(true)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>حذف ({effectiveSelectedIds.length})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk / Quick Swipe Feedback Toast */}
      {(swipeNotice || bulkFeedback) && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent/30 bg-accent-soft/70 px-4 py-2.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100"
        >
          <span>{swipeNotice ? swipeNotice.message : bulkFeedback}</span>
          <div className="flex items-center gap-2">
            {swipeNotice && (
              <button
                type="button"
                onClick={swipeNotice.undo}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-accent shadow-xs hover:bg-slate-50 dark:bg-slate-900"
              >
                <RotateCcw className="h-3 w-3" />
                <span>تراجع</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSwipeNotice(null);
                setBulkFeedback(null);
              }}
              aria-label="إغلاق الإشعار"
              className="rounded-lg p-1 text-slate-500 hover:bg-white/70 dark:hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Tasks List or Grouped by Tag */}
      {filteredTasks.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-400">
          <p>
            {tasks.length === 0
              ? 'مفيش مهام لسه. ضيف أول مهمة فوق عشان تبدأ.'
              : 'مفيش مهام مطابقة للفلتر ده دلوقتي.'}
          </p>
          {tasks.length > 0 && hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              عرض كل المهام
            </button>
          )}
        </div>
      ) : groupByTag ? (
        <div className="space-y-4">
          {groupedByTagSections.map((group) => (
            <section key={group.key}>
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-accent" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {group.label}
                  </h2>
                </div>
                <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {group.items.length}
                </span>
              </div>
              <div className="mt-2 space-y-3">{group.items.map(renderTaskRow)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">{filteredTasks.map(renderTaskRow)}</div>
      )}
        </>
      )}

      {/* Task Details Page */}
      {detailTaskId &&
        (() => {
          const task = tasks.find((t) => t.id === detailTaskId);
          if (!task) return null;
          const priorityInfo = PRIORITY_META[task.priority] ?? PRIORITY_META['متوسط'];
          const PriorityIcon = priorityInfo.icon;
          const deadline = getTaskDeadlineMs(task);
          const diff = deadline === null ? null : deadline - nowTick;
          const taskSubtasks = task.subtasks ?? [];
          const doneCount = taskSubtasks.filter((st) => st.done).length;
          const linkedGoalTitle = task.goalId ? goalsById.get(task.goalId) : undefined;
          const fmtTs = (ts?: number | null) =>
            ts
              ? new Intl.DateTimeFormat('ar-EG', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(ts))
              : null;
          const close = () => setDetailTaskId(null);
          return (
            <div
              className="fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-950"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  تفاصيل المهمة
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="رجوع"
                  className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-32">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <h1
                      className={`text-xl font-extrabold leading-relaxed ${
                        task.status === 'خلصت'
                          ? 'text-slate-400 line-through dark:text-slate-500'
                          : 'text-slate-900 dark:text-slate-50'
                      }`}
                    >
                      {task.title}
                    </h1>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${priorityInfo.activeButtonClass}`}
                    >
                      <PriorityIcon className="h-3.5 w-3.5" />
                      <span>{priorityInfo.label}</span>
                    </span>
                  </div>

                  {task.status !== 'خلصت' && diff !== null && (
                    <div
                      className={`mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ${
                        diff < 0
                          ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          : diff < 24 * 3_600_000
                            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-accent-soft text-accent'
                      }`}
                    >
                      <Clock className="h-5 w-5 shrink-0" />
                      <span>
                        {diff < 0
                          ? `اتأخر ${formatRemainingTime(diff)}`
                          : `باقي ${formatRemainingTime(diff)}`}
                      </span>
                    </div>
                  )}

                  <dl className="mt-4 space-y-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <ListChecks className="h-4 w-4" />
                        الحالة
                      </dt>
                      <dd>
                        <select
                          value={task.status}
                          onChange={(e) =>
                            updateTask(task.id, {status: e.target.value as TaskStatus})
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <option value="لسه">لسه</option>
                          <option value="شغال عليها">شغال عليها</option>
                          <option value="خلصت">خلصت</option>
                        </select>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <CalendarDays className="h-4 w-4" />
                        الميعاد
                      </dt>
                      <dd className="font-semibold text-slate-800 dark:text-slate-100">
                        {formatFriendlyDate(task.dueDate)}
                      </dd>
                    </div>
                    {task.reminderEnabled && task.reminderTime && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Bell className="h-4 w-4" />
                          التنبيه
                        </dt>
                        <dd className="font-semibold text-slate-800 dark:text-slate-100">
                          {formatReminderTime(task.reminderTime)}
                        </dd>
                      </div>
                    )}
                    {task.recurrence && task.recurrence !== 'none' && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Repeat className="h-4 w-4" />
                          التكرار
                        </dt>
                        <dd className="font-semibold text-slate-800 dark:text-slate-100">
                          {RECURRENCE_LABELS[task.recurrence]}
                        </dd>
                      </div>
                    )}
                    {linkedGoalTitle && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Target className="h-4 w-4" />
                          الهدف
                        </dt>
                        <dd>
                          <button
                            type="button"
                            onClick={() => {
                              close();
                              setActiveSection('goals');
                            }}
                            className="font-semibold text-amber-700 hover:underline dark:text-amber-400"
                          >
                            {linkedGoalTitle}
                          </button>
                        </dd>
                      </div>
                    )}
                    {(task.tags ?? []).length > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Tag className="h-4 w-4" />
                          الوسوم
                        </dt>
                        <dd className="flex flex-wrap justify-end gap-1.5">
                          {(task.tags ?? []).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent"
                            >
                              #{tag}
                            </span>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {taskSubtasks.length > 0 && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        خطوات المهمة
                      </h3>
                      <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {doneCount}/{taskSubtasks.length}
                      </span>
                    </div>
                    <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{
                          width: `${Math.round((doneCount / Math.max(taskSubtasks.length, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <ul className="space-y-2">
                      {taskSubtasks.map((st) => (
                        <li key={st.id}>
                          <button
                            type="button"
                            onClick={() => handleToggleInlineSubtask(task, st.id)}
                            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start hover:bg-slate-50 dark:hover:bg-slate-800/70"
                          >
                            {st.done ? (
                              <CheckSquare className="h-4.5 w-4.5 shrink-0 text-accent" />
                            ) : (
                              <Square className="h-4.5 w-4.5 shrink-0 text-slate-300 dark:text-slate-600" />
                            )}
                            <span
                              className={`text-sm ${
                                st.done
                                  ? 'text-slate-400 line-through dark:text-slate-500'
                                  : 'text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              {st.title}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-xs text-slate-400 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
                  <p>اتعملت: {fmtTs(task.createdAt) ?? '—'}</p>
                  {task.updatedAt !== task.createdAt && (
                    <p className="mt-1">آخر تعديل: {fmtTs(task.updatedAt)}</p>
                  )}
                  {task.completedAt && <p className="mt-1">خلصت: {fmtTs(task.completedAt)}</p>}
                </div>
              </div>

              <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/80 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                <div className="mx-auto flex max-w-lg items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateTask(task.id, {status: task.status === 'خلصت' ? 'لسه' : 'خلصت'})
                    }
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-2xl text-sm font-bold text-white ${
                      task.status === 'خلصت'
                        ? 'bg-slate-500 hover:bg-slate-600'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {task.status === 'خلصت' ? 'رجّعها' : 'خلصتها'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      startEdit(task);
                    }}
                    aria-label="تعديل"
                    className="inline-flex min-h-[44px] min-w-[48px] items-center justify-center rounded-2xl bg-accent-soft text-accent hover:brightness-95"
                  >
                    <Pencil className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      startFocusForTask({id: task.id, title: task.title});
                    }}
                    aria-label="بدء تركيز"
                    className="inline-flex min-h-[44px] min-w-[48px] items-center justify-center rounded-2xl bg-accent-soft text-accent hover:brightness-95"
                  >
                    <Timer className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      archiveTask(task.id);
                      close();
                    }}
                    aria-label="أرشفة"
                    className="inline-flex min-h-[44px] min-w-[48px] items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Archive className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteTask(task.id);
                      close();
                    }}
                    aria-label="مسح"
                    className="inline-flex min-h-[44px] min-w-[48px] items-center justify-center rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                  >
                    <Trash2 className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Edit Task Modal */}
      {editingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setEditingTask(null)}
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">تعديل المهمة</h2>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                aria-label="إغلاق"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  اسم المهمة
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <SmartTagSuggestionsBar
                suggestions={editSmartTagSuggestions}
                onAcceptTag={handleAcceptEditSmartTag}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    تاريخ التنفيذ
                  </label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    التنبيه
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditReminderEnabled((v) => !v)}
                      className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                        editReminderEnabled
                          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {editReminderEnabled ? (
                        <Bell className="h-3.5 w-3.5" />
                      ) : (
                        <BellOff className="h-3.5 w-3.5" />
                      )}
                      <span>{editReminderEnabled ? 'مفعّل' : 'مقفول'}</span>
                    </button>
                    {editReminderEnabled && (
                      <input
                        type="time"
                        value={editReminderTime}
                        onChange={(e) => setEditReminderTime(e.target.value)}
                        aria-label="وقت التنبيه"
                        className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    الأولوية
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRIORITY_ORDER.map((level) => {
                      const meta = PRIORITY_META[level];
                      const Icon = meta.icon;
                      const active = editPriority === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setEditPriority(level)}
                          aria-pressed={active}
                          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition-colors ${
                            active
                              ? meta.activeButtonClass
                              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                          <Icon className="h-3.5 w-3.5" />
                          <span>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    الحالة
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="لسه">لسه</option>
                    <option value="شغال عليها">شغال عليها</option>
                    <option value="خلصت">خلصت</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  التصنيفات
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {Array.from(new Set([...availableTags, ...editTags])).map((tag) => {
                    const active = editTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleEditTag(tag)}
                        className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-accent bg-accent text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={editCustomTag}
                    onChange={(e) => setEditCustomTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomEditTag();
                      }
                    }}
                    placeholder="أضف تصنيف جديد..."
                    className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomEditTag}
                    className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    + ضيف
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    التكرار
                  </label>
                  <select
                    value={editRecurrence}
                    onChange={(e) => setEditRecurrence(e.target.value as TaskRecurrence)}
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="none">مرة واحدة</option>
                    <option value="daily">يومياً</option>
                    <option value="weekly">أسبوعياً</option>
                    <option value="monthly">شهرياً</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    ربط بهدف / مشروع
                  </label>
                  <select
                    value={editGoalId}
                    onChange={(e) => setEditGoalId(e.target.value)}
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">بدون هدف مرتبط</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title} ({g.kind})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  الخطوات الفرعية ({editSubtasks.length})
                </label>
                {editSubtasks.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    {editSubtasks.map((st) => (
                      <div key={st.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                        <button
                          type="button"
                          onClick={() =>
                            setEditSubtasks((prev) =>
                              prev.map((item) =>
                                item.id === st.id ? {...item, done: !item.done} : item,
                              ),
                            )
                          }
                          className="flex min-w-0 flex-1 items-center gap-2 text-start text-xs"
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              st.done
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                            }`}
                          >
                            {st.done && <Check className="h-3 w-3" />}
                          </span>
                          <span
                            className={`truncate ${
                              st.done ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {st.title}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditSubtasks((prev) => prev.filter((item) => item.id !== st.id))
                          }
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editSubtaskInput}
                    onChange={(e) => setEditSubtaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = editSubtaskInput.trim();
                        if (!clean) return;
                        setEditSubtasks((prev) => [
                          ...prev,
                          {id: createSimpleId(), title: clean, done: false},
                        ]);
                        setEditSubtaskInput('');
                      }
                    }}
                    placeholder="أضف خطوة فرعية..."
                    className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = editSubtaskInput.trim();
                      if (!clean) return;
                      setEditSubtasks((prev) => [
                        ...prev,
                        {id: createSimpleId(), title: clean, done: false},
                      ]);
                      setEditSubtaskInput('');
                    }}
                    className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    + خطوة
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-xl bg-accent px-5 text-xs font-semibold text-white"
              >
                حفظ التعديل
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
