import React, {useEffect, useMemo, useState} from 'react';
import {Moon, Check} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {formatReminderTime, getTodayIso} from '../storage/localStore';
import {
  fetchSuhoorIftar,
  getRamadanRange,
  ramadanDayNumber,
  ramadanLength,
  type SuhoorIftar,
} from '../services/ramadanTimes';

const FASTING_HABIT_TITLE = 'صيام رمضان 🌙';
const RAMADAN_PLAN_HABITS = [FASTING_HABIT_TITLE, 'قيام الليل 🤲', 'قراءة القرآن 📖', 'صدقة يومية 🤍'];

export const RamadanCard: React.FC = () => {
  const {habits, addHabit} = useLife();
  const todayIso = getTodayIso();
  const range = useMemo(() => getRamadanRange(todayIso), [todayIso]);
  const [times, setTimes] = useState<SuhoorIftar | null>(null);

  const inRamadan = Boolean(range && todayIso >= range.startIso && todayIso <= range.endIso);

  useEffect(() => {
    if (!inRamadan) return;
    let cancelled = false;
    fetchSuhoorIftar(todayIso).then((t) => {
      if (!cancelled) setTimes(t);
    });
    return () => {
      cancelled = true;
    };
  }, [inRamadan, todayIso]);

  const daysUntilStart = range
    ? Math.round(
        (new Date(`${range.startIso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) /
          86_400_000,
      )
    : 0;
  const [planAdded, setPlanAdded] = useState(false);

  if (!range || (!inRamadan && (daysUntilStart < 1 || daysUntilStart > 7))) return null;

  // Pre-Ramadan week: countdown + one-tap Ramadan plan in the habit coach.
  if (!inRamadan) {
    const missing = RAMADAN_PLAN_HABITS.filter(
      (t) => !habits.some((h) => h.title.replace(/\s+/g, ' ').includes(t.split(' ')[0])),
    );
    return (
      <section
        aria-label="وضع رمضان"
        className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-bl from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4 shadow-xs space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
            <Moon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            رمضان قرب 🌙
            {range.tentative && (
              <span className="text-[10px] font-medium text-emerald-600/70 dark:text-emerald-400/70">(الموعد متوقع)</span>
            )}
          </h3>
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {daysUntilStart === 1 ? 'باقي يوم واحد' : `باقي ${daysUntilStart} أيام`}
          </span>
        </div>
        {missing.length > 0 && !planAdded ? (
          <button
            type="button"
            onClick={() => {
              for (const t of missing) addHabit(t);
              setPlanAdded(true);
            }}
            className="w-full min-h-[40px] rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
          >
            جهّز خطة رمضان في مدرب العادات
          </button>
        ) : (
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            <Check className="w-3.5 h-3.5" />
            خطة رمضان جاهزة في مدرب العادات
          </p>
        )}
      </section>
    );
  }

  const dayNumber = ramadanDayNumber(todayIso, range);
  const totalDays = ramadanLength(range);
  const hasFastingHabit = habits.some((h) => h.title.replace(/\s+/g, ' ').includes('صيام'));

  return (
    <section
      aria-label="وضع رمضان"
      className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-bl from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4 shadow-xs space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
          <Moon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          رمضان كريم 🌙
          {range.tentative && (
            <span className="text-[10px] font-medium text-emerald-600/70 dark:text-emerald-400/70">(المواعيد متوقعة)</span>
          )}
        </h3>
        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
          يوم {dayNumber} من {totalDays}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 border border-emerald-100 dark:border-emerald-900/50 px-3 py-2.5 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">السحور (الإمساك)</p>
          <p className="mt-0.5 text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
            {times ? formatReminderTime(times.suhoor) : '…'}
          </p>
        </div>
        <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 border border-emerald-100 dark:border-emerald-900/50 px-3 py-2.5 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">الإفطار (المغرب)</p>
          <p className="mt-0.5 text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
            {times ? formatReminderTime(times.iftar) : '…'}
          </p>
        </div>
      </div>
      {times && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
          المواقيت حسب {times.locationLabel} — الهيئة المصرية العامة للمساحة
        </p>
      )}

      {!hasFastingHabit ? (
        <button
          type="button"
          onClick={() => addHabit(FASTING_HABIT_TITLE)}
          className="w-full min-h-[40px] rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
        >
          ضيف عادة الصيام لمدرب العادات
        </button>
      ) : (
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          <Check className="w-3.5 h-3.5" />
          عادة الصيام موجودة في مدرب العادات، علّم عليها كل يوم
        </p>
      )}
    </section>
  );
};
