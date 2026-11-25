import React, {useMemo, useState} from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Plus,
  Repeat,
  Target,
  Timer,
} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {formatFriendlyDate, getTodayIso} from '../storage/localStore';
import {occasionsForDate} from '../data/egyptOccasions';
import {RECURRENCE_LABELS, buildArabicMonthGrid} from '../storage/productivityUtils';
import type {TaskItem} from '../types';

interface CalendarMonthViewProps {
  onSelectTaskToEdit?: (task: TaskItem) => void;
}

const WEEKDAY_HEADERS = ['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

export const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({onSelectTaskToEdit}) => {
  const {
    tasks,
    goals,
    preferences,
    addTask,
    updateTask,
    startFocusForTask,
    setActiveSection,
  } = useLife();

  const todayIso = getTodayIso();
  const [todayYear, todayMonth] = todayIso.split('-').map(Number);

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth); // 1-based
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [quickTitle, setQuickTitle] = useState('');

  const cells = useMemo(() => buildArabicMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthTitle = useMemo(() => {
    return new Intl.DateTimeFormat('ar-EG', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(viewYear, viewMonth - 1, 1));
  }, [viewYear, viewMonth]);

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
    const map = new Map<string, typeof goals>();
    for (const g of goals) {
      if (!g.targetDate) continue;
      const list = map.get(g.targetDate) ?? [];
      list.push(g);
      map.set(g.targetDate, list);
    }
    return map;
  }, [goals]);

  const selectedDayTasks = useMemo(() => {
    return (tasksByDate.get(selectedDate) ?? []).sort((a, b) => {
      if (a.status === 'خلصت' && b.status !== 'خلصت') return 1;
      if (a.status !== 'خلصت' && b.status === 'خلصت') return -1;
      return b.updatedAt - a.updatedAt;
    });
  }, [tasksByDate, selectedDate]);

  const selectedDayGoals = useMemo(
    () => goalsByDate.get(selectedDate) ?? [],
    [goalsByDate, selectedDate],
  );

  const selectedDayOccasions = useMemo(() => occasionsForDate(selectedDate), [selectedDate]);

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

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    addTask({
      title: quickTitle.trim(),
      dueDate: selectedDate,
      priority: preferences.defaultPriority,
      tags: [],
      reminderEnabled: true,
    });
    setQuickTitle('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Calendar Grid */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrevMonth}
              aria-label="الشهر السابق"
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white min-w-[130px] text-center">
              {monthTitle}
            </h2>
            <button
              type="button"
              onClick={goNextMonth}
              aria-label="الشهر التالي"
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
          >
            النهارده
          </button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_HEADERS.map((d) => (
            <div
              key={d}
              className="text-[11px] font-bold text-slate-500 dark:text-slate-400 py-1.5"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell) => {
            const dayTasks = tasksByDate.get(cell.dateIso) ?? [];
            const dayGoals = goalsByDate.get(cell.dateIso) ?? [];
            const pendingCount = dayTasks.filter((t) => t.status !== 'خلصت').length;
            const doneCount = dayTasks.filter((t) => t.status === 'خلصت').length;
            const dayOccasions = occasionsForDate(cell.dateIso);
            const isSelected = cell.dateIso === selectedDate;
            const isToday = cell.dateIso === todayIso;

            return (
              <button
                key={cell.dateIso}
                type="button"
                onClick={() => setSelectedDate(cell.dateIso)}
                className={`min-h-[54px] sm:min-h-[62px] rounded-xl p-1.5 flex flex-col items-center justify-between border transition-all ${
                  isSelected
                    ? 'border-accent bg-accent-soft ring-1 ring-accent'
                    : isToday
                      ? 'border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-800/70'
                      : cell.inCurrentMonth
                        ? 'border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                        : 'border-transparent bg-slate-50/40 dark:bg-slate-950/30 opacity-45 hover:opacity-75'
                }`}
              >
                <span
                  className={`text-xs sm:text-sm font-bold tabular-nums leading-none ${
                    isSelected
                      ? 'text-accent'
                      : isToday
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                <div className="flex items-center justify-center gap-1 flex-wrap mt-1">
                  {pendingCount > 0 && (
                    <span
                      title={`${pendingCount} مهام متبقية`}
                      className="w-2 h-2 rounded-full bg-accent"
                    />
                  )}
                  {doneCount > 0 && (
                    <span
                      title={`${doneCount} مهام خلصانة`}
                      className="w-2 h-2 rounded-full bg-emerald-500"
                    />
                  )}
                  {dayGoals.length > 0 && (
                    <span
                      title={`${dayGoals.length} أهداف بميعاد في اليوم ده`}
                      className="w-2 h-2 rounded-full bg-amber-500"
                    />
                  )}
                  {dayOccasions.length > 0 && (
                    <span
                      title={dayOccasions.map((o) => o.name).join('، ')}
                      className="w-2 h-2 rounded-full bg-rose-500"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-accent" />
            مهام متبقية
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            مهام خلصت
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            ميعاد هدف / مشروع
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            مناسبة أو أجازة رسمية
          </span>
        </div>
      </div>

      {/* Selected Day Agenda */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="w-5 h-5 text-accent shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                أجندة {formatFriendlyDate(selectedDate)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums" dir="ltr">
                {selectedDate}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
            {selectedDayTasks.length} مهمة
          </span>
        </div>

        {/* Egyptian holidays and Islamic occasions on this date */}
        {selectedDayOccasions.length > 0 && (
          <div className="space-y-2">
            {selectedDayOccasions.map((occ) => (
              <div
                key={`${occ.dateIso}-${occ.name}`}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                  occ.kind === 'ramadan'
                    ? 'border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/25'
                    : occ.kind === 'religious'
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/25'
                      : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/25'
                }`}
              >
                <span className="text-lg leading-none shrink-0" aria-hidden>
                  {occ.emoji}
                </span>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {occ.name}
                  {occ.tentative && (
                    <span className="font-medium text-slate-400 dark:text-slate-500"> (متوقع)</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Quick add task for selected date */}
        <form onSubmit={handleQuickAdd} className="flex items-center gap-2">
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="أضف مهمة سريعة في اليوم ده..."
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!quickTitle.trim()}
            className="inline-flex items-center gap-1 px-3.5 py-2.5 min-h-[40px] rounded-xl bg-accent disabled:opacity-40 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة</span>
          </button>
        </form>

        {/* Goals due on this date */}
        {selectedDayGoals.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              أهداف ومشاريع ميعادها في اليوم ده
            </p>
            {selectedDayGoals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveSection('goals')}
                className="w-full text-right p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors flex items-center justify-between gap-2"
              >
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {g.title}
                </span>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 tabular-nums shrink-0">
                  {g.progress}%
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Tasks on this date */}
        {selectedDayTasks.length === 0 ? (
          <div className="py-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              مفيش مهام مجدولة في اليوم ده. تقدر تضيف مهمة من فوق مباشرة.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDayTasks.map((task) => {
              const isDone = task.status === 'خلصت';
              return (
                <div
                  key={task.id}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        updateTask(task.id, {status: isDone ? 'لسه' : 'خلصت'})
                      }
                      aria-label={isDone ? 'إعادة فتح المهمة' : 'إنهاء المهمة'}
                      className="shrink-0 text-slate-400 hover:text-accent transition-colors"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectTaskToEdit?.(task)}
                      className="min-w-0 text-right flex-1"
                    >
                      <p
                        className={`text-sm font-semibold truncate ${
                          isDone
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {task.priority}
                        </span>
                        {task.recurrence && task.recurrence !== 'none' && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent">
                            <Repeat className="w-3 h-3" />
                            {RECURRENCE_LABELS[task.recurrence]}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {!isDone && (
                    <button
                      type="button"
                      onClick={() => startFocusForTask({id: task.id, title: task.title})}
                      title="ابدأ مؤقت التركيز على المهمة دي"
                      className="p-2 rounded-lg text-slate-500 hover:text-accent hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <Timer className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
