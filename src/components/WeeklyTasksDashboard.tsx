import React, {useMemo, useState} from 'react';
import {BarChart3, Plus} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {getTodayIso} from '../storage/localStore';
import {
  computeWeeklyTaskStats,
  type WeeklyDayBucket,
  type WeeklyRangeMode,
} from '../storage/weeklyAnalytics';
import type {TaskItem} from '../types';

interface WeeklyTasksDashboardProps {
  tasks: TaskItem[];
  onQuickAddTask: () => void;
}

interface CustomBarTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    dataKey?: string;
    payload?: WeeklyDayBucket;
  }>;
}

const WeeklyBarTooltip: React.FC<CustomBarTooltipProps> = ({active, payload}) => {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold text-slate-900 dark:text-slate-100">
        {bucket.dayLabel} · {bucket.dateLabel}
        {bucket.isToday ? ' (النهارده)' : ''}
      </p>
      <div className="mt-1.5 space-y-1 text-slate-600 dark:text-slate-300">
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-600 dark:text-emerald-400">منجزة</span>
          <span className="font-mono font-semibold tabular-nums">{bucket.completed}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-amber-600 dark:text-amber-400">متبقية</span>
          <span className="font-mono font-semibold tabular-nums">{bucket.remaining}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1 dark:border-slate-800">
          <span>نسبة الإنجاز</span>
          <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {bucket.rate}%
          </span>
        </div>
      </div>
    </div>
  );
};

interface CustomPieTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
  }>;
}

const WeeklyPieTooltip: React.FC<CustomPieTooltipProps> = ({active, payload}) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  if (!item || item.name === 'فارغ') return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <span className="font-medium text-slate-700 dark:text-slate-200">{item.name}: </span>
      <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {item.value}
      </span>
    </div>
  );
};

export const WeeklyTasksDashboard: React.FC<WeeklyTasksDashboardProps> = ({
  tasks,
  onQuickAddTask,
}) => {
  const [rangeMode, setRangeMode] = useState<WeeklyRangeMode>('current_week');
  const todayIso = getTodayIso();

  const stats = useMemo(
    () => computeWeeklyTaskStats(tasks, todayIso, rangeMode),
    [tasks, todayIso, rangeMode],
  );

  const pieData = useMemo(() => {
    if (stats.weeklyTotal === 0) {
      return [{name: 'فارغ', value: 1, color: '#e2e8f0'}];
    }
    return [
      {name: 'مهام منجزة', value: stats.weeklyCompleted, color: '#10b981'},
      {name: 'مهام متبقية', value: stats.weeklyRemaining, color: '#f59e0b'},
    ];
  }, [stats.weeklyTotal, stats.weeklyCompleted, stats.weeklyRemaining]);

  const remainingPercent = stats.weeklyTotal === 0 ? 0 : 100 - stats.weeklyPercent;

  return (
    <section
      aria-label="لوحة إنجاز المهام الأسبوعية"
      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90"
    >
      {/* Header & Range Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              لوحة إنجاز الأسبوع
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              الأسبوع: {stats.weeklyCompleted} منجزة · {stats.weeklyRemaining} متبقية
            </span>
            {stats.overallTotal > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span>الإجمالي الكلي: {stats.overallPercent}% ({stats.overallCompleted}/{stats.overallTotal})</span>
              </>
            )}
          </p>
        </div>

        <div
          role="group"
          aria-label="نطاق العرض الأسبوعي"
          className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900"
        >
          <button
            type="button"
            onClick={() => setRangeMode('current_week')}
            aria-pressed={rangeMode === 'current_week'}
            className={`min-h-[36px] whitespace-nowrap shrink-0 rounded-lg px-3 text-xs font-medium transition-colors ${
              rangeMode === 'current_week'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            الأسبوع الحالي
          </button>
          <button
            type="button"
            onClick={() => setRangeMode('last_7_days')}
            aria-pressed={rangeMode === 'last_7_days'}
            className={`min-h-[36px] whitespace-nowrap shrink-0 rounded-lg px-3 text-xs font-medium transition-colors ${
              rangeMode === 'last_7_days'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            آخر ٧ أيام
          </button>
        </div>
      </div>

      {/* Recharts Visualizations Grid */}
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
        {/* Donut Chart (Weekly Completion Ratio) */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row lg:col-span-4 lg:flex-col lg:border-e lg:border-slate-100 lg:pe-6 dark:lg:border-slate-700">
          <div className="relative h-40 w-40 shrink-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={68}
                  startAngle={90}
                  endAngle={-270}
                  strokeWidth={0}
                  paddingAngle={stats.weeklyCompleted > 0 && stats.weeklyRemaining > 0 ? 3 : 0}
                >
                  {pieData.map((entry, idx) => (
                    <Cell key={`${entry.name}-${idx}`} fill={entry.color} />
                  ))}
                </Pie>
                {stats.weeklyTotal > 0 && <Tooltip content={<WeeklyPieTooltip />} />}
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {stats.weeklyPercent}%
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                إنجاز الأسبوع
              </span>
            </div>
          </div>

          <div className="w-full max-w-[240px] space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-700/70">
              <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                <span className="h-2.5 w-2.5 shrink-0 rounded-xs bg-emerald-500" />
                <span>المهام المنجزة</span>
              </span>
              <span className="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {stats.weeklyCompleted} ({stats.weeklyPercent}%)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                <span className="h-2.5 w-2.5 shrink-0 rounded-xs bg-amber-500" />
                <span>المهام المتبقية</span>
              </span>
              <span className="font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {stats.weeklyRemaining} ({remainingPercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* 7-Day Bar Chart (Day-by-Day Completed vs Remaining) */}
        <div className="lg:col-span-8">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              توزيع المهام المنجزة والمتبقية يوم بيوم
            </span>
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-xs bg-emerald-500" />
                <span>منجزة</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-xs bg-amber-500" />
                <span>متبقية</span>
              </span>
            </span>
          </div>

          {stats.weeklyTotal === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                مفيش مهام متسجلة في الأسبوع ده لسه. أول ما تضيف مهامك، هيظهرلك هنا رسم بياني يقارن المنجز بالمتبقي كل يوم.
              </p>
              <button
                type="button"
                onClick={onQuickAddTask}
                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-4 text-xs font-semibold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>ضيف أول مهمة للأسبوع</span>
              </button>
            </div>
          ) : (
            <div className="h-56 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.days}
                  margin={{top: 8, right: 8, left: -18, bottom: 2}}
                  barCategoryGap="24%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#94a3b8"
                    strokeOpacity={0.22}
                  />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{fontSize: 11, fill: '#64748b'}}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{fontSize: 11, fill: '#64748b'}}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    cursor={{fill: 'rgba(148, 163, 184, 0.12)'}}
                    content={<WeeklyBarTooltip />}
                  />
                  <Bar
                    dataKey="completed"
                    name="منجزة"
                    fill="#10b981"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={26}
                  />
                  <Bar
                    dataKey="remaining"
                    name="متبقية"
                    fill="#f59e0b"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={26}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
