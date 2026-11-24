import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  FileBadge2,
  Folder,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {FilterDropdown, type FilterDropdownOption} from '../components/FilterDropdown';
import {useLife} from '../context/LifeContext';
import {
  DOCUMENT_REMINDER_LEAD_LABELS,
  DOCUMENT_REMINDER_SHORT_LABELS,
  getDocumentExpiryInfo,
} from '../storage/documentsAndReminders';
import {normalizeSearchText} from '../storage/globalSearch';
import {formatFriendlyDate, getOffsetIso, getTodayIso} from '../storage/localStore';
import type {DocumentCategory, DocumentItem, DocumentReminderLead} from '../types';

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'بطاقة وهوية',
  'جواز سفر',
  'رخصة',
  'عقد وإيجار',
  'تأمين',
  'أوراق رسمية',
  'أخرى',
];

const REMINDER_LEAD_OPTIONS: DocumentReminderLead[] = ['month', 'week', 'day'];

type DocumentStatusFilter = 'الكل' | 'due_soon' | 'expired' | 'active';

export const DocumentsView: React.FC = () => {
  const {
    documents,
    addDocument,
    updateDocument,
    deleteDocument,
    focusedItem,
    clearFocusedItem,
  } = useLife();

  const todayIso = getTodayIso();

  // Create form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('بطاقة وهوية');
  const [documentNumber, setDocumentNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState(() => getOffsetIso(90));
  const [reminderLead, setReminderLead] = useState<DocumentReminderLead>('month');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('الكل');
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>('الكل');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Edit modal state
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<DocumentCategory>('أوراق رسمية');
  const [editNumber, setEditNumber] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editReminderLead, setEditReminderLead] = useState<DocumentReminderLead>('month');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    if (!focusedItem || focusedItem.section !== 'documents') return;
    setSearchQuery('');
    setCategoryFilter('الكل');
    setStatusFilter('الكل');
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

  const enrichedDocs = useMemo(() => {
    return documents
      .map((doc) => ({
        doc,
        info: getDocumentExpiryInfo(doc, todayIso),
      }))
      .sort((a, b) => a.info.daysLeft - b.info.daysLeft);
  }, [documents, todayIso]);

  const alertDocs = useMemo(
    () => enrichedDocs.filter((item) => item.info.isReminderActive),
    [enrichedDocs],
  );

  const statusCounts = useMemo(() => {
    const counts = {expired: 0, due_soon: 0, active: 0};
    for (const item of enrichedDocs) {
      counts[item.info.state] += 1;
    }
    return counts;
  }, [enrichedDocs]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of enrichedDocs) {
      map.set(item.doc.category, (map.get(item.doc.category) ?? 0) + 1);
    }
    return map;
  }, [enrichedDocs]);

  const categoryOptions: FilterDropdownOption[] = useMemo(
    () => [
      {value: 'الكل', label: 'الكل', count: enrichedDocs.length},
      ...DOCUMENT_CATEGORIES.map((cat) => ({
        value: cat,
        label: cat,
        count: categoryCounts.get(cat) ?? 0,
      })),
    ],
    [categoryCounts, enrichedDocs.length],
  );

  const statusOptions: FilterDropdownOption[] = useMemo(
    () => [
      {value: 'الكل', label: 'الكل', count: enrichedDocs.length},
      {
        value: 'expired',
        label: 'منتهية',
        count: statusCounts.expired,
        dotClass: 'bg-red-500 dark:bg-red-400',
      },
      {
        value: 'due_soon',
        label: 'تذكير قريب',
        count: statusCounts.due_soon,
        dotClass: 'bg-amber-500 dark:bg-amber-400',
      },
      {
        value: 'active',
        label: 'سارية',
        count: statusCounts.active,
        dotClass: 'bg-emerald-500 dark:bg-emerald-400',
      },
    ],
    [enrichedDocs.length, statusCounts],
  );

  const filteredDocs = useMemo(() => {
    const normQuery = normalizeSearchText(searchQuery);
    return enrichedDocs.filter(({doc, info}) => {
      if (categoryFilter !== 'الكل' && doc.category !== categoryFilter) return false;
      if (statusFilter !== 'الكل' && info.state !== statusFilter) return false;
      if (!normQuery) return true;
      const hay = normalizeSearchText(
        [doc.title, doc.category, doc.documentNumber ?? '', doc.notes ?? '', doc.expiryDate].join(
          ' ',
        ),
      );
      return hay.includes(normQuery);
    });
  }, [enrichedDocs, categoryFilter, statusFilter, searchQuery]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('اكتب اسم الوثيقة الأول.');
      return;
    }
    if (!expiryDate) {
      setFormError('اختار تاريخ انتهاء الوثيقة.');
      return;
    }
    setFormError('');
    addDocument({
      title: title.trim(),
      category,
      documentNumber: documentNumber.trim(),
      expiryDate,
      reminderLead,
      notes: notes.trim(),
    });
    setTitle('');
    setDocumentNumber('');
    setNotes('');
    setReminderLead('month');
  };

  const startEdit = (doc: DocumentItem) => {
    setEditingDoc(doc);
    setEditTitle(doc.title);
    setEditCategory(doc.category);
    setEditNumber(doc.documentNumber ?? '');
    setEditExpiryDate(doc.expiryDate);
    setEditReminderLead(doc.reminderLead ?? 'month');
    setEditNotes(doc.notes ?? '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc || !editTitle.trim() || !editExpiryDate) return;
    updateDocument(editingDoc.id, {
      title: editTitle.trim(),
      category: editCategory,
      documentNumber: editNumber.trim(),
      expiryDate: editExpiryDate,
      reminderLead: editReminderLead,
      notes: editNotes.trim(),
    });
    setEditingDoc(null);
  };

  const hasFilters =
    categoryFilter !== 'الكل' || statusFilter !== 'الكل' || searchQuery.trim() !== '';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">وثائقي</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            احفظ أوراقك الرسمية واختار مدة التذكير لكل وثيقة (قبل شهر / أسبوع / يوم)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
          <span>الإجمالي {documents.length}</span>
          {alertDocs.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                تذكيرات نشطة {alertDocs.length}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Active Expiry Alerts Banner */}
      {alertDocs.length > 0 && (
        <section
          role="status"
          className="space-y-2 rounded-2xl border border-amber-200/90 bg-amber-50/80 p-4 dark:border-amber-900/60 dark:bg-amber-950/30"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {alertDocs.length === 1
                ? 'فيه وثيقة واحدة دخلت فترة التذكير أو انتهت:'
                : `فيه ${alertDocs.length} وثائق دخلت فترة التذكير أو انتهت:`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertDocs.slice(0, 5).map(({doc, info}) => (
              <span
                key={doc.id}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-medium ${
                  info.state === 'expired'
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300'
                    : 'border-amber-200 bg-white text-amber-800 dark:border-amber-800/60 dark:bg-slate-900/80 dark:text-amber-200'
                }`}
              >
                <span className="font-semibold">{doc.title}</span>
                <span aria-hidden="true">·</span>
                <span>{info.label}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Add Document Form */}
      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (formError) setFormError('');
            }}
            placeholder="اسم الوثيقة (مثلاً: البطاقة الشخصية، جواز السفر، رخصة العربية...)"
            className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-6"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            aria-label="تصنيف الوثيقة"
            className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
          >
            {DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            aria-label="تاريخ الانتهاء"
            className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-3"
          />
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          <input
            type="text"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            placeholder="رقم الوثيقة (اختياري)"
            className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-4"
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات أو مكان الحفظ (اختياري)"
            className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-8"
          />
        </div>

        {/* Per-document reminder lead time selector + Submit */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <Bell className="h-3.5 w-3.5 text-accent" />
              <span>فكرني قبل الانتهاء بـ:</span>
            </span>
            <div
              role="group"
              aria-label="مدة التذكير قبل انتهاء الوثيقة"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900"
            >
              {REMINDER_LEAD_OPTIONS.map((lead) => {
                const active = reminderLead === lead;
                return (
                  <button
                    key={lead}
                    type="button"
                    onClick={() => setReminderLead(lead)}
                    aria-pressed={active}
                    className={`min-h-[32px] rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-accent text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {DOCUMENT_REMINDER_SHORT_LABELS[lead]}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-accent px-5 text-xs font-semibold text-white whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>حفظ الوثيقة</span>
          </button>
        </div>

        {formError && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{formError}</p>
        )}
      </form>

      {/* Compact Filter Row */}
      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-800/90">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 start-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="دوّر في وثائقك أو أرقامها..."
              className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 ps-8 pe-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <FilterDropdown
            label="التصنيف"
            value={categoryFilter}
            options={categoryOptions}
            onChange={setCategoryFilter}
            icon={<Folder className="h-3.5 w-3.5 text-accent" />}
            ariaLabel="تصفية الوثائق بالتصنيف"
          />

          <FilterDropdown
            label="الحالة"
            value={statusFilter}
            options={statusOptions}
            onChange={(val) => setStatusFilter(val as DocumentStatusFilter)}
            icon={<Bell className="h-3.5 w-3.5 text-accent" />}
            ariaLabel="تصفية الوثائق بحالة الانتهاء"
          />

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('الكل');
                setStatusFilter('الكل');
              }}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5" />
              <span>مسح</span>
            </button>
          )}
        </div>
      )}

      {/* Documents List */}
      {filteredDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-800/90">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-accent dark:bg-slate-900">
            <FileBadge2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {documents.length === 0 ? 'مفيش وثائق مسجلة لسه' : 'مفيش وثائق مطابقة للفلتر ده'}
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            {documents.length === 0
              ? 'سجّل بطاقتك أو جواز السفر أو الرخصة فوق واختار يفكرك قبل الانتهاء بشهر أو أسبوع أو يوم.'
              : 'جرّب تغيّر التصنيف أو تمسح البحث.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white dark:divide-slate-700 dark:border-slate-800 dark:bg-slate-800/90">
          {filteredDocs.map(({doc, info}) => {
            const isHighlighted = highlightedId === doc.id;
            const isConfirmingDelete = confirmDeleteId === doc.id;
            return (
              <div
                key={doc.id}
                id={`life-item-${doc.id}`}
                className={`p-4 transition-colors ${
                  isHighlighted ? 'bg-accent-soft/70 ring-2 ring-inset ring-accent/50' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        info.state === 'expired'
                          ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                          : info.state === 'due_soon'
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                      }`}
                    >
                      {info.state === 'active' ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {doc.title}
                        </h2>
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                            info.state === 'expired'
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                              : info.state === 'due_soon'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          }`}
                        >
                          {info.label}
                        </span>
                      </div>

                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        <span className="font-medium text-accent">{doc.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          <span>ينتهي: {formatFriendlyDate(doc.expiryDate)}</span>
                        </span>
                        {doc.documentNumber && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span dir="ltr" className="font-mono text-slate-600 dark:text-slate-300">
                              #{doc.documentNumber}
                            </span>
                          </>
                        )}
                      </p>

                      {doc.notes && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {doc.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Per-document quick reminder lead selector + edit/delete */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
                      <Bell className="h-3.5 w-3.5 text-accent" />
                      <select
                        value={doc.reminderLead ?? 'month'}
                        onChange={(e) =>
                          updateDocument(doc.id, {
                            reminderLead: e.target.value as DocumentReminderLead,
                          })
                        }
                        aria-label={`مدة التذكير لوثيقة ${doc.title}`}
                        className="bg-transparent text-xs font-medium text-slate-700 outline-none dark:text-slate-200"
                      >
                        {REMINDER_LEAD_OPTIONS.map((lead) => (
                          <option
                            key={lead}
                            value={lead}
                            className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                          >
                            تذكير {DOCUMENT_REMINDER_SHORT_LABELS[lead]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => startEdit(doc)}
                      aria-label={`تعديل ${doc.title}`}
                      className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    {isConfirmingDelete ? (
                      <div className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 dark:border-red-900/60 dark:bg-red-950/40">
                        <button
                          type="button"
                          onClick={() => {
                            deleteDocument(doc.id);
                            setConfirmDeleteId(null);
                          }}
                          className="text-xs font-semibold text-red-700 dark:text-red-300"
                        >
                          تأكيد الحذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-slate-400 hover:text-slate-600"
                          aria-label="إلغاء الحذف"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        aria-label={`حذف ${doc.title}`}
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Document Modal */}
      {editingDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setEditingDoc(null)}
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تعديل الوثيقة
              </h2>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                aria-label="إغلاق"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  اسم الوثيقة
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    التصنيف
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as DocumentCategory)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {DOCUMENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    تاريخ الانتهاء
                  </label>
                  <input
                    type="date"
                    required
                    value={editExpiryDate}
                    onChange={(e) => setEditExpiryDate(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  مدة التذكير قبل الانتهاء
                </label>
                <select
                  value={editReminderLead}
                  onChange={(e) => setEditReminderLead(e.target.value as DocumentReminderLead)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {REMINDER_LEAD_OPTIONS.map((lead) => (
                    <option key={lead} value={lead}>
                      {DOCUMENT_REMINDER_LEAD_LABELS[lead]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  رقم الوثيقة (اختياري)
                </label>
                <input
                  type="text"
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  ملاحظات (اختياري)
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
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
