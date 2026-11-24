import React, {useEffect, useMemo, useState} from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  FolderKanban,
  Link2,
  Pencil,
  Plus,
  Target,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {
  GOAL_COLOR_OPTIONS,
  getGoalStatusLabel,
  getTargetDateCountdown,
  resolveGoalPalette,
} from '../storage/goalTheme';
import {formatFriendlyDate, getTodayIso} from '../storage/localStore';
import {computeGoalLinkedProgress} from '../storage/productivityUtils';
import type {GoalColor, GoalKind, GoalProjectItem} from '../types';

type GoalSortKey = 'newest' | 'progress_desc' | 'progress_asc' | 'target_soon';

interface ColorPickerRowProps {
  value: GoalColor;
  onChange: (color: GoalColor) => void;
  label?: string;
}

const ColorPickerRow: React.FC<ColorPickerRowProps> = ({
  value,
  onChange,
  label = 'لون شريط التقدم',
}) => {
  const selectedOption = GOAL_COLOR_OPTIONS.find((o) => o.id === value) ?? GOAL_COLOR_OPTIONS[0];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-slate-500 dark:text-slate-400">{selectedOption.label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
        {GOAL_COLOR_OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => onChange(opt.id)}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95 ${opt.swatch} ${
                active
                  ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900'
                  : 'opacity-80 hover:opacity-100'
              }`}
            >
              {active && <Check className="h-4 w-4 text-white drop-shadow-xs" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const GoalsProjectsView: React.FC = () => {
  const {
    goals,
    allTasks,
    preferences,
    addTask,
    updateTask,
    addGoal,
    updateGoal,
    deleteGoal,
    focusedItem,
    clearFocusedItem,
  } = useLife();

  const [highlightedGoalId, setHighlightedGoalId] = useState<string | null>(null);
  const [linkedTaskInputs, setLinkedTaskInputs] = useState<Record<string, string>>({});
  const [isAddFormOpen, setIsAddFormOpen] = useState<boolean>(() => goals.length === 0);

  const [kind, setKind] = useState<GoalKind>('هدف');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [color, setColor] = useState<GoalColor>('auto');
  const [errorMsg, setErrorMsg] = useState('');

  const [kindFilter, setKindFilter] = useState<'الكل' | GoalKind>('الكل');
  const [sortKey, setSortKey] = useState<GoalSortKey>('newest');

  const [editing, setEditing] = useState<GoalProjectItem | null>(null);
  const [editKind, setEditKind] = useState<GoalKind>('هدف');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [editProgress, setEditProgress] = useState(0);
  const [editColor, setEditColor] = useState<GoalColor>('auto');

  const todayIso = getTodayIso();

  useEffect(() => {
    if (goals.length === 0) {
      setIsAddFormOpen(true);
    }
  }, [goals.length]);

  useEffect(() => {
    if (!focusedItem || focusedItem.section !== 'goals') return;
    setKindFilter('الكل');
    setHighlightedGoalId(focusedItem.id);
    clearFocusedItem();

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`life-item-${focusedItem.id}`)
        ?.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
    const timer = window.setTimeout(() => setHighlightedGoalId(null), 2600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusedItem, clearFocusedItem]);

  const enrichedGoals = useMemo(() => {
    return goals.map((item) => {
      const linkedTasks = allTasks.filter((t) => t.goalId === item.id);
      const linkedStats = computeGoalLinkedProgress(item.id, allTasks);
      const effectiveProgress =
        linkedStats.percent !== null ? linkedStats.percent : item.progress;
      return {item, linkedTasks, linkedStats, effectiveProgress};
    });
  }, [goals, allTasks]);

  const summary = useMemo(() => {
    const total = enrichedGoals.length;
    const goalsCount = enrichedGoals.filter((g) => g.item.kind === 'هدف').length;
    const projectsCount = total - goalsCount;
    const completedCount = enrichedGoals.filter((g) => g.effectiveProgress >= 100).length;
    const avgProgress =
      total === 0
        ? 0
        : Math.round(
            enrichedGoals.reduce((sum, g) => sum + g.effectiveProgress, 0) / total,
          );
    return {total, goalsCount, projectsCount, completedCount, avgProgress};
  }, [enrichedGoals]);

  const displayedGoals = useMemo(() => {
    const filtered = enrichedGoals.filter((entry) =>
      kindFilter === 'الكل' ? true : entry.item.kind === kindFilter,
    );
    return [...filtered].sort((a, b) => {
      if (sortKey === 'progress_desc') {
        return b.effectiveProgress - a.effectiveProgress || b.item.updatedAt - a.item.updatedAt;
      }
      if (sortKey === 'progress_asc') {
        return a.effectiveProgress - b.effectiveProgress || b.item.updatedAt - a.item.updatedAt;
      }
      if (sortKey === 'target_soon') {
        const aDate = a.item.targetDate || '9999-12-31';
        const bDate = b.item.targetDate || '9999-12-31';
        return aDate.localeCompare(bDate) || b.item.updatedAt - a.item.updatedAt;
      }
      return b.item.createdAt - a.item.createdAt;
    });
  }, [enrichedGoals, kindFilter, sortKey]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('اكتب اسم الهدف أو المشروع الأول.');
      return;
    }
    setErrorMsg('');
    addGoal({
      kind,
      title: title.trim(),
      description: description.trim(),
      targetDate: targetDate || null,
      progress,
      color,
    });
    setTitle('');
    setDescription('');
    setTargetDate('');
    setProgress(0);
    setColor('auto');
    setIsAddFormOpen(false);
  };

  const openEdit = (item: GoalProjectItem) => {
    setEditing(item);
    setEditKind(item.kind);
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditTargetDate(item.targetDate ?? '');
    setEditProgress(item.progress);
    setEditColor(item.color ?? 'auto');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editTitle.trim()) return;
    updateGoal(editing.id, {
      kind: editKind,
      title: editTitle.trim(),
      description: editDescription.trim(),
      targetDate: editTargetDate || null,
      progress: editProgress,
      color: editColor,
    });
    setEditing(null);
  };

  const avgPalette = resolveGoalPalette(summary.avgProgress, 'auto');
  const formPreviewPalette = resolveGoalPalette(progress, color);
  const editingLinkedStats = editing ? computeGoalLinkedProgress(editing.id, allTasks) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            أهدافي ومشاريعي
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.total === 0
              ? 'ابدأ بسرد أهدافك ومشاريعك وتابع تقدمك فيها'
              : `${summary.goalsCount} هدف · ${summary.projectsCount} مشروع`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddFormOpen((prev) => !prev)}
          aria-expanded={isAddFormOpen}
          className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-colors"
        >
          {isAddFormOpen ? (
            <>
              <ChevronUp className="h-4 w-4 shrink-0" />
              <span>إخفاء النموذج</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 shrink-0" />
              <span>هدف أو مشروع جديد</span>
            </>
          )}
        </button>
      </div>

      {/* Overview Stats Strip */}
      {summary.total > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
            <p className="text-xs text-slate-500 dark:text-slate-400">إجمالي البطاقات</p>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {summary.total}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {summary.goalsCount} هدف · {summary.projectsCount} مشروع
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">متوسط الإنجاز الكلي</p>
              <span className={`font-mono text-lg font-bold tabular-nums ${avgPalette.text}`}>
                {summary.avgProgress}%
              </span>
            </div>
            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80">
              <div
                className={`h-full rounded-full transition-all duration-300 ${avgPalette.bar}`}
                style={{width: `${summary.avgProgress}%`}}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
            <p className="text-xs text-slate-500 dark:text-slate-400">مكتملة بالكامل</p>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {summary.completedCount}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                من أصل {summary.total}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Add Goal/Project Form */}
      {isAddFormOpen && (
        <form
          onSubmit={handleAdd}
          className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90"
        >
          <div className={`h-1.5 w-full ${formPreviewPalette.ribbon}`} />
          <div className="space-y-3.5 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                إضافة هدف أو مشروع جديد
              </h2>
              {summary.total > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  aria-label="إغلاق النموذج"
                  className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as GoalKind)}
                aria-label="النوع"
                className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
              >
                <option value="هدف">هدف</option>
                <option value="مشروع">مشروع</option>
              </select>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="عايز تحقق إيه أو تبدأ مشروع إيه؟"
                className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-7"
              />
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                aria-label="التاريخ المستهدف"
                className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
              />
            </div>

            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف بسيط أو الخطوة الجاية (اختياري)"
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />

            <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    التقدم المبدئي · {getGoalStatusLabel(progress)}
                  </span>
                  <span className={`font-mono font-bold tabular-nums ${formPreviewPalette.text}`}>
                    {progress}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${formPreviewPalette.bar}`}
                    style={{width: `${progress}%`}}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  aria-label="التقدم المبدئي"
                  style={{accentColor: formPreviewPalette.hex}}
                  className="w-full"
                />
              </div>

              <ColorPickerRow value={color} onChange={setColor} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/80">
              {errorMsg ? (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">{errorMsg}</p>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  تقدر تربط مهام بالهدف بعد الحفظ عشان التقدم يتحسب تلقائياً.
                </span>
              )}

              <button
                type="submit"
                className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>حفظ البطاقة</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter & Sort Bar */}
      {summary.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-800">
            {(
              [
                {key: 'الكل', label: `الكل (${summary.total})`},
                {key: 'هدف', label: `أهداف (${summary.goalsCount})`},
                {key: 'مشروع', label: `مشاريع (${summary.projectsCount})`},
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setKindFilter(tab.key)}
                className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors tabular-nums ${
                  kindFilter === tab.key
                    ? 'bg-accent text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="goals-sort-select"
              className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              ترتيب حسب
            </label>
            <div className="relative">
              <select
                id="goals-sort-select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as GoalSortKey)}
                className="min-h-[38px] appearance-none rounded-xl border border-slate-200 bg-white pe-8 ps-3 text-xs font-medium text-slate-700 outline-none focus:border-accent dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="newest">الأحدث</option>
                <option value="progress_desc">الأعلى إنجازاً</option>
                <option value="progress_asc">الأقل إنجازاً</option>
                <option value="target_soon">الأقرب ميعاداً</option>
              </select>
              <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>
      )}

      {/* Goals & Projects Card Grid */}
      {displayedGoals.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-800/90">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Target className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {summary.total === 0
              ? 'مفيش أهداف أو مشاريع متسجلة لسه'
              : 'مفيش بطاقات في القسم ده دلوقتي'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.total === 0
              ? 'ضيف أول هدف أو مشروع فوق، اختار لونه، وتابع تقدمك خطوة بخطوة.'
              : 'جرّب تغير الفلتر لـ "الكل" أو ضيف بطاقة جديدة.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {displayedGoals.map(({item, linkedTasks, linkedStats, effectiveProgress}) => {
            const palette = resolveGoalPalette(effectiveProgress, item.color);
            const statusLabel = getGoalStatusLabel(effectiveProgress);
            const countdown = getTargetDateCountdown(
              item.targetDate,
              effectiveProgress,
              todayIso,
            );
            const isCompleted = effectiveProgress >= 100;

            const handleQuickAddLinkedTask = (e: React.FormEvent) => {
              e.preventDefault();
              const clean = (linkedTaskInputs[item.id] ?? '').trim();
              if (!clean) return;
              addTask({
                title: clean,
                dueDate: item.targetDate || getTodayIso(),
                priority: preferences.defaultPriority,
                goalId: item.id,
              });
              setLinkedTaskInputs((prev) => ({...prev, [item.id]: ''}));
            };

            return (
              <article
                key={item.id}
                id={`life-item-${item.id}`}
                className={`group flex flex-col justify-between overflow-hidden rounded-2xl border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all hover:shadow-md dark:bg-slate-800/90 ${
                  highlightedGoalId === item.id
                    ? `border-accent ring-2 ${palette.ring}`
                    : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                {/* Top Colorful Ribbon */}
                <div className={`h-1.5 w-full ${palette.ribbon}`} />

                <div className="flex flex-1 flex-col justify-between p-5">
                  {/* Top Content: Header + Description + Progress */}
                  <div className="space-y-4">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${palette.iconBg}`}
                        >
                          {isCompleted ? (
                            <Trophy className="h-5 w-5" />
                          ) : item.kind === 'مشروع' ? (
                            <FolderKanban className="h-5 w-5" />
                          ) : (
                            <Target className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-slate-100 line-clamp-2">
                            {item.title}
                          </h3>
                          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                            <span>{item.kind}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatFriendlyDate(item.targetDate)}</span>
                            {countdown && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    countdown.isOverdue
                                      ? 'font-medium text-rose-600 dark:text-rose-400'
                                      : countdown.isUrgent
                                        ? 'font-medium text-amber-700 dark:text-amber-400'
                                        : ''
                                  }
                                >
                                  {countdown.label}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          aria-label={`تعديل ${item.title}`}
                          className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGoal(item.id)}
                          aria-label={`مسح ${item.title}`}
                          className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {item.description}
                      </p>
                    )}

                    {/* Colorful Progress Section */}
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0 text-xs">
                          <span className={`font-semibold ${palette.text}`}>{statusLabel}</span>
                          <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
                            {' '}
                            ·{' '}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {linkedStats.linkedCount > 0
                              ? `تلقائي (${linkedStats.doneCount}/${linkedStats.linkedCount} مهام)`
                              : 'تقدم يدوي'}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 font-mono text-xl font-bold leading-none tabular-nums ${palette.text}`}
                        >
                          {effectiveProgress}%
                        </span>
                      </div>

                      {/* Colorful Gradient Progress Bar with Subtle Milestone Markers */}
                      <div
                        role="progressbar"
                        aria-valuenow={effectiveProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`نسبة إنجاز ${item.title}`}
                        className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80"
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${palette.bar}`}
                          style={{width: `${effectiveProgress}%`}}
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 flex justify-evenly"
                        >
                          <span className="h-full w-px bg-white/40 dark:bg-slate-900/35" />
                          <span className="h-full w-px bg-white/40 dark:bg-slate-900/35" />
                          <span className="h-full w-px bg-white/40 dark:bg-slate-900/35" />
                        </div>
                      </div>

                      {isCompleted && (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>عاش! حققت ال{item.kind} بالكامل.</span>
                        </p>
                      )}

                      {/* Quick Manual Progress Controls (only when no linked tasks drive auto-progress) */}
                      {linkedStats.linkedCount === 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateGoal(item.id, {progress: Math.max(0, item.progress - 10)})
                            }
                            aria-label="تقليل التقدم ١٠٪"
                            className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 font-mono text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            -10%
                          </button>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={item.progress}
                            onChange={(e) =>
                              updateGoal(item.id, {progress: Number(e.target.value)})
                            }
                            aria-label={`تحديث نسبة إنجاز ${item.title}`}
                            style={{accentColor: palette.hex}}
                            className="min-w-0 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateGoal(item.id, {progress: Math.min(100, item.progress + 10)})
                            }
                            aria-label="زيادة التقدم ١٠٪"
                            className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 font-mono text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            +10%
                          </button>
                          {!isCompleted && (
                            <button
                              type="button"
                              onClick={() => updateGoal(item.id, {progress: 100})}
                              aria-label="تحديد كمكتمل ١٠٠٪"
                              className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                            >
                              تم
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Linked Tasks Section (clean hairline divider, no nested card box) */}
                  <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-3.5 dark:border-slate-700/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                        <Link2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                        <span>المهام المرتبطة</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {linkedStats.doneCount}/{linkedStats.linkedCount}
                      </span>
                    </div>

                    {linkedTasks.length > 0 && (
                      <div className="max-h-36 space-y-1 overflow-y-auto pe-0.5">
                        {linkedTasks.map((task) => {
                          const done = task.status === 'خلصت';
                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() =>
                                updateTask(task.id, {status: done ? 'لسه' : 'خلصت'})
                              }
                              className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2 py-1 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                            >
                              {done ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                              ) : (
                                <Circle className="h-4 w-4 shrink-0 text-slate-400" />
                              )}
                              <span
                                className={`truncate text-xs ${
                                  done
                                    ? 'text-slate-400 line-through dark:text-slate-500'
                                    : 'text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                {task.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <form onSubmit={handleQuickAddLinkedTask} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={linkedTaskInputs[item.id] ?? ''}
                        onChange={(e) =>
                          setLinkedTaskInputs((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder="أضف مهمة مرتبطة..."
                        className="min-h-[38px] min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        disabled={!(linkedTaskInputs[item.id] ?? '').trim()}
                        className="min-h-[38px] shrink-0 whitespace-nowrap rounded-xl bg-accent px-3 text-xs font-semibold text-white transition-colors disabled:opacity-40"
                      >
                        + مهمة
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setEditing(null)}
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div
              className={`h-1.5 w-full ${resolveGoalPalette(editProgress, editColor).ribbon}`}
            />
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  تعديل البطاقة
                </h2>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  aria-label="إغلاق"
                  className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3.5">
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={editKind}
                    onChange={(e) => setEditKind(e.target.value as GoalKind)}
                    aria-label="النوع"
                    className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="هدف">هدف</option>
                    <option value="مشروع">مشروع</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="col-span-2 min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="الوصف"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />

                <input
                  type="date"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                  aria-label="التاريخ المستهدف"
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />

                <ColorPickerRow value={editColor} onChange={setEditColor} />

                {editingLinkedStats && editingLinkedStats.linkedCount > 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    نسبة الإنجاز محسوبة تلقائياً من المهام المرتبطة ({editingLinkedStats.doneCount}/
                    {editingLinkedStats.linkedCount}).
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">
                        التقدم · {getGoalStatusLabel(editProgress)}
                      </span>
                      <strong
                        className={`font-mono tabular-nums ${
                          resolveGoalPalette(editProgress, editColor).text
                        }`}
                      >
                        {editProgress}%
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={editProgress}
                      onChange={(e) => setEditProgress(Number(e.target.value))}
                      style={{
                        accentColor: resolveGoalPalette(editProgress, editColor).hex,
                      }}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="min-h-[40px] whitespace-nowrap rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] whitespace-nowrap rounded-xl bg-accent px-5 text-xs font-semibold text-white"
                >
                  حفظ التعديل
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
