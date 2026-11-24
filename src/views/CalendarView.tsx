import React, {useMemo, useState} from 'react';
import {
  ArrowUpLeft,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  FolderKanban,
  Plus,
  Repeat,
  Target,
  Timer,
  Trophy,
} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {getGoalStatusLabel, resolveGoalPalette} from '../storage/goalTheme';
import {formatFriendlyDate, formatReminderTime, getTodayIso} from '../storage/localStore';
import {
  RECURRENCE_LABELS,
  addDaysToIso,
  buildArabicMonthGrid,
  computeCalendarMonthStats,
  computeGoalLinkedProgress,
} from '../storage/productivityUtils';
import type {GoalKind, GoalProjectItem, TaskItem, TaskPriority} from '../types';

type CalendarScope = 'all' | 'tasks' | 'goals';
type QuickCreateMode = 'task' | 'goal';

const WEEKDAY_HEADERS = [
  {short: 'سبت', full: 'السبت'},
  {short: 'أحد', full: 'الأحد'},
  {short: 'إثنين', full: 'الإثنين'},
  {short: 'ثلاثاء', full: 'الثلاثاء'},
  {short: 'أربعاء', full: 'الأربعاء'},
  {short: 'خميس', full: 'الخميس'},
  {short: 'جمعة', full: 'الجمعة'},
];

function formatFullArabicDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

