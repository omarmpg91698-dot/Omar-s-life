import React, {useMemo, useRef, useState} from 'react';
import {
  Archive,
  Bell,
  BellOff,
  Check,
  Download,
  FileSpreadsheet,
  Lock,
  Moon,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sun,
  Tag,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import {GoogleDriveSyncCard} from '../components/GoogleDriveSyncCard';
import {PWAInstallButton} from '../components/PWAInstallButton';
import {useLife} from '../context/LifeContext';
import {exportOmarsLifeToExcel} from '../storage/excelExport';
import {DEFAULT_TASK_TAGS} from '../storage/localStore';
import {hashLocalPin, verifyLocalPin} from '../storage/productivityUtils';
import type {AccentColor, TaskPriority} from '../types';

export const SettingsView: React.FC = () => {
  const {
    preferences,
    updatePreferences,
    addTaskTag,
    renameTaskTag,
    deleteTaskTag,
    resetDefaultTaskTags,
    exportBackupJson,
    restoreFromBackupJson,
    clearAllData,
    setActiveSection,
    lockApp,
    tasks,
    archivedTasks,
    allTasks,
    notes,
    goals,
  } = useLife();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMsg, setStatusMsg] = useState<{type: 'ok' | 'err'; text: string} | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [tagError, setTagError] = useState('');
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagInput, setEditTagInput] = useState('');
  const [pinMode, setPinMode] = useState<'idle' | 'setup' | 'change' | 'disable'>('idle');
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [browserNotifPermission, setBrowserNotifPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  const resetPinForm = () => {
    setPinMode('idle');
    setPinCurrent('');
    setPinNew('');
    setPinConfirm('');
    setPinError('');
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    const pinRegex = /^\d{4}$/;

    if (pinMode === 'setup') {
      if (!pinRegex.test(pinNew)) {
        setPinError('الرقم السري لازم يكون ٤ أرقام بالظبط.');
        return;
      }
      if (pinNew !== pinConfirm) {
        setPinError('الرقمين مش متطابقين، راجعهم تاني.');
        return;
      }
      updatePreferences({pinLockEnabled: true, pinHash: hashLocalPin(pinNew)});
      resetPinForm();
      setStatusMsg({type: 'ok', text: 'تم تفعيل قفل التطبيق بالرقم السري بنجاح.'});
      return;
    }

    if (pinMode === 'change') {
      if (!verifyLocalPin(pinCurrent, preferences.pinHash)) {
        setPinError('الرقم السري الحالي غلط.');
        return;
      }
      if (!pinRegex.test(pinNew)) {
        setPinError('الرقم السري الجديد لازم يكون ٤ أرقام.');
        return;
      }
      if (pinNew !== pinConfirm) {
        setPinError('تأكيد الرقم السري الجديد مش متطابق.');
        return;
      }
      updatePreferences({pinLockEnabled: true, pinHash: hashLocalPin(pinNew)});
      resetPinForm();
      setStatusMsg({type: 'ok', text: 'تم تغيير الرقم السري بنجاح.'});
      return;
    }

    if (pinMode === 'disable') {
      if (!verifyLocalPin(pinCurrent, preferences.pinHash)) {
        setPinError('الرقم السري الحالي غلط.');
        return;
      }
      updatePreferences({pinLockEnabled: false, pinHash: null});
      resetPinForm();
      setStatusMsg({type: 'ok', text: 'تم إلغاء قفل التطبيق بالرقم السري.'});
    }
  };

  const handleRequestBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setBrowserNotifPermission(perm);
      if (perm === 'granted') {
        updatePreferences({remindersEnabled: true});
        setStatusMsg({type: 'ok', text: 'تم تفعيل إشعارات المتصفح للتنبيهات بنجاح.'});
      } else {
        setStatusMsg({
          type: 'err',
          text: 'المتصفح رفض إذن الإشعارات، بس التنبيهات جوه التطبيق شغالة عادي.',
        });
      }
    } catch {
      setStatusMsg({
        type: 'err',
        text: 'مش قادرين نطلب إذن الإشعارات من المتصفح ده، بس التنبيهات جوه التطبيق شغالة.',
      });
    }
  };

  const tagUsageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of allTasks) {
      for (const tag of task.tags ?? []) {
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    }
    return map;
  }, [allTasks]);

  const missingDefaultTags = DEFAULT_TASK_TAGS.some(
    (defTag) => !preferences.taskTags.includes(defTag),
  );

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addTaskTag(newTagInput);
    if (!res.ok) {
      setTagError(res.error ?? 'حصلت مشكلة ومقدرناش نضيف التصنيف.');
      return;
    }
    setTagError('');
    setNewTagInput('');
    setStatusMsg({type: 'ok', text: `تم إضافة التصنيف "${res.tag}" لقائمة التصنيفات.`});
  };

  const handleDeleteTag = (tag: string, usageCount: number) => {
    if (usageCount > 0 && confirmDeleteTag !== tag) {
      setConfirmDeleteTag(tag);
      setEditingTag(null);
      return;
    }
    deleteTaskTag(tag);
    setConfirmDeleteTag(null);
    setStatusMsg({type: 'ok', text: `تم حذف التصنيف "${tag}" من القائمة والمهام.`});
  };

  const startEditTag = (tag: string) => {
    setEditingTag(tag);
    setEditTagInput(tag);
    setConfirmDeleteTag(null);
    setTagError('');
  };

  const handleSaveEditTag = (oldTag: string) => {
    const res = renameTaskTag(oldTag, editTagInput);
    if (!res.ok) {
      setTagError(res.error ?? 'مقدرناش نعدّل التصنيف ده.');
      return;
    }
    setTagError('');
    setEditingTag(null);
    if (res.tag && res.tag !== oldTag) {
      setStatusMsg({
        type: 'ok',
        text: `تم تعديل التصنيف "${oldTag}" إلى "${res.tag}" في القائمة والمهام.`,
      });
    }
  };

  const handleDownloadBackup = () => {
    const content = exportBackupJson();
    const blob = new Blob([content], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `omars-life-backup-${dateTag}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatusMsg({type: 'ok', text: 'تم تحميل النسخة الاحتياطية (JSON) بنجاح.'});
  };

  const handleDownloadExcel = () => {
    try {
      exportOmarsLifeToExcel({tasks: allTasks, notes, goals});
      setStatusMsg({
        type: 'ok',
        text: 'تم تصدير كل المهام والملاحظات والأهداف في ملف إكسيل (.xlsx) بنجاح.',
      });
    } catch {
      setStatusMsg({
        type: 'err',
        text: 'حصلت مشكلة ومقدرناش نصدّر ملف الإكسيل دلوقتي.',
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      restoreFromBackupJson(text);
      setStatusMsg({type: 'ok', text: 'تم استرجاع كل بياناتك من النسخة الاحتياطية بنجاح.'});
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'حصلت مشكلة ومش قادرين نقرأ الملف ده.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmClear = () => {
    clearAllData();
    setConfirmClear(false);
    setStatusMsg({type: 'ok', text: 'تم مسح كل البيانات ورجعت الصفحة فاضية.'});
  };

  const accents: Array<{
    id: AccentColor;
    label: string;
    hint: string;
    color: string;
    soft: string;
  }> = [
    {id: 'teal', label: 'تيل (افتراضي)', hint: 'متوازن وهادي', color: '#0d9488', soft: '#ccfbf1'},
    {id: 'blue', label: 'أزرق', hint: 'واضح وعملي', color: '#2563eb', soft: '#dbeafe'},
    {id: 'indigo', label: 'نيلي', hint: 'مركز ومريح', color: '#4f46e5', soft: '#e0e7ff'},
    {id: 'emerald', label: 'زمردي', hint: 'منعش ومشرق', color: '#059669', soft: '#d1fae5'},
    {id: 'violet', label: 'بنفسجي', hint: 'عصري ومميز', color: '#7c3aed', soft: '#ede9fe'},
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">الإعدادات</h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          تفضيلات الشكل، المزامنة السحابية عبر Google Drive، والنسخ الاحتياطي لبياناتك
        </p>
      </div>

      {statusMsg && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            statusMsg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Mobile Install & APK Guide */}
      <PWAInstallButton
        variant="card"
        onInstalled={() =>
          setStatusMsg({type: 'ok', text: 'تم تثبيت التطبيق على جهازك بنجاح.'})
        }
      />

      {/* Google Drive Cross-Device Cloud Sync */}
      <GoogleDriveSyncCard />

      {/* Appearance */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/90">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">المظهر والألوان</h2>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">وضع الإضاءة</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              اختار بين الوضع الفاتح للنهار أو الوضع الغامق بالليل
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updatePreferences({theme: 'light'})}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium ${
                preferences.theme === 'light'
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <Sun className="h-4 w-4" />
              <span>فاتح</span>
            </button>
            <button
              type="button"
              onClick={() => updatePreferences({theme: 'dark'})}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium ${
                preferences.theme === 'dark'
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <Moon className="h-4 w-4" />
              <span>غامق</span>
            </button>
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <label
                htmlFor="accent-color-select"
                className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                <Palette className="h-4 w-4 text-accent" />
                <span>لون التمييز (Accent Color)</span>
              </label>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                غيّر لون الأزرار والروابط والتنقل في التطبيق بالكامل فوراً
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                id="accent-color-select"
                value={preferences.accent}
                onChange={(e) => {
                  const next = e.target.value as AccentColor;
                  updatePreferences({accent: next});
                  const picked = accents.find((a) => a.id === next);
                  if (picked) {
                    setStatusMsg({
                      type: 'ok',
                      text: `تم تغيير لون التطبيق إلى «${picked.label}».`,
                    });
                  }
                }}
                aria-label="اختيار لون التمييز للتطبيق"
                className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {accents.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label}
                  </option>
                ))}
              </select>

              {preferences.accent !== 'teal' && (
                <button
                  type="button"
                  onClick={() => {
                    updatePreferences({accent: 'teal'});
                    setStatusMsg({type: 'ok', text: 'تم إرجاع لون التمييز الافتراضي (تيل).'});
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>افتراضي</span>
                </button>
              )}
            </div>
          </div>

          <div
            role="radiogroup"
            aria-label="قائمة ألوان التمييز"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          >
            {accents.map((acc) => {
              const active = preferences.accent === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => updatePreferences({accent: acc.id})}
                  className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start transition-all ${
                    active
                      ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full shadow-xs"
                      style={{backgroundColor: acc.color}}
                    >
                      {active && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{acc.label}</span>
                      <span className="block truncate text-[10px] opacity-75">{acc.hint}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Personal Preferences */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/90">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">تفضيلات عامة</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              الاسم في رسالة الترحيب
            </label>
            <input
              type="text"
              value={preferences.userName}
              onChange={(e) => updatePreferences({userName: e.target.value || 'عمر'})}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              الأولوية الافتراضية لأي مهمة جديدة
            </label>
            <select
              value={preferences.defaultPriority}
              onChange={(e) => updatePreferences({defaultPriority: e.target.value as TaskPriority})}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="مهم">مهم</option>
              <option value="متوسط">متوسط</option>
              <option value="عادي">عادي</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              تنبيهات المهام اليومية
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              إظهار إشعار وجرس للمهام اللي يحين ميعادها النهارده
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => updatePreferences({remindersEnabled: !preferences.remindersEnabled})}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium transition-colors ${
                preferences.remindersEnabled
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {preferences.remindersEnabled ? (
                <Bell className="h-3.5 w-3.5" />
              ) : (
                <BellOff className="h-3.5 w-3.5" />
              )}
              <span>{preferences.remindersEnabled ? 'مفعّلة' : 'مقفولة'}</span>
            </button>

            {browserNotifPermission === 'default' && (
              <button
                type="button"
                onClick={handleRequestBrowserNotifications}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <span>تفعيل إشعارات المتصفح</span>
              </button>
            )}
          </div>
        </div>

        {/* Auto-Archive Rule (30 days default) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
              <Archive className="h-4 w-4 text-accent" />
              <span>الأرشفة التلقائية للمهام المنتهية</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              نقل المهام اللي خلصت وعدّى عليها المدة المحددة إلى قسم الأرشيف بدل حذفها نهائياً
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                updatePreferences({autoArchiveEnabled: !preferences.autoArchiveEnabled})
              }
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium transition-colors ${
                preferences.autoArchiveEnabled
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <span>{preferences.autoArchiveEnabled ? 'مفعّلة' : 'مقفولة'}</span>
            </button>

            {preferences.autoArchiveEnabled && (
              <select
                value={preferences.autoArchiveDays ?? 30}
                onChange={(e) =>
                  updatePreferences({autoArchiveDays: Number(e.target.value) || 30})
                }
                aria-label="مدة الأرشفة التلقائية بالأيام"
                className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value={14}>بعد ١٤ يوم</option>
                <option value={30}>بعد ٣٠ يوم (افتراضي)</option>
                <option value={60}>بعد ٦٠ يوم</option>
                <option value={90}>بعد ٩٠ يوم</option>
              </select>
            )}

            <button
              type="button"
              onClick={() => setActiveSection('archive')}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <span>الأرشيف ({archivedTasks.length})</span>
            </button>
          </div>
        </div>
      </section>

      {/* PIN Lock Privacy Section */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/90">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <Lock className="h-4 w-4 text-accent" />
              <span>قفل التطبيق برقم سري (PIN)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              احمِ مهامك وملاحظاتك الخاصة برقم سري من ٤ أرقام يُطلب عند فتح التطبيق
            </p>
          </div>

          {preferences.pinLockEnabled && preferences.pinHash ? (
            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>مفعّل</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <Unlock className="h-3.5 w-3.5" />
              <span>غير مفعّل</span>
            </span>
          )}
        </div>

        {pinMode === 'idle' ? (
          <div className="flex flex-wrap items-center gap-2">
            {preferences.pinLockEnabled && preferences.pinHash ? (
              <>
                <button
                  type="button"
                  onClick={lockApp}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-white whitespace-nowrap"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>قفل التطبيق الآن</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPinMode('change')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap"
                >
                  <span>تغيير الرقم السري</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPinMode('disable')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 px-3.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30 whitespace-nowrap"
                >
                  <span>إلغاء القفل</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPinMode('setup')}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-white whitespace-nowrap"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>تعيين رقم سري (٤ أرقام)</span>
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handlePinSubmit} className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {(pinMode === 'change' || pinMode === 'disable') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    الرقم السري الحالي
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinCurrent}
                    onChange={(e) => setPinCurrent(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    dir="ltr"
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-sm tracking-[0.5em] text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              )}

              {(pinMode === 'setup' || pinMode === 'change') && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      الرقم السري الجديد (٤ أرقام)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pinNew}
                      onChange={(e) => setPinNew(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      dir="ltr"
                      className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-sm tracking-[0.5em] text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      تأكيد الرقم السري
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pinConfirm}
                      onChange={(e) =>
                        setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      placeholder="••••"
                      dir="ltr"
                      className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-sm tracking-[0.5em] text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </>
              )}
            </div>

            {pinError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{pinError}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="min-h-[38px] rounded-xl bg-accent px-4 text-xs font-semibold text-white whitespace-nowrap"
              >
                {pinMode === 'disable' ? 'تأكيد إلغاء القفل' : 'حفظ الرقم السري'}
              </button>
              <button
                type="button"
                onClick={resetPinForm}
                className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Task Tags Management */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/90">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <Tag className="h-4 w-4 text-accent" />
              <span>إدارة تصنيفات المهام</span>
              <span className="font-mono text-xs font-normal tabular-nums text-slate-400 dark:text-slate-500">
                ({preferences.taskTags.length})
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              ضيف تصنيفات جديدة، عدّل اسم أي تصنيف، أو احذفه عشان تنظم مهامك بمرونة.
            </p>
          </div>
          {missingDefaultTags && (
            <button
              type="button"
              onClick={() => {
                resetDefaultTaskTags();
                setStatusMsg({
                  type: 'ok',
                  text: 'تم استرجاع التصنيفات الأساسية (شغل، بيت، شخصي).',
                });
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>رجّع الافتراضي</span>
            </button>
          )}
        </div>

        <form onSubmit={handleAddTag} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newTagInput}
            onChange={(e) => {
              setNewTagInput(e.target.value);
              if (tagError) setTagError('');
            }}
            placeholder="اسم التصنيف الجديد (مثلاً: صحة، دراسة، سفر)..."
            className="min-h-[42px] min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            <span>ضيف تصنيف</span>
          </button>
        </form>

        {tagError && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{tagError}</p>
        )}

        {preferences.taskTags.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            مفيش تصنيفات متسجلة دلوقتي. ضيف تصنيف جديد فوق أو اضغط "رجّع الافتراضي".
          </p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 dark:divide-slate-700 dark:border-slate-700">
            {preferences.taskTags.map((tag) => {
              const usageCount = tagUsageCounts.get(tag) ?? 0;
              const isConfirming = confirmDeleteTag === tag;
              const isEditing = editingTag === tag;
              return (
                <div
                  key={tag}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                >
                  {isEditing ? (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={editTagInput}
                        onChange={(e) => {
                          setEditTagInput(e.target.value);
                          if (tagError) setTagError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveEditTag(tag);
                          } else if (e.key === 'Escape') {
                            setEditingTag(null);
                            setTagError('');
                          }
                        }}
                        aria-label={`تعديل اسم تصنيف ${tag}`}
                        className="min-h-[38px] min-w-[160px] flex-1 rounded-lg border border-accent bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:bg-slate-900 dark:text-slate-100"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSaveEditTag(tag)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-accent px-3 text-xs font-semibold text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>حفظ</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTag(null);
                            setTagError('');
                          }}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>إلغاء</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          #{tag}
                        </span>
                        <span className="font-mono text-xs text-slate-400 tabular-nums dark:text-slate-500">
                          {usageCount === 0 ? 'غير مستخدم' : `${usageCount} مهام`}
                        </span>
                      </div>

                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-red-600 dark:text-red-400">
                            هيتشال من {usageCount} مهام، متأكد؟
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteTag(tag, usageCount)}
                            className="min-h-[32px] rounded-lg bg-red-600 px-2.5 text-xs font-semibold text-white"
                          >
                            احذف
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTag(null)}
                            className="min-h-[32px] rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditTag(tag)}
                            aria-label={`تعديل تصنيف ${tag}`}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-accent dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTag(tag, usageCount)}
                            aria-label={`حذف تصنيف ${tag}`}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Data Export, Backup & Restore */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/90">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            تصدير البيانات والنسخ الاحتياطي
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            كل بياناتك محفوظة على جهازك ({tasks.length} مهام نشطة · {archivedTasks.length} مؤرشفة ·{' '}
            {notes.length} ملاحظات · {goals.length} أهداف ومشاريع). تقدر تصدّرها في ملف إكسيل أو
            تاخد نسخة احتياطية كاملة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>تصدير البيانات (إكسيل)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-white"
          >
            <Download className="h-4 w-4" />
            <span>تحميل نسخة احتياطية (JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Upload className="h-4 w-4 text-accent" />
            <span>استعادة من ملف</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-700">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 px-3.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>مسح كل البيانات</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                متأكد إنك عايز تمسح كل المهام والملاحظات والأهداف؟
              </span>
              <button
                type="button"
                onClick={handleConfirmClear}
                className="min-h-[38px] rounded-xl bg-red-600 px-3.5 text-xs font-semibold text-white"
              >
                أيوه امسح الكل
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                لأ، رجّعني
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
