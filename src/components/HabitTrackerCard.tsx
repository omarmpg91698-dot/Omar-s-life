import React, {useState} from 'react';
import {Check, Flame, Plus, Repeat, Trash2} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {getTodayIso} from '../storage/localStore';
import {computeHabitStreak} from '../storage/productivityUtils';

export const HabitTrackerCard: React.FC = () => {
  const {habits, addHabit, deleteHabit, toggleHabitDate} = useLife();
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const todayIso = getTodayIso();

  const doneTodayCount = habits.filter((h) => h.completedDates.includes(todayIso)).length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;
    addHabit(newHabitTitle);
    setNewHabitTitle('');
    setShowAdd(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              العادات اليومية
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {habits.length === 0
                ? 'ابنِ روتينك اليومي خطوة بخطوة'
                : `خلصت ${doneTodayCount} من ${habits.length} النهارده`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>عادة جديدة</span>
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            type="text"
            value={newHabitTitle}
            onChange={(e) => setNewHabitTitle(e.target.value)}
            placeholder="مثال: قراءة ١٥ دقيقة، شرب ٢ لتر مياه، رياضة..."
            maxLength={60}
            autoFocus
            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newHabitTitle.trim()}
            className="px-4 py-2.5 min-h-[40px] rounded-xl bg-accent disabled:opacity-40 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            إضافة
          </button>
        </form>
      )}

      {habits.length === 0 ? (
        <div className="py-5 px-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
          <Repeat className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            لسه مفيش عادات مضافة. اضغط «عادة جديدة» وتابع سلسلتك اليومية.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map((habit) => {
            const summary = computeHabitStreak(habit, todayIso);
            return (
              <div
                key={habit.id}
                className="p-3 rounded-xl border border-slate-100 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleHabitDate(habit.id, todayIso)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-right group"
                  >
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                        summary.doneToday
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-accent'
                      }`}
                    >
                      {summary.doneToday && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span
                      className={`text-sm font-semibold truncate ${
                        summary.doneToday
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {habit.title}
                    </span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      title={`أطول سلسلة: ${summary.bestStreak} يوم`}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold tabular-nums ${
                        summary.currentStreak > 0
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Flame className="w-3 h-3" />
                      <span>{summary.currentStreak} يوم</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteHabit(habit.id)}
                      aria-label={`حذف عادة ${habit.title}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Interactive 7-day strip */}
                <div className="grid grid-cols-7 gap-1.5">
                  {summary.last7Days.map((day) => {
                    const isToday = day.dateIso === todayIso;
                    return (
                      <button
                        key={day.dateIso}
                        type="button"
                        onClick={() => toggleHabitDate(habit.id, day.dateIso)}
                        title={`${day.dayShort} (${day.dateIso})`}
                        className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[10px] font-semibold transition-colors border ${
                          day.done
                            ? 'bg-accent border-accent text-white'
                            : isToday
                              ? 'border-accent bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                              : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <span className="truncate max-w-full px-0.5">{day.dayShort}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
