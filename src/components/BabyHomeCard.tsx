import React from 'react';
import {Baby, ChevronLeft} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {daysBetween, pregnancyWeekFor, tipForWeek} from '../data/pregnancyTips';
import {getTodayIso} from '../storage/localStore';

interface BabyHomeCardProps {
  onOpenBaby?: () => void;
}

export const BabyHomeCard: React.FC<BabyHomeCardProps> = ({onOpenBaby}) => {
  const {baby} = useLife();
  const todayIso = getTodayIso();

  const isBorn = Boolean(baby.birthDate);
  const hasDate = Boolean(baby.dueDate || baby.birthDate);

  if (!hasDate) {
    return (
      <section
        aria-label="قسم البيبي"
        className="rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-gradient-to-bl from-sky-50 to-indigo-50 dark:from-sky-950/30 dark:to-indigo-950/20 p-4 shadow-xs"
      >
        <h3 className="text-sm font-extrabold text-sky-900 dark:text-sky-100 flex items-center gap-2">
          <Baby className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          البيبي في الطريق 👶
        </h3>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          ظبط تاريخ الولادة المتوقع وهتلاقي هنا عداد أسبوع الحمل ونصيحة كل أسبوع للبابا الجديد.
        </p>
        {onOpenBaby && (
          <button
            type="button"
            onClick={onOpenBaby}
            className="mt-3 w-full min-h-[40px] rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 transition-colors"
          >
            ظبط التاريخ من قسم البيبي
          </button>
        )}
      </section>
    );
  }

  if (isBorn) {
    const days = Math.max(0, daysBetween(baby.birthDate!, todayIso));
    const weeks = Math.floor(days / 7);
    const ageLabel =
      days < 7 ? `${days} يوم` : days < 60 ? `${weeks} أسبوع` : `${Math.floor(days / 30)} شهر`;
    return (
      <section
        aria-label="البيبي"
        className="rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-gradient-to-bl from-sky-50 to-indigo-50 dark:from-sky-950/30 dark:to-indigo-950/20 p-4 shadow-xs space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-sky-900 dark:text-sky-100 flex items-center gap-2">
            <Baby className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            {baby.babyName?.trim() || 'البيبي'} وصل 👶
          </h3>
          {onOpenBaby && (
            <button
              type="button"
              onClick={onOpenBaby}
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300 hover:underline"
            >
              قسم البيبي
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          عمره دلوقتي <span className="font-bold text-sky-800 dark:text-sky-200 tabular-nums">{ageLabel}</span> — ألف مبروك يا عمر ❤️
        </p>
      </section>
    );
  }

  const week = pregnancyWeekFor(baby.dueDate!, todayIso);
  const daysLeft = daysBetween(todayIso, baby.dueDate!);
  const tip = tipForWeek(week);

  return (
    <section
      aria-label="عداد الحمل"
      className="rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-gradient-to-bl from-sky-50 to-indigo-50 dark:from-sky-950/30 dark:to-indigo-950/20 p-4 shadow-xs space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-sky-900 dark:text-sky-100 flex items-center gap-2">
          <Baby className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          {baby.babyName?.trim() || 'البيبي'}
        </h3>
        {onOpenBaby && (
          <button
            type="button"
            onClick={onOpenBaby}
            className="inline-flex items-center gap-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300 hover:underline"
          >
            قسم البيبي
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="shrink-0 w-14 h-14 rounded-2xl bg-sky-600 text-white flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold tabular-nums leading-none">{week}</span>
          <span className="text-[9px] font-bold mt-0.5">أسبوع</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {daysLeft > 0
              ? `باقي ${daysLeft} يوم على الميعاد المتوقع`
              : daysLeft === 0
                ? 'الميعاد المتوقع النهارده 🤍'
                : 'الميعاد عدّى، المتابعة أقرب دلوقتي'}
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-sky-100 dark:bg-sky-950 overflow-hidden">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{width: `${Math.min(100, Math.round((week / 40) * 100))}%`}}
            />
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-sky-100 dark:border-sky-900/50 px-3 py-2">
        <span className="font-bold text-sky-800 dark:text-sky-200">نصيحة الأسبوع: </span>
        {tip}
      </p>
    </section>
  );
};
