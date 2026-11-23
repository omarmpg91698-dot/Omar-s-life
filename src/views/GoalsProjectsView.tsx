import React, {useEffect, useState} from 'react';
import {Pencil, Plus, Target, Trash2, X} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {formatFriendlyDate} from '../storage/localStore';
import type {GoalKind, GoalProjectItem} from '../types';

export const GoalsProjectsView: React.FC = () => {
  const {goals, addGoal, updateGoal, deleteGoal, focusedItem, clearFocusedItem} = useLife();
  const [highlightedGoalId, setHighlightedGoalId] = useState<string | null>(null);

  const [kind, setKind] = useState<GoalKind>('هدف');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const [kindFilter, setKindFilter] = useState<'الكل' | GoalKind>('الكل');

  const [editing, setEditing] = useState<GoalProjectItem | null>(null);
  const [editKind, setEditKind] = useState<GoalKind>('هدف');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [editProgress, setEditProgress] = useState(0);

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
    });
    setTitle('');
    setDescription('');
    setTargetDate('');
    setProgress(0);
  };

  const openEdit = (item: GoalProjectItem) => {
    setEditing(item);
    setEditKind(item.kind);
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditTargetDate(item.targetDate ?? '');
    setEditProgress(item.progress);
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
    });
    setEditing(null);
  };

  const filtered = goals.filter((g) => (kindFilter === 'الكل' ? true : g.kind === kindFilter));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">أهدافي ومشاريعي</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {goals.length} هدف ومشروع
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-800">
          {(['الكل', 'هدف', 'مشروع'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors ${
                kindFilter === k
                  ? 'bg-accent text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {k === 'هدف' ? 'أهداف' : k === 'مشروع' ? 'مشاريع' : 'الكل'}
            </button>
          ))}
        </div>
      </div>

      {/* Add Goal/Project Form */}
      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as GoalKind)}
            aria-label="النوع"
            className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
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
            className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
          />
        </div>

        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="وصف بسيط (اختياري)"
          className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-600 dark:text-slate-300">
              التقدم المبدئي: <span className="font-mono font-bold tabular-nums">{progress}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-32 accent-[var(--accent)]"
            />
          </div>

          <button
            type="submit"
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة</span>
          </button>
        </div>

        {errorMsg && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{errorMsg}</p>
        )}
      </form>

      {/* Goals & Projects List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-400">
          مفيش أهداف أو مشاريع لسه. ضيف أول هدف أو مشروع فوق وابدأ تابع تقدمك.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              id={`life-item-${item.id}`}
              className={`flex flex-col justify-between rounded-2xl border bg-white p-4 transition-all dark:bg-slate-800/90 ${
                highlightedGoalId === item.id
                  ? 'border-accent ring-2 ring-accent/40'
                  : 'border-slate-200/80 dark:border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Target className="h-4 w-4 shrink-0 text-accent" />
                    <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      aria-label="تعديل"
                      className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGoal(item.id)}
                      aria-label="مسح"
                      className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{item.kind}</span>
                  <span aria-hidden="true"> · </span>
                  <span>الموعد المستهدف: {formatFriendlyDate(item.targetDate)}</span>
                </p>

                {item.description && (
                  <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300">
                    {item.description}
                  </p>
                )}
              </div>

              <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-700">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">نسبة الإنجاز</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-accent">
                    {item.progress}%
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{width: `${item.progress}%`}}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateGoal(item.id, {progress: Math.max(0, item.progress - 10)})}
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 font-mono text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      -10%
                    </button>
                    <button
                      type="button"
                      onClick={() => updateGoal(item.id, {progress: Math.min(100, item.progress + 10)})}
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 font-mono text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      +10%
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={item.progress}
                    onChange={(e) => updateGoal(item.id, {progress: Number(e.target.value)})}
                    aria-label="تحديث نسبة الإنجاز"
                    className="flex-1 accent-[var(--accent)]"
                  />
                </div>
              </div>
            </div>
          ))}
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
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">تعديل</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="إغلاق"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={editKind}
                  onChange={(e) => setEditKind(e.target.value as GoalKind)}
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
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  التقدم: <strong className="font-mono tabular-nums">{editProgress}%</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={editProgress}
                  onChange={(e) => setEditProgress(Number(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-xl bg-accent px-5 text-xs font-semibold text-white"
              >
                حفظ التعديل
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
