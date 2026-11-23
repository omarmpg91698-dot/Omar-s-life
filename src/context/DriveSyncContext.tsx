import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import type {User} from 'firebase/auth';
import {AlertTriangle, Cloud, Loader2, ShieldAlert, X} from 'lucide-react';
import {useLife} from './LifeContext';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from '../services/googleAuth';
import {
  DRIVE_SYNC_FILENAME,
  DriveAuthExpiredError,
  deleteSyncFile,
  downloadSyncFile,
  findSyncFile,
  formatDriveTimestamp,
  mergeOmarsLifeStores,
  uploadSyncFile,
  type DriveSyncFileMeta,
} from '../services/googleDriveSync';
import type {OmarsLifeStore} from '../types';

export type DriveBusyAction =
  | null
  | 'checking'
  | 'syncing'
  | 'uploading'
  | 'downloading'
  | 'deleting';

export interface DriveSyncNotice {
  type: 'ok' | 'err' | 'info';
  text: string;
}

interface PendingConfirmAction {
  kind: 'smart-sync' | 'upload-local' | 'restore-remote' | 'delete-remote';
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}

interface DriveSyncContextValue {
  user: User | null;
  needsAuth: boolean;
  isSigningIn: boolean;
  remoteFile: DriveSyncFileMeta | null;
  lastSyncedAt: number | null;
  hasUnsyncedChanges: boolean;
  busyAction: DriveBusyAction;
  notice: DriveSyncNotice | null;
  clearNotice: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshCloudStatus: () => Promise<DriveSyncFileMeta | null>;
  requestSmartSync: () => Promise<void>;
  requestUploadLocalToDrive: () => Promise<void>;
  requestRestoreFromDrive: () => Promise<void>;
  requestDeleteCloudBackup: () => void;
}

const LAST_SYNC_META_KEY = 'omars_life_drive_last_sync_at';

function computeStoreDigest(store: OmarsLifeStore): string {
  return JSON.stringify({
    t: store.tasks.map((x) => [x.id, x.updatedAt, x.status]),
    n: store.notes.map((x) => [x.id, x.updatedAt, x.images.length]),
    g: store.goals.map((x) => [x.id, x.updatedAt, x.progress]),
    p: store.preferences,
  });
}

const DriveSyncContext = createContext<DriveSyncContextValue | null>(null);

