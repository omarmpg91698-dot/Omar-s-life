import React, {useMemo} from 'react';
import {
  BrainCircuit,
  CalendarDays,
  Check,
  Flame,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {formatFriendlyDate, getOffsetIso, getTodayIso} from '../storage/localStore';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(todayIso: string, days: number): string {
  const d = new Date(todayIso + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return toLocalIso(d);
}

function weekdayOf(iso: string): number {
  return new Date(iso + 'T00:00:00').getDay();
}

function currentStreak(completedDates: string[], todayIso: string): number {
  const done = new Set(completedDates);
  let streak = 0;
  let cursor = todayIso;
  // allow today to be missing without breaking the streak
  if (!done.has(cursor)) cursor = isoDaysAgo(cursor, 1);
  while (done.has(cursor)) {
    streak += 1;
    cursor = isoDaysAgo(cursor, 1);
  }
  return streak;
}

export const HabitCoachView: React.FC = () => {
  const {habits, allTasks, focusSessions, toggleHabitDate} = useLife();
  const todayIso = getTodayIso();
  const tomorrowIso = getOffsetIso(1);

  const analysis = useMemo(() => {
    const last7: string[] = Array.from({length: 7}, (_, i) => isoDaysAgo(todayIso, i));
    const last7Set = new Set(last7);

    const habitStats = habits.map((h) => {
      const weekCount = last7.filter((d) => h.completedDates.includes(d)).length;
      const streak = currentStreak(h.completedDates, todayIso);
      const byWeekday = new Array(7).fill(0) as number[];
      h.completedDates.forEach((d) => {
        byWeekday[weekdayOf(d)] += 1;
      });
      const bestDay = byWeekday.indexOf(Math.max(...byWeekday));
      const lastDone =
        h.completedDates.length > 0
          ? [...h.completedDates].sort().reverse()[0]
          : null;
      return {habit: h, weekCount, streak, bestDay, lastDone, total: h.completedDates.length};
    });

    const completedThisWeek = allTasks.filter(
      (t) => t.completedAt && last7Set.has(new Date(t.completedAt).toISOString().slice(0, 10)),
    );
    const overdue = allTasks.filter(
      (t) => !t.archivedAt && t.status !== 'خلصت' && t.dueDate && t.dueDate < todayIso,
    );
    const tomorrowTasks = allTasks.filter(
      (t) => !t.archivedAt && t.status !== 'خلصت' && t.dueDate === tomorrowIso,
    );
    const focusWeekMin = focusSessions
      .filter((f) => last7Set.has(f.dateIso))
      .reduce((sum, f) => sum + f.durationMinutes, 0);

    const completedByWeekday = new Array(7).fill(0) as number[];
    allTasks.forEach((t) => {
      if (t.completedAt) {
        completedByWeekday[new Date(t.completedAt).getDay()] += 1;
      }
    });
    const productiveDay = completedByWeekday.indexOf(Math.max(...completedByWeekday));

    return {
      habitStats,
      completedThisWeek: completedThisWeek.length,
      overdue,
      tomorrowTasks,
      focusWeekMin,
      productiveDay,
    };
  }, [habits, allTasks, focusSessions, todayIso, tomorrowIso]);

  const insights = useMemo(() => {
    const out: {icon: 'flame' | 'warn' | 'tip' | 'win'; text: string}[] = [];
    const {habitStats, overdue, productiveDay, focusWeekMin, completedThisWeek} = analysis;

    habitStats.forEach((s) => {
      if (s.streak >= 7) {
        out.push({
          icon: 'win',
          text: `سلسلة ${s.streak} يوم في "${s.habit.title}"، أداء بطل. اليوم اللي بتكسره أغلى من اللي بتكمله.`,
        });
      } else if (s.total > 0 && s.weekCount === 0) {
        out.push({
          icon: 'warn',
          text: `"${s.habit.title}" واقفة من أسبوع. ارجع ليها النهارده حتى لو 5 دقايق بس.`,
        });
      } else if (s.total > 0 && s.weekCount > 0 && s.weekCount <= 2) {
        out.push({
          icon: 'tip',
          text: `"${s.habit.title}" ${s.weekCount} بس الأسبوع ده. اربطها بعادة ثابتة (زي بعد القهوة) عشان تلزم.`,
        });
      }
      if (s.total >= 5 && s.weekCount < 4) {
        out.push({
          icon: 'tip',
          text: `أكتر يوم بتلتزم فيه بـ"${s.habit.title}" هو ${WEEKDAYS[s.bestDay]}. خلّي ${WEEKDAYS[s.bestDay]} معيارك وكرر نفس الظروف.`,
        });
      }
    });

    if (overdue.length >= 4) {
      out.push({
        icon: 'warn',
        text: `عندك ${overdue.length} مهام متأخرة. اختار 3 بس الأهم واقفلهم، والباقي اما اتاريخ جديد صريح أو امسحه من غير ذنب.`,
      });
    } else if (overdue.length > 0) {
      out.push({
        icon: 'tip',
        text: `${overdue.length} ${overdue.length === 1 ? 'مهمة متأخرة' : 'مهام متأخرة'}. اقفلها أول حاجة بكرة الصبح قبل أي حاجة جديدة.`,
      });
    }

    if (completedThisWeek >= 10) {
      out.push({
        icon: 'win',
        text: `خلصت ${completedThisWeek} مهمة الأسبوع ده. إيقاعك عالي، حافظ عليه بس متنساش الراحة.`,
      });
    }

    if (analysis.completedThisWeek > 0 || overdue.length > 0) {
      out.push({
        icon: 'tip',
        text: `أكتر يوم بتنجز فيه هو ${WEEKDAYS[productiveDay]}. حط أصعب مهمة بكرة في نفس مزاج اليوم ده.`,
      });
    }

    if (focusWeekMin >= 120) {
      out.push({
        icon: 'win',
        text: `${Math.round(focusWeekMin / 60)} ساعة تركيز الأسبوع ده. جلسات التركيز شغالة معاك، كمّل بنفس النظام.`,
      });
    } else if (focusWeekMin === 0 && (overdue.length > 0 || analysis.tomorrowTasks.length > 2)) {
      out.push({
        icon: 'tip',
        text: 'مجربتش جلسة تركيز الأسبوع ده. جرب ٢٥ دقيقة تركيز ٢٥ د على أهم مهمة بكرة.',
      });
    }

    if (habits.length === 0) {
      out.push({
        icon: 'tip',
        text: 'لسه مفيش عادات مسجلة. ابدأ بعادة واحدة سهلة (زي شرب مية الصبح)، الصغر هنا ميزة مش عيب.',
      });
    }

    return out.slice(0, 6);
  }, [analysis, habits.length]);

  const tomorrowPlan = useMemo(() => {
    const items: {kind: 'overdue' | 'scheduled' | 'habit'; text: string; hint?: string}[] = [];
    const priorityRank: Record<string, number> = {'مهم': 0, 'متوسط': 1, 'عادي': 2};
    [...analysis.overdue]
      .sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1))
      .slice(0, 3)
      .forEach((t) =>
        items.push({kind: 'overdue', text: t.title, hint: 'متأخرة، اقفلها الصبح'}),
      );
    analysis.tomorrowTasks.forEach((t) =>
      items.push({
        kind: 'scheduled',
        text: t.title,
        hint: t.reminderTime ? `الساعة ${t.reminderTime}` : 'ميعادها بكرة',
      }),
    );
    const habitsNotToday = analysis.habitStats.filter(
      (s) => !s.habit.completedDates.includes(todayIso),
    );
    habitsNotToday.slice(0, 3).forEach((s) =>
      items.push({kind: 'habit', text: s.habit.title, hint: 'عادة، جدولها بكرة'}),
    );
    return items.slice(0, 8);
  }, [analysis, todayIso]);

  const loadLevel =
    analysis.overdue.length + analysis.tomorrowTasks.length >= 6
      ? {label: 'بكرة تقيل', hint: 'ركّز على الـ 3 الأهم بس، والباقي ميستاهلش زعلك'}
      : analysis.overdue.length + analysis.tomorrowTasks.length >= 3
        ? {label: 'بكرة متوسط', hint: 'يوم ماشي، ابدأ بالأصعب الأول'}
        : {label: 'بكرة خفيف', hint: 'فرصة تجيب فيها حاجة متأجلة من زمان'};

  const doneToday = (id: string) =>
    habits.find((h) => h.id === id)?.completedDates.includes(todayIso) ?? false;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">مدرب العادات</h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          بيتعلم من يومك ويقترحلك خطة بكرة
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <p className="text-xl font-bold text-accent tabular-nums" dir="ltr">
            {analysis.habitStats.reduce((m, s) => Math.max(m, s.streak), 0)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">أطول سلسلة</p>
        </div>
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <p className="text-xl font-bold text-accent tabular-nums" dir="ltr">
            {analysis.completedThisWeek}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">مهام خلصت الأسبوع ده</p>
        </div>
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <p className="text-xl font-bold text-accent tabular-nums" dir="ltr">
            {analysis.focusWeekMin}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">دقيقة تركيز</p>
        </div>
      </div>

      {/* Today's habits quick check */}
      {habits.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4.5 w-4.5 text-accent" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">عادات النهارده</h2>
          </div>
          <ul className="space-y-1.5">
            {analysis.habitStats.map((s) => {
              const done = doneToday(s.habit.id);
              return (
                <li key={s.habit.id}>
                  <button
                    type="button"
                    onClick={() => toggleHabitDate(s.habit.id, todayIso)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        done
                          ? 'border-accent bg-accent text-white'
                          : 'border-slate-300 text-transparent dark:border-slate-600'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span
                      className={`flex-1 text-sm ${
                        done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {s.habit.title}
                    </span>
                    {s.streak > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        <Flame className="h-3 w-3" />
                        <span className="tabular-nums" dir="ltr">{s.streak}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Insights */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
        <div className="mb-3 flex items-center gap-2">
          <BrainCircuit className="h-4.5 w-4.5 text-accent" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">المدرب بيقولك</h2>
        </div>
        {insights.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400">
            استخدم التطبيق كام يوم والمدرب هيبدأ يفهم إيقاعك ويقترحلك
          </p>
        ) : (
          <ul className="space-y-2.5">
            {insights.map((ins, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {ins.icon === 'flame' || ins.icon === 'win' ? (
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                ) : (
                  <Lightbulb
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      ins.icon === 'warn' ? 'text-amber-500' : 'text-accent'
                    }`}
                  />
                )}
                <span>{ins.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tomorrow plan */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4.5 w-4.5 text-accent" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              خطة بكرة ({formatFriendlyDate(tomorrowIso)})
            </h2>
          </div>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent dark:bg-slate-900">
            {loadLevel.label}
          </span>
        </div>
        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <TrendingUp className="h-3 w-3" />
          {loadLevel.hint}
        </p>
        {tomorrowPlan.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400">
            بكرة فاضي تماما، يوم مفتوح ليك
          </p>
        ) : (
          <ul className="space-y-1.5">
            {tomorrowPlan.map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-700"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    item.kind === 'overdue'
                      ? 'bg-rose-500'
                      : item.kind === 'habit'
                        ? 'bg-amber-500'
                        : 'bg-accent'
                  }`}
                />
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                  {item.text}
                </span>
                {item.hint && (
                  <span className="text-[11px] text-slate-400">{item.hint}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-2xl bg-white p-4 text-[11px] text-slate-400 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
        <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          التحليل بيتحسب من مهامك وعاداتك وجلسات تركيزك على جهازك، وكل ما تستخدم التطبيق أكتر بيبقى أدق.
        </span>
      </div>
    </div>
  );
};
