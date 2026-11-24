import React, {useEffect, useRef, useState} from 'react';
import {
  Camera,
  ImagePlus,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {captureVideoFrameToNoteImage, compressImageFile} from '../storage/imageUtils';
import type {NoteCategory, NoteImage, NoteItem} from '../types';

const NOTE_CATEGORIES: NoteCategory[] = ['شخصي', 'شغل', 'أفكار', 'حاجات مهمة'];

export const NotesView: React.FC = () => {
  const {
    notes,
    addNote,
    updateNote,
    deleteNote,
    storageQuotaExceeded,
    focusedItem,
    clearFocusedItem,
  } = useLife();
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);

  // Add note state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NoteCategory>('شخصي');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [images, setImages] = useState<NoteImage[]>([]);
  const [processingImages, setProcessingImages] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Filter & search
  const [categoryFilter, setCategoryFilter] = useState<'الكل' | NoteCategory>('الكل');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!focusedItem || focusedItem.section !== 'notes') return;
    setCategoryFilter('الكل');
    setSearchQuery('');
    setHighlightedNoteId(focusedItem.id);
    clearFocusedItem();

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`life-item-${focusedItem.id}`)
        ?.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
    const timer = window.setTimeout(() => setHighlightedNoteId(null), 2600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusedItem, clearFocusedItem]);

  // Edit note modal state
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<NoteCategory>('شخصي');
  const [editContent, setEditContent] = useState('');
  const [editPinned, setEditPinned] = useState(false);
  const [editImages, setEditImages] = useState<NoteImage[]>([]);
  const [editError, setEditError] = useState('');

  // Lightbox preview
  const [previewImage, setPreviewImage] = useState<NoteImage | null>(null);

  // Camera capture modal state
  const [cameraTarget, setCameraTarget] = useState<'create' | 'edit' | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Hidden file inputs
  const createUploadRef = useRef<HTMLInputElement | null>(null);
  const createCaptureRef = useRef<HTMLInputElement | null>(null);
  const editUploadRef = useRef<HTMLInputElement | null>(null);
  const editCaptureRef = useRef<HTMLInputElement | null>(null);

  const stopCameraStream = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (!cameraTarget) {
      stopCameraStream();
      setCameraReady(false);
      return;
    }

    let cancelled = false;
    setCameraReady(false);
    const startCamera = async () => {
      setCameraError('');
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('المتصفح مش بيدعم فتح الكاميرا مباشرة هنا — تقدر تختار صورة من جهازك.');
        return;
      }
      try {
        stopCameraStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {facingMode},
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        if (!cancelled) {
          setCameraError('مقدرناش نوصل للكاميرا (ممكن تحتاج إذن أو تستخدم اختيار صورة من الجهاز).');
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraTarget, facingMode]);

  const handleFilesSelected = async (
    files: FileList | null,
    target: 'create' | 'edit',
    inputEl: HTMLInputElement | null,
  ) => {
    if (!files || files.length === 0) return;
    setProcessingImages(true);
    if (target === 'create') setErrorMsg('');
    else setEditError('');

    try {
      const processed: NoteImage[] = [];
      for (const file of Array.from(files)) {
        const compressed = await compressImageFile(file);
        processed.push(compressed);
      }
      if (target === 'create') {
        setImages((prev) => [...prev, ...processed]);
      } else {
        setEditImages((prev) => [...prev, ...processed]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حصلت مشكلة أثناء تجهيز الصورة.';
      if (target === 'create') setErrorMsg(msg);
      else setEditError(msg);
    } finally {
      setProcessingImages(false);
      if (inputEl) inputEl.value = '';
    }
  };

  const handleOpenCamera = (target: 'create' | 'edit') => {
    const isCoarsePointer =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    if (isCoarsePointer || !navigator.mediaDevices?.getUserMedia) {
      if (target === 'create') {
        createCaptureRef.current?.click();
      } else {
        editCaptureRef.current?.click();
      }
      return;
    }

    setCameraTarget(target);
  };

  const handlePasteImage = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    target: 'create' | 'edit',
  ) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (imageFiles.length === 0) return;

    e.preventDefault();
    setProcessingImages(true);
    try {
      const processed: NoteImage[] = [];
      for (const file of imageFiles) {
        processed.push(await compressImageFile(file));
      }
      if (target === 'create') {
        setImages((prev) => [...prev, ...processed]);
        setErrorMsg('');
      } else {
        setEditImages((prev) => [...prev, ...processed]);
        setEditError('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حصلت مشكلة أثناء لصق الصورة.';
      if (target === 'create') setErrorMsg(msg);
      else setEditError(msg);
    } finally {
      setProcessingImages(false);
    }
  };

  const handleTakeSnapshot = () => {
    if (!videoRef.current || !cameraTarget || !cameraReady) return;
    try {
      const img = captureVideoFrameToNoteImage(videoRef.current);
      if (cameraTarget === 'create') {
        setImages((prev) => [...prev, img]);
        setErrorMsg('');
      } else {
        setEditImages((prev) => [...prev, img]);
        setEditError('');
      }
      setCameraTarget(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'مقدرناش نلتقط الصورة.');
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim() && images.length === 0) {
      setErrorMsg('اكتب عنوان أو كلام للملاحظة أو ضيف صورة الأول.');
      return;
    }
    setErrorMsg('');
    const fallbackTitle =
      title.trim() ||
      (content.trim() ? content.trim().slice(0, 40) : `صورة مرفقة (${images.length})`);
    addNote({
      title: fallbackTitle,
      content: content.trim(),
      category,
      images,
      pinned,
    });
    setTitle('');
    setContent('');
    setPinned(false);
    setImages([]);
  };

  const openEdit = (note: NoteItem) => {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditCategory(note.category);
    setEditContent(note.content);
    setEditPinned(Boolean(note.pinned));
    setEditImages(note.images ?? []);
    setEditError('');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote) return;
    if (!editTitle.trim() && !editContent.trim() && editImages.length === 0) {
      setEditError('اكتب عنوان أو كلام للملاحظة أو سيب صورة على الأقل.');
      return;
    }
    updateNote(editingNote.id, {
      title:
        editTitle.trim() ||
        (editContent.trim()
          ? editContent.trim().slice(0, 40)
          : `صورة مرفقة (${editImages.length})`),
      category: editCategory,
      content: editContent.trim(),
      pinned: editPinned,
      images: editImages,
    });
    setEditingNote(null);
  };

  const filteredNotes = notes
    .filter((n) => (categoryFilter === 'الكل' ? true : n.category === categoryFilter))
    .filter((n) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    })
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">ملاحظاتي</h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {notes.length} ملاحظة محفوظة محلياً
        </p>
      </div>

      {storageQuotaExceeded && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          مساحة التخزين المحلي في المتصفح امتلأت. امسح بعض الصور القديمة أو نزّل نسخة احتياطية عشان تتأكد إن ملاحظاتك الجديدة تتحفظ.
        </div>
      )}

      {/* Add Note Form */}
      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90"
      >
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="عنوان الملاحظة"
            className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as NoteCategory)}
            aria-label="تصنيف الملاحظة"
            className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <textarea
          rows={3}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (errorMsg) setErrorMsg('');
          }}
          onPaste={(e) => void handlePasteImage(e, 'create')}
          placeholder="اكتب أي فكرة أو تفاصيل عايز تفتكرها (وتقدر تلصق أو ترفع صور)..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />

        {/* Hidden Inputs for Upload & Camera Capture */}
        <input
          ref={createUploadRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void handleFilesSelected(e.target.files, 'create', createUploadRef.current)}
          className="hidden"
        />
        <input
          ref={createCaptureRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void handleFilesSelected(e.target.files, 'create', createCaptureRef.current)}
          className="hidden"
        />

        {/* Attached Images Preview (Create) */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2.5 pt-1">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
              >
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((item) => item.id !== img.id))}
                  aria-label="حذف الصورة"
                  className="absolute top-1 end-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/75 text-white hover:bg-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {errorMsg && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{errorMsg}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={processingImages}
              onClick={() => createUploadRef.current?.click()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ImagePlus className="h-4 w-4 text-accent" />
              <span>{processingImages ? 'جاري تجهيز الصورة...' : 'رفع صورة'}</span>
            </button>

            <button
              type="button"
              disabled={processingImages}
              onClick={() => handleOpenCamera('create')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Camera className="h-4 w-4 text-accent" />
              <span>التقاط صورة</span>
            </button>

            <button
              type="button"
              onClick={() => setPinned((v) => !v)}
              aria-pressed={pinned}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
                pinned
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
              <span>{pinned ? 'مثبّتة فوق' : 'تثبيت فوق'}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={processingImages}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            <span>حفظ الملاحظة</span>
          </button>
        </div>
      </form>

      {/* Search & Category Filter */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-800/90 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {(['الكل', ...NOTE_CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`min-h-[36px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-accent text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 start-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="دوّر في ملاحظاتك..."
            className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 ps-8 pe-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-400">
          {notes.length === 0
            ? 'لسه مكتبتش أي ملاحظات. اكتب أول ملاحظة فوق أو ضيف صورة.'
            : 'مفيش ملاحظات مطابقة للبحث ده.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredNotes.map((note) => {
            const noteImages = note.images ?? [];
            return (
              <article
                key={note.id}
                id={`life-item-${note.id}`}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-4 transition-all dark:bg-slate-800/90 ${
                  highlightedNoteId === note.id
                    ? 'border-accent ring-2 ring-accent/40'
                    : note.pinned
                      ? 'border-accent/60 bg-accent-soft/20 dark:border-accent/50'
                      : 'border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {note.pinned && (
                        <Pin className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="ملاحظة مثبّتة" />
                      )}
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {note.title}
                      </h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateNote(note.id, {pinned: !note.pinned})}
                        aria-label={note.pinned ? 'إلغاء تثبيت الملاحظة' : 'تثبيت الملاحظة في الأعلى'}
                        title={note.pinned ? 'إلغاء التثبيت' : 'تثبيت فوق'}
                        className={`flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg transition-colors ${
                          note.pinned
                            ? 'bg-accent-soft text-accent'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700'
                        }`}
                      >
                        {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(note)}
                        aria-label="تعديل الملاحظة"
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-accent dark:hover:bg-slate-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteNote(note.id)}
                        aria-label="مسح الملاحظة"
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {note.pinned && <span className="font-semibold text-accent">مثبّتة · </span>}
                    {note.category} ·{' '}
                    {new Intl.DateTimeFormat('ar-EG', {
                      day: 'numeric',
                      month: 'short',
                    }).format(new Date(note.updatedAt))}
                    {noteImages.length > 0 && ` · ${noteImages.length} صور`}
                  </p>
                  {note.content && (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {note.content}
                    </p>
                  )}

                  {noteImages.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {noteImages.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => setPreviewImage(img)}
                          aria-label={`عرض ${img.name}`}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition-opacity hover:opacity-90 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <img
                            src={img.dataUrl}
                            alt={img.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Edit Note Modal */}
      {editingNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setEditingNote(null)}
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">تعديل الملاحظة</h2>
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                aria-label="إغلاق"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="عنوان الملاحظة"
                  className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as NoteCategory)}
                  className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {NOTE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={4}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onPaste={(e) => void handlePasteImage(e, 'edit')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />

              <input
                ref={editUploadRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void handleFilesSelected(e.target.files, 'edit', editUploadRef.current)}
                className="hidden"
              />
              <input
                ref={editCaptureRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => void handleFilesSelected(e.target.files, 'edit', editCaptureRef.current)}
                className="hidden"
              />

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={processingImages}
                    onClick={() => editUploadRef.current?.click()}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-accent" />
                    <span>رفع صورة</span>
                  </button>
                  <button
                    type="button"
                    disabled={processingImages}
                    onClick={() => handleOpenCamera('edit')}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Camera className="h-3.5 w-3.5 text-accent" />
                    <span>التقاط صورة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPinned((v) => !v)}
                    aria-pressed={editPinned}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                      editPinned
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <Pin className="h-3.5 w-3.5" />
                    <span>{editPinned ? 'مثبّتة فوق' : 'تثبيت فوق'}</span>
                  </button>
                </div>

                {editImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {editImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditImages((prev) => prev.filter((item) => item.id !== img.id))
                          }
                          aria-label="حذف الصورة"
                          className="absolute top-1 end-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/75 text-white hover:bg-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">{editError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={processingImages}
                className="min-h-[40px] rounded-xl bg-accent px-5 text-xs font-semibold text-white disabled:opacity-60"
              >
                حفظ التعديل
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Camera Capture Modal (Desktop / WebRTC) */}
      {cameraTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={() => setCameraTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  التقاط صورة
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCameraTarget(null)}
                aria-label="إغلاق الكاميرا"
                className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {cameraError ? (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
                <p className="text-xs text-amber-900 dark:text-amber-200">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => {
                    const target = cameraTarget;
                    setCameraTarget(null);
                    if (target === 'create') {
                      createCaptureRef.current?.click();
                    } else {
                      editCaptureRef.current?.click();
                    }
                  }}
                  className="min-h-[38px] rounded-xl bg-accent px-4 text-xs font-semibold text-white"
                >
                  اختيار صورة من الجهاز
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl bg-slate-950">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => setCameraReady(true)}
                    className="aspect-video w-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                    }
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>تبديل الكاميرا</span>
                  </button>
                  <button
                    type="button"
                    disabled={!cameraReady}
                    onClick={handleTakeSnapshot}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-accent px-5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Camera className="h-4 w-4" />
                    <span>{cameraReady ? 'التقاط وحفظ' : 'جاري فتح الكاميرا...'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl bg-slate-900 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              aria-label="إغلاق المعاينة"
              className="absolute top-3 end-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/80 text-white hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewImage.dataUrl}
              alt={previewImage.name}
              className="max-h-[85vh] w-auto max-w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