export const DriveSyncProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {store, replaceStore} = useLife();
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [remoteFile, setRemoteFile] = useState<DriveSyncFileMeta | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(LAST_SYNC_META_KEY);
      const parsed = saved ? Number(saved) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [lastSyncedDigest, setLastSyncedDigest] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<DriveBusyAction>(null);
  const [notice, setNotice] = useState<DriveSyncNotice | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmAction | null>(null);
  const [confirmExecuting, setConfirmExecuting] = useState(false);

  const currentDigest = useMemo(() => computeStoreDigest(store), [store]);
  const hasUnsyncedChanges = Boolean(
    !needsAuth && lastSyncedDigest !== null && lastSyncedDigest !== currentDigest,
  );

  const markSynced = useCallback((syncedStore: OmarsLifeStore, fileMeta: DriveSyncFileMeta) => {
    const now = Date.now();
    setRemoteFile(fileMeta);
    setLastSyncedAt(now);
    setLastSyncedDigest(computeStoreDigest(syncedStore));
    try {
      localStorage.setItem(LAST_SYNC_META_KEY, String(now));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleDriveError = useCallback((err: unknown) => {
    if (err instanceof DriveAuthExpiredError) {
      clearAccessToken();
      setNeedsAuth(true);
      setNotice({type: 'info', text: err.message});
      return;
    }
    const msg =
      err instanceof Error
        ? err.message
        : 'حصلت مشكلة أثناء التواصل مع Google Drive. جرّب تاني بعد شوية.';
    setNotice({type: 'err', text: msg});
  }, []);

  const refreshCloudStatusWithToken = useCallback(
    async (token: string): Promise<DriveSyncFileMeta | null> => {
      setBusyAction('checking');
      try {
        const meta = await findSyncFile(token);
        setRemoteFile(meta);
        return meta;
      } catch (err) {
        handleDriveError(err);
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [handleDriveError],
  );

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setNeedsAuth(false);
        void refreshCloudStatusWithToken(token);
      },
      (signedInWithoutToken) => {
        setUser(signedInWithoutToken ?? null);
        setNeedsAuth(true);
      },
    );
    return unsubscribe;
  }, [refreshCloudStatusWithToken]);

  const requireToken = useCallback(async (): Promise<string | null> => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setNotice({
        type: 'info',
        text: 'محتاج تسجّل دخول بحساب Google الأول عشان تقدر توصل لملف المزامنة على Google Drive.',
      });
      return null;
    }
    return token;
  }, []);

  const signIn = useCallback(async () => {
    setIsSigningIn(true);
    setNotice(null);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setNeedsAuth(false);
      const existing = await refreshCloudStatusWithToken(result.accessToken);
      if (existing) {
        setNotice({
          type: 'ok',
          text: `تم الربط بحساب Google بنجاح! لقينا نسخة محفوظة على Drive (آخر تعديل: ${formatDriveTimestamp(existing.modifiedTime)}).`,
        });
      } else {
        setNotice({
          type: 'ok',
          text: 'تم الربط بحساب Google بنجاح! تقدر دلوقتي ترفع بياناتك وتزامنها بين أجهزتك.',
        });
      }
    } catch (err) {
      const code = (err as {code?: string})?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setNotice({
          type: 'info',
          text: 'تم إلغاء نافذة تسجيل الدخول. تقدر تجرب تاني في أي وقت.',
        });
      } else if (code === 'auth/popup-blocked') {
        setNotice({
          type: 'err',
          text: 'المتصفح منع فتح نافذة تسجيل الدخول (Popup). اسمح بالنوافذ المنبثقة وجرّب تاني.',
        });
      } else {
        handleDriveError(err);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [handleDriveError, refreshCloudStatusWithToken]);

  const signOut = useCallback(async () => {
    setNotice(null);
    try {
      await logout();
      setUser(null);
      setNeedsAuth(true);
      setRemoteFile(null);
      setLastSyncedDigest(null);
      setNotice({
        type: 'info',
        text: 'تم تسجيل الخروج من Google Drive. بياناتك المحلية على الجهاز ده زي ما هي بأمان.',
      });
    } catch (err) {
      handleDriveError(err);
    }
  }, [handleDriveError]);

  const refreshCloudStatus = useCallback(async (): Promise<DriveSyncFileMeta | null> => {
    setNotice(null);
    const token = await requireToken();
    if (!token) return null;
    const meta = await refreshCloudStatusWithToken(token);
    if (meta) {
      setNotice({
        type: 'info',
        text: `تم فحص السحابة: ملف "${meta.name}" موجود وآخر تحديث ${formatDriveTimestamp(meta.modifiedTime)}.`,
      });
    } else {
      setNotice({
        type: 'info',
        text: 'مفيش نسخة مزامنة محفوظة على Google Drive لسه.',
      });
    }
    return meta;
  }, [refreshCloudStatusWithToken, requireToken]);

  const requestSmartSync = useCallback(async () => {
    setNotice(null);
    const token = await requireToken();
    if (!token) return;

    setBusyAction('checking');
    try {
      const existing = await findSyncFile(token);
      setRemoteFile(existing);

      if (!existing) {
        setPendingConfirm({
          kind: 'smart-sync',
          title: 'إنشاء ملف مزامنة جديد على Google Drive؟',
          description: `مفيش نسخة سحابية لسه. هيتم إنشاء ملف "${DRIVE_SYNC_FILENAME}" في حسابك على Google Drive ورفع بيانات هذا الجهاز.`,
          details: [
            `المهام اللي هتترفع: ${store.tasks.length}`,
            `الملاحظات اللي هتترفع: ${store.notes.length}`,
            `الأهداف والمشاريع: ${store.goals.length}`,
          ],
          confirmLabel: 'تأكيد الإنشاء والرفع',
          onConfirm: async () => {
            const activeToken = await requireToken();
            if (!activeToken) return;
            setBusyAction('syncing');
            try {
              const saved = await uploadSyncFile(activeToken, store, null);
              markSynced(store, saved);
              setNotice({
                type: 'ok',
                text: 'تم إنشاء ملف المزامنة على Google Drive ورفع كل بياناتك بنجاح!',
              });
            } finally {
              setBusyAction(null);
            }
          },
        });
        return;
      }

      const remoteStore = await downloadSyncFile(token, existing.id);
      const {merged, stats} = mergeOmarsLifeStores(store, remoteStore);

      const summaryLines = [
        `الإجمالي بعد الدمج: ${merged.tasks.length} مهام · ${merged.notes.length} ملاحظات · ${merged.goals.length} أهداف ومشاريع`,
        `إضافات/تحديثات من السحابة: +${stats.addedTasks} مهام (${stats.updatedTasks} تحديث) · +${stats.addedNotes} ملاحظات (${stats.updatedNotes} تحديث) · +${stats.addedGoals} أهداف (${stats.updatedGoals} تحديث)`,
        `سيتم تحديث الملف "${existing.name}" على Google Drive (آخر تعديل سحابي: ${formatDriveTimestamp(existing.modifiedTime)}).`,
      ];

      setPendingConfirm({
        kind: 'smart-sync',
        title: 'تأكيد المزامنة والدمج الذكي مع Google Drive؟',
        description:
          'هيتم دمج بيانات جهازك مع النسخة الموجودة على Google Drive مع الاحتفاظ بأحدث تعديل لكل عنصر، ثم تحديث ملف المزامنة السحابي وبيانات الجهاز معاً.',
        details: summaryLines,
        confirmLabel: 'تأكيد المزامنة والتحديث',
        onConfirm: async () => {
          const activeToken = await requireToken();
          if (!activeToken) return;
          setBusyAction('syncing');
          try {
            const saved = await uploadSyncFile(activeToken, merged, existing.id);
            replaceStore(merged);
            markSynced(merged, saved);
            setNotice({
              type: 'ok',
              text: 'تمت المزامنة والدمج بنجاح بين جهازك وGoogle Drive!',
            });
          } finally {
            setBusyAction(null);
          }
        },
      });
    } catch (err) {
      handleDriveError(err);
    } finally {
      setBusyAction(null);
    }
  }, [handleDriveError, markSynced, replaceStore, requireToken, store]);

  const requestUploadLocalToDrive = useCallback(async () => {
    setNotice(null);
    const token = await requireToken();
    if (!token) return;

    setBusyAction('checking');
    try {
      const existing = await findSyncFile(token);
      setRemoteFile(existing);

      const isOverwrite = Boolean(existing);
      setPendingConfirm({
        kind: 'upload-local',
        title: isOverwrite
          ? 'تأكيد استبدال النسخة السحابية ببيانات هذا الجهاز؟'
          : 'تأكيد رفع بيانات هذا الجهاز إلى Google Drive؟',
        description: isOverwrite
          ? `هيتم استبدال محتوى الملف "${DRIVE_SYNC_FILENAME}" على Google Drive بالكامل ببيانات جهازك الحالية.`
          : `هيتم إنشاء الملف "${DRIVE_SYNC_FILENAME}" على Google Drive وحفظ نسخة كاملة من بياناتك الحالية.`,
        details: [
          `البيانات اللي هتتحفظ: ${store.tasks.length} مهام · ${store.notes.length} ملاحظات · ${store.goals.length} أهداف ومشاريع`,
          ...(existing
            ? [`آخر تعديل للملف الحالي على Drive: ${formatDriveTimestamp(existing.modifiedTime)}`]
            : []),
        ],
        confirmLabel: isOverwrite ? 'تأكيد الاستبدال والرفع' : 'تأكيد الرفع والحفظ',
        onConfirm: async () => {
          const activeToken = await requireToken();
          if (!activeToken) return;
          setBusyAction('uploading');
          try {
            const saved = await uploadSyncFile(activeToken, store, existing?.id ?? null);
            markSynced(store, saved);
            setNotice({
              type: 'ok',
              text: 'تم رفع وحفظ نسخة بياناتك على Google Drive بنجاح!',
            });
          } finally {
            setBusyAction(null);
          }
        },
      });
    } catch (err) {
      handleDriveError(err);
    } finally {
      setBusyAction(null);
    }
  }, [handleDriveError, markSynced, requireToken, store]);

  const requestRestoreFromDrive = useCallback(async () => {
    setNotice(null);
    const token = await requireToken();
    if (!token) return;

    setBusyAction('downloading');
    try {
      const existing = await findSyncFile(token);
      setRemoteFile(existing);
      if (!existing) {
        setNotice({
          type: 'info',
          text: 'مفيش ملف مزامنة محفوظ على Google Drive عشان نستعيده. ارفع بياناتك الأول.',
        });
        return;
      }

      const remoteStore = await downloadSyncFile(token, existing.id);
      setPendingConfirm({
        kind: 'restore-remote',
        title: 'تأكيد استعادة النسخة من Google Drive؟',
        description:
          'هيتم استبدال البيانات المحلية على الجهاز ده بالنسخة المحفوظة على Google Drive. لو عايز تدمج الاتنين من غير ما تفقد تعديلات محلية، اختار "مزامنة ودمج ذكي".',
        details: [
          `محتوى النسخة السحابية: ${remoteStore.tasks.length} مهام · ${remoteStore.notes.length} ملاحظات · ${remoteStore.goals.length} أهداف ومشاريع`,
          `آخر تحديث على Google Drive: ${formatDriveTimestamp(existing.modifiedTime)}`,
          `بياناتك الحالية على الجهاز: ${store.tasks.length} مهام · ${store.notes.length} ملاحظات · ${store.goals.length} أهداف ومشاريع`,
        ],
        confirmLabel: 'تأكيد الاستعادة على الجهاز',
        onConfirm: async () => {
          replaceStore(remoteStore);
          markSynced(remoteStore, existing);
          setNotice({
            type: 'ok',
            text: 'تم استعادة كل بياناتك من Google Drive على الجهاز ده بنجاح!',
          });
        },
      });
    } catch (err) {
      handleDriveError(err);
    } finally {
      setBusyAction(null);
    }
  }, [handleDriveError, markSynced, replaceStore, requireToken, store]);

  const requestDeleteCloudBackup = useCallback(() => {
    if (!remoteFile) {
      setNotice({type: 'info', text: 'مفيش نسخة سحابية موجودة على Google Drive حالياً.'});
      return;
    }
    const target = remoteFile;
    setPendingConfirm({
      kind: 'delete-remote',
      title: 'حذف ملف المزامنة من Google Drive؟',
      description: `هيتم حذف الملف "${target.name}" نهائياً من Google Drive. بياناتك المحلية على الجهاز ده مش هتتأثر.`,
      details: [
        `اسم الملف: ${target.name}`,
        `آخر تعديل: ${formatDriveTimestamp(target.modifiedTime)}`,
      ],
      confirmLabel: 'تأكيد الحذف من Drive',
      destructive: true,
      onConfirm: async () => {
        const activeToken = await requireToken();
        if (!activeToken) return;
        setBusyAction('deleting');
        try {
          await deleteSyncFile(activeToken, target.id);
          setRemoteFile(null);
          setLastSyncedDigest(null);
          setNotice({
            type: 'ok',
            text: 'تم حذف ملف المزامنة من Google Drive بنجاح. بيانات جهازك المحلية زي ما هي.',
          });
        } finally {
          setBusyAction(null);
        }
      },
    });
  }, [remoteFile, requireToken]);

  const handleConfirmExecute = async () => {
    if (!pendingConfirm || confirmExecuting) return;
    setConfirmExecuting(true);
    try {
      await pendingConfirm.onConfirm();
      setPendingConfirm(null);
    } catch (err) {
      setPendingConfirm(null);
      handleDriveError(err);
    } finally {
      setConfirmExecuting(false);
    }
  };

  return (
    <DriveSyncContext.Provider
      value={{
        user,
        needsAuth,
        isSigningIn,
        remoteFile,
        lastSyncedAt,
        hasUnsyncedChanges,
        busyAction,
        notice,
        clearNotice: () => setNotice(null),
        signIn,
        signOut,
        refreshCloudStatus,
        requestSmartSync,
        requestUploadLocalToDrive,
        requestRestoreFromDrive,
        requestDeleteCloudBackup,
      }}
    >
      {children}

      {/* Mandatory Explicit User Confirmation Modal for Google Drive Mutations & Restores */}
      {pendingConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="drive-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => {
            if (!confirmExecuting) setPendingConfirm(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    pendingConfirm.destructive
                      ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                      : 'bg-accent-soft text-accent'
                  }`}
                >
                  {pendingConfirm.destructive ? (
                    <ShieldAlert className="h-5 w-5" />
                  ) : pendingConfirm.kind === 'restore-remote' ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Cloud className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3
                    id="drive-confirm-title"
                    className="text-base font-bold text-slate-900 dark:text-slate-100"
                  >
                    {pendingConfirm.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {pendingConfirm.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={confirmExecuting}
                onClick={() => setPendingConfirm(null)}
                aria-label="إغلاق"
                className="flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {pendingConfirm.details.length > 0 && (
              <ul className="space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                {pendingConfirm.details.map((line, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {line}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                disabled={confirmExecuting}
                onClick={() => setPendingConfirm(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={confirmExecuting}
                onClick={handleConfirmExecute}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-xs font-semibold text-white transition-colors disabled:opacity-60 ${
                  pendingConfirm.destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-accent'
                }`}
              >
                {confirmExecuting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{confirmExecuting ? 'جاري التنفيذ...' : pendingConfirm.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </DriveSyncContext.Provider>
  );
};

export function useDriveSync(): DriveSyncContextValue {
  const ctx = useContext(DriveSyncContext);
  if (!ctx) {
    throw new Error('useDriveSync must be used inside DriveSyncProvider');
  }
  return ctx;
}
