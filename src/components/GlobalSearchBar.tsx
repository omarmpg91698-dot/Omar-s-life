import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowUpLeft,
  CheckCircle2,
  CheckSquare,
  Circle,
  FileBadge2,
  FileText,
  Plus,
  Search,
  Target,
  X,
} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {
  searchAllLifeItems,
  type GlobalSearchResult,
  type SearchFilterKind,
} from '../storage/globalSearch';
import {formatFriendlyDate, formatReminderTime} from '../storage/localStore';
import {isTaskArchived} from '../storage/taskArchive';

interface GlobalSearchBarProps {
  onQuickCreateFromQuery?: (kind: 'task' | 'note', query: string) => void;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({onQuickCreateFromQuery}) => {
  const {allTasks, notes, documents, goals, updateTask, navigateToItem} = useLife();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilterKind>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const hasQuery = query.trim().length > 0;

  const {results, counts} = useMemo(
    () => searchAllLifeItems({tasks: allTasks, notes, documents, goals}, query, filter),
    [allTasks, notes, documents, goals, query, filter],
  );

  // Reset active highlight when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query, filter]);

  // Global keyboard shortcut: Ctrl+K / Cmd+K or '/' focuses search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const isEditable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          Boolean(target?.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          inputRef.current?.focus();
          setIsOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const openResult = (item: GlobalSearchResult) => {
    const section =
      item.kind === 'task'
        ? item.task && isTaskArchived(item.task)
          ? 'archive'
          : 'tasks'
        : item.kind === 'note'
          ? 'notes'
          : item.kind === 'document'
            ? 'documents'
            : 'goals';
    setIsOpen(false);
    setQuery('');
    navigateToItem(section, item.id);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query) {
        setQuery('');
      } else {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (!hasQuery || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) openResult(target);
    }
  };

  const totalItems = allTasks.length + notes.length + documents.length + goals.length;
  const showDropdown = isOpen && hasQuery;

  const filterTabs: Array<{id: SearchFilterKind; label: string; count: number}> = [
    {id: 'all', label: 'الكل', count: counts.all},
    {id: 'task', label: 'مهام', count: counts.task},
    {id: 'note', label: 'ملاحظات', count: counts.note},
    {id: 'document', label: 'وثائق', count: counts.document},
    {id: 'goal', label: 'أهداف ومشاريع', count: counts.goal},
  ];

