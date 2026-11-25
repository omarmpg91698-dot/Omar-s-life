import React, {useMemo} from 'react';
import {CalendarDays, ChevronLeft} from 'lucide-react';
import {upcomingOccasions} from '../data/egyptOccasions';
import {formatFriendlyDate, getTodayIso} from '../storage/localStore';

interface OccasionsCardProps {
  onOpenCalendar?: () => void;
}

function daysAwayLabel(days: number): string {
  if (days === 0) return 'النهارده';
  if (days === 1) return 'بكرة';
  if (days === 2) return 'بعد بكرة';
  if (days <= 10) return `باقي ${days} أيام`;
  if (days <= 30) return `باقي ${days} يوم`;
  const months = Math.floor(days / 30);
  const remDays = days - months * 30;
  const monthWord = months === 1 ? 'شهر' : months === 2 ? 'شهرين' : months <= 10 ? `${months} شهور` : `${months} شهر`;
  if (remDays === 0) return `باقي ${monthWord}`;
  const dayWord = remDays === 1 ? 'يوم واحد' : remDays === 2 ? 'يومين' : remDays <= 10 ? `${remDays} أيام` : `${remDays} يوم`;
  return `باقي ${monthWord} و ${dayWord}`;
}

export const OccasionsCard: React.FC<OccasionsCardProps> = ({onOpenCalendar}) => {
  const todayIso = getTodayIso();
  const upcoming = useMemo(() => upcomingOccasions(todayIso, 4, 150), [todayIso]);

  if (upcoming.length === 0) return null;

  return (
    <section
      aria-label="المناسبات والأجازات القادمة"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-accent" />
          المناسبات والأجازات الجاية
        </h3>
        {onOpenCalendar && (
          <button
            type="button"
            onClick={onOpenCalendar}
            className="inline-flex items-center gap-0.5 text-[11px] font-bold text-accent hover:underline"
          >
            التقويم
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {upcoming.map((occ) => (
          <li
            key={`${occ.dateIso}-${occ.name}`}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              occ.kind === 'ramadan'
                ? 'border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/25'
                : occ.kind === 'religious'
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/25'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40'
            }`}
          >
            <span className="text-lg leading-none shrink-0" aria-hidden>
              {occ.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                {occ.name}
                {occ.tentative && (
                  <span className="font-medium text-slate-400 dark:text-slate-500"> (متوقع)</span>
                )}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {formatFriendlyDate(occ.dateIso)}
              </p>
            </div>
            <span
              className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold tabular-nums ${
                occ.daysAway <= 14
                  ? 'bg-accent-soft text-accent'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {daysAwayLabel(occ.daysAway)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
