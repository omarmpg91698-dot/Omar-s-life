import React, {useMemo, useState} from 'react';
import {Plus, Tags} from 'lucide-react';
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
import {
  computeTagDistribution,
  type TagDistributionBucket,
  type TagScopeMode,
  type TagTimeframe,
} from '../storage/tagAnalytics';
import type {TaskItem} from '../types';

interface TagsDistributionChartProps {
  tasks: TaskItem[];
  onQuickAddTask: () => void;
}

interface TagPieTooltipProps {
  active?: boolean;
  scope: TagScopeMode;
  payload?: Array<{
    payload?: TagDistributionBucket;
  }>;
}

const TagPieTooltip: React.FC<TagPieTooltipProps> = ({active, scope, payload}) => {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;

  const unitLabel =
    scope === 'completed' ? 'مهام منجزة' : scope === 'active' ? 'مهام مفتوحة' : 'مهام';

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold text-slate-900 dark:text-slate-100">{bucket.label}</p>
      <p className="mt-1 text-slate-600 tabular-nums dark:text-slate-300">
        <span>
          {bucket.total} {unitLabel}
        </span>
        <span aria-hidden="true"> · </span>
        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
          {bucket.sharePercent}%
        </span>
      </p>
    </div>
  );
};

interface TagBarTooltipProps {
  active?: boolean;
  scope: TagScopeMode;
  payload?: Array<{
    payload?: TagDistributionBucket;
  }>;
}

const TagBarTooltip: React.FC<TagBarTooltipProps> = ({active, scope, payload}) => {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold text-slate-900 dark:text-slate-100">{bucket.label}</p>
      <div className="mt-1.5 space-y-1 text-slate-600 dark:text-slate-300">
        {scope === 'completed' ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <span>مهام منجزة</span>
              <span className="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {bucket.completed}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>معدل الإنجاز في المجال</span>
              <span className="font-mono font-semibold tabular-nums">
                {bucket.completionRate}%
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-emerald-600 dark:text-emerald-400">منجزة</span>
              <span className="font-mono font-semibold tabular-nums">{bucket.completed}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-amber-600 dark:text-amber-400">متبقية</span>
              <span className="font-mono font-semibold tabular-nums">{bucket.remaining}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1 dark:border-slate-800">
          <span>النسبة من وقتك</span>
          <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {bucket.sharePercent}%
          </span>
        </div>
      </div>
    </div>
  );
};

