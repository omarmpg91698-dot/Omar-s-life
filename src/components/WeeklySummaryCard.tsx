import React, {useMemo} from 'react';
import {Bot} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {getOffsetIso, getTodayIso, isTaskOverdue} from '../storage/localStore';

const DAY_MS = 86_400_000;

// Weekly assistant summary, computed locally from the store: what Omar
// finished in the last 7 days, what is waiting, and what is coming next.
export const WeeklySummaryCard: React.FC = () => {
  const {allTasks, habits, preferences} = useLife();
  const todayIso = getTodayIso();

  const summary = useMemo(() => {
    const weekAgoMs = Date.now() - 7 * DAY_MS;
    const doneThisWeek = allTasks.filter(
      (t) => t.status === 'خلصت' && typeof t.completedAt === 'number' && t.completedAt >= weekAgoMs,
    ).length;
    const overdue = allTasks.filter((t) => t.status !== 'خلصت' && isTaskOverdue(t, todayIso)).length;
    const nextWeekEnd = getOffsetIso(7);
    const comingNextWeek = allTasks.filter(
      (t) => t.status !== 'خلصت' && t.dueDate && t.dueDate > todayIso && t.dueDate <= nextWeekEnd,
    ).length;
    const habitsDoneToday = habits.filter((h) => h.completedDates.includes(todayIso)).length;
    return {doneThisWeek, overdue, comingNextWeek, habitsDoneToday, habitsTotal: habits.length};
  }, [allTasks, habits, todayIso]);

  const lines: string[] = [];
  if (summary.doneThisWeek > 0) {
    lines.push(`الأسبوع اللي فات خلصت ${summary.doneThisWeek} ${summary.doneThisWeek === 1 ? 'مهمة' : 'مهام'} 👏`);
  } else {
    lines.push('الأسبوع اللي فات مفيش مهام اتقفلت، أسبوع جديد بداية جديدة 💪');
  }
  if (summary.overdue > 0) {
    lines.push(`عليك ${summary.overdue} ${summary.overdue === 1 ? 'مهمة متأخرة' : 'مهام متأخرة'}، لو خلصتها هترتاح.`);
  }
  if (summary.comingNextWeek > 0) {
    lines.push(`الأسبوع الجاي فيه ${summary.comingNextWeek} ${summary.comingNextWeek === 1 ? 'مهمة' : 'مهام'} مستنياك.`);
  }
  if (summary.habitsTotal > 0) {
    lines.push(`عاداتك النهارده: ${summary.habitsDoneToday} من ${summary.habitsTotal}.`);
  }

  return (
    <section
      aria-label="ملخص الأسبوع من المساعد"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <Bot className="w-4 h-4 text-accent" />
          ملخص الأسبوع
        </h3>
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
          من مساعدك الشخصي لـ {preferences.userName}
        </span>
      </div>
      <ul className="space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 flex gap-2">
            <span className="text-accent shrink-0">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