  return (
    <div ref={containerRef} className="relative z-20">
      <div
        className={`flex items-center gap-2.5 rounded-2xl border bg-white px-4 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors dark:bg-slate-800/90 ${
          isOpen
            ? 'border-accent ring-2 ring-accent/15'
            : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
          aria-label="بحث شامل في المهام والملاحظات والوثائق والأهداف"
          placeholder={`ابحث فوراً في مهامك وملاحظاتك ووثائقك (${totalItems} عنصر)...`}
          className="min-h-[38px] w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
        />

        {hasQuery ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('all');
              inputRef.current?.focus();
            }}
            aria-label="مسح البحث"
            className="flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span
            dir="ltr"
            aria-hidden="true"
            className="hidden shrink-0 font-mono text-[11px] text-slate-400 sm:inline dark:text-slate-500"
          >
            Ctrl K
          </span>
        )}
      </div>

      {/* Instant Search Results Dropdown */}
      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="نتائج البحث الشامل"
          className="absolute start-0 end-0 top-full mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {/* Filter Tabs Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1" role="tablist">
              {filterTabs.map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(tab.id)}
                    className={`inline-flex min-h-[32px] items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-accent text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        active ? 'text-white/90' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <span className="hidden text-[11px] text-slate-400 sm:inline dark:text-slate-500">
              استخدم ↑ ↓ و Enter للفتح السريع
            </span>
          </div>

          {results.length === 0 ? (
            <div className="space-y-3 px-4 py-6 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                مفيش نتايج مطابقة لـ «<strong className="font-semibold">{query.trim()}</strong>»
                {filter !== 'all' && counts.all > 0 ? ' في القسم ده.' : '.'}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {filter !== 'all' && counts.all > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className="min-h-[36px] rounded-xl border border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:text-slate-200"
                  >
                    عرض كل النتايج ({counts.all})
                  </button>
                )}

                {onQuickCreateFromQuery && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const q = query.trim();
                        setIsOpen(false);
                        setQuery('');
                        onQuickCreateFromQuery('task', q);
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-semibold text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>إضافة كمهمة جديدة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const q = query.trim();
                        setIsOpen(false);
                        setQuery('');
                        onQuickCreateFromQuery('note', q);
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>إضافة كملاحظة</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="max-h-[380px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {results.slice(0, 20).map((item, idx) => {
                const isSelected = idx === activeIndex;
                const isTaskDone = item.task?.status === 'خلصت';

                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-accent-soft/50 dark:bg-slate-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {/* Left Icon / Quick Task Toggle */}
                    {item.task ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTask(item.task!.id, {
                            status: isTaskDone ? 'لسه' : 'خلصت',
                          });
                        }}
                        aria-label={isTaskDone ? `إرجاع ${item.title}` : `تعليم ${item.title} خلصت`}
                        className={`flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                          isTaskDone
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : 'border-slate-200 bg-white text-slate-400 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900'
                        }`}
                      >
                        {isTaskDone ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-accent dark:bg-slate-800">
                        {item.kind === 'note' ? (
                          <FileText className="h-4 w-4" />
                        ) : item.kind === 'document' ? (
                          <FileBadge2 className="h-4 w-4" />
                        ) : (
                          <Target className="h-4 w-4" />
                        )}
                      </div>
                    )}

                    {/* Clickable Item Body */}
                    <button
                      type="button"
                      onClick={() => openResult(item)}
                      className="min-w-0 flex-1 text-start"
                    >
                      <p
                        className={`truncate text-sm font-semibold ${
                          isTaskDone
                            ? 'text-slate-400 line-through dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {item.title}
                      </p>

                      {item.snippet && (
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {item.snippet}
                        </p>
                      )}

                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        {item.task && (
                          <>
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                              <CheckSquare className="h-3 w-3 text-accent" />
                              {isTaskArchived(item.task) ? 'مهمة مؤرشفة' : 'مهمة'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                item.task.priority === 'مهم'
                                  ? 'font-medium text-red-600 dark:text-red-400'
                                  : item.task.priority === 'متوسط'
                                    ? 'font-medium text-amber-700 dark:text-amber-400'
                                    : ''
                              }
                            >
                              {item.task.priority}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatFriendlyDate(item.task.dueDate)}</span>
                            {item.task.reminderTime && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">
                                  {formatReminderTime(item.task.reminderTime)}
                                </span>
                              </>
                            )}
                            {(item.task.tags ?? []).length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-medium text-accent">
                                  {item.task.tags.map((t) => `#${t}`).join(' ')}
                                </span>
                              </>
                            )}
                          </>
                        )}

                        {item.note && (
                          <>
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              ملاحظة
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.note.category}</span>
                            {item.note.images.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{item.note.images.length} صور مرفقة</span>
                              </>
                            )}
                          </>
                        )}

                        {item.document && (
                          <>
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              وثيقة
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.document.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>تنتهي {formatFriendlyDate(item.document.expiryDate)}</span>
                          </>
                        )}

                        {item.goal && (
                          <>
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {item.goal.kind}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-semibold text-accent">
                              {item.goal.progress}%
                            </span>
                            {item.goal.targetDate && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{formatFriendlyDate(item.goal.targetDate)}</span>
                              </>
                            )}
                          </>
                        )}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => openResult(item)}
                      aria-label={`فتح ${item.title}`}
                      className="flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-accent dark:hover:bg-slate-900"
                    >
                      <ArrowUpLeft className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
