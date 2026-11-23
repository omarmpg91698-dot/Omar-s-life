import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Archive,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  CircleDot,
  Flag,
  Layers,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {SmartTagSuggestionsBar} from '../components/SmartTagSuggestionsBar';
import {useLife} from '../context/LifeContext';
import {
  formatFriendlyDate,
  formatReminderTime,
  getTodayIso,
  isTaskDueToday,
  isTaskOverdue,
  isTaskReminderDueToday,
} from '../storage/localStore';
import {
  suggestSmartTaskTags,
  type SmartTagSuggestion,
} from '../storage/smartTagSuggestions';
import {DEFAULT_AUTO_ARCHIVE_DAYS, daysUntilAutoArchive} from '../storage/taskArchive';
import type {TaskItem, TaskPriority, TaskStatus} from '../types';

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

export const TasksView: React.FC = () => {
  const {
    tasks,
    archivedTasks,
    preferences,
    addTask,
    updateTask,
    archiveTask,
    deleteTask,
    addTaskTag,
    setActiveSection,
    focusedItem,
    clearFocusedItem,
  } = useLife();
  const todayIso = getTodayIso();
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

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
  const [formError, setFormError] = useState('');

  // Filters & grouping
  const [statusTab, setStatusTab] = useState<TaskFilterTab>('الكل');
  const [tagFilter, setTagFilter] = useState<string>('الكل');
  const [priorityFilter, setPriorityFilter] = useState<'الكل' | TaskPriority>('الكل');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByTag, setGroupByTag] = useState(false);
  const [priorityAlertDismissed, setPriorityAlertDismissed] = useState(false);

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
    setFormError('');
    addTask({
      title: title.trim(),
      dueDate: dueDate || null,
      priority,
      status,
      tags: tagsToSave,
      reminderEnabled,
      reminderTime: reminderEnabled && reminderTime ? reminderTime : null,
    });
    setTitle('');
    setDueDate(todayIso);
    setStatus('لسه');
    setSelectedTags([]);
    setDismissedCreateTags([]);
    setCustomTagInput('');
    setReminderEnabled(true);
    setReminderTime('');
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
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;
    updateTask(editingTask.id, {
      title: editTitle.trim(),
      dueDate: editDueDate || null,
      priority: editPriority,
      status: editStatus,
      tags: editTags,
      reminderEnabled: editReminderEnabled,
      reminderTime: editReminderEnabled && editReminderTime ? editReminderTime : null,
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
    return tasksMatchingNonTagFilters.filter((t) => {
      if (effectiveTagFilter === 'الكل') return true;
      if (effectiveTagFilter === 'من غير تصنيف') return (t.tags ?? []).length === 0;
      return (t.tags ?? []).includes(effectiveTagFilter);
    });
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
    const priorityInfo = PRIORITY_META[task.priority] ?? PRIORITY_META['متوسط'];
    const PriorityIcon = priorityInfo.icon;
    const isHighOpen = task.priority === 'مهم' && task.status !== 'خلصت';
    return (
      <div
        key={task.id}
        id={`life-item-${task.id}`}
        className={`flex flex-wrap items-center justify-between gap-3 p-4 transition-colors ${
          highlightedTaskId === task.id
            ? 'bg-accent-soft/60 ring-2 ring-inset ring-accent'
            : dueToday
              ? 'bg-amber-50/45 dark:bg-amber-950/15'
              : isHighOpen
                ? 'bg-red-50/30 dark:bg-red-950/10'
                : ''
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
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
              {/* Colored priority dot + icon right beside task title */}
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

              <p
                className={`text-sm font-medium ${
                  task.status === 'خلصت'
                    ? 'text-slate-400 line-through dark:text-slate-500'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {task.title}
              </p>
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
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white"
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

          <button
            type="button"
            onClick={() => setGroupByTag((v) => !v)}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
              groupByTag
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>تجميع بالتصنيف</span>
          </button>
        </div>

        {/* Tag Filter Bar */}
        <div
          role="region"
          aria-label="شريط تصفية المهام بالتصنيف"
          className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-700"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <Tag className="h-3.5 w-3.5 text-accent" />
            <span>فلتر بالتصنيف:</span>
          </span>

          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTagFilter('الكل')}
              aria-pressed={effectiveTagFilter === 'الكل'}
              className={`inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors ${
                effectiveTagFilter === 'الكل'
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <span>الكل</span>
              <span className="font-mono text-[11px] opacity-80 tabular-nums">
                ({tasksMatchingNonTagFilters.length})
              </span>
            </button>

            {availableTags.map((tag) => {
              const count = tagCounts.counts.get(tag) ?? 0;
              const isActive = effectiveTagFilter === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter((prev) => (prev === tag ? 'الكل' : tag))}
                  aria-pressed={isActive}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-accent bg-accent text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  <span>{tag}</span>
                  <span className="font-mono text-[11px] opacity-80 tabular-nums">
                    ({count})
                  </span>
                </button>
              );
            })}

            {(tagCounts.untagged > 0 || effectiveTagFilter === 'من غير تصنيف') && (
              <button
                type="button"
                onClick={() =>
                  setTagFilter((prev) => (prev === 'من غير تصنيف' ? 'الكل' : 'من غير تصنيف'))
                }
                aria-pressed={effectiveTagFilter === 'من غير تصنيف'}
                className={`inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors ${
                  effectiveTagFilter === 'من غير تصنيف'
                    ? 'border-accent bg-accent text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                <span>من غير تصنيف</span>
                <span className="font-mono text-[11px] opacity-80 tabular-nums">
                  ({tagCounts.untagged})
                </span>
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex min-h-[34px] items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              <span>مسح الفلاتر</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-700">
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

          <div
            role="group"
            aria-label="تصفية بالأولوية"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => setPriorityFilter('الكل')}
              aria-pressed={priorityFilter === 'الكل'}
              className={`min-h-[36px] whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                priorityFilter === 'الكل'
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              كل الأولويات
            </button>
            {PRIORITY_ORDER.map((level) => {
              const meta = PRIORITY_META[level];
              const Icon = meta.icon;
              const isActive = priorityFilter === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPriorityFilter((prev) => (prev === level ? 'الكل' : level))}
                  aria-pressed={isActive}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                    isActive
                      ? meta.activeButtonClass
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                  <Icon className="h-3.5 w-3.5" />
                  <span>{meta.label}</span>
                  <span className="font-mono text-[11px] opacity-75 tabular-nums">
                    ({priorityCounts[level]})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
            <section
              key={group.key}
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-800/90"
            >
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
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {group.items.map(renderTaskRow)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white dark:divide-slate-700 dark:border-slate-800 dark:bg-slate-800/90">
          {filteredTasks.map(renderTaskRow)}
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setEditingTask(null)}
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
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
