import React, {useRef} from 'react';
import {
  CalendarClock,
  Cloud,
  CloudDownload,
  CloudOff,
  CloudUpload,
  FileDown,
  FileUp,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {useDriveSync} from '../context/DriveSyncContext';
import {
  DRIVE_SYNC_FILENAME,
  formatDriveFileSize,
  formatDriveTimestamp,
} from '../services/googleDriveSync';
import {GoogleSignInButton} from './GoogleSignInButton';

export const GoogleDriveSyncCard: React.FC = () => {
  const {
    user,
    needsAuth,
    isSigningIn,
    remoteFile,
    lastSyncedAt,
    hasUnsyncedChanges,
    busyAction,
    notice,
    signIn,
    signOut,
    refreshCloudStatus,
    requestSmartSync,
    requestUploadLocalToDrive,
    requestRestoreFromDrive,
    requestDeleteCloudBackup,
    requestImportFromFile,
    requestExportToFile,
    weeklyAutoBackupEnabled,
    setWeeklyAutoBackupEnabled,
    lastAutoBackupAt,
    autoBackupBusy,
    runAutoBackupNow,
  } = useDriveSync();

  const isBusy = busyAction !== null;
  const importInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section
      id="google-drive-sync"
      className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/90"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <Cloud className="h-4 w-4 text-accent" />
            <span>المزامنة السحابية عبر Google Drive</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            احفظ وزامن مهامك وملاحظاتك وأهدافك بين الموبايل والكمبيوتر في ملف خاص بالتطبيق على حسابك في Google Drive.
          </p>
        </div>

        <span
          className={`text-xs font-medium ${
            !needsAuth
              ? hasUnsyncedChanges
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-emerald-700 dark:text-emerald-300'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {!needsAuth
            ? hasUnsyncedChanges
              ? 'متصل · فيه تغييرات جديدة للمزامنة'
              : 'متصل بـ Google Drive'
            : 'غير متصل حالياً'}
        </span>
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
            notice.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : notice.type === 'err'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
                : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Local JSON backup (works without Google sign-in) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300/90 bg-slate-50/60 px-3.5 py-3 dark:border-slate-600 dark:bg-slate-900/40">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            نسخة احتياطية بملف JSON
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            استورد ملف النسخة من التطبيق القديم أو نزّل نسخة من بياناتك الحالية — من غير تسجيل دخول Google.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void requestImportFromFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isBusy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-semibold text-white transition-colors disabled:opacity-60"
          >
            <FileUp className="h-4 w-4" />
            <span>استيراد من ملف</span>
          </button>
          <button
            type="button"
            onClick={requestExportToFile}
            disabled={isBusy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <FileDown className="h-4 w-4 text-accent" />
            <span>تنزيل نسخة JSON</span>
          </button>
        </div>
      </div>

      <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <CalendarClock className="h-4 w-4 text-accent" />
              <span>النسخ الأسبوعي التلقائي</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              كل يوم سبت بنعمل نسخة كاملة من كل بياناتك (مهام وملاحظات وصور) في فولدر «Omar's Life» على Drive، والنسخة القديمة بتتبدل بالجديدة تلقائياً.
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {lastAutoBackupAt
                ? `آخر نسخة: ${formatDriveTimestamp(new Date(lastAutoBackupAt).toISOString())}`
                : 'لسه مفيش نسخة أسبوعية — هتتعمل أول سبت أو أول مرة تسجل دخول.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWeeklyAutoBackupEnabled(!weeklyAutoBackupEnabled)}
            aria-pressed={weeklyAutoBackupEnabled}
            className={`inline-flex min-h-[36px] items-center rounded-xl px-3 text-xs font-semibold transition-colors ${
              weeklyAutoBackupEnabled
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {weeklyAutoBackupEnabled ? 'شغالة' : 'متوقفة'}
          </button>
        </div>
        <div>
          <button
            type="button"
            onClick={() => void runAutoBackupNow()}
            disabled={isBusy || autoBackupBusy || needsAuth}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {autoBackupBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : (
              <CloudUpload className="h-3.5 w-3.5 text-accent" />
            )}
            <span>{autoBackupBusy ? 'بترفع النسخة في الخلفية...' : 'اعمل نسخة دلوقتي'}</span>
          </button>
        </div>
      </div>

      {needsAuth ? (
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-900/60">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <CloudOff className="h-4 w-4 text-slate-400" />
              <span>
                {user
                  ? `أعد تأكيد الجلسة لحساب ${user.email ?? user.displayName ?? 'Google'}`
                  : 'اربط حسابك في Google لتفعيل المزامنة بين الأجهزة'}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              التطبيق يصل فقط لملف المزامنة الخاص بـ Omar&apos;s Life (<span dir="ltr" className="font-mono">{DRIVE_SYNC_FILENAME}</span>) ولا يطلع على أي ملفات أخرى في Drive.
            </p>
          </div>
          <div className="shrink-0">
            <GoogleSignInButton
              onClick={signIn}
              loading={isSigningIn}
              label="Sign in with Google"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connected Account Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-3 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="flex min-w-0 items-center gap-3">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName ?? 'Google Account'}
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                  {(user?.displayName || user?.email || 'G').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {user?.displayName || 'حساب Google متصل'}
                </p>
                {user?.email && (
                  <p dir="ltr" className="truncate text-right text-xs text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={signOut}
              disabled={isBusy}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          </div>

          {/* Cloud File Metadata */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3.5 py-2.5 dark:border-slate-700/80 dark:bg-slate-900/40">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">ملف المزامنة</p>
              <p dir="ltr" className="mt-0.5 truncate text-right font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                {remoteFile ? remoteFile.name : 'غير منشأ بعد'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3.5 py-2.5 dark:border-slate-700/80 dark:bg-slate-900/40">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">آخر تحديث على Drive</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                {remoteFile ? formatDriveTimestamp(remoteFile.modifiedTime) : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3.5 py-2.5 dark:border-slate-700/80 dark:bg-slate-900/40">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {remoteFile ? 'حجم النسخة السحابية' : 'آخر مزامنة من هذا الجهاز'}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                {remoteFile
                  ? formatDriveFileSize(remoteFile.size)
                  : formatDriveTimestamp(lastSyncedAt)}
              </p>
            </div>
          </div>

          {/* Sync Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={requestSmartSync}
              disabled={isBusy}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-colors disabled:opacity-60"
            >
              {busyAction === 'syncing' || busyAction === 'checking' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>مزامنة ودمج ذكي</span>
            </button>

            <button
              type="button"
              onClick={requestUploadLocalToDrive}
              disabled={isBusy}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {busyAction === 'uploading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4 text-accent" />
              )}
              <span>رفع بيانات الجهاز إلى Drive</span>
            </button>

            <button
              type="button"
              onClick={requestRestoreFromDrive}
              disabled={isBusy || !remoteFile}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {busyAction === 'downloading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="h-4 w-4 text-accent" />
              )}
              <span>استعادة من Drive</span>
            </button>

            <button
              type="button"
              onClick={refreshCloudStatus}
              disabled={isBusy}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busyAction === 'checking' ? 'animate-spin' : ''}`} />
              <span>فحص السحابة</span>
            </button>

            {remoteFile && (
              <button
                type="button"
                onClick={requestDeleteCloudBackup}
                disabled={isBusy}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>حذف النسخة السحابية</span>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
