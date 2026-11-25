import React, {useEffect, useState} from 'react';
import {
  Archive,
  Baby,
  Bell,
  BellRing,
  Bot,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckSquare,
  Cloud,
  CloudOff,
  FileBadge2,
  FileText,
  Home,
  Loader2,
  Lock,
  Moon,
  MoreHorizontal,
  Settings,
  Smartphone,
  Sun,
  Target,
  X,
} from 'lucide-react';
import {FocusTimerWidget} from './components/FocusTimerWidget';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';
import {PinLockScreen} from './components/PinLockScreen';
import DailyQuoteCard from './components/DailyQuoteCard';
import {DriveSyncProvider, useDriveSync} from './context/DriveSyncContext';
import {LifeProvider, useLife} from './context/LifeContext';
import {
  formatReminderTime,
  getTodayIso,
  isTaskReminderDueToday,
} from './storage/localStore';
import type {NavSection} from './types';
import {ArchiveView} from './views/ArchiveView';
import {AssistantView} from './views/AssistantView';
import {BabyView} from './views/BabyView';
import {CalendarView} from './views/CalendarView';
import {DocumentsView} from './views/DocumentsView';
import {GoalsProjectsView} from './views/GoalsProjectsView';
import {HabitCoachView} from './views/HabitCoachView';
import {HomeView} from './views/HomeView';
import {NotesView} from './views/NotesView';
import {OmarAiCompanionApp} from './views/OmarAiCompanionApp';
import {SettingsView} from './views/SettingsView';
import {TasksView} from './views/TasksView';
import {getDocumentExpiryInfo} from './storage/documentsAndReminders';
import {buildWidgetPayload, syncOccasionNotifications, syncWidgetData} from './services/nativeBridge';

interface NavItem {
  id: NavSection;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{className?: string}>;
}

const NAV_ITEMS: NavItem[] = [
  {id: 'home', label: 'الرئيسية', shortLabel: 'الرئيسية', icon: Home},
  {id: 'assistant', label: 'المساعد الذكي', shortLabel: 'المساعد', icon: Bot},
  {id: 'tasks', label: 'مهامي', shortLabel: 'مهامي', icon: CheckSquare},
  {id: 'calendar', label: 'التقويم', shortLabel: 'التقويم', icon: CalendarDays},
  {id: 'notes', label: 'ملاحظاتي', shortLabel: 'ملاحظاتي', icon: FileText},
  {id: 'documents', label: 'وثائقي', shortLabel: 'وثائقي', icon: FileBadge2},
  {id: 'goals', label: 'أهدافي ومشاريعي', shortLabel: 'أهدافي', icon: Target},
  {id: 'baby', label: 'الطفل', shortLabel: 'الطفل', icon: Baby},
  {id: 'coach', label: 'مدرب العادات', shortLabel: 'المدرب', icon: BrainCircuit},
  {id: 'archive', label: 'الأرشيف', shortLabel: 'الأرشيف', icon: Archive},
  {id: 'settings', label: 'الإعدادات', shortLabel: 'الإعدادات', icon: Settings},
];

const MOBILE_PRIMARY_NAV_IDS: NavSection[] = ['home', 'assistant', 'tasks', 'calendar', 'goals'];