export const TagsDistributionChart: React.FC<TagsDistributionChartProps> = ({
  tasks,
  onQuickAddTask,
}) => {
  const [scope, setScope] = useState<TagScopeMode>('completed');
  const [timeframe, setTimeframe] = useState<TagTimeframe>('all_time');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const summary = useMemo(
    () => computeTagDistribution(tasks, scope, timeframe),
    [tasks, scope, timeframe],
  );
  const topBuckets = useMemo(() => summary.buckets.slice(0, 7), [summary.buckets]);
  const barChartHeight = Math.max(195, topBuckets.length * 36 + 24);

  const activeBucket = useMemo(() => {
    if (!selectedTag) return summary.topTag;
    return summary.buckets.find((b) => b.tag === selectedTag) ?? summary.topTag;
  }, [selectedTag, summary.buckets, summary.topTag]);

  const headingLabel =
    scope === 'completed'
      ? 'توزيع المهام المنجزة حسب التصنيفات'
      : scope === 'active'
        ? 'توزيع المهام المفتوحة حسب التصنيفات'
        : 'توزيع كل المهام حسب التصنيفات';

  return (
    <section
      aria-label="لوحة توزيع المهام المنجزة حسب التصنيفات"
      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90"
    >
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between dark:border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <Tags className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {headingLabel}
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {summary.topTag ? (
              <>
                <span>
                  أكتر مجال قضيت فيه وقتك:{' '}
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">
                    {summary.topTag.label}
                  </strong>{' '}
                  ({summary.topTag.sharePercent}%)
                </span>
                <span aria-hidden="true"> · </span>
                <span>{summary.totalTasksInScope} مهمة</span>
              </>
            ) : (
              <span>لوحة سريعة توضح أكتر المجالات والتصنيفات اللي بتقضي فيها وقتك</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Filter */}
          <div
            role="group"
            aria-label="الفترة الزمنية لتوزيع التصنيفات"
            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900"
          >
            {(
              [
                {id: '7d', label: '٧ أيام'},
                {id: '30d', label: '٣٠ يوم'},
                {id: 'all_time', label: 'الكل'},
              ] as const
            ).map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => {
                  setTimeframe(tf.id);
                  setSelectedTag(null);
                }}
                aria-pressed={timeframe === tf.id}
                className={`min-h-[32px] shrink-0 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors ${
                  timeframe === tf.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Scope Filter (Completed first) */}
          <div
            role="group"
            aria-label="تصفية توزيع التصنيفات حسب الحالة"
            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900"
          >
            {(
              [
                {id: 'completed', label: 'المنجزة'},
                {id: 'all', label: 'الكل'},
                {id: 'active', label: 'مفتوحة'},
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setScope(tab.id);
                  setSelectedTag(null);
                }}
                aria-pressed={scope === tab.id}
                className={`min-h-[32px] shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                  scope === tab.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {summary.buckets.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
            {tasks.length === 0
              ? 'مفيش مهام متسجلة لسه عشان نعرض توزيع وقتك حسب التصنيفات.'
              : scope === 'completed'
                ? timeframe === 'all_time'
                  ? 'لسه مفيش مهام منجزة — علّم على أي مهمة «خلصت» عشان تشوف أكتر المجالات اللي بتقضي فيها وقتك.'
                  : 'مفيش مهام منجزة في الفترة الزمنية المختارة.'
                : scope === 'active'
                  ? 'مفيش مهام مفتوحة في الفترة الزمنية المختارة.'
                  : 'مفيش مهام في الفترة الزمنية المختارة.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {timeframe !== 'all_time' && (
              <button
                type="button"
                onClick={() => setTimeframe('all_time')}
                className="min-h-[38px] whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                عرض كل الوقت
              </button>
            )}
            {scope !== 'all' && tasks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setScope('all');
                  setTimeframe('all_time');
                }}
                className="min-h-[38px] whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                عرض كل المهام ({tasks.length})
              </button>
            )}
            <button
              type="button"
              onClick={onQuickAddTask}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-4 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>ضيف مهمة بتصنيف</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Clean 3-Column KPI Strip (flat hairline dividers, no nested cards) */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 border-b border-slate-100 pb-4 dark:divide-slate-700/80 dark:border-slate-700">
            <div className="pe-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">أكتر مجال تركيز</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {activeBucket?.label ?? '—'}
                {activeBucket && (
                  <span className="ms-1.5 font-mono text-xs font-semibold text-accent">
                    {activeBucket.sharePercent}%
                  </span>
                )}
              </p>
            </div>
            <div className="px-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {scope === 'completed'
                  ? 'مهام منجزة'
                  : scope === 'active'
                    ? 'مهام مفتوحة'
                    : 'إجمالي المهام'}
              </p>
              <p className="mt-1 font-mono text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {summary.totalTasksInScope}
              </p>
            </div>
            <div className="ps-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">تصنيفات نشطة</p>
              <p className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {summary.activeTagCount}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
            {/* Donut Chart + Interactive Ranked Tag Breakdown */}
            <div className="flex flex-col items-center gap-4 sm:flex-row lg:col-span-5 lg:flex-col lg:border-e lg:border-slate-100 lg:pe-6 dark:lg:border-slate-700">
              <div className="relative h-44 w-44 shrink-0" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.buckets}
                      dataKey="total"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={72}
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                      paddingAngle={summary.buckets.length > 1 ? 2.5 : 0}
                      onClick={(_data, index) => {
                        const clicked = summary.buckets[index];
                        if (!clicked) return;
                        setSelectedTag((prev) => (prev === clicked.tag ? null : clicked.tag));
                      }}
                    >
                      {summary.buckets.map((entry) => (
                        <Cell
                          key={entry.tag}
                          fill={entry.color}
                          fillOpacity={
                            !selectedTag || selectedTag === entry.tag ? 1 : 0.35
                          }
                          className="cursor-pointer outline-none"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<TagPieTooltip scope={scope} />} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                  <span className="max-w-full truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {activeBucket?.label ?? '—'}
                  </span>
                  <span className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-accent">
                    {activeBucket ? `${activeBucket.sharePercent}%` : '0%'}
                  </span>
                </div>
              </div>

              <div className="w-full max-w-[270px] divide-y divide-slate-100 text-xs dark:divide-slate-700/70">
                {summary.buckets.slice(0, 6).map((bucket) => {
                  const isFocused = selectedTag === bucket.tag;
                  return (
                    <button
                      key={bucket.tag}
                      type="button"
                      onClick={() =>
                        setSelectedTag((prev) => (prev === bucket.tag ? null : bucket.tag))
                      }
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-start transition-colors ${
                        isFocused
                          ? 'bg-slate-100/90 dark:bg-slate-700/60'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-xs"
                          style={{backgroundColor: bucket.color}}
                        />
                        <span className="truncate">{bucket.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                        {bucket.total} ({bucket.sharePercent}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Horizontal Bar Chart: Completed Focus or Completed vs Remaining */}
            <div className="lg:col-span-7">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {scope === 'completed'
                    ? 'عدد المهام المنجزة في كل تصنيف'
                    : 'حجم المهام وإنجازها داخل كل تصنيف'}
                </span>
                {scope === 'completed' ? (
                  <span className="tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                    اضغط على أي تصنيف لتمييزه
                  </span>
                ) : (
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
                )}
              </div>

              <div style={{height: barChartHeight}} className="w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topBuckets}
                    layout="vertical"
                    margin={{top: 4, right: 12, left: 6, bottom: 4}}
                    barCategoryGap="24%"
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#94a3b8"
                      strokeOpacity={0.22}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{fontSize: 11, fill: '#64748b'}}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={88}
                      tick={{fontSize: 11, fill: '#64748b'}}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{fill: 'rgba(148, 163, 184, 0.12)'}}
                      content={<TagBarTooltip scope={scope} />}
                    />
                    {scope === 'completed' ? (
                      <Bar
                        dataKey="completed"
                        name="منجزة"
                        radius={[0, 6, 6, 0]}
                        maxBarSize={22}
                      >
                        {topBuckets.map((entry) => (
                          <Cell
                            key={entry.tag}
                            fill={entry.color}
                            fillOpacity={
                              !selectedTag || selectedTag === entry.tag ? 1 : 0.35
                            }
                          />
                        ))}
                      </Bar>
                    ) : (
                      <>
                        <Bar
                          dataKey="completed"
                          name="منجزة"
                          stackId="tag-stack"
                          fill="#10b981"
                          radius={[0, 0, 0, 0]}
                          maxBarSize={20}
                        />
                        <Bar
                          dataKey="remaining"
                          name="متبقية"
                          stackId="tag-stack"
                          fill="#f59e0b"
                          radius={[0, 5, 5, 0]}
                          maxBarSize={20}
                        />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
