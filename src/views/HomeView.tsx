import React, {useMemo, useState} from 'react';
import {
  ArrowUpLeft,
  Bell,
  BellOff,
  BellRing,
  Bot,
  Calendar,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  CloudUpload,
  FileText,
  Plus,
  Target,
  Timer,
  TrendingUp,
  X,
} from 'lucide-react';
import {DayPlannerTimeline} from '../components/DayPlannerTimeline';
import {FocusTimerWidget} from '../components/FocusTimerWidget';
import {GlobalSearchBar} from '../components/GlobalSearchBar';
import {HabitTrackerCard} from '../components/HabitTrackerCard';
import {SmartTagSuggestionsBar} from '../components/SmartTagSuggestionsBar';
import {TagsDistributionChart} from '../components/TagsDistributionChart';
import {WeatherWidget} from '../components/WeatherWidget';
import {WeeklyTasksDashboard} from '../components/WeeklyTasksDashboard';
import {useDriveSync} from '../context/DriveSyncContext';
import {useLife} from '../context/LifeContext';
import {evaluateWeeklyDriveBackupReminder} from '../storage/documentsAndReminders';
import {computeWeeklyTaskStats} from '../storage/weeklyAnalytics';
import {resolveGoalPalette} from '../storage/goalTheme';
import {computeGoalLinkedProgress} from '../storage/productivityUtils';
import {
  formatFriendlyDate,
  formatReminderTime,
  getTodayIso,
  isTaskDueToday,
  isTaskOverdue,
  isTaskUpcoming,
} from '../storage/localStore';
import {
  suggestSmartTaskTags,
  type SmartTagSuggestion,
} from '../storage/smartTagSuggestions';
import type {
  GoalKind,
  NavSection,
  NoteCategory,
  TaskItem,
  TaskPriority,
} from '../types';

type QuickActionKind = 'task' | 'note' | 'goal' | null;

const NOTE_CATEGORIES: NoteCategory[] = ['شخصي', 'شغل', 'أفكار', 'حاجات مهمة'];

const DRIVE_REMINDER_SNOOZE_KEY = 'omars_life_drive_reminder_snooze_until';

