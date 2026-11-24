import React, {useEffect, useMemo, useState} from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowUpLeft,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {FilterDropdown, type FilterDropdownOption} from '../components/FilterDropdown';
import {useLife} from '../context/LifeContext';
import {normalizeSearchText} from '../storage/globalSearch';
import {formatFriendlyDate} from '../storage/localStore';
import {
  DEFAULT_AUTO_ARCHIVE_DAYS,
  formatArchiveDate,
  getTaskCompletionTimestamp,
} from '../storage/taskArchive';

type ArchiveSortOrder = 'archived_desc' | 'archived_asc' | 'completed_desc';

export const ArchiveView: React.FC = () => {
  const {
    tasks,
    archivedTasks,
    preferences,
    focusedItem,
    clearFocusedItem,
    setActiveSection,
    restoreArchivedTask,
    restoreAllArchivedTasks,
    deleteTask,
    clearArchive,
    runAutoArchiveNow,
  } = useLife();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('الكل');
  const [sortOrder, setSortOrder] = useState<ArchiveSortOrder>('archived_desc');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const archiveDays = preferences.autoArchiveDays ?? DEFAULT_AUTO_ARCHIVE_DAYS;
  const activeCompletedCount = useMemo(
    () => tasks.filter((t) => t.status === 'خلصت').length,
    [tasks],
  );

  useEffect(() => {
    if (!focusedItem || focusedItem.section !== 'archive') return;
    setSearchQuery('');
    setSelectedTag('الكل');
    setHighlightedId(focusedItem.id);
    clearFocusedItem();

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`life-item-${focusedItem.id}`)
        ?.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
    const timer = window.setTimeout(() => setHighlightedId(null), 2600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusedItem, clearFocusedItem]);

  const archiveTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of archivedTasks) {
      for (const tag of task.tags ?? []) {
        const clean = tag.trim();
        if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [archivedTasks]);

  const archiveUntaggedCount = useMemo(
    () => archivedTasks.filter((t) => (t.tags ?? []).length === 0).length,
    [archivedTasks],
  );

  const effectiveTag =
    selectedTag === 'الكل' ||
    selectedTag === 'من غير تصنيف' ||
    archiveTags.some(([tag]) => tag === selectedTag)
      ? selectedTag
      : 'الكل';

  const archiveFilterOptions: FilterDropdownOption[] = useMemo(() => {
    const opts: FilterDropdownOption[] = [
      {value: 'الكل', label: 'الكل', count: archivedTasks.length},
      ...archiveTags.map(([tag, count]) => ({
        value: tag,
        label: tag,
        count,
      })),
    ];
    if (archiveUntaggedCount > 0 || effectiveTag === 'من غير تصنيف') {
      opts.push({
        value: 'من غير تصنيف',
        label: 'من غير تصنيف',
        count: archiveUntaggedCount,
      });
    }
    return opts;
  }, [archivedTasks.length, archiveTags, archiveUntaggedCount, effectiveTag]);

  const filteredTasks = useMemo(() => {
    const normQuery = normalizeSearchText(searchQuery);
    const list = archivedTasks.filter((task) => {
      if (effectiveTag === 'من غير تصنيف') {
        if ((task.tags ?? []).length > 0) return false;
      } else if (effectiveTag !== 'الكل' && !(task.tags ?? []).includes(effectiveTag)) {
        return false;
      }
      if (!normQuery) return true;
      const haystack = normalizeSearchText(
        [task.title, task.priority, ...(task.tags ?? [])].join(' '),
      );
      return haystack.includes(normQuery);
    });

    return [...list].sort((a, b) => {
      if (sortOrder === 'archived_asc') {
        return (a.archivedAt ?? a.updatedAt) - (b.archivedAt ?? b.updatedAt);
      }
      if (sortOrder === 'completed_desc') {
        const cA = getTaskCompletionTimestamp(a) ?? a.updatedAt;
        const cB = getTaskCompletionTimestamp(b) ?? b.updatedAt;
        return cB - cA;
      }
      return (b.archivedAt ?? b.updatedAt) - (a.archivedAt ?? a.updatedAt);
    });
  }, [archivedTasks, effectiveTag, searchQuery, sortOrder]);

  const handleRunAutoArchive = () => {
    const count = runAutoArchiveNow();
    if (count > 0) {
      setStatusMessage(`تم أرشفة ${count} مهام منتهية منذ أكثر من ${archiveDays} يوماً.`);
    } else {
      setStatusMessage(
        `لا توجد مهام منتهية منذ أكثر من ${archiveDays} يوماً تحتاج للأرشفة حالياً.`,
      );
    }
  };

  const handleRestore = (id: string, title: string, reopen: boolean) => {
    restoreArchivedTask(id, reopen);
    setConfirmDeleteId(null);
    setStatusMessage(
      reopen
        ? `تمت استعادة «${title}» وإعادة فتحها في مهامي.`
        : `تمت استعادة «${title}» إلى صفحة مهامي.`,
    );
  };

  const handlePermanentDelete = (id: string, title: string) => {
    deleteTask(id);
    setConfirmDeleteId(null);
    setStatusMessage(`تم حذف «${title}» نهائياً من الأرشيف.`);
  };

  const handleRestoreAll = () => {
    const count = archivedTasks.length;
    if (count === 0) return;
    restoreAllArchivedTasks();
    setConfirmClearAll(false);
    setStatusMessage(`تمت استعادة كل المهام المؤرشفة (${count}) إلى صفحة مهامي.`);
  };

  const handleClearAll = () => {
    const count = archivedTasks.length;
    clearArchive();
    setConfirmClearAll(false);
    setStatusMessage(`تم تفريغ الأرشيف وحذف ${count} مهام نهائياً.`);
  };

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            <Archive className="h-5 w-5 text-accent" />
            <span>الأرشيف</span>
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {preferences.autoArchiveEnabled
              ? `المهام المنتهية منذ أكتر من ${archiveDays} يوماً بتتنقل هنا تلقائياً بدل حذفها نهائياً.`
              : 'الأرشفة التلقائية متوقفة حالياً من الإعدادات، وتقدر تأرشف المهام يدوياً من مهامي.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRunAutoArchive}
            className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5 text-accent" />
            <span>فحص الأرشفة الآن</span>
          </button>

          {archivedTasks.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleRestoreAll}
                className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <ArchiveRestore className="h-3.5 w-3.5 text-accent" />
                <span>استعادة الكل</span>
              </button>

              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-200 bg-white px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>تفريغ الأرشيف</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1 text-xs dark:border-red-900/60 dark:bg-red-950/40">
                  <span className="font-medium text-red-700 dark:text-red-300">حذف الكل نهائياً؟</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="min-h-[28px] rounded-lg bg-red-600 px-2.5 font-semibold text-white"
                  >
                    تأكيد
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="min-h-[28px] rounded-lg px-2 text-slate-600 hover:bg-white/60 dark:text-slate-300"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Status feedback banner */}
      {statusMessage && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200"
        >
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label="إغلاق الإشعار"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Flat 3-Column Overview Strip */}
      <section className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:divide-slate-700/80 dark:border-slate-800 dark:bg-slate-800/90">
        <div className="pe-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">مهام في الأرشيف</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {archivedTasks.length}
          </p>
        </div>
        <div className="px-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">قاعدة الأرشفة</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-accent">
            {preferences.autoArchiveEnabled ? `${archiveDays} يوم` : 'يدوي'}
          </p>
        </div>
        <div className="ps-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">منتهية في مهامي</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {activeCompletedCount}
          </p>
        </div>
      </section>

      {/* Search, Compact Archive Filter Dropdown & Sort Controls */}
      {archivedTasks.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-800/90">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 start-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="دوّر في المهام المؤرشفة أو التصنيفات..."
                className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 ps-8 pe-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <FilterDropdown
              label="العرض"
              value={effectiveTag}
              options={archiveFilterOptions}
              onChange={setSelectedTag}
              icon={<Tag className="h-3.5 w-3.5 text-accent" />}
              ariaLabel="فلتر عرض الأرشيف"
            />

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as ArchiveSortOrder)}
              aria-label="ترتيب المهام المؤرشفة"
              className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="archived_desc">الأحدث أرشفة</option>
              <option value="archived_asc">الأقدم أرشفة</option>
              <option value="completed_desc">الأحدث إنجازاً</option>
            </select>
          </div>
        </div>
      )}

      {/* Archived Tasks List or Empty State */}
      {archivedTasks.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-800/90">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-accent dark:bg-slate-900">
            <Archive className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            الأرشيف فاضي حالياً
          </h2>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            أي مهمة تخلصها ويعدّي عليها أكتر من {archiveDays} يوماً هتتنقل هنا تلقائياً عشان تفضل
            قائمة مهامك خفيفة ومنظمة من غير ما تخسر سجل إنجازاتك. وتقدر كمان تنقل أي مهمة منتهية
            للأرشيف يدوياً من صفحة مهامي.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('tasks')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-white"
            >
              <span>افتح مهامي</span>
              <ArrowUpLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('settings')}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              إعدادات الأرشفة التلقائية
            </button>
          </div>
        </section>
      ) : filteredTasks.length === 0 ? (
        <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-400">
          <p>مفيش مهام مؤرشفة مطابقة للبحث أو التصنيف ده.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedTag('الكل');
            }}
            className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            عرض كل الأرشيف ({archivedTasks.length})
          </button>
        </section>
      ) : (
        <section className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white dark:divide-slate-700 dark:border-slate-800 dark:bg-slate-800/90">
          {filteredTasks.map((task) => {
            const completedTs = getTaskCompletionTimestamp(task);
            const isConfirmingDelete = confirmDeleteId === task.id;
            const isHighlighted = highlightedId === task.id;

            return (
              <div
                key={task.id}
                id={`life-item-${task.id}`}
                className={`flex flex-wrap items-center justify-between gap-3 p-4 transition-colors ${
                  isHighlighted ? 'bg-accent-soft/60 ring-2 ring-inset ring-accent' : ''
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {task.title}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      <span>{task.priority}</span>
                      <span aria-hidden="true">·</span>
                      <span>اكتملت {formatArchiveDate(completedTs)}</span>
                      <span aria-hidden="true">·</span>
                      <span>أُرشفت {formatArchiveDate(task.archivedAt)}</span>
                      {task.dueDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>ميعادها {formatFriendlyDate(task.dueDate)}</span>
                        </>
                      )}
                      {(task.tags ?? []).length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-accent">
                            {task.tags.map((t) => `#${t}`).join(' · ')}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {isConfirmingDelete ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-red-600 dark:text-red-400">
                      حذف نهائي؟
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePermanentDelete(task.id, task.title)}
                      className="min-h-[34px] rounded-lg bg-red-600 px-3 font-semibold text-white"
                    >
                      احذف
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRestore(task.id, task.title, false)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      <span>استعادة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestore(task.id, task.title, true)}
                      className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-accent dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>فتحها تاني</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(task.id)}
                      aria-label={`حذف ${task.title} نهائياً`}
                      title="حذف نهائي"
                      className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
};
