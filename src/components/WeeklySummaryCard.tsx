import React, {useEffect, useMemo, useState} from 'react';
import {Bot, Sparkles} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {getOffsetIso, getTodayIso, isTaskOverdue} from '../storage/localStore';
import {chatWithAssistantClientSide} from '../services/geminiAssistant';

const GEMINI_API_KEY = ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? '').trim();
const AI_CACHE_KEY = 'omars_life_weekly_ai_summary';

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

  const statsHash = JSON.stringify(summary);
  const [aiLines, setAiLines] = useState<string[] | null>(null);

  // Once per day per stats-change, ask the assistant for a personal weekly
  // summary. Cached in localStorage so it costs one Gemini call a day at
  // most; on any failure the deterministic lines below are shown instead.
  useEffect(() => {
    if (!GEMINI_API_KEY) return;
    try {
      const cached = JSON.parse(localStorage.getItem(AI_CACHE_KEY) ?? 'null');
      if (cached && cached.hash === statsHash && Array.isArray(cached.lines)) {
        setAiLines(cached.lines);
        return;
      }
    } catch {
      // ignore cache errors
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await chatWithAssistantClientSide({
          message:
            'اكتب ملخص أسبوعي قصير بالمصري (3 سطور بالظبط، كل سطر بيبدأ بشرطة) لعمر، ودود ومشجع وشخصي، من غير أي مقدمات. ' +
            `الإحصائيات: خلص ${summary.doneThisWeek} مهام الأسبوع اللي فات، ` +
            `عليه ${summary.overdue} مهام متأخرة، ` +
            `الأسبوع الجاي فيه ${summary.comingNextWeek} مهام، ` +
            `عاداته النهارده ${summary.habitsDoneToday} من ${summary.habitsTotal}.`,
          history: [],
          lifeContext: {},
          apiKey: GEMINI_API_KEY,
        });
        if (cancelled || res.error || !res.reply) return;
        const lines = res.reply
          .split('\n')
          .map((l) => l.replace(/^[-•*\s]+/, '').trim())
          .filter((l) => l.length > 3)
          .slice(0, 4);
        if (lines.length === 0) return;
        setAiLines(lines);
        try {
          localStorage.setItem(AI_CACHE_KEY, JSON.stringify({hash: statsHash, lines}));
        } catch {
          // ignore
        }
      } catch {
        // silent fallback
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsHash]);

  const lines: string[] = aiLines ?? [];
  if (aiLines === null && summary.doneThisWeek > 0) {
    lines.push(`الأسبوع اللي فات خلصت ${summary.doneThisWeek} ${summary.doneThisWeek === 1 ? 'مهمة' : 'مهام'} 👏`);
  } else {
    lines.push('الأسبوع اللي فات مفيش مهام اتقفلت، أسبوع جديد بداية جديدة 💪');
  }
  if (aiLines === null && summary.overdue > 0) {
    lines.push(`عليك ${summary.overdue} ${summary.overdue === 1 ? 'مهمة متأخرة' : 'مهام متأخرة'}، لو خلصتها هترتاح.`);
  }
  if (aiLines === null && summary.comingNextWeek > 0) {
    lines.push(`الأسبوع الجاي فيه ${summary.comingNextWeek} ${summary.comingNextWeek === 1 ? 'مهمة' : 'مهام'} مستنياك.`);
  }
  if (aiLines === null && summary.habitsTotal > 0) {
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
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
          {aiLines && <Sparkles className="w-3 h-3 text-accent" />}
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