export const HomeView: React.FC = () => {
  const {
    store,
    tasks,
    allTasks,
    goals,
    preferences,
    addTask,
    addNote,
    addGoal,
    addTaskTag,
    updateTask,
    setActiveSection,
    setTasksViewMode,
    startFocusForTask,
  } = useLife();
  const {needsAuth, lastSyncedAt, busyAction, requestSmartSync} = useDriveSync();
  const [driveReminderSnoozedUntil, setDriveReminderSnoozedUntil] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(DRIVE_REMINDER_SNOOZE_KEY);
      const parsed = saved ? Number(saved) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [quickAction, setQuickAction] = useState<QuickActionKind>(null);
  const [quickFeedback, setQuickFeedback] = useState<{
    message: string;
    section: NavSection;
    actionLabel: string;
  } | null>(null);

  // Quick Task state
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDue, setQuickDue] = useState(getTodayIso());
  const [quickPriority, setQuickPriority] = useState<TaskPriority>(preferences.defaultPriority);
  const [quickTags, setQuickTags] = useState<string[]>([]);
  const [quickDismissedTags, setQuickDismissedTags] = useState<string[]>([]);
  const [quickCustomTag, setQuickCustomTag] = useState('');
  const [quickReminderEnabled, setQuickReminderEnabled] = useState(true);
  const [quickTaskError, setQuickTaskError] = useState('');

  const quickSmartSuggestions = useMemo(
    () =>
      suggestSmartTaskTags({
        title: quickTitle,
        availableTags: preferences.taskTags,
        selectedTags: quickTags,
        dismissedTags: quickDismissedTags,
        existingTasks: tasks,
      }),
    [quickTitle, preferences.taskTags, quickTags, quickDismissedTags, tasks],
  );

  const handleAcceptQuickSmartTag = (suggestion: SmartTagSuggestion) => {
    if (suggestion.isNewTag) {
      addTaskTag(suggestion.tag);
    }
    setQuickTags((prev) =>
      prev.includes(suggestion.tag) ? prev : [...prev, suggestion.tag],
    );
  };

  const handleAcceptAllQuickSmartTags = () => {
    for (const suggestion of quickSmartSuggestions) {
      if (suggestion.isNewTag) {
        addTaskTag(suggestion.tag);
      }
    }
    setQuickTags((prev) =>
      Array.from(new Set([...prev, ...quickSmartSuggestions.map((s) => s.tag)])),
    );
  };

  // Quick Note state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState<NoteCategory>('شخصي');
  const [noteContent, setNoteContent] = useState('');
  const [quickNoteError, setQuickNoteError] = useState('');

  // Quick Goal state
  const [goalKind, setGoalKind] = useState<GoalKind>('هدف');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [quickGoalError, setQuickGoalError] = useState('');

  const todayIso = getTodayIso();
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t, todayIso));
  const todayTasks = tasks.filter((t) => isTaskDueToday(t, todayIso));
  const dueTodayOrOverdue = [...overdueTasks, ...todayTasks];
  const upcomingTasks = tasks.filter((t) => isTaskUpcoming(t, todayIso));
  const completedTasks = tasks.filter((t) => t.status === 'خلصت');

  const weeklySummary = useMemo(
    () => computeWeeklyTaskStats(allTasks, todayIso, 'current_week'),
    [allTasks, todayIso],
  );

  const driveBackupReminder = useMemo(
    () =>
      evaluateWeeklyDriveBackupReminder({
        lastSyncedAt,
        store,
        snoozedUntil: driveReminderSnoozedUntil,
      }),
    [lastSyncedAt, store, driveReminderSnoozedUntil],
  );

  const snoozeDriveBackupReminder = () => {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    setDriveReminderSnoozedUntil(until);
    try {
      localStorage.setItem(DRIVE_REMINDER_SNOOZE_KEY, String(until));
    } catch {
      // Ignore storage errors
    }
  };

  const hour = new Date().getHours();
  const greetingText =
    hour < 12
      ? `صباح الخير يا ${preferences.userName}`
      : hour < 17
        ? `أهلاً بيك يا ${preferences.userName}`
        : `مساء الخير يا ${preferences.userName}`;

  const formattedToday = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const toggleQuickAction = (target: Exclude<QuickActionKind, null>) => {
    setQuickFeedback(null);
    setQuickTaskError('');
    setQuickNoteError('');
    setQuickGoalError('');
    setQuickAction((prev) => (prev === target ? null : target));
  };

  const handleAddQuickCustomTag = () => {
    const clean = quickCustomTag.trim().replace(/^#/, '');
    if (!clean) return;
    const existing = preferences.taskTags.find((t) => t.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (!quickTags.includes(existing)) {
        setQuickTags((prev) => [...prev, existing]);
      }
      setQuickCustomTag('');
      setQuickTaskError('');
      return;
    }
    const res = addTaskTag(clean);
    if (!res.ok) {
      setQuickTaskError(res.error ?? 'اسم التصنيف مش مظبوط.');
      return;
    }
    const tagToUse = res.tag ?? clean;
    if (!quickTags.includes(tagToUse)) {
      setQuickTags((prev) => [...prev, tagToUse]);
    }
    setQuickCustomTag('');
    setQuickTaskError('');
  };

  const handleQuickAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) {
      setQuickTaskError('اكتب اسم المهمة الأول عشان نقدر نحفظها.');
      return;
    }
    let tagsToSave = [...quickTags];
    const pendingTag = quickCustomTag.trim().replace(/^#/, '');
    if (pendingTag) {
      const existing = preferences.taskTags.find(
        (t) => t.toLowerCase() === pendingTag.toLowerCase(),
      );
      if (existing) {
        if (!tagsToSave.includes(existing)) tagsToSave.push(existing);
      } else {
        const res = addTaskTag(pendingTag);
        if (!res.ok) {
          setQuickTaskError(res.error ?? 'اسم التصنيف مش مظبوط.');
          return;
        }
        const tagToUse = res.tag ?? pendingTag;
        if (!tagsToSave.includes(tagToUse)) tagsToSave.push(tagToUse);
      }
    }
    setQuickTaskError('');
    addTask({
      title: quickTitle.trim(),
      dueDate: quickDue || null,
      priority: quickPriority,
      status: 'لسه',
      tags: tagsToSave,
      reminderEnabled: quickReminderEnabled,
    });
    setQuickTitle('');
    setQuickDue(todayIso);
    setQuickTags([]);
    setQuickDismissedTags([]);
    setQuickCustomTag('');
    setQuickReminderEnabled(true);
    setQuickAction(null);
    setQuickFeedback({
      message: 'تمت إضافة المهمة الجديدة بنجاح.',
      section: 'tasks',
      actionLabel: 'افتح مهامي',
    });
  };

  const handleQuickAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() && !noteContent.trim()) {
      setQuickNoteError('اكتب عنوان أو نص الملاحظة الأول.');
      return;
    }
    setQuickNoteError('');
    const resolvedTitle = noteTitle.trim() || noteContent.trim().slice(0, 40);
    addNote({
      title: resolvedTitle,
      content: noteContent.trim(),
      category: noteCategory,
    });
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('شخصي');
    setQuickAction(null);
    setQuickFeedback({
      message: 'تم حفظ الملاحظة الجديدة في ملاحظاتي.',
      section: 'notes',
      actionLabel: 'افتح ملاحظاتي',
    });
  };

  const handleQuickAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) {
      setQuickGoalError('اكتب اسم الهدف أو المشروع الأول.');
      return;
    }
    setQuickGoalError('');
    addGoal({
      kind: goalKind,
      title: goalTitle.trim(),
      description: goalDescription.trim(),
      targetDate: goalTargetDate || null,
      progress: 0,
    });
    setGoalTitle('');
    setGoalDescription('');
    setGoalTargetDate('');
    setGoalKind('هدف');
    setQuickAction(null);
    setQuickFeedback({
      message: `تم تسجيل ال${goalKind} الجديد بنجاح.`,
      section: 'goals',
      actionLabel: 'افتح أهدافي ومشاريعي',
    });
  };

  const toggleDone = (task: TaskItem) => {
    updateTask(task.id, {status: task.status === 'خلصت' ? 'لسه' : 'خلصت'});
  };

  const handleQuickCreateFromSearch = (kind: 'task' | 'note', rawText: string) => {
    setQuickFeedback(null);
    setQuickTaskError('');
    setQuickNoteError('');
    setQuickGoalError('');
    if (kind === 'task') {
      setQuickTitle(rawText);
      setQuickAction('task');
    } else {
      setNoteTitle(rawText);
      setQuickAction('note');
    }
  };

  return (
    <div className="space-y-6">
      {/* Global Instant Search Bar */}
      <GlobalSearchBar onQuickCreateFromQuery={handleQuickCreateFromSearch} />

      {/* Top Operational Row: Welcome & Quick Shortcuts + Live Weather Widget */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90 sm:p-6 lg:col-span-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Calendar className="h-3.5 w-3.5 text-accent" />
              <span>{formattedToday}</span>
            </p>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {greetingText}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {dueTodayOrOverdue.length === 0
                ? 'يومك فاضي وهادي لحد دلوقتي. عايز تفتكر إيه النهارده؟'
                : `عندك ${dueTodayOrOverdue.length} مهام محتاجة تركيزك النهارده.`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveSection('assistant')}
            className="inline-flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-colors"
          >
            <Bot className="h-4 w-4 shrink-0" />
            <span>اسأل مساعدك الشخصي</span>
          </button>
        </div>

        {/* Quick Shortcuts Strip */}
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
          <p className="mb-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            اختصارات سريعة
          </p>
          <div
            role="group"
            aria-label="اختصارات سريعة للإضافة الفورية"
            className="grid grid-cols-1 gap-2.5 md:grid-cols-3"
          >
            <button
              type="button"
              onClick={() => toggleQuickAction('task')}
              aria-expanded={quickAction === 'task'}
              className={`flex min-h-[46px] items-center justify-between gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                quickAction === 'task'
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-accent'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <CheckSquare
                  className={`h-4 w-4 shrink-0 ${quickAction === 'task' ? 'text-white' : 'text-accent'}`}
                />
                <span className="truncate">إضافة مهمة جديدة</span>
              </span>
              <Plus className="h-4 w-4 shrink-0 opacity-75" />
            </button>

            <button
              type="button"
              onClick={() => toggleQuickAction('note')}
              aria-expanded={quickAction === 'note'}
              className={`flex min-h-[46px] items-center justify-between gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                quickAction === 'note'
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-accent'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText
                  className={`h-4 w-4 shrink-0 ${quickAction === 'note' ? 'text-white' : 'text-accent'}`}
                />
                <span className="truncate">إضافة ملاحظة جديدة</span>
              </span>
              <Plus className="h-4 w-4 shrink-0 opacity-75" />
            </button>

            <button
              type="button"
              onClick={() => toggleQuickAction('goal')}
              aria-expanded={quickAction === 'goal'}
              className={`flex min-h-[46px] items-center justify-between gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                quickAction === 'goal'
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-accent'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Target
                  className={`h-4 w-4 shrink-0 ${quickAction === 'goal' ? 'text-white' : 'text-accent'}`}
                />
                <span className="truncate">تسجيل هدف</span>
              </span>
              <Plus className="h-4 w-4 shrink-0 opacity-75" />
            </button>
          </div>
        </div>

        {/* Instant Confirmation Banner */}
        {quickFeedback && !quickAction && (
          <div
            role="status"
            className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-700"
          >
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {quickFeedback.message}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSection(quickFeedback.section)}
                className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
              >
                <span>{quickFeedback.actionLabel}</span>
                <ArrowUpLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setQuickFeedback(null)}
                aria-label="إخفاء الإشعار"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Quick Task Inline Form */}
        {quickAction === 'task' && (
          <form
            onSubmit={handleQuickAddTask}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuickAction(null);
            }}
            className="mt-4 grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-700 sm:grid-cols-12"
          >
            <input
              type="text"
              autoFocus
              value={quickTitle}
              onChange={(e) => {
                setQuickTitle(e.target.value);
                if (quickTaskError) setQuickTaskError('');
              }}
              placeholder="عايز تفتكر إيه النهارده؟"
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-6"
            />
            <input
              type="date"
              value={quickDue}
              onChange={(e) => setQuickDue(e.target.value)}
              aria-label="تاريخ التنفيذ"
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
            />
            <select
              value={quickPriority}
              onChange={(e) => setQuickPriority(e.target.value as TaskPriority)}
              aria-label="الأولوية"
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
            >
              <option value="مهم">مهم</option>
              <option value="متوسط">متوسط</option>
              <option value="عادي">عادي</option>
            </select>

            {quickSmartSuggestions.length > 0 && (
              <div className="sm:col-span-12">
                <SmartTagSuggestionsBar
                  suggestions={quickSmartSuggestions}
                  onAcceptTag={handleAcceptQuickSmartTag}
                  onAcceptAll={handleAcceptAllQuickSmartTags}
                  onDismissTag={(tag) =>
                    setQuickDismissedTags((prev) =>
                      prev.includes(tag) ? prev : [...prev, tag],
                    )
                  }
                />
              </div>
            )}

            {quickTaskError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400 sm:col-span-12">
                {quickTaskError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-12">
              <div className="flex flex-wrap items-center gap-1.5">
                {preferences.taskTags.map((tag) => {
                  const active = quickTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setQuickTags((prev) =>
                          prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
                        )
                      }
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
                    value={quickCustomTag}
                    onChange={(e) => setQuickCustomTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddQuickCustomTag();
                      }
                    }}
                    placeholder="تصنيف جديد..."
                    className="min-h-[34px] w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddQuickCustomTag}
                    className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    + ضيف
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickReminderEnabled((v) => !v)}
                  className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                    quickReminderEnabled
                      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  {quickReminderEnabled ? (
                    <Bell className="h-3.5 w-3.5" />
                  ) : (
                    <BellOff className="h-3.5 w-3.5" />
                  )}
                  <span>{quickReminderEnabled ? 'تنبيه' : 'بدون تنبيه'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSection('tasks')}
                  className="inline-flex min-h-[40px] items-center gap-1 px-2 text-xs font-medium text-accent hover:underline"
                >
                  <span>صفحة مهامي</span>
                  <ArrowUpLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setQuickAction(null)}
                  className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] rounded-xl bg-accent px-5 text-xs font-semibold text-white"
                >
                  حفظ المهمة
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Quick Note Inline Form */}
        {quickAction === 'note' && (
          <form
            onSubmit={handleQuickAddNote}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuickAction(null);
            }}
            className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-700"
          >
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <input
                type="text"
                autoFocus
                value={noteTitle}
                onChange={(e) => {
                  setNoteTitle(e.target.value);
                  if (quickNoteError) setQuickNoteError('');
                }}
                placeholder="عنوان الملاحظة"
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <select
                value={noteCategory}
                onChange={(e) => setNoteCategory(e.target.value as NoteCategory)}
                aria-label="تصنيف الملاحظة"
                className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {NOTE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              rows={2}
              value={noteContent}
              onChange={(e) => {
                setNoteContent(e.target.value);
                if (quickNoteError) setQuickNoteError('');
              }}
              placeholder="اكتب الفكرة أو التفاصيل بسرعة..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />

            {quickNoteError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                {quickNoteError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActiveSection('notes')}
                className="inline-flex min-h-[40px] items-center gap-1 px-1 text-xs font-medium text-accent hover:underline"
              >
                <span>فتح ملاحظاتي لإرفاق صور</span>
                <ArrowUpLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickAction(null)}
                  className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] rounded-xl bg-accent px-5 text-xs font-semibold text-white"
                >
                  حفظ الملاحظة
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Quick Goal Inline Form */}
        {quickAction === 'goal' && (
          <form
            onSubmit={handleQuickAddGoal}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuickAction(null);
            }}
            className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-700"
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
              <select
                value={goalKind}
                onChange={(e) => setGoalKind(e.target.value as GoalKind)}
                aria-label="النوع"
                className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
              >
                <option value="هدف">هدف</option>
                <option value="مشروع">مشروع</option>
              </select>
              <input
                type="text"
                autoFocus
                value={goalTitle}
                onChange={(e) => {
                  setGoalTitle(e.target.value);
                  if (quickGoalError) setQuickGoalError('');
                }}
                placeholder="عايز تحقق إيه أو تبدأ مشروع إيه؟"
                className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-7"
              />
              <input
                type="date"
                value={goalTargetDate}
                onChange={(e) => setGoalTargetDate(e.target.value)}
                aria-label="التاريخ المستهدف"
                className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
              />
            </div>

            <input
              type="text"
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
              placeholder="وصف بسيط للهدف (اختياري)"
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />

            {quickGoalError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                {quickGoalError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActiveSection('goals')}
                className="inline-flex min-h-[40px] items-center gap-1 px-1 text-xs font-medium text-accent hover:underline"
              >
                <span>فتح أهدافي ومشاريعي</span>
                <ArrowUpLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickAction(null)}
                  className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] rounded-xl bg-accent px-5 text-xs font-semibold text-white"
                >
                  تسجيل الهدف
                </button>
              </div>
            </div>
          </form>
        )}
        </section>

        <div className="lg:col-span-4">
          <WeatherWidget />
        </div>
      </div>

      {/* Simple 3-Number Overview */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setActiveSection('tasks')}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 text-start transition-colors hover:border-accent dark:border-slate-800 dark:bg-slate-800/90"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">مهام النهارده</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {dueTodayOrOverdue.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('tasks')}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 text-start transition-colors hover:border-accent dark:border-slate-800 dark:bg-slate-800/90"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">مهام جاية</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {upcomingTasks.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('tasks')}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 text-start transition-colors hover:border-accent dark:border-slate-800 dark:bg-slate-800/90"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">مهام خلصت</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {completedTasks.length}
          </p>
        </button>
      </div>

      {/* Automatic Weekly Google Drive Backup Reminder */}
      {driveBackupReminder.shouldRemind && (
        <section
          role="status"
          aria-label="تذكير النسخ الاحتياطي الأسبوعي على Google Drive"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/90 bg-amber-50/85 px-4 py-3.5 dark:border-amber-900/60 dark:bg-amber-950/30"
        >
          <div className="flex items-start gap-2.5">
            <CloudUpload className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-xs font-semibold text-amber-950 sm:text-sm dark:text-amber-100">
                تذكير أسبوعي: حان وقت عمل نسخة احتياطية على Google Drive
              </p>
              <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/85">
                {driveBackupReminder.neverSynced
                  ? 'عدّى أسبوع من غير ما تعمل نسخة احتياطية على Google Drive. احفظ بياناتك عشان تفضل بأمان.'
                  : `عدّى ${driveBackupReminder.daysSinceLastSync} يوم من آخر مزامنة مع Google Drive.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => {
                if (!needsAuth) {
                  void requestSmartSync();
                } else {
                  setActiveSection('settings');
                }
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              <CloudUpload className="h-3.5 w-3.5" />
              <span>{needsAuth ? 'افتح مزامنة Drive' : 'اعمل نسخة دلوقتي'}</span>
            </button>
            <button
              type="button"
              onClick={snoozeDriveBackupReminder}
              className="min-h-[36px] rounded-xl border border-amber-300/80 bg-white/80 px-3 text-xs font-medium text-amber-900 hover:bg-white dark:border-amber-800/60 dark:bg-slate-900/60 dark:text-amber-200"
            >
              فكّرني بكرة
            </button>
          </div>
        </section>
      )}

      {/* Simple Weekly Summary Strip */}
      <section
        aria-label="ملخص الأسبوع"
        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              ملخص الأسبوع ده
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs tabular-nums">
            <span className="text-slate-600 dark:text-slate-300">
              خلصت{' '}
              <strong className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {weeklySummary.weeklyCompleted}
              </strong>{' '}
              من{' '}
              <strong className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {weeklySummary.weeklyTotal}
              </strong>{' '}
              مهمة
            </span>
            <span className="rounded-lg bg-accent-soft px-2 py-0.5 font-mono text-xs font-bold text-accent">
              {weeklySummary.weeklyPercent}%
            </span>
          </div>
        </div>

        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{width: `${weeklySummary.weeklyPercent}%`}}
          />
        </div>
      </section>

      {/* Focus Timer (Pomodoro) & Daily Habit Tracker */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FocusTimerWidget variant="card" />
        <HabitTrackerCard />
      </div>

      {/* Day Planner Drag & Drop Timeline */}
      <DayPlannerTimeline />

      {/* Recharts Weekly Tasks Dashboard */}
      <WeeklyTasksDashboard
        tasks={tasks}
        onQuickAddTask={() => {
          setQuickAction('task');
          window.scrollTo({top: 0, behavior: 'smooth'});
        }}
      />

      {/* Recharts Tasks by Tags Distribution (includes archived completed history) */}
      <TagsDistributionChart
        tasks={allTasks}
        onQuickAddTask={() => {
          setQuickAction('task');
          window.scrollTo({top: 0, behavior: 'smooth'});
        }}
      />

      {/* Main Content Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Today & Overdue + Upcoming + Completed */}
        <div className="space-y-5 lg:col-span-7">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                مهام النهارده
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSection('calendar')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-accent dark:text-slate-300"
                >
                  <CalendarDays className="h-3.5 w-3.5 text-accent" />
                  <span>التقويم</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTasksViewMode('list');
                    setActiveSection('tasks');
                  }}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  كل المهام
                </button>
              </div>
            </div>

            {dueTodayOrOverdue.length === 0 ? (
              <p className="py-7 text-center text-sm text-slate-500 dark:text-slate-400">
                مفيش مهام مطلوبة النهارده. لو فيه حاجة في بالك اضغط &quot;إضافة مهمة جديدة&quot;.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {dueTodayOrOverdue.map((task) => {
                  const overdue = isTaskOverdue(task, todayIso);
                  const dueToday = isTaskDueToday(task, todayIso);
                  return (
                    <div key={task.id} className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        onClick={() => toggleDone(task)}
                        aria-label={`تعليم ${task.title} خلصت`}
                        className="flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {task.title}
                          </p>
                          {dueToday && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                              <BellRing className="h-3.5 w-3.5" />
                              <span>
                                ميعادها النهارده
                                {task.reminderTime
                                  ? ` · ${formatReminderTime(task.reminderTime)}`
                                  : ''}
                              </span>
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>{task.priority}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{task.status}</span>
                          {(task.tags ?? []).length > 0 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-medium text-accent">
                                {(task.tags ?? []).map((tag) => `#${tag}`).join(' · ')}
                              </span>
                            </>
                          )}
                          {overdue && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-medium text-red-600 dark:text-red-400">
                                اتأجلت ({formatFriendlyDate(task.dueDate)})
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startFocusForTask({id: task.id, title: task.title})}
                        aria-label={`ابدأ جلسة تركيز على ${task.title}`}
                        title="ابدأ مؤقت التركيز"
                        className="flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                      >
                        <Timer className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
              <h3 className="border-b border-slate-100 pb-2.5 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
                مهام جاية
              </h3>
              {upcomingTasks.length === 0 ? (
                <p className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  مفيش مهام جاية متسجلة لسه.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {upcomingTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-2 py-2.5">
                      <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                        {task.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                        {formatFriendlyDate(task.dueDate)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
              <h3 className="border-b border-slate-100 pb-2.5 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
                مهام خلصت
              </h3>
              {completedTasks.length === 0 ? (
                <p className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  لسه مخلصتش مهام النهارده.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {completedTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-2 py-2.5">
                      <span className="truncate text-xs text-slate-400 line-through dark:text-slate-500">
                        {task.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleDone(task)}
                        className="shrink-0 text-[11px] font-medium text-accent hover:underline"
                      >
                        رجّعها
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Goals & Projects Quick Overview */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                أهدافك ومشاريعك
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('goals')}
              className="text-xs font-medium text-accent hover:underline"
            >
              تعديل الكل
            </button>
          </div>

          {goals.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                مفيش أهداف أو مشاريع متسجلة لسه.
              </p>
              <button
                type="button"
                onClick={() => setActiveSection('goals')}
                className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:text-slate-200"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>ضيف أول هدف</span>
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {goals.slice(0, 5).map((g) => {
                const linked = computeGoalLinkedProgress(g.id, allTasks);
                const pct = linked.percent !== null ? linked.percent : g.progress;
                const palette = resolveGoalPalette(pct, g.color);
                return (
                  <div key={g.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {g.title}
                      </span>
                      <span className={`font-mono text-xs font-semibold tabular-nums ${palette.text}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${palette.bar}`}
                        style={{width: `${pct}%`}}
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {g.kind} · {formatFriendlyDate(g.targetDate)}
                      {linked.linkedCount > 0 &&
                        ` · ${linked.doneCount}/${linked.linkedCount} مهام مرتبطة`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