export const CalendarView: React.FC = () => {
  const {
    tasks,
    allTasks,
    goals,
    preferences,
    addTask,
    updateTask,
    addGoal,
    startFocusForTask,
    navigateToItem,
  } = useLife();

  const todayIso = getTodayIso();
  const [todayYear, todayMonth] = todayIso.split('-').map(Number);

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth); // 1..12
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [scope, setScope] = useState<CalendarScope>('all');

  // Quick-add inside Selected Day Panel
  const [createMode, setCreateMode] = useState<QuickCreateMode>('task');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskPriority>(
    preferences.defaultPriority,
  );
  const [quickTaskTime, setQuickTaskTime] = useState('');
  const [quickGoalKind, setQuickGoalKind] = useState<GoalKind>('هدف');
  const [quickGoalTitle, setQuickGoalTitle] = useState('');

  const cells = useMemo(() => buildArabicMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthTitle = useMemo(() => {
    return new Intl.DateTimeFormat('ar-EG', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(viewYear, viewMonth - 1, 1));
  }, [viewYear, viewMonth]);

  const monthStats = useMemo(
    () => computeCalendarMonthStats(viewYear, viewMonth, tasks, goals, todayIso),
    [viewYear, viewMonth, tasks, goals, todayIso],
  );

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks]);

  const goalsByDate = useMemo(() => {
    const map = new Map<string, GoalProjectItem[]>();
    for (const g of goals) {
      if (!g.targetDate) continue;
      const list = map.get(g.targetDate) ?? [];
      list.push(g);
      map.set(g.targetDate, list);
    }
    return map;
  }, [goals]);

  const goalsById = useMemo(() => {
    const map = new Map<string, GoalProjectItem>();
    for (const g of goals) map.set(g.id, g);
    return map;
  }, [goals]);

  const selectedDayTasks = useMemo(() => {
    const list = tasksByDate.get(selectedDate) ?? [];
    return [...list].sort((a, b) => {
      if (a.status === 'خلصت' && b.status !== 'خلصت') return 1;
      if (a.status !== 'خلصت' && b.status === 'خلصت') return -1;
      const aTime = a.reminderTime ?? '99:99';
      const bTime = b.reminderTime ?? '99:99';
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return b.updatedAt - a.updatedAt;
    });
  }, [tasksByDate, selectedDate]);

  const selectedDayGoals = useMemo(
    () => goalsByDate.get(selectedDate) ?? [],
    [goalsByDate, selectedDate],
  );

  const monthGoalsList = useMemo(() => {
    return goals
      .filter((g) => g.targetDate && g.targetDate.startsWith(monthStats.monthPrefix))
      .sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? ''));
  }, [goals, monthStats.monthPrefix]);

  const unscheduledTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.dueDate && t.status !== 'خلصت')
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [tasks]);

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    setSelectedDate(todayIso);
  };

  const handleSelectCell = (dateIso: string, inCurrentMonth: boolean) => {
    setSelectedDate(dateIso);
    if (!inCurrentMonth) {
      const [y, m] = dateIso.split('-').map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m);
      }
    }
  };

  const handleQuickAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    addTask({
      title: quickTaskTitle.trim(),
      dueDate: selectedDate,
      priority: quickTaskPriority,
      tags: [],
      reminderEnabled: true,
      reminderTime: quickTaskTime || null,
    });
    setQuickTaskTitle('');
    setQuickTaskTime('');
  };

  const handleQuickAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickGoalTitle.trim()) return;
    addGoal({
      kind: quickGoalKind,
      title: quickGoalTitle.trim(),
      description: '',
      targetDate: selectedDate,
      progress: 0,
      color: 'auto',
    });
    setQuickGoalTitle('');
  };

  const showTasks = scope === 'all' || scope === 'tasks';
  const showGoals = scope === 'all' || scope === 'goals';
  const isCurrentMonthView = viewYear === todayYear && viewMonth === todayMonth;

  return (
    <div className="space-y-5">
      {/* Page Header & Scope Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">التقويم</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            الجدول الزمني لمهامك وأهدافك موزعة على أيام الشهر
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="تصفية عناصر التقويم"
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-800"
          >
            {(
              [
                {key: 'all', label: 'الكل'},
                {key: 'tasks', label: 'المهام'},
                {key: 'goals', label: 'الأهداف'},
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setScope(opt.key)}
                className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                  scope === opt.key
                    ? 'bg-accent text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={goToday}
            className={`min-h-[38px] shrink-0 whitespace-nowrap rounded-xl border px-3.5 text-xs font-semibold transition-colors ${
              isCurrentMonthView && selectedDate === todayIso
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-slate-200 bg-white text-slate-700 hover:border-accent hover:text-accent dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            النهارده
          </button>
        </div>
      </div>

      {/* Monthly Overview Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
          <p className="text-xs text-slate-500 dark:text-slate-400">مهام الشهر</p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {monthStats.totalTasks}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {monthStats.busyDaysCount} يوم مشغول
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
          <p className="text-xs text-slate-500 dark:text-slate-400">مهام خلصت</p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {monthStats.completedTasks}
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {monthStats.completionRate}%
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
          <p className="text-xs text-slate-500 dark:text-slate-400">مهام متبقية</p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {monthStats.pendingTasks}
            </span>
            {monthStats.overdueTasks > 0 ? (
              <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 tabular-nums">
                {monthStats.overdueTasks} متأخرة
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">ماشي تمام</span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
          <p className="text-xs text-slate-500 dark:text-slate-400">مواعيد الأهداف</p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {monthStats.goalsCount}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">في {monthTitle}</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Calendar + Selected Day Panel */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Interactive Monthly Grid */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90 sm:p-5 lg:col-span-8">
          {/* Month Stepper Header */}
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrevMonth}
                aria-label="الشهر السابق"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:text-slate-300"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <h2 className="min-w-[140px] text-center text-base font-bold text-slate-900 dark:text-slate-100 sm:text-lg">
                {monthTitle}
              </h2>
              <button
                type="button"
                onClick={goNextMonth}
                aria-label="الشهر التالي"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:text-slate-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline">
              اضغط على أي يوم لعرض جدوله أو إضافة مهمة
            </span>
          </div>

          {/* Weekday Row */}
          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center sm:gap-1.5">
            {WEEKDAY_HEADERS.map((day) => (
              <div
                key={day.short}
                className="py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 sm:text-xs"
              >
                <span className="sm:hidden">{day.short}</span>
                <span className="hidden sm:inline">{day.full}</span>
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {cells.map((cell) => {
              const rawTasks = showTasks ? tasksByDate.get(cell.dateIso) ?? [] : [];
              const rawGoals = showGoals ? goalsByDate.get(cell.dateIso) ?? [] : [];

              const pendingTasks = rawTasks.filter((t) => t.status !== 'خلصت');
              const doneTasks = rawTasks.filter((t) => t.status === 'خلصت');
              const hasOverdue = pendingTasks.some((t) => cell.dateIso < todayIso);

              const isSelected = cell.dateIso === selectedDate;
              const isToday = cell.dateIso === todayIso;

              // Build compact inline preview entries for tablet/desktop cells (up to 2 items)
              const previews: Array<{
                id: string;
                label: string;
                kind: 'goal' | 'task_pending' | 'task_overdue' | 'task_done';
              }> = [];

              for (const g of rawGoals) {
                if (previews.length >= 2) break;
                previews.push({id: `g-${g.id}`, label: g.title, kind: 'goal'});
              }
              for (const t of pendingTasks) {
                if (previews.length >= 2) break;
                previews.push({
                  id: `t-${t.id}`,
                  label: t.title,
                  kind: cell.dateIso < todayIso ? 'task_overdue' : 'task_pending',
                });
              }
              for (const t of doneTasks) {
                if (previews.length >= 2) break;
                previews.push({id: `td-${t.id}`, label: t.title, kind: 'task_done'});
              }

              const totalItems = rawTasks.length + rawGoals.length;
              const overflowCount = Math.max(0, totalItems - previews.length);

              return (
                <button
                  key={cell.dateIso}
                  type="button"
                  onClick={() => handleSelectCell(cell.dateIso, cell.inCurrentMonth)}
                  aria-label={`${formatFullArabicDate(cell.dateIso)} — ${totalItems} عناصر`}
                  aria-pressed={isSelected}
                  className={`flex min-h-[58px] flex-col justify-between rounded-xl border p-1.5 text-start transition-colors sm:min-h-[96px] sm:p-2 ${
                    isSelected
                      ? 'border-accent bg-accent-soft/80 ring-1 ring-accent dark:bg-accent-soft'
                      : isToday
                        ? 'border-accent/60 bg-slate-50 dark:bg-slate-900/70'
                        : cell.inCurrentMonth
                          ? 'border-slate-100 bg-white hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-900/40 dark:hover:border-slate-600'
                          : 'border-transparent bg-slate-50/40 opacity-45 hover:opacity-80 dark:bg-slate-950/30'
                  }`}
                >
                  {/* Day Number Row */}
                  <div className="flex w-full items-center justify-between gap-1">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-lg font-mono text-xs font-bold tabular-nums sm:text-xs ${
                        isToday
                          ? 'bg-accent text-white'
                          : isSelected
                            ? 'text-accent'
                            : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {overflowCount > 0 && (
                      <span className="hidden font-mono text-[10px] font-semibold tabular-nums text-slate-500 dark:text-slate-400 sm:inline">
                        +{overflowCount}
                      </span>
                    )}
                  </div>

                  {/* Mobile Compact Dots (< sm) */}
                  <div className="mt-1 flex items-center justify-center gap-1 sm:hidden">
                    {rawGoals.length > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                    {pendingTasks.length > 0 && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          hasOverdue ? 'bg-rose-500' : 'bg-accent'
                        }`}
                      />
                    )}
                    {doneTasks.length > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    )}
                  </div>

                  {/* Tablet / Desktop Inline Schedule Previews (>= sm) */}
                  <div className="mt-1.5 hidden w-full space-y-1 sm:block">
                    {previews.map((entry) => (
                      <div
                        key={entry.id}
                        className={`truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight ${
                          entry.kind === 'goal'
                            ? 'bg-amber-100/90 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200'
                            : entry.kind === 'task_overdue'
                              ? 'bg-rose-100/90 text-rose-800 dark:bg-rose-950/70 dark:text-rose-200'
                              : entry.kind === 'task_done'
                                ? 'bg-emerald-100/75 text-emerald-800 line-through opacity-80 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {entry.label}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Calendar Color Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              <span>مهام متبقية</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span>مهام متأخرة</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>مهام خلصت</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span>ميعاد هدف / مشروع</span>
            </span>
          </div>
        </section>

        {/* Selected Day Agenda & Quick Scheduler */}
        <aside className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90 sm:p-5 lg:col-span-4">
          {/* Selected Date Header */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-700/80">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {formatFriendlyDate(selectedDate)}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatFullArabicDate(selectedDate)}
                </p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
              {selectedDayTasks.length + selectedDayGoals.length} عنصر
            </span>
          </div>

          {/* Dual Quick Add (Task or Goal on Selected Date) */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900/70">
              <button
                type="button"
                onClick={() => setCreateMode('task')}
                className={`min-h-[34px] flex-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                  createMode === 'task'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                + مهمة في اليوم ده
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('goal')}
                className={`min-h-[34px] flex-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                  createMode === 'goal'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                + هدف بميعاد اليوم
              </button>
            </div>

            {createMode === 'task' ? (
              <form onSubmit={handleQuickAddTask} className="space-y-2">
                <input
                  type="text"
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  placeholder="اكتب اسم المهمة..."
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <div className="flex items-center gap-1.5">
                  <select
                    value={quickTaskPriority}
                    onChange={(e) => setQuickTaskPriority(e.target.value as TaskPriority)}
                    aria-label="الأولوية"
                    className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="مهم">مهم</option>
                    <option value="متوسط">متوسط</option>
                    <option value="عادي">عادي</option>
                  </select>
                  <input
                    type="time"
                    value={quickTaskTime}
                    onChange={(e) => setQuickTaskTime(e.target.value)}
                    aria-label="الساعة (اختياري)"
                    className="min-h-[38px] min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={!quickTaskTitle.trim()}
                    className="inline-flex min-h-[38px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-accent px-3.5 text-xs font-semibold text-white transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>إضافة</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleQuickAddGoal} className="space-y-2">
                <input
                  type="text"
                  value={quickGoalTitle}
                  onChange={(e) => setQuickGoalTitle(e.target.value)}
                  placeholder="اسم الهدف أو المشروع..."
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={quickGoalKind}
                    onChange={(e) => setQuickGoalKind(e.target.value as GoalKind)}
                    aria-label="نوع الهدف"
                    className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="هدف">هدف</option>
                    <option value="مشروع">مشروع</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!quickGoalTitle.trim()}
                    className="inline-flex min-h-[38px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>تسجيل في اليوم ده</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Goals Due on Selected Day */}
          {showGoals && selectedDayGoals.length > 0 && (
            <div className="space-y-2.5 border-t border-slate-100 pt-3.5 dark:border-slate-700/80">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                  <Target className="h-3.5 w-3.5" />
                  <span>أهداف ومشاريع ميعادها اليوم</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  {selectedDayGoals.length}
                </span>
              </div>

              <div className="space-y-2">
                {selectedDayGoals.map((g) => {
                  const linked = computeGoalLinkedProgress(g.id, allTasks);
                  const pct = linked.percent !== null ? linked.percent : g.progress;
                  const palette = resolveGoalPalette(pct, g.color);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => navigateToItem('goals', g.id)}
                      className="w-full space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-start transition-colors hover:border-accent dark:border-slate-700 dark:bg-slate-900/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${palette.iconBg}`}
                          >
                            {pct >= 100 ? (
                              <Trophy className="h-3.5 w-3.5" />
                            ) : g.kind === 'مشروع' ? (
                              <FolderKanban className="h-3.5 w-3.5" />
                            ) : (
                              <Target className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                            {g.title}
                          </span>
                        </span>
                        <span className={`shrink-0 font-mono text-xs font-bold tabular-nums ${palette.text}`}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700">
                        <div
                          className={`h-full rounded-full transition-all ${palette.bar}`}
                          style={{width: `${pct}%`}}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {g.kind} · {getGoalStatusLabel(pct)}
                        {linked.linkedCount > 0
                          ? ` · ${linked.doneCount}/${linked.linkedCount} مهام`
                          : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tasks on Selected Day */}
          {showTasks && (
            <div className="space-y-2.5 border-t border-slate-100 pt-3.5 dark:border-slate-700/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  مهام اليوم ده
                </span>
                <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  {selectedDayTasks.length} مهمة
                </span>
              </div>

              {selectedDayTasks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  مفيش مهام مجدولة في اليوم ده. تقدر تضيف مهمة جديدة من فوق.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                  {selectedDayTasks.map((task) => {
                    const isDone = task.status === 'خلصت';
                    const linkedGoal = task.goalId ? goalsById.get(task.goalId) : null;
                    return (
                      <div key={task.id} className="flex items-start justify-between gap-2 py-2.5">
                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateTask(task.id, {status: isDone ? 'لسه' : 'خلصت'})
                            }
                            aria-label={isDone ? `إعادة فتح ${task.title}` : `إنهاء ${task.title}`}
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700"
                          >
                            {isDone ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => navigateToItem('tasks', task.id)}
                            className="min-w-0 flex-1 text-start"
                          >
                            <p
                              className={`truncate text-sm font-semibold ${
                                isDone
                                  ? 'text-slate-400 line-through dark:text-slate-500'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {task.title}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>{task.priority}</span>
                              {task.reminderTime && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-0.5 font-mono tabular-nums">
                                    <Clock className="h-3 w-3" />
                                    {formatReminderTime(task.reminderTime)}
                                  </span>
                                </>
                              )}
                              {task.recurrence && task.recurrence !== 'none' && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-0.5 text-accent">
                                    <Repeat className="h-3 w-3" />
                                    {RECURRENCE_LABELS[task.recurrence]}
                                  </span>
                                </>
                              )}
                              {linkedGoal && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate font-medium text-amber-700 dark:text-amber-400">
                                    {linkedGoal.title}
                                  </span>
                                </>
                              )}
                            </p>
                          </button>
                        </div>

                        {!isDone && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateTask(task.id, {
                                  dueDate: addDaysToIso(selectedDate, 1),
                                })
                              }
                              title="أجّل المهمة ليوم واحد"
                              aria-label={`تأجيل ${task.title} ليوم واحد`}
                              className="min-h-[32px] whitespace-nowrap rounded-lg border border-slate-200 px-2 text-[11px] font-medium text-slate-600 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:text-slate-300"
                            >
                              +يوم
                            </button>
                            <button
                              type="button"
                              onClick={() => startFocusForTask({id: task.id, title: task.title})}
                              title="ابدأ مؤقت التركيز"
                              aria-label={`تركيز على ${task.title}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-accent-soft hover:text-accent dark:text-slate-400"
                            >
                              <Timer className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Bottom Row: Month Goals Timeline & Unscheduled Tasks Quick-Assign */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Goals & Projects Targeting This Month */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90 sm:p-5">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-700/80">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                أهداف ومشاريع {monthTitle}
              </h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {monthGoalsList.length}
            </span>
          </div>

          {monthGoalsList.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              مفيش أهداف ليها ميعاد مستهدف في {monthTitle}.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {monthGoalsList.map((g) => {
                const linked = computeGoalLinkedProgress(g.id, allTasks);
                const pct = linked.percent !== null ? linked.percent : g.progress;
                const palette = resolveGoalPalette(pct, g.color);
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-900/40"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (g.targetDate) setSelectedDate(g.targetDate);
                      }}
                      className="min-w-0 flex-1 space-y-1.5 text-start"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                          {g.title}
                        </span>
                        <span className={`shrink-0 font-mono text-xs font-bold tabular-nums ${palette.text}`}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700">
                        <div
                          className={`h-full rounded-full ${palette.bar}`}
                          style={{width: `${pct}%`}}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {g.kind} · الميعاد: {formatFriendlyDate(g.targetDate)}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigateToItem('goals', g.id)}
                      aria-label={`فتح ${g.title}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-accent dark:hover:bg-slate-800"
                    >
                      <ArrowUpLeft className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Unscheduled Tasks Ready to Place on Selected Date */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90 sm:p-5">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-700/80">
            <div className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                مهام بدون ميعاد محدد
              </h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {unscheduledTasks.length}
            </span>
          </div>

          {unscheduledTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              ممتاز! كل مهامك المفتوحة ليها تواريخ محددة على التقويم.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700/80">
              {unscheduledTasks.slice(0, 6).map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {task.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {task.priority}
                      {(task.tags ?? []).length > 0
                        ? ` · ${task.tags.map((t) => `#${t}`).join(' ')}`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateTask(task.id, {dueDate: selectedDate})}
                    className="inline-flex min-h-[34px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <Plus className="h-3 w-3" />
                    <span>جدولة {formatFriendlyDate(selectedDate)}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