const Shell: React.FC = () => {
  const {
    activeSection,
    setActiveSection,
    tasks,
    archivedTasks,
    documents,
    lastAutoArchivedCount,
    dismissAutoArchiveNotice,
    preferences,
    updatePreferences,
    updateTask,
    isAppLocked,
    lockApp,
    unlockApp,
  } = useLife();
  const {needsAuth, hasUnsyncedChanges, busyAction, requestSmartSync} = useDriveSync();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [remindersPanelOpen, setRemindersPanelOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<'omar-ai' | 'life'>(() => {
    if (typeof localStorage === 'undefined') return 'omar-ai';
    const saved = localStorage.getItem('omar_workspace_mode_v1');
    return saved === 'life' ? 'life' : 'omar-ai';
  });

  const switchWorkspace = (next: 'omar-ai' | 'life') => {
    setWorkspaceMode(next);
    try {
      localStorage.setItem('omar_workspace_mode_v1', next);
    } catch {
      // Ignore storage error
    }
  };

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const todayIso = getTodayIso();
  const openTasksCount = tasks.filter((t) => t.status !== 'خلصت').length;
  const expiringDocsCount = documents.filter(
    (doc) => getDocumentExpiryInfo(doc, todayIso).isReminderActive,
  ).length;
  const activeReminders = preferences.remindersEnabled
    ? tasks.filter((t) => isTaskReminderDueToday(t, todayIso))
    : [];

  useEffect(() => {
    if (!preferences.remindersEnabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const checkAndNotify = () => {
      const currentIso = getTodayIso();
      const now = new Date();
      const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const storageKey = `omars_life_notified_${currentIso}`;
      let notifiedIds: string[] = [];
      try {
        notifiedIds = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      } catch {
        notifiedIds = [];
      }

      const dueNow = tasks.filter((t) => {
        if (!isTaskReminderDueToday(t, currentIso)) return false;
        if (notifiedIds.includes(t.id)) return false;
        if (t.reminderTime && nowHm < t.reminderTime) return false;
        return true;
      });

      if (dueNow.length === 0) return;

      for (const task of dueNow) {
        try {
          new Notification("تذكير من Omar's Life", {
            body: task.reminderTime
              ? `${task.title} — الساعة ${formatReminderTime(task.reminderTime)}`
              : `${task.title} — ميعادها النهارده`,
          });
          notifiedIds.push(task.id);
        } catch {
          // Ignore browser notification errors in restricted iframes
        }
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify(notifiedIds));
      } catch {
        // Ignore storage quota errors
      }
    };

    checkAndNotify();
    const timer = window.setInterval(checkAndNotify, 60_000);
    return () => window.clearInterval(timer);
  }, [tasks, preferences.remindersEnabled]);

  // The home-screen widget's ✓ button routes here through the native wrapper:
  // mark the open task with this exact title as done.
  useEffect(() => {
    (window as unknown as {__omarWidgetComplete?: (title: string) => void}).__omarWidgetComplete = (
      title: string,
    ) => {
      const open = tasks.filter((t) => t.status !== 'خلصت' && !t.archivedAt);
      const target = open.find((t) => t.title === title) ?? open.find((t) => t.title.includes(title));
      if (target) updateTask(target.id, {status: 'خلصت'});
    };
    return () => {
      delete (window as unknown as {__omarWidgetComplete?: (title: string) => void})
        .__omarWidgetComplete;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // Native Android bridge: schedule day-before notifications for upcoming
  // occasions and push today's tasks + weather to the home-screen widget.
  // Both are no-ops in a plain browser.
  useEffect(() => {
    syncOccasionNotifications(getTodayIso());
    const timer = window.setInterval(() => syncOccasionNotifications(getTodayIso()), 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      syncWidgetData(buildWidgetPayload(tasks, getTodayIso()));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [tasks]);

  const toggleTheme = () => {
    updatePreferences({theme: preferences.theme === 'dark' ? 'light' : 'dark'});
  };

  const renderView = () => {
    switch (activeSection) {
      case 'home':
        return <HomeView />;
      case 'assistant':
        return <AssistantView />;
      case 'tasks':
        return <TasksView />;
      case 'calendar':
        return <CalendarView />;
      case 'notes':
        return <NotesView />;
      case 'documents':
        return <DocumentsView />;
      case 'goals':
        return <GoalsProjectsView />;
      case 'baby':
        return <BabyView />;
      case 'coach':
        return <HabitCoachView />;
      case 'archive':
        return <ArchiveView />;
      case 'settings':
        return <SettingsView />;
    }
  };

  const hasPinLock = Boolean(preferences.pinLockEnabled && preferences.pinHash);

  if (isAppLocked && hasPinLock && preferences.pinHash) {
    return (
      <PinLockScreen
        expectedHash={preferences.pinHash}
        userName={preferences.userName}
        onUnlock={unlockApp}
      />
    );
  }

  if (workspaceMode === 'omar-ai') {
    return <OmarAiCompanionApp onSwitchToLifeApp={() => switchWorkspace('life')} />;
  }

  return (
    <div className="min-h-screen bg-[#F7F9FB] text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {gmpQuotaExceeded && (
        <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-900 shadow-sm md:text-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-950 underline hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <OfflineIndicator />
      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col justify-between border-e border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90 lg:flex">
          <div className="space-y-6">
            <div className="flex items-center justify-between px-3 pt-1">
              <span
                className="font-brand text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
                dir="ltr"
              >
                Omar&apos;s Life
              </span>
              <button
                type="button"
                onClick={() => setRemindersPanelOpen((v) => !v)}
                aria-label="تنبيهات اليوم"
                className={`relative flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl border transition-colors ${
                  activeReminders.length > 0
                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                }`}
              >
                {activeReminders.length > 0 ? (
                  <BellRing className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                {activeReminders.length > 0 && (
                  <span className="absolute -top-1 -end-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                    {activeReminders.length}
                  </span>
                )}
              </button>
            </div>

            <nav className="space-y-1" aria-label="الأقسام الرئيسية">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl px-3 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-accent text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">{item.label}</span>
                    </span>
                    {item.id === 'tasks' && openTasksCount > 0 && (
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          active ? 'text-white/90' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {openTasksCount}
                      </span>
                    )}
                    {item.id === 'documents' && expiringDocsCount > 0 && (
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          active ? 'text-white/95' : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {expiringDocsCount}
                      </span>
                    )}
                    {item.id === 'archive' && archivedTasks.length > 0 && (
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          active ? 'text-white/90' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {archivedTasks.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
            <button
              type="button"
              onClick={() => switchWorkspace('omar-ai')}
              className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>فتح Omar&apos;s personal assistant</span>
            </button>
            <PWAInstallButton variant="sidebar" />
            <button
              type="button"
              onClick={() => {
                if (!needsAuth) {
                  void requestSmartSync();
                } else {
                  setActiveSection('settings');
                }
              }}
              disabled={busyAction !== null}
              className={`flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                !needsAuth
                  ? hasUnsyncedChanges
                    ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {busyAction !== null ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : needsAuth ? (
                <CloudOff className="h-3.5 w-3.5" />
              ) : (
                <Cloud className="h-3.5 w-3.5" />
              )}
              <span>
                {needsAuth
                  ? 'ربط Google Drive'
                  : hasUnsyncedChanges
                    ? 'مزامنة التغييرات'
                    : 'مزامنة Google Drive'}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {preferences.theme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5" />
                  <span>الوضع الفاتح</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" />
                  <span>الوضع الغامق</span>
                </>
              )}
            </button>

            {hasPinLock && (
              <button
                type="button"
                onClick={lockApp}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>قفل التطبيق</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile & Tablet Top Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center border-b border-slate-200/80 bg-white px-3 dark:border-slate-800 dark:bg-slate-800 lg:hidden">
            <div className="relative flex w-full items-center justify-center">
              <button
                type="button"
                onClick={() => setActiveSection('home')}
                dir="ltr"
                className="font-brand truncate text-base font-bold tracking-tight text-slate-900 dark:text-slate-100"
              >
                Omar&apos;s Life
              </button>

              <div className="absolute end-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRemindersPanelOpen((v) => !v)}
                  aria-label="تنبيهات اليوم"
                  className={`relative inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium ${
                    activeReminders.length > 0
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {activeReminders.length > 0 ? (
                    <BellRing className="h-3.5 w-3.5" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                  {activeReminders.length > 0 && (
                    <span className="font-mono text-xs font-bold tabular-nums">
                      {activeReminders.length}
                    </span>
                  )}
                </button>

                {hasPinLock && (
                  <button
                    type="button"
                    onClick={lockApp}
                    aria-label="قفل التطبيق"
                    className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 p-4 pb-24 sm:p-6 lg:pb-8">
            <DailyQuoteCard />
            {/* Due-Today Reminders In-App Notification Banner */}
            {activeReminders.length > 0 && !bannerDismissed && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col gap-3 rounded-2xl border border-amber-200/90 bg-amber-50/90 p-4 dark:border-amber-900/60 dark:bg-amber-950/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                        {activeReminders.length === 1
                          ? 'تذكير النهارده: عندك مهمة واحدة يحين وقتها النهارده'
                          : `تذكير النهارده: عندك ${activeReminders.length} مهام يحين وقتها النهارده`}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {activeReminders.slice(0, 3).map((task) => (
                          <div
                            key={task.id}
                            className="inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-white/80 px-2.5 py-1 text-xs text-slate-800 dark:border-amber-800/50 dark:bg-slate-900/70 dark:text-slate-100"
                          >
                            <span className="max-w-[180px] truncate font-medium">{task.title}</span>
                            {task.reminderTime && (
                              <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                                {formatReminderTime(task.reminderTime)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => updateTask(task.id, {status: 'خلصت'})}
                              aria-label={`تعليم ${task.title} خلصت`}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500 hover:text-white dark:text-emerald-300"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {activeReminders.length > 3 && (
                          <button
                            type="button"
                            onClick={() => setActiveSection('tasks')}
                            className="text-xs font-semibold text-amber-800 hover:underline dark:text-amber-300"
                          >
                            +{activeReminders.length - 3} تانيين في مهامي
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setBannerDismissed(true)}
                    aria-label="إخفاء التذكير مؤقتاً"
                    className="flex min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Auto-Archive Notification Banner */}
            {lastAutoArchivedCount > 0 && activeSection !== 'archive' && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-xs text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 shrink-0 text-accent" />
                  <span>
                    تم نقل{' '}
                    <strong className="font-mono font-semibold tabular-nums">
                      {lastAutoArchivedCount}
                    </strong>{' '}
                    مهام منتهية منذ أكتر من {preferences.autoArchiveDays ?? 30} يوماً إلى الأرشيف
                    تلقائياً.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      dismissAutoArchiveNotice();
                      setActiveSection('archive');
                    }}
                    className="font-semibold text-accent hover:underline"
                  >
                    فتح الأرشيف
                  </button>
                  <button
                    type="button"
                    onClick={dismissAutoArchiveNotice}
                    aria-label="إغلاق إشعار الأرشفة"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {renderView()}
          </main>
        </div>
      </div>

      {/* Reminders Modal / Drawer */}
      {remindersPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 pt-16 backdrop-blur-xs"
          onClick={() => setRemindersPanelOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  تنبيهات النهارده
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRemindersPanelOpen(false)}
                aria-label="إغلاق"
                className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!preferences.remindersEnabled ? (
              <div className="space-y-3 py-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  التنبيهات مقفولة حالياً من الإعدادات.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    updatePreferences({remindersEnabled: true});
                  }}
                  className="min-h-[38px] rounded-xl bg-accent px-4 text-xs font-semibold text-white"
                >
                  تفعيل التنبيهات
                </button>
              </div>
            ) : activeReminders.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                مفيش مهام يحين وقتها النهارده. يومك رايق!
              </p>
            ) : (
              <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {activeReminders.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {task.title}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                        ميعادها النهارده
                        {task.reminderTime ? ` · الساعة ${formatReminderTime(task.reminderTime)}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateTask(task.id, {status: 'خلصت'})}
                      className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500 hover:text-white dark:text-emerald-300"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>خلصت</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setRemindersPanelOpen(false);
                  setActiveSection('tasks');
                }}
                className="min-h-[38px] rounded-xl bg-accent px-4 text-xs font-semibold text-white"
              >
                افتح مهامي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Focus Timer Bar when active outside HomeView */}
      {activeSection !== 'home' && <FocusTimerWidget variant="floating" />}

      {/* Mobile More Bottom Sheet (Archive & Settings) */}
      {moreSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/45 backdrop-blur-xs lg:hidden"
          onClick={() => setMoreSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl border-t border-slate-200 bg-white px-5 pb-6 pt-3 shadow-2xl pb-safe dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">أقسام إضافية</h2>
              <button
                type="button"
                onClick={() => setMoreSheetOpen(false)}
                aria-label="إغلاق"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  if (!needsAuth) {
                    void requestSmartSync();
                  } else {
                    setActiveSection('settings');
                  }
                }}
                disabled={busyAction !== null}
                aria-label={needsAuth ? 'ربط Google Drive' : 'مزامنة Google Drive'}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-xs font-semibold disabled:opacity-60 ${
                  !needsAuth
                    ? hasUnsyncedChanges
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {busyAction !== null ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : needsAuth ? (
                  <CloudOff className="h-4 w-4" />
                ) : (
                  <Cloud className="h-4 w-4" />
                )}
                <span>مزامنة</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  setRemindersPanelOpen((v) => !v);
                }}
                aria-label="تنبيهات اليوم"
                className={`relative flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-xs font-semibold ${
                  activeReminders.length > 0
                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {activeReminders.length > 0 ? (
                  <BellRing className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                <span>
                  تنبيهات
                  {activeReminders.length > 0 ? ` (${activeReminders.length})` : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  toggleTheme();
                }}
                aria-label={preferences.theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الغامق'}
                className="flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {preferences.theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                <span>{preferences.theme === 'dark' ? 'فاتح' : 'غامق'}</span>
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  switchWorkspace('omar-ai');
                }}
                className="flex min-h-[48px] w-full items-center justify-between rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <span className="flex items-center gap-3">
                  <Smartphone className="h-4 w-4 shrink-0" />
                  <span>فتح Omar&apos;s personal assistant</span>
                </span>
              </button>
              {(['baby', 'coach', 'notes', 'documents', 'archive', 'settings'] as const).map((secId) => {
                const nav = NAV_ITEMS.find((i) => i.id === secId)!;
                const Icon = nav.icon;
                const active = activeSection === secId;
                return (
                  <button
                    key={secId}
                    type="button"
                    onClick={() => {
                      setActiveSection(secId);
                      setMoreSheetOpen(false);
                    }}
                    className={`flex min-h-[48px] w-full items-center justify-between rounded-2xl border px-4 text-sm font-semibold transition-colors ${
                      active
                        ? 'border-accent bg-accent text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{nav.label}</span>
                    </span>
                    {secId === 'documents' && expiringDocsCount > 0 && (
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          active ? 'text-white/95' : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {expiringDocsCount}
                      </span>
                    )}
                    {secId === 'archive' && archivedTasks.length > 0 && (
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          active ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {archivedTasks.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation (5 primary daily tabs + More sheet) */}
      <nav
        aria-label="التنقل السريع"
        className="fixed bottom-0 start-0 end-0 z-40 grid h-16 grid-cols-6 items-center border-t border-slate-200 bg-white pb-safe dark:border-slate-800 dark:bg-slate-800 lg:hidden"
      >
        {MOBILE_PRIMARY_NAV_IDS.map((id) => {
          const item = NAV_ITEMS.find((n) => n.id === id)!;
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMoreSheetOpen(false);
                setActiveSection(item.id);
              }}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-0.5 transition-colors ${
                active ? 'text-accent' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate text-[10px] font-medium sm:text-[11px]">
                {item.shortLabel}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreSheetOpen((v) => !v)}
          aria-expanded={moreSheetOpen}
          className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-0.5 transition-colors ${
            moreSheetOpen ||
            activeSection === 'notes' ||
            activeSection === 'documents' ||
            activeSection === 'archive' ||
            activeSection === 'settings'
              ? 'text-accent'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="max-w-full truncate text-[10px] font-medium sm:text-[11px]">
            المزيد
          </span>
        </button>
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <LifeProvider>
      <DriveSyncProvider>
        <Shell />
      </DriveSyncProvider>
    </LifeProvider>
  );
}
