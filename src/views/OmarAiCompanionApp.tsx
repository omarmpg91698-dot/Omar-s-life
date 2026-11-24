import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlarmClock,
  ArrowLeftRight,
  BookOpen,
  Brain,
  Check,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  FolderCode,
  Globe,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Megaphone,
  Menu,
  Mic,
  Moon,
  Paperclip,
  Phone,
  PhoneCall,
  Plus,
  Repeat,
  Search,
  Send,
  Smartphone,
  Square,
  Star,
  Store,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import omarLogoImg from '../assets/images/omar_assistant_logo_1795532106453.jpg';
import {AdPsychologyAuditorPanel} from '../components/AdPsychologyAuditorPanel';
import {LiveVoiceCallModal} from '../components/LiveVoiceCallModal';
import {useLife} from '../context/LifeContext';
import {MEMORY_CATEGORIES} from '../storage/assistantContext';
import {createSimpleId, getTodayIso} from '../storage/localStore';
import {
  EGYPT_AREA_CHIPS,
  PSYCHOLOGY_MARKETING_STUDIES,
  SPECIALIST_MODE_OPTIONS,
  type EgyptShopResult,
  type GroundingSourceItem,
  type SpecialistMode,
} from '../storage/psychologyMarketingKb';
import {
  ARABIC_ISO_WEEKDAYS,
  REMINDER_RECURRENCE_OPTIONS,
  REMINDER_TIME_PRESETS,
  computeNextReminderTrigger,
  formatNextTriggerArabic,
  formatReminderRecurrenceArabic,
  formatTime24,
  formatTimeArabic12,
  normalizeReminderRecurrence,
  parseTime24,
  type ReminderRecurrence,
  type ScheduledReminderItem,
} from '../storage/reminderSchedule';
import type {AssistantMemoryCategory, NoteCategory, TaskRecurrence} from '../types';

interface OmarAiToolCall {
  type: string;
  requiresConfirmation: boolean;
  confirmationPrompt: string;
  appName?: string;
  phoneNumber?: string;
  url?: string;
  title?: string;
  description?: string;
  startTimeIso?: string;
  delayMinutes?: number;
  reminderTime?: string;
  recurrence?: string;
  daysOfWeek?: number[];
  taskId?: string;
  dueDateIso?: string;
  shareText?: string;
  memoryCategory?: string;
  memoryFact?: string;
  isSensitiveMemory?: boolean;
  recipientEmail?: string;
  recipientName?: string;
  subject?: string;
  body?: string;
  content?: string;
  noteCategory?: string;
  openInPhoneNotes?: boolean;
  channel?: 'whatsapp' | 'sms' | string;
  messageText?: string;
}

interface CompanionMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  language?: 'ar-EG' | 'en-US';
  resolvedMode?: SpecialistMode;
  imageDataUrl?: string;
  docName?: string;
  suggestedFollowUps?: string[];
  sources?: GroundingSourceItem[];
  places?: EgyptShopResult[];
  createdAt: number;
}

interface CompanionThread {
  id: string;
  title: string;
  updatedAt: number;
  messages: CompanionMessage[];
}

interface AndroidProjectManifest {
  projectName: string;
  packageName: string;
  minSdk: number;
  targetSdk: number;
  apkBuiltInSandbox: boolean;
  zipAvailable: boolean;
  zipBytes: number;
  fileCount: number;
  files: Array<{path: string; bytes: number}>;
}

const THREADS_STORAGE_KEY = 'omar_ai_companion_threads_v1';
const REMINDERS_STORAGE_KEY = 'omar_ai_scheduled_reminders_v1';

function loadThreads(): CompanionThread[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: CompanionThread[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads.slice(0, 30)));
  } catch {
    // Ignore storage quota errors
  }
}

function loadScheduledReminders(): ScheduledReminderItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REMINDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 60) : [];
  } catch {
    return [];
  }
}

function saveScheduledReminders(items: ScheduledReminderItem[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(items.slice(0, 60)));
  } catch {
    // Ignore storage quota errors
  }
}

async function compressImageFile(file: File, maxSide = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشل قراءة الصورة.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('مقدرناش نجهّز الصورة.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function getSafeExternalUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function mapToTaskRecurrence(recurrence: ReminderRecurrence): TaskRecurrence {
  if (recurrence === 'daily' || recurrence === 'weekly' || recurrence === 'monthly') {
    return recurrence;
  }
  return 'none';
}

function buildSafeMailtoUrl(to?: string, subject?: string, body?: string): string {
  const cleanTo = (to || '').trim();
  const params = new URLSearchParams();
  if (subject?.trim()) params.set('subject', subject.trim());
  if (body?.trim()) params.set('body', body.trim());
  const q = params.toString();
  return `mailto:${encodeURIComponent(cleanTo)}${q ? `?${q}` : ''}`;
}

function normalizeEgyptWhatsAppDigits(rawPhone?: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('01')) return `20${digits.slice(1)}`;
  return digits;
}

function buildSafeWhatsAppUrl(phoneNumber?: string, messageText?: string): string {
  const digits = normalizeEgyptWhatsAppDigits(phoneNumber);
  const text = (messageText || '').trim();
  const params = new URLSearchParams();
  if (digits) params.set('phone', digits);
  if (text) params.set('text', text);
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

function buildSafeSmsUrl(phoneNumber?: string, messageText?: string): string {
  const phone = (phoneNumber || '').replace(/[^0-9+]/g, '');
  const text = (messageText || '').trim();
  return `sms:${encodeURIComponent(phone)}${text ? `?body=${encodeURIComponent(text)}` : ''}`;
}

interface ReminderConfirmationEditorProps {
  tool: OmarAiToolCall;
  onConfirm: (editedTool: OmarAiToolCall) => void;
  onReject: () => void;
}

const ReminderConfirmationEditor: React.FC<ReminderConfirmationEditorProps> = ({
  tool,
  onConfirm,
  onReject,
}) => {
  const initialTime = useMemo(() => {
    if (parseTime24(tool.reminderTime)) return tool.reminderTime!;
    if (typeof tool.delayMinutes === 'number' && tool.delayMinutes > 0) {
      const target = new Date(Date.now() + tool.delayMinutes * 60_000);
      return formatTime24(target.getHours(), target.getMinutes());
    }
    return '08:00';
  }, [tool.delayMinutes, tool.reminderTime]);

  const [titleDraft, setTitleDraft] = useState(tool.title || '');
  const [timeDraft, setTimeDraft] = useState(initialTime);
  const [recurrenceDraft, setRecurrenceDraft] = useState<ReminderRecurrence>(() =>
    normalizeReminderRecurrence(tool.recurrence),
  );
  const [daysDraft, setDaysDraft] = useState<number[]>(() =>
    Array.isArray(tool.daysOfWeek) ? tool.daysOfWeek : [],
  );

  const toggleDay = (isoDay: number) => {
    setDaysDraft((prev) =>
      prev.includes(isoDay) ? prev.filter((d) => d !== isoDay) : [...prev, isoDay],
    );
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#141A24]">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400">
          <AlarmClock className="h-3.5 w-3.5" />
          <span>تأكيد وضبط وقت التذكير</span>
        </span>
        <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {formatReminderRecurrenceArabic(recurrenceDraft, daysDraft)} ·{' '}
          {formatTimeArabic12(timeDraft)}
        </span>
      </div>

      <p className="text-sm text-slate-800 dark:text-slate-200">
        {tool.confirmationPrompt || `جدولة تذكير: ${tool.title || ''}`}
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
            عنوان التذكير
          </label>
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
            الوقت الدقيق
          </label>
          <input
            type="time"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            dir="ltr"
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm tabular-nums outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {REMINDER_RECURRENCE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setRecurrenceDraft(opt.id)}
            className={`min-h-[34px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap ${
              recurrenceDraft === opt.id
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {recurrenceDraft === 'weekly' && (
        <div className="flex flex-wrap gap-1.5">
          {ARABIC_ISO_WEEKDAYS.map((day) => {
            const active = daysDraft.includes(day.isoDay);
            return (
              <button
                key={day.isoDay}
                type="button"
                onClick={() => toggleDay(day.isoDay)}
                className={`min-h-[34px] rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-teal-500 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {day.shortLabel}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!titleDraft.trim()}
          onClick={() =>
            onConfirm({
              ...tool,
              title: titleDraft.trim(),
              reminderTime: timeDraft,
              recurrence: recurrenceDraft,
              daysOfWeek: daysDraft,
            })
          }
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50 whitespace-nowrap"
        >
          <Check className="h-3.5 w-3.5" />
          <span>تأكيد وجدولة</span>
        </button>
        <button
          type="button"
          onClick={onReject}
          className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
};

interface OmarAiCompanionAppProps {
  onSwitchToLifeApp: () => void;
}

export const OmarAiCompanionApp: React.FC<OmarAiCompanionAppProps> = ({
  onSwitchToLifeApp,
}) => {
  const {
    preferences,
    updatePreferences,
    tasks,
    addTask,
    updateTask,
    addNote,
    assistantProfile,
    updateAssistantProfile,
    assistantMemories,
    addAssistantMemory,
    deleteAssistantMemory,
  } = useLife();

  const [threads, setThreads] = useState<CompanionThread[]>(() => loadThreads());
  const [scheduledReminders, setScheduledReminders] = useState<ScheduledReminderItem[]>(() =>
    loadScheduledReminders(),
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<
    'chat' | 'auditor' | 'library' | 'shops' | 'reminders' | 'memory' | 'android'
  >('chat');
  const [specialistMode, setSpecialistMode] = useState<SpecialistMode>('general');
  const [liveCallOpen, setLiveCallOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [inputText, setInputText] = useState('');
  const [voiceLang, setVoiceLang] = useState<'ar-EG' | 'en-US'>('ar-EG');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingDoc, setPendingDoc] = useState<{name: string; text: string} | null>(null);
  const [pendingTools, setPendingTools] = useState<OmarAiToolCall[]>([]);

  // Inline precise reminder picker in chat composer
  const [reminderComposerOpen, setReminderComposerOpen] = useState(false);
  const [composerReminderTitle, setComposerReminderTitle] = useState('');
  const [composerReminderTime, setComposerReminderTime] = useState('08:00');
  const [composerReminderRecurrence, setComposerReminderRecurrence] =
    useState<ReminderRecurrence>('daily');
  const [composerReminderDays, setComposerReminderDays] = useState<number[]>([6, 2]);

  // Psychology & Marketing Library state
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'psychology' | 'marketing'>('all');
  const [librarySearch, setLibrarySearch] = useState('');

  // Egypt Shops Locator state
  const [shopQuery, setShopQuery] = useState('');
  const [shopArea, setShopArea] = useState('القاهرة');
  const [shopOpenNow, setShopOpenNow] = useState(false);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopResults, setShopResults] = useState<EgyptShopResult[]>([]);
  const [shopSummary, setShopSummary] = useState('');
  const [shopSources, setShopSources] = useState<GroundingSourceItem[]>([]);

  // Memory screen state
  const [memCategory, setMemCategory] = useState<AssistantMemoryCategory>('شخصي');
  const [memFact, setMemFact] = useState('');
  const [memFilter, setMemFilter] = useState<'الكل' | AssistantMemoryCategory>('الكل');
  const [bioDraft, setBioDraft] = useState(assistantProfile.personalNotes || '');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingFactDraft, setEditingFactDraft] = useState('');

  // Android project manifest state
  const [manifest, setManifest] = useState<AndroidProjectManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<{stop: () => void} | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const sendMessageRef = useRef<
    (
      overridePrompt?: string,
      overrideMode?: SpecialistMode,
      options?: {suppressAutoSpeak?: boolean},
    ) => Promise<{reply: string; language: 'ar-EG' | 'en-US'} | null>
  >(async () => null);

  useEffect(() => {
    saveThreads(threads);
  }, [threads]);

  useEffect(() => {
    saveScheduledReminders(scheduledReminders);
  }, [scheduledReminders]);

  // Check active recurring reminders every 20s while web companion is open
  useEffect(() => {
    const checkDue = () => {
      const nowMs = Date.now();
      let triggeredTitle: string | null = null;
      setScheduledReminders((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          if (!item.enabled || item.nextTriggerAt > nowMs) return item;
          changed = true;
          triggeredTitle = item.title;
          try {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification("تذكير من Omar's personal assistant", {
                body: `${item.title} (${formatTimeArabic12(item.reminderTime)})`,
              });
            }
          } catch {
            // Ignore restricted iframe notification error
          }
          if (item.recurrence === 'once') {
            return {...item, enabled: false};
          }
          return {
            ...item,
            nextTriggerAt: computeNextReminderTrigger(
              item.reminderTime,
              item.recurrence,
              item.daysOfWeek,
              new Date(nowMs + 5_000),
            ),
          };
        });
        return changed ? next : prev;
      });
      if (triggeredTitle) {
        setStatusNotice(`حان موعد التذكير: ${triggeredTitle}`);
      }
    };

    const timer = window.setInterval(checkDue, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activePanel === 'android' && !manifest && !manifestLoading) {
      setManifestLoading(true);
      fetch('/api/omar-ai/project-manifest')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setManifest(data as AndroidProjectManifest);
        })
        .catch(() => {})
        .finally(() => setManifestLoading(false));
    }
  }, [activePanel, manifest, manifestLoading]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const activeMessages = activeThread?.messages ?? [];
  const activeRemindersCount = useMemo(
    () => scheduledReminders.filter((r) => r.enabled).length,
    [scheduledReminders],
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [activeMessages.length, isSending, pendingTools.length]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const userName = preferences.userName || 'عمر';
    if (voiceLang === 'en-US') {
      if (hour < 12) return `Good morning, ${userName}`;
      if (hour < 18) return `Good afternoon, ${userName}`;
      return `Good evening, ${userName}`;
    }
    if (hour < 12) return `صباح الخير يا ${userName}`;
    if (hour < 18) return `مساء الفل يا ${userName}`;
    return `مساء الخير يا ${userName}`;
  }, [preferences.userName, voiceLang]);

  const stopSpeaking = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsGeneratingVoice(false);
    setIsSpeaking(false);
  }, []);

  const speakWithBrowserFallback = useCallback((clean: string, lang: 'ar-EG' | 'en-US') => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    const hasArabic = /[\u0600-\u06FF]/.test(clean);
    utterance.lang = hasArabic || lang === 'ar-EG' ? 'ar-EG' : 'en-US';
    utterance.rate = 1.02;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const speakText = useCallback(
    async (text: string, lang: 'ar-EG' | 'en-US' = 'ar-EG') => {
      const clean = text.trim();
      if (!clean) return;
      stopSpeaking();

      const controller = new AbortController();
      ttsAbortRef.current = controller;
      setIsGeneratingVoice(true);

      try {
        const res = await fetch('/api/omar-ai/tts', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({text: clean, language: lang, voiceName: 'Charon'}),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          audioBase64?: string;
          mimeType?: string;
        };
        if (controller.signal.aborted) return;

        if (res.ok && data.audioBase64) {
          const audio = new Audio(
            `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`,
          );
          activeAudioRef.current = audio;
          audio.onplay = () => {
            setIsGeneratingVoice(false);
            setIsSpeaking(true);
          };
          audio.onended = () => {
            setIsSpeaking(false);
            activeAudioRef.current = null;
          };
          audio.onerror = () => {
            setIsGeneratingVoice(false);
            setIsSpeaking(false);
            activeAudioRef.current = null;
            speakWithBrowserFallback(clean, lang);
          };
          await audio.play();
          return;
        }
      } catch (err) {
        if ((err as {name?: string})?.name === 'AbortError') return;
      } finally {
        setIsGeneratingVoice(false);
      }

      speakWithBrowserFallback(clean, lang);
    },
    [speakWithBrowserFallback, stopSpeaking],
  );

  const scheduleRecurringReminder = useCallback(
    (input: {
      title: string;
      reminderTime: string;
      recurrence: ReminderRecurrence;
      daysOfWeek?: number[];
      dueDateIso?: string | null;
    }): string => {
      const cleanTitle = input.title.trim();
      if (!cleanTitle) return 'مفيش عنوان واضح للتذكير.';

      const validTime = parseTime24(input.reminderTime) ? input.reminderTime : '08:00';
      const recurrence = normalizeReminderRecurrence(input.recurrence);
      const days = Array.isArray(input.daysOfWeek) ? input.daysOfWeek : [];
      const nextTriggerAt = computeNextReminderTrigger(validTime, recurrence, days);

      const newReminder: ScheduledReminderItem = {
        id: createSimpleId(),
        title: cleanTitle,
        reminderTime: validTime,
        recurrence,
        daysOfWeek: days,
        nextTriggerAt,
        enabled: true,
        createdAt: Date.now(),
      };

      setScheduledReminders((prev) => [newReminder, ...prev]);

      // Also sync into Omar's Life tasks with exact reminderTime and recurrence
      addTask({
        title: cleanTitle,
        dueDate: input.dueDateIso || getTodayIso(),
        priority: 'متوسط',
        tags: ["Omar's personal assistant"],
        reminderEnabled: true,
        reminderTime: validTime,
        recurrence: mapToTaskRecurrence(recurrence),
      });

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'default'
      ) {
        Notification.requestPermission().catch(() => {});
      }

      const recLabel = formatReminderRecurrenceArabic(recurrence, days);
      const timeLabel = formatTimeArabic12(validTime);
      return `تم جدولة التذكير "${cleanTitle}" (${recLabel} · الساعة ${timeLabel}).`;
    },
    [addTask],
  );

  const handleToggleVoiceInput = useCallback(async () => {
    stopSpeaking();

    if (isListening) {
      recognitionRef.current?.stop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: (e: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: (e: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };

    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (SpeechRec) {
      setErrorMessage(null);
      const rec = new SpeechRec();
      rec.lang = voiceLang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          void sendMessageRef.current(transcript);
        }
      };
      rec.onerror = () => {
        setIsListening(false);
        setErrorMessage('مقدرتش أسمع صوت واضح، جرّب تاني أو تأكد من إذن الميكروفون.');
      };
      rec.onend = () => {
        setIsListening(false);
      };
      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
      return;
    }

    // Fallback for browsers without Web Speech API: record audio and transcribe via Gemini 3.5 Transcribe
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        setErrorMessage(null);
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          if (blob.size < 200) return;
          setIsTranscribing(true);
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error('فشل قراءة التسجيل الصوتي.'));
              reader.onload = () => {
                const raw = String(reader.result || '');
                const idx = raw.indexOf(',');
                resolve(idx >= 0 ? raw.slice(idx + 1) : raw);
              };
              reader.readAsDataURL(blob);
            });
            const res = await fetch('/api/omar-ai/transcribe', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({audioBase64: base64, mimeType: blob.type || 'audio/webm'}),
            });
            const data = (await res.json().catch(() => ({}))) as {transcript?: string; message?: string};
            if (res.ok && data.transcript?.trim()) {
              void sendMessageRef.current(data.transcript.trim());
            } else {
              setErrorMessage(data.message || 'مقدرتش أسمع كلام واضح، جرّب تسجل تاني.');
            }
          } catch {
            setErrorMessage('حصلت مشكلة أثناء تحويل صوتك لنص، جرّب تاني.');
          } finally {
            setIsTranscribing(false);
          }
        };
        mediaRecorderRef.current = recorder;
        setIsListening(true);
        recorder.start();
      } catch {
        setIsListening(false);
        setErrorMessage("تأكد من السماح بإذن الميكروفون عشان تقدر تتكلم مع Omar's personal assistant بالمصري.");
      }
      return;
    }

    setErrorMessage(
      'الإملاء الصوتي غير مدعوم في المتصفح الحالي. في تطبيق Android الأصلي بيشتغل بـ SpeechRecognizer مباشرة.',
    );
  }, [isListening, stopSpeaking, voiceLang]);

  const executeToolInWebCompanion = useCallback(
    (tool: OmarAiToolCall): string => {
      switch (tool.type) {
        case 'create_reminder': {
          let resolvedTime = tool.reminderTime || '';
          if (!parseTime24(resolvedTime)) {
            const delay = typeof tool.delayMinutes === 'number' ? tool.delayMinutes : 15;
            const d = new Date(Date.now() + delay * 60_000);
            resolvedTime = formatTime24(d.getHours(), d.getMinutes());
          }
          return scheduleRecurringReminder({
            title: tool.title || '',
            reminderTime: resolvedTime,
            recurrence: normalizeReminderRecurrence(tool.recurrence),
            daysOfWeek: tool.daysOfWeek,
            dueDateIso: tool.dueDateIso,
          });
        }
        case 'create_task': {
          const title = (tool.title || '').trim();
          if (!title) return 'مفيش عنوان واضح للمهمة.';
          addTask({
            title,
            dueDate: tool.dueDateIso || null,
            priority: 'متوسط',
            tags: ["Omar's personal assistant"],
            reminderEnabled: true,
          });
          return `اتضافت المهمة "${title}" بنجاح.`;
        }
        case 'complete_task': {
          if (tool.taskId) {
            updateTask(tool.taskId, {status: 'خلصت'});
            return `اتعلّم على "${tool.title || 'المهمة'}" إنها خلصت.`;
          }
          return 'مقدرتش أحدد المهمة المطلوبة.';
        }
        case 'save_memory': {
          const fact = (tool.memoryFact || '').trim();
          if (!fact) return 'مفيش معلومة واضحة للحفظ.';
          const cat = MEMORY_CATEGORIES.includes(tool.memoryCategory as AssistantMemoryCategory)
            ? (tool.memoryCategory as AssistantMemoryCategory)
            : 'شخصي';
          addAssistantMemory({category: cat, fact});
          return `اتحفظت في ذاكرتي: ${fact}`;
        }
        case 'create_note': {
          const title = (tool.title || 'ملاحظة سريعة').trim();
          const content = (tool.content || tool.description || '').trim();
          if (!content) return 'مفيش نص واضح عشان أحفظه كنوت.';
          const validCats: NoteCategory[] = ['شخصي', 'شغل', 'أفكار', 'حاجات مهمة'];
          const category = validCats.includes(tool.noteCategory as NoteCategory)
            ? (tool.noteCategory as NoteCategory)
            : 'شخصي';
          addNote({title, content, category});
          return `اتحفظت الملاحظة "${title}" بنجاح في قسم الملاحظات.`;
        }
        case 'compose_email': {
          const fullEmail = [
            tool.recipientEmail ? `إلى: ${tool.recipientEmail}` : '',
            tool.subject ? `الموضوع: ${tool.subject}` : '',
            '',
            tool.body || '',
          ]
            .filter(Boolean)
            .join('\n');
          if (fullEmail && typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(fullEmail).catch(() => {});
          }
          return 'تم تجهيز تمبليت الإيميل ونسخه للحافظة (وتقدر تفتحه مباشرة في Gmail من الزرار).';
        }
        case 'send_message': {
          const text = (tool.messageText || tool.body || '').trim();
          if (text && typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(() => {});
          }
          return tool.channel === 'sms'
            ? 'جهّزتلك رسالة SMS ونسخت النص للحافظة.'
            : 'جهّزتلك رسالة واتساب ونسخت النص للحافظة.';
        }
        case 'share_content': {
          const shareText = (tool.shareText || tool.title || '').trim();
          if (shareText && typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(shareText).catch(() => {});
            return 'اتنسخ النص للحافظة وجاهز للمشاركة (وفي تطبيق Android بيفتح قائمة المشاركة الرسمية).';
          }
          return 'مفيش نص للمشاركة.';
        }
        case 'open_app':
        case 'dial_number':
        case 'create_calendar_event':
          return "الإجراء ده بيتنفّذ مباشرة على الموبايل داخل تطبيق Android الأصلي (Omar's personal assistant APK) بصلاحيات النظام الرسمية.";
        default:
          return 'تمت المراجعة.';
      }
    },
    [addAssistantMemory, addNote, addTask, scheduleRecurringReminder, updateTask],
  );

  const sendMessage = useCallback(
    async (
      overridePrompt?: string,
      overrideMode?: SpecialistMode,
      options?: {suppressAutoSpeak?: boolean},
    ): Promise<{reply: string; language: 'ar-EG' | 'en-US'} | null> => {
      const text = (overridePrompt ?? inputText).trim();
      const effectiveMode = overrideMode ?? specialistMode;
      if ((!text && !pendingImage && !pendingDoc) || isSending) return null;

      stopSpeaking();
      setErrorMessage(null);
      setStatusNotice(null);
      setPendingTools([]);
      setReminderComposerOpen(false);

      const userPromptText =
        text ||
        (pendingImage
          ? 'اقرأ وحلّل الصورة دي بالتفصيل.'
          : pendingDoc
            ? `لخّصلي ملف ${pendingDoc.name}`
            : '');

      const now = Date.now();
      let targetThreadId = activeThreadId;
      const userMsg: CompanionMessage = {
        id: createSimpleId(),
        role: 'user',
        text: userPromptText,
        imageDataUrl: pendingImage ?? undefined,
        docName: pendingDoc?.name,
        createdAt: now,
      };

      const historySnapshot = activeMessages.slice(-10).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      if (!targetThreadId) {
        targetThreadId = createSimpleId();
        const newThread: CompanionThread = {
          id: targetThreadId,
          title: userPromptText.slice(0, 44),
          updatedAt: now,
          messages: [userMsg],
        };
        setThreads((prev) => [newThread, ...prev]);
        setActiveThreadId(targetThreadId);
      } else {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === targetThreadId
              ? {...t, updatedAt: now, messages: [...t.messages, userMsg]}
              : t,
          ),
        );
      }

      const imgToSend = pendingImage;
      const docToSend = pendingDoc;
      setInputText('');
      setPendingImage(null);
      setPendingDoc(null);
      setIsSending(true);

      try {
        const res = await fetch('/api/omar-ai/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            message: userPromptText,
            imageDataUrl: imgToSend ?? undefined,
            attachedDocName: docToSend?.name,
            attachedDocText: docToSend?.text,
            history: historySnapshot,
            memories: assistantMemories.map((m) => ({category: m.category, fact: m.fact})),
            tasks: tasks.slice(0, 25).map((t) => ({
              id: t.id,
              title: t.title,
              dueDateIso: t.dueDate,
              completed: t.status === 'خلصت',
            })),
            userName: preferences.userName || 'عمر',
            personalBio: [
              assistantProfile.roleAndWork,
              assistantProfile.dailyRoutine,
              assistantProfile.topPriorities,
              assistantProfile.personalNotes,
            ]
              .filter(Boolean)
              .join(' | '),
            preferredLanguage: voiceLang,
            specialistMode: effectiveMode,
            deviceTimeIso: new Date().toISOString(),
            deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo',
          }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          language?: 'ar-EG' | 'en-US';
          resolvedMode?: SpecialistMode;
          suggestedFollowUps?: string[];
          toolCalls?: OmarAiToolCall[];
          sources?: GroundingSourceItem[];
          places?: EgyptShopResult[];
          message?: string;
        };

        if (!res.ok || !data.reply) {
          setErrorMessage(data.message || "حصلت مشكلة مؤقتة في الاتصال بـ Omar's personal assistant.");
          return null;
        }

        const assistantMsg: CompanionMessage = {
          id: createSimpleId(),
          role: 'assistant',
          text: data.reply,
          language: data.language === 'en-US' ? 'en-US' : 'ar-EG',
          resolvedMode: data.resolvedMode ?? effectiveMode,
          suggestedFollowUps: data.suggestedFollowUps ?? [],
          sources: Array.isArray(data.sources) ? data.sources : [],
          places: Array.isArray(data.places) ? data.places : [],
          createdAt: Date.now(),
        };

        setThreads((prev) =>
          prev.map((t) =>
            t.id === targetThreadId
              ? {...t, updatedAt: Date.now(), messages: [...t.messages, assistantMsg]}
              : t,
          ),
        );

        const incomingTools = Array.isArray(data.toolCalls) ? data.toolCalls : [];
        if (incomingTools.length > 0) {
          setPendingTools(incomingTools);
        }

        if (autoSpeak && !options?.suppressAutoSpeak) {
          void speakText(assistantMsg.text, assistantMsg.language);
        }

        return {
          reply: assistantMsg.text,
          language: assistantMsg.language ?? 'ar-EG',
        };
      } catch {
        setErrorMessage('تعذر الاتصال بالخادم. تأكد من الإنترنت وجرّب تاني.');
        return null;
      } finally {
        setIsSending(false);
      }
    },
    [
      activeMessages,
      activeThreadId,
      assistantMemories,
      assistantProfile,
      autoSpeak,
      inputText,
      isSending,
      pendingDoc,
      pendingImage,
      preferences.userName,
      specialistMode,
      speakText,
      stopSpeaking,
      tasks,
      voiceLang,
    ],
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const handleSearchEgyptShops = async (overrideQuery?: string, overrideArea?: string) => {
    const q = (overrideQuery ?? shopQuery).trim();
    const area = (overrideArea ?? shopArea).trim();
    if (!q) {
      setErrorMessage('اكتب نوع المحل أو المنتج اللي بتدور عليه في مصر.');
      return;
    }
    setShopLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/omar-ai/egypt-shops', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({query: q, area, openNow: shopOpenNow}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        places?: EgyptShopResult[];
        sources?: GroundingSourceItem[];
        summary?: string;
        message?: string;
      };
      if (!res.ok) {
        setErrorMessage(data.message || 'مقدرناش نبحث عن المحلات دلوقتي، جرّب تاني.');
        return;
      }
      setShopResults(Array.isArray(data.places) ? data.places : []);
      setShopSources(Array.isArray(data.sources) ? data.sources : []);
      setShopSummary(typeof data.summary === 'string' ? data.summary : '');
    } catch {
      setErrorMessage('تعذر الاتصال بخدمة خرائط مصر دلوقتي.');
    } finally {
      setShopLoading(false);
    }
  };

  const filteredStudies = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return PSYCHOLOGY_MARKETING_STUDIES.filter((s) => {
      if (libraryFilter !== 'all' && s.domain !== libraryFilter) return false;
      if (!q) return true;
      return (
        s.titleAr.toLowerCase().includes(q) ||
        s.titleEn.toLowerCase().includes(q) ||
        s.researcher.toLowerCase().includes(q) ||
        s.summaryAr.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [libraryFilter, librarySearch]);

  const activeModeMeta = useMemo(
    () =>
      SPECIALIST_MODE_OPTIONS.find((m) => m.id === specialistMode) ?? SPECIALIST_MODE_OPTIONS[0],
    [specialistMode],
  );

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      setPendingImage(dataUrl);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'مقدرناش نحمّل الصورة.');
    }
  };

  const handleDocPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = (await file.text()).slice(0, 12_000);
      setPendingDoc({name: file.name, text});
      setErrorMessage(null);
    } catch {
      setErrorMessage('مقدرناش نقرأ الملف ده. استخدم ملف نصي (TXT / MD / CSV / JSON).');
    }
  };

  const filteredMemories = useMemo(
    () =>
      memFilter === 'الكل'
        ? assistantMemories
        : assistantMemories.filter((m) => m.category === memFilter),
    [assistantMemories, memFilter],
  );

  const toggleTheme = () => {
    updatePreferences({theme: preferences.theme === 'dark' ? 'light' : 'dark'});
  };

  const handleDirectComposerSchedule = () => {
    const title = composerReminderTitle.trim() || inputText.trim();
    if (!title) {
      setErrorMessage('اكتب عنوان التذكير الأول.');
      return;
    }
    const msg = scheduleRecurringReminder({
      title,
      reminderTime: composerReminderTime,
      recurrence: composerReminderRecurrence,
      daysOfWeek: composerReminderRecurrence === 'weekly' ? composerReminderDays : [],
    });
    setStatusNotice(msg);
    setComposerReminderTitle('');
    setInputText('');
    setReminderComposerOpen(false);
  };

  const isRtl = voiceLang === 'ar-EG';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="flex h-screen w-full overflow-hidden bg-[#F7F8FA] text-slate-900 dark:bg-[#0A0D12] dark:text-slate-100"
    >
      {/* Desktop Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col justify-between border-e border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F141D] lg:flex">
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <img
                src={omarLogoImg}
                alt="Omar's personal assistant"
                referrerPolicy="no-referrer"
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-teal-500/40"
              />
              <span className="font-brand truncate text-sm font-bold tracking-tight" dir="ltr">
                Omar&apos;s personal assistant
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setActiveThreadId(null);
                setPendingTools([]);
                setActivePanel('chat');
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-500 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>محادثة جديدة</span>
            </button>
          </div>

          <nav className="space-y-1" aria-label="أقسام Omar's personal assistant">
            <button
              type="button"
              onClick={() => setActivePanel('chat')}
              className={`flex min-h-[42px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                activePanel === 'chat'
                  ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
              }`}
            >
              <Mic className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">المحادثة الصوتية والنصية</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('reminders')}
              className={`flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 text-sm font-medium transition-colors ${
                activePanel === 'reminders'
                  ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-3">
                <AlarmClock className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">التذكيرات المتكررة</span>
              </span>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {activeRemindersCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('auditor')}
              className={`flex min-h-[42px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                activePanel === 'auditor'
                  ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
              }`}
            >
              <Megaphone className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">محلّل الإعلانات بالسيكولوجي</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('library')}
              className={`flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 text-sm font-medium transition-colors ${
                activePanel === 'library'
                  ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-3">
                <BookOpen className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">مكتبة علم النفس والتسويق</span>
              </span>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {PSYCHOLOGY_MARKETING_STUDIES.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('shops')}
              className={`flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 text-sm font-medium transition-colors ${
                activePanel === 'shops'
                  ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">محلات وأماكن مصر</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('memory')}
              className={`flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 text-sm font-medium transition-colors ${
                activePanel === 'memory'
                  ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-3">
                <Brain className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">ذاكرة Omar&apos;s personal assistant</span>
              </span>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {assistantMemories.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('android')}
              className={`flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 text-sm font-medium transition-colors ${
                activePanel === 'android'
                  ? 'bg-teal-600/12 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
                  : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">مشروع Android (APK)</span>
              </span>
            </button>
          </nav>

          {/* Conversation History */}
          <div className="flex min-h-0 flex-1 flex-col border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                المحادثات السابقة
              </span>
              {threads.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setThreads([]);
                    setActiveThreadId(null);
                  }}
                  className="text-xs text-slate-400 hover:text-rose-500"
                >
                  مسح الكل
                </button>
              )}
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto pe-1">
              {threads.length === 0 ? (
                <p className="px-2 py-4 text-xs text-slate-400 dark:text-slate-500">
                  مفيش محادثات سابقة لسه. ابدأ كلامك مع Omar&apos;s personal assistant.
                </p>
              ) : (
                threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={`group flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs transition-colors ${
                      activeThreadId === thread.id && activePanel === 'chat'
                        ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveThreadId(thread.id);
                        setActivePanel('chat');
                      }}
                      className="min-w-0 flex-1 truncate text-start"
                    >
                      {thread.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setThreads((prev) => prev.filter((t) => t.id !== thread.id));
                        if (activeThreadId === thread.id) setActiveThreadId(null);
                      }}
                      aria-label="حذف المحادثة"
                      className="opacity-60 hover:text-rose-500 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-[#141A24] dark:text-slate-200 whitespace-nowrap"
            >
              {preferences.theme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5" />
                  <span>فاتح</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" />
                  <span>داكن</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setVoiceLang((l) => (l === 'ar-EG' ? 'en-US' : 'ar-EG'))}
              className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-[#141A24] dark:text-slate-200 whitespace-nowrap"
            >
              {voiceLang === 'ar-EG' ? 'مصري · AR' : 'English · EN'}
            </button>
          </div>
          <button
            type="button"
            onClick={onSwitchToLifeApp}
            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:border-teal-500 hover:text-teal-600 dark:border-slate-800 dark:text-slate-300 dark:hover:text-teal-300 whitespace-nowrap"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>فتح Omar&apos;s Life (المهام والتقويم)</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-72 flex-col justify-between bg-white p-4 shadow-2xl dark:bg-[#0F141D]"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <img
                    src={omarLogoImg}
                    alt="Omar's personal assistant"
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-teal-500/40"
                  />
                  <span className="font-brand truncate text-base font-bold" dir="ltr">
                    Omar&apos;s personal assistant
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="إغلاق القائمة"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveThreadId(null);
                  setActivePanel('chat');
                  setDrawerOpen(false);
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                <span>محادثة جديدة</span>
              </button>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel('chat');
                    setDrawerOpen(false);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Mic className="h-4 w-4" />
                  <span>المحادثة</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel('reminders');
                    setDrawerOpen(false);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <AlarmClock className="h-4 w-4" />
                  <span>التذكيرات المتكررة ({activeRemindersCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel('auditor');
                    setDrawerOpen(false);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Megaphone className="h-4 w-4" />
                  <span>محلّل الإعلانات بالسيكولوجي</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel('library');
                    setDrawerOpen(false);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>مكتبة علم النفس والتسويق ({PSYCHOLOGY_MARKETING_STUDIES.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel('shops');
                    setDrawerOpen(false);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <MapPin className="h-4 w-4" />
                  <span>محلات وأماكن مصر</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel('memory');
                    setDrawerOpen(false);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Brain className="h-4 w-4" />
                  <span>ذاكرة Omar&apos;s personal assistant ({assistantMemories.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel('android');
                    setDrawerOpen(false);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>تحميل مشروع Android (APK)</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-medium dark:border-slate-800"
              >
                {preferences.theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                <span>{preferences.theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onSwitchToLifeApp();
                }}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-medium dark:border-slate-800"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>الرجوع لـ Omar&apos;s Life</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Clean Minimal Top Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#0A0D12]/90">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="فتح القائمة"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img
              src={omarLogoImg}
              alt="Omar's personal assistant"
              referrerPolicy="no-referrer"
              className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-teal-500/40"
            />
            <span
              className="font-brand text-base font-bold tracking-tight whitespace-nowrap"
              dir="ltr"
            >
              Omar&apos;s personal assistant
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(isSpeaking || isGeneratingVoice) && (
              <button
                type="button"
                onClick={stopSpeaking}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-rose-500/15 px-3 text-xs font-semibold text-rose-600 dark:text-rose-300 whitespace-nowrap shrink-0"
              >
                {isGeneratingVoice ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5 fill-current" />
                )}
                <span>{isGeneratingVoice ? 'بيجهز الصوت المصري...' : 'إيقاف الصوت'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setLiveCallOpen(true);
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-600 hover:text-white dark:text-teal-300 dark:hover:bg-teal-600 dark:hover:text-white whitespace-nowrap shrink-0"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">مكالمة حية</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === 'reminders' ? 'chat' : 'reminders')}
              aria-label="التذكيرات المتكررة"
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                activePanel === 'reminders' || activeRemindersCount > 0
                  ? 'border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <AlarmClock className="h-4 w-4" />
              {activeRemindersCount > 0 && (
                <span className="absolute -end-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                  {activeRemindersCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setAutoSpeak((v) => !v)}
              aria-label={autoSpeak ? 'كتم القراءة التلقائية' : 'تفعيل القراءة التلقائية'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === 'android' ? 'chat' : 'android')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-500 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{activePanel === 'android' ? 'العودة للشات' : 'مشروع Android'}</span>
            </button>
          </div>
        </header>

        {/* Panel Router */}
        {activePanel === 'reminders' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold">التذكيرات المتكررة والمجدولة</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  ظبط تذكيرات يومية أو أسبوعية أو شهرية بوقت دقيق — وفي تطبيق Android الأصلي بتشتغل بنظام AlarmManager وإشعارات أندرويد وتفضل شغالة حتى بعد إعادة تشغيل الموبايل.
                </p>
              </div>

              {/* Add Recurring Reminder Card */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]">
                <h2 className="text-sm font-semibold">جدولة تذكير جديد بوقت دقيق</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                      عنوان التذكير
                    </label>
                    <input
                      type="text"
                      value={composerReminderTitle}
                      onChange={(e) => setComposerReminderTitle(e.target.value)}
                      placeholder="مثلاً: أخذ الفيتامين أو مراجعة خطة اليوم"
                      className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                      الوقت الدقيق
                    </label>
                    <input
                      type="time"
                      value={composerReminderTime}
                      onChange={(e) => setComposerReminderTime(e.target.value)}
                      dir="ltr"
                      className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm tabular-nums outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">أوقات سريعة:</span>
                  {REMINDER_TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.time24}
                      type="button"
                      onClick={() => setComposerReminderTime(preset.time24)}
                      className={`min-h-[32px] rounded-lg px-2.5 font-mono text-xs tabular-nums transition-colors ${
                        composerReminderTime === preset.time24
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <span className="block text-xs text-slate-500 dark:text-slate-400">التكرار</span>
                  <div className="flex flex-wrap gap-1.5">
                    {REMINDER_RECURRENCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setComposerReminderRecurrence(opt.id)}
                        className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                          composerReminderRecurrence === opt.id
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {composerReminderRecurrence === 'weekly' && (
                  <div className="flex flex-wrap gap-1.5">
                    {ARABIC_ISO_WEEKDAYS.map((day) => {
                      const active = composerReminderDays.includes(day.isoDay);
                      return (
                        <button
                          key={day.isoDay}
                          type="button"
                          onClick={() =>
                            setComposerReminderDays((prev) =>
                              prev.includes(day.isoDay)
                                ? prev.filter((d) => d !== day.isoDay)
                                : [...prev, day.isoDay],
                            )
                          }
                          className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-slate-900 text-white dark:bg-teal-500 dark:text-slate-950'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleDirectComposerSchedule}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-semibold text-white hover:bg-teal-500 whitespace-nowrap"
                >
                  <AlarmClock className="h-4 w-4" />
                  <span>حفظ وجدولة التذكير</span>
                </button>
              </div>

              {/* Active Reminders List */}
              {scheduledReminders.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  مفيش تذكيرات مجدولة لسه. جرّب تكتب لـ Omar&apos;s personal assistant: &quot;فكّرني كل يوم الساعة ٨ الصبح أراجع خطة يومي&quot;.
                </p>
              ) : (
                <div className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#121720]">
                  {scheduledReminders.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-semibold ${
                            item.enabled
                              ? 'text-slate-900 dark:text-slate-100'
                              : 'text-slate-400 line-through dark:text-slate-500'
                          }`}
                        >
                          {item.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono font-semibold text-teal-600 tabular-nums dark:text-teal-400">
                            {formatTimeArabic12(item.reminderTime)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {formatReminderRecurrenceArabic(item.recurrence, item.daysOfWeek)}
                          </span>
                          {item.enabled && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                التنبيه القادم: {formatNextTriggerArabic(item.nextTriggerAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setScheduledReminders((prev) =>
                              prev.map((r) => {
                                if (r.id !== item.id) return r;
                                const nextEnabled = !r.enabled;
                                return {
                                  ...r,
                                  enabled: nextEnabled,
                                  nextTriggerAt: nextEnabled
                                    ? computeNextReminderTrigger(
                                        r.reminderTime,
                                        r.recurrence,
                                        r.daysOfWeek,
                                      )
                                    : r.nextTriggerAt,
                                };
                              }),
                            )
                          }
                          className={`min-h-[36px] rounded-xl px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                            item.enabled
                              ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {item.enabled ? 'مفعّل' : 'متوقف'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setScheduledReminders((prev) => prev.filter((r) => r.id !== item.id))
                          }
                          aria-label="حذف التذكير"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activePanel === 'android' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  تطبيق Omar&apos;s personal assistant الأصلي لأندرويد (Kotlin + Jetpack Compose)
                </h1>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  المشروع مكتوب بالكامل بـ Kotlin و Jetpack Compose و Material 3 و Room و AlarmManager + BroadcastReceiver للتذكيرات المتكررة الدقيقة (تفضل شغالة حتى بعد إعادة تشغيل الموبايل)، بالإضافة لـ TimePicker و SpeechRecognizer و TextToSpeech ومربوط بالخادم الآمن بدون أي API Key داخل الـ APK.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/api/omar-ai/project-zip"
                  download="OmarAI-AndroidStudio-Project.zip"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  <span>تحميل مشروع Android Studio كامل (ZIP)</span>
                </a>
                {manifest && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {manifest.fileCount} ملف · {(manifest.zipBytes / 1024).toFixed(1)} KB · Android
                    SDK {manifest.minSdk}–{manifest.targetSdk}
                  </span>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]">
                <h2 className="mb-3 text-base font-semibold">
                  خطوات استخراج الـ APK وتثبيته على Samsung S23 Ultra
                </h2>
                <ol className="list-decimal space-y-2.5 ps-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  <li>
                    حمّل ملف <code className="font-mono text-xs">OmarAI-AndroidStudio-Project.zip</code> وفك الضغط عنه.
                  </li>
                  <li>
                    افتح برنامج <strong>Android Studio</strong> واضغط <strong>File → Open</strong> واختار مجلد{' '}
                    <code className="font-mono text-xs">android-omar-ai</code>.
                  </li>
                  <li>
                    استنى Gradle Sync يخلص تلقائياً (الرابط الآمن للخادم مضبوط جاهز داخل{' '}
                    <code className="font-mono text-xs">app/build.gradle.kts</code> بدون أي مفاتيح سرية).
                  </li>
                  <li>
                    لبناء Debug APK: اختار{' '}
                    <strong>Build → Build Bundle(s) / APK(s) → Build APK(s)</strong> (أو شغّل{' '}
                    <code className="font-mono text-xs">./gradlew assembleDebug</code>).
                  </li>
                  <li>
                    انقل ملف <code className="font-mono text-xs">app-debug.apk</code> لموبايلك Samsung S23 Ultra أو وصّله بكابل USB مع تفعيل USB Debugging واضغط Run.
                  </li>
                </ol>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <FolderCode className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    <span>ملفات المشروع الأصلية</span>
                  </h2>
                  {manifestLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
                {manifest && (
                  <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/80">
                    {manifest.files.map((f) => (
                      <div
                        key={f.path}
                        className="flex items-center justify-between gap-4 py-2 text-xs"
                        dir="ltr"
                      >
                        <span className="truncate font-mono text-slate-700 dark:text-slate-300">
                          {f.path}
                        </span>
                        <span className="shrink-0 font-mono text-slate-400 tabular-nums">
                          {(f.bytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activePanel === 'memory' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold">ذاكرة Omar&apos;s personal assistant الشخصية</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  التحكم الكامل في كل حاجة Omar&apos;s personal assistant فاكرها عنك — عدّل أو احذف أي معلومة في أي وقت.
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]">
                <label className="block text-sm font-semibold">نبذة عن حياتك وتفضيلاتك</label>
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  rows={3}
                  placeholder="مثلاً: طبيعة شغلك، مواعيد يومك، الحاجات اللي بتحبها، أسلوب الكلام اللي يريحك..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
                />
                <button
                  type="button"
                  onClick={() => {
                    updateAssistantProfile({personalNotes: bioDraft});
                    setStatusNotice('تم حفظ نبذتك الشخصية.');
                  }}
                  className="inline-flex min-h-[40px] items-center rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500"
                >
                  حفظ النبذة
                </button>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]">
                <h2 className="text-sm font-semibold">أضف معلومة جديدة</h2>
                <div className="flex flex-wrap gap-1.5">
                  {MEMORY_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMemCategory(cat)}
                      className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors ${
                        memCategory === cat
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={memFact}
                    onChange={(e) => setMemFact(e.target.value)}
                    placeholder="مثلاً: بفضل المواعيد الصبح بدري وبروح الجيم الساعة ٧"
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!memFact.trim()) return;
                      addAssistantMemory({category: memCategory, fact: memFact});
                      setMemFact('');
                    }}
                    className="min-h-[42px] rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500 whitespace-nowrap"
                  >
                    حفظ
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {(['الكل', ...MEMORY_CATEGORIES] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMemFilter(cat)}
                      className={`min-h-[34px] rounded-lg px-3 text-xs font-medium transition-colors ${
                        memFilter === cat
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {filteredMemories.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    مفيش ذكريات محفوظة في القسم ده لسه.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#121720]">
                    {filteredMemories.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-teal-600 dark:text-teal-400">
                            {item.category}
                          </p>
                          {editingMemoryId === item.id ? (
                            <div className="mt-1.5 flex gap-2">
                              <input
                                type="text"
                                value={editingFactDraft}
                                onChange={(e) => setEditingFactDraft(e.target.value)}
                                className="min-h-[36px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-[#0B0F17]"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingFactDraft.trim()) {
                                    deleteAssistantMemory(item.id);
                                    addAssistantMemory({
                                      category: item.category,
                                      fact: editingFactDraft.trim(),
                                    });
                                  }
                                  setEditingMemoryId(null);
                                }}
                                className="rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white"
                              >
                                حفظ
                              </button>
                            </div>
                          ) : (
                            <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">
                              {item.fact}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMemoryId(item.id);
                              setEditingFactDraft(item.fact);
                            }}
                            aria-label="تعديل"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAssistantMemory(item.id)}
                            aria-label="حذف"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activePanel === 'auditor' ? (
          <AdPsychologyAuditorPanel
            compressImage={compressImageFile}
            onSpeakArabic={(text) => void speakText(text, 'ar-EG')}
          />
        ) : activePanel === 'library' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-4xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold">مكتبة دراسات علم النفس والتسويق</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  أشهر الدراسات العلمية الموثقة في علم النفس السلوكي والتسويق — اضغط على أي دراسة عشان Omar&apos;s personal assistant يشرحهالك بالمصري ويبحثلك عن أحدث الأبحاث والتطبيقات من النت.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      {id: 'all', label: 'الكل'},
                      {id: 'psychology', label: 'علم النفس'},
                      {id: 'marketing', label: 'التسويق والإقناع'},
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setLibraryFilter(tab.id)}
                      className={`min-h-[38px] rounded-xl px-4 text-xs font-semibold transition-colors whitespace-nowrap ${
                        libraryFilter === tab.id
                          ? 'bg-teal-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#121720] dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="ابحث باسم الدراسة أو العالم..."
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white pe-3 ps-9 text-sm outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-[#121720]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredStudies.map((study) => (
                  <article
                    key={study.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-teal-500/50 dark:border-slate-800 dark:bg-[#121720]"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                          {study.domain === 'psychology' ? 'دراسة علم نفس' : 'علم نفس التسويق'} ·{' '}
                          <span className="font-mono tabular-nums">{study.year}</span>
                        </span>
                        <span
                          className="truncate text-[11px] text-slate-400 dark:text-slate-500"
                          dir="ltr"
                        >
                          {study.researcher}
                        </span>
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          {study.titleAr}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                          {study.titleEn}
                        </p>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {study.summaryAr}
                      </p>
                      <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-[#0B0F17] dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">التطبيق العملي: </strong>
                        {study.practicalTakeawayAr}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSpecialistMode(study.domain);
                        setActivePanel('chat');
                        void sendMessage(
                          `اشرحلي بالمصري دراسة "${study.titleAr}" (${study.researcher}) وهاتلي أحدث تطبيقات وأبحاث من النت عنها في التسويق والبيع في السوق المصري.`,
                          study.domain,
                        );
                      }}
                      className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-teal-600/10 px-4 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-600 hover:text-white dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-600 dark:hover:text-white"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>اشرحها بالمصري + ابحث عنها في النت</span>
                    </button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : activePanel === 'shops' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-4xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold">دليل محلات وأماكن مصر الحقيقية</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  ابحث عن أي محل أو كافيه أو مطعم أو مول أو صيدلية في مصر ببيانات حقيقية وموثقة من خرائط Google بدون أي عناوين وهمية.
                </p>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSearchEgyptShops();
                  }}
                  className="flex flex-col gap-2.5 sm:flex-row"
                >
                  <div className="relative flex-1">
                    <Store className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={shopQuery}
                      onChange={(e) => setShopQuery(e.target.value)}
                      placeholder="بتدور على إيه؟ (مثلاً: محلات لابتوب، كافيهات، براندات لبس، مطاعم)"
                      className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pe-3.5 ps-10 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={shopLoading || !shopQuery.trim()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50 whitespace-nowrap"
                  >
                    {shopLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span>ابحث في مصر</span>
                  </button>
                </form>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      اختار المنطقة في مصر:
                    </span>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={shopOpenNow}
                        onChange={(e) => setShopOpenNow(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 accent-teal-600"
                      />
                      <span>المفتوح دلوقتي بس</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {EGYPT_AREA_CHIPS.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => setShopArea(area)}
                        className={`min-h-[34px] rounded-xl px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                          shopArea === area
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {shopSummary && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap dark:border-slate-800 dark:bg-[#121720] dark:text-slate-200">
                  {shopSummary}
                </div>
              )}

              {shopResults.length > 0 && (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {shopResults.map((place) => (
                    <div
                      key={place.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121720]"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            {place.name}
                          </h3>
                          {typeof place.rating === 'number' && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-amber-700 tabular-nums dark:text-amber-300">
                              <Star className="h-3 w-3 fill-current" />
                              {place.rating.toFixed(1)}
                              {place.ratingCount ? ` (${place.ratingCount})` : ''}
                            </span>
                          )}
                        </div>
                        {place.primaryType && (
                          <p className="text-xs font-medium text-teal-600 dark:text-teal-400">
                            {place.primaryType}
                          </p>
                        )}
                        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {place.address}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                          {place.openNow !== null && (
                            <span
                              className={
                                place.openNow
                                  ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                                  : 'font-medium text-rose-500 dark:text-rose-400'
                              }
                            >
                              {place.openNow ? 'مفتوح دلوقتي' : 'مقفول حالياً'}
                            </span>
                          )}
                          {place.phone && (
                            <a
                              href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}
                              className="inline-flex items-center gap-1 font-mono text-slate-600 hover:text-teal-600 dark:text-slate-300"
                              dir="ltr"
                            >
                              <Phone className="h-3 w-3" />
                              <span>{place.phone}</span>
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                        {place.googleMapsUri && (
                          <a
                            href={place.googleMapsUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-500"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span>فتح على خرائط Google</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {shopSources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    روابط الأماكن الموثقة على Google Maps:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {shopSources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-teal-700 hover:border-teal-500 dark:border-slate-800 dark:bg-[#121720] dark:text-teal-300"
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[220px] truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Main Muse-Inspired Conversation Canvas */
          <div className="flex min-h-0 flex-1 flex-col">
            {errorMessage && (
              <div className="mx-auto mt-3 flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
                <span>{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  aria-label="إغلاق"
                  className="p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {statusNotice && (
              <div className="mx-auto mt-3 flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-xs text-teal-800 dark:text-teal-200">
                <span>{statusNotice}</span>
                <button
                  type="button"
                  onClick={() => setStatusNotice(null)}
                  aria-label="إغلاق"
                  className="p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {activeMessages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
                <div className="flex w-full max-w-xl flex-col items-center text-center">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {greeting}
                  </p>
                  <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                    {voiceLang === 'en-US' ? 'How can I help you?' : 'أقدر أساعدك في إيه؟'}
                  </h1>

                  {/* Specialist Knowledge Mode Selector */}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
                    {SPECIALIST_MODE_OPTIONS.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSpecialistMode(mode.id)}
                        className={`min-h-[36px] rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          specialistMode === mode.id
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-teal-500/60 dark:border-slate-800 dark:bg-[#121720] dark:text-slate-300'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {/* Large Muse-Inspired Voice Orb Button */}
                  <div className="relative my-7 flex items-center justify-center">
                    <div
                      className={`absolute h-32 w-32 rounded-full transition-transform duration-300 ${
                        isListening
                          ? 'scale-110 bg-rose-500/20 animate-pulse'
                          : isTranscribing
                            ? 'scale-105 bg-amber-500/20 animate-pulse'
                            : 'scale-100 bg-teal-500/12'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleToggleVoiceInput}
                      disabled={isTranscribing}
                      aria-label={isListening ? 'إيقاف الاستماع' : 'التحدث بالصوت بالمصري'}
                      className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60 ${
                        isListening
                          ? 'bg-rose-600 hover:bg-rose-500'
                          : 'bg-teal-600 hover:bg-teal-500'
                      }`}
                    >
                      {isTranscribing ? (
                        <Loader2 className="h-9 w-9 animate-spin" />
                      ) : isListening ? (
                        <Square className="h-8 w-8 fill-current" />
                      ) : (
                        <Mic className="h-9 w-9" />
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isTranscribing
                      ? 'بفهم كلامك المصري دلوقتي...'
                      : isListening
                        ? 'سامعك دلوقتي... اتكلم بالمصري وهبعته وأرد عليك بالصوت تلقائياً'
                        : activeModeMeta.description}
                  </p>

                  {/* Quick Live Voice Call & Ad Psychology Auditor Triggers */}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        stopSpeaking();
                        setLiveCallOpen(true);
                      }}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-600 dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-600 dark:hover:text-white whitespace-nowrap"
                    >
                      <PhoneCall className="h-4 w-4" />
                      <span>ابدأ مكالمة صوتية حية بالمصري</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePanel('auditor')}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:border-teal-500 hover:text-teal-600 dark:border-slate-800 dark:bg-[#121720] dark:text-slate-200 whitespace-nowrap"
                    >
                      <Megaphone className="h-4 w-4" />
                      <span>حلّل إعلان بالسيكولوجي</span>
                    </button>
                  </div>

                  {/* Mode-Aware Quick Action Prompts */}
                  <div className="mt-7 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {activeModeMeta.samplePrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-start text-sm text-slate-700 transition-colors hover:border-teal-500/60 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#121720] dark:text-slate-200 dark:hover:bg-[#171E2A]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="mx-auto max-w-3xl space-y-5">
                  {activeMessages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[82%] ${
                            isUser
                              ? 'bg-teal-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-[#121720] dark:text-slate-100'
                          }`}
                        >
                          {msg.imageDataUrl && (
                            <img
                              src={msg.imageDataUrl}
                              alt="صورة مرفقة"
                              className="mb-2.5 max-h-56 w-full rounded-xl object-cover"
                            />
                          )}
                          {msg.docName && (
                            <div className="mb-2 flex items-center gap-1.5 text-xs opacity-85">
                              <FileText className="h-3.5 w-3.5" />
                              <span>{msg.docName}</span>
                            </div>
                          )}
                          <p className="whitespace-pre-wrap">{msg.text}</p>

                          {/* Verified Egypt Shops & Places Cards */}
                          {!isUser && msg.places && msg.places.length > 0 && (
                            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                              {msg.places.map((place) => (
                                <div
                                  key={place.id}
                                  className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-700/80 dark:bg-[#0B0F17]"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                                        {place.name}
                                      </p>
                                      {typeof place.rating === 'number' && (
                                        <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                                          <Star className="h-3 w-3 fill-current" />
                                          {place.rating.toFixed(1)}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                                      {place.address}
                                    </p>
                                    {place.phone && (
                                      <a
                                        href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}
                                        className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 hover:text-teal-600 dark:text-slate-300"
                                        dir="ltr"
                                      >
                                        <Phone className="h-3 w-3" />
                                        <span>{place.phone}</span>
                                      </a>
                                    )}
                                  </div>
                                  {place.googleMapsUri && (
                                    <a
                                      href={place.googleMapsUri}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex min-h-[32px] items-center justify-center gap-1 rounded-lg bg-teal-600 px-2.5 text-[11px] font-semibold text-white hover:bg-teal-500"
                                    >
                                      <MapPin className="h-3 w-3" />
                                      <span>الموقع على الخريطة</span>
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Verified Web & Google Maps Grounding Sources */}
                          {!isUser && msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                              <p className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                مصادر موثقة من الإنترنت والخرائط:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.sources.map((src) => (
                                  <a
                                    key={src.uri}
                                    href={src.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex max-w-[240px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17] dark:text-teal-300"
                                  >
                                    {src.kind === 'maps' ? (
                                      <MapPin className="h-3 w-3 shrink-0" />
                                    ) : (
                                      <Globe className="h-3 w-3 shrink-0" />
                                    )}
                                    <span className="truncate">{src.title}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {!isUser && (
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void speakText(msg.text, msg.language)}
                                aria-label="قراءة الرد بالصوت المصري"
                                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-teal-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                              >
                                <Volume2 className="h-4 w-4" />
                                <span>اسمعه بالمصري</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isSending && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
                      <span>Omar&apos;s personal assistant بيفكّر...</span>
                    </div>
                  )}

                  {/* Explicit Tool Confirmation Cards (with inline precise reminder time editor) */}
                  {pendingTools.map((tool, idx) => {
                    if (tool.type === 'create_reminder') {
                      return (
                        <ReminderConfirmationEditor
                          key={`reminder-${idx}-${tool.title ?? ''}`}
                          tool={tool}
                          onConfirm={(edited) => {
                            const msg = executeToolInWebCompanion(edited);
                            setStatusNotice(msg);
                            setPendingTools((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          onReject={() =>
                            setPendingTools((prev) => prev.filter((_, i) => i !== idx))
                          }
                        />
                      );
                    }

                    const safeUrl =
                      tool.type === 'open_website' ? getSafeExternalUrl(tool.url) : null;
                    const emailHref =
                      tool.type === 'compose_email'
                        ? buildSafeMailtoUrl(tool.recipientEmail, tool.subject, tool.body)
                        : null;
                    const messageHref =
                      tool.type === 'send_message'
                        ? tool.channel === 'sms'
                          ? buildSafeSmsUrl(tool.phoneNumber, tool.messageText || tool.body)
                          : buildSafeWhatsAppUrl(tool.phoneNumber, tool.messageText || tool.body)
                        : null;

                    return (
                      <div
                        key={`${tool.type}-${idx}`}
                        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#141A24]"
                      >
                        <p className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                          {tool.type === 'compose_email'
                            ? 'مراجعة تمبليت الإيميل قبل الفتح'
                            : tool.type === 'create_note'
                              ? 'مراجعة الملاحظة قبل الحفظ'
                              : tool.type === 'send_message'
                                ? tool.channel === 'sms'
                                  ? 'مراجعة رسالة SMS قبل الإرسال'
                                  : 'مراجعة رسالة واتساب قبل الإرسال'
                                : 'تأكيد قبل التنفيذ'}
                        </p>
                        <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                          {tool.confirmationPrompt || `تنفيذ الإجراء (${tool.type})؟`}
                        </p>

                        {tool.type === 'compose_email' && (
                          <div className="mt-3 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-[#0D1117] dark:text-slate-200">
                            {tool.recipientEmail && (
                              <p>
                                <span className="font-semibold">إلى:</span> {tool.recipientEmail}
                              </p>
                            )}
                            {tool.subject && (
                              <p>
                                <span className="font-semibold">الموضوع:</span> {tool.subject}
                              </p>
                            )}
                            {tool.body && (
                              <p className="whitespace-pre-wrap pt-1 text-slate-600 dark:text-slate-300">
                                {tool.body}
                              </p>
                            )}
                          </div>
                        )}

                        {tool.type === 'create_note' && (
                          <div className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-[#0D1117] dark:text-slate-200">
                            <p className="font-semibold">{tool.title || 'ملاحظة سريعة'}</p>
                            <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                              {tool.content || tool.description}
                            </p>
                          </div>
                        )}

                        {tool.type === 'send_message' && (
                          <div className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-[#0D1117] dark:text-slate-200">
                            {(tool.recipientName || tool.phoneNumber) && (
                              <p>
                                <span className="font-semibold">المستلم:</span>{' '}
                                {[tool.recipientName, tool.phoneNumber].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                              {tool.messageText || tool.body}
                            </p>
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {safeUrl ? (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() =>
                                setPendingTools((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>فتح الرابط</span>
                            </a>
                          ) : emailHref ? (
                            <>
                              <a
                                href={emailHref}
                                onClick={() => {
                                  const msg = executeToolInWebCompanion(tool);
                                  setStatusNotice(msg);
                                  setPendingTools((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>فتح في تطبيق الإيميل</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  const msg = executeToolInWebCompanion(tool);
                                  setStatusNotice(msg);
                                  setPendingTools((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                نسخ التمبليت
                              </button>
                            </>
                          ) : messageHref ? (
                            <>
                              <a
                                href={messageHref}
                                target={tool.channel === 'sms' ? undefined : '_blank'}
                                rel={tool.channel === 'sms' ? undefined : 'noopener noreferrer'}
                                onClick={() => {
                                  const msg = executeToolInWebCompanion(tool);
                                  setStatusNotice(msg);
                                  setPendingTools((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>
                                  {tool.channel === 'sms' ? 'فتح في الرسائل (SMS)' : 'فتح في واتساب'}
                                </span>
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  const msg = executeToolInWebCompanion(tool);
                                  setStatusNotice(msg);
                                  setPendingTools((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                نسخ الرسالة
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const msg = executeToolInWebCompanion(tool);
                                setStatusNotice(msg);
                                setPendingTools((prev) => prev.filter((_, i) => i !== idx));
                              }}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>{tool.type === 'create_note' ? 'حفظ الملاحظة' : 'موافق'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setPendingTools((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Follow-up Suggestions */}
                  {!isSending &&
                    activeMessages.length > 0 &&
                    (activeMessages[activeMessages.length - 1].suggestedFollowUps?.length ?? 0) >
                      0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {activeMessages[activeMessages.length - 1].suggestedFollowUps!.map(
                          (followUp) => (
                            <button
                              key={followUp}
                              type="button"
                              onClick={() => void sendMessage(followUp)}
                              className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:border-teal-500 hover:text-teal-700 dark:border-slate-800 dark:bg-[#121720] dark:text-slate-300 dark:hover:text-teal-300"
                            >
                              {followUp}
                            </button>
                          ),
                        )}
                      </div>
                    )}

                  <div ref={chatEndRef} />
                </div>
              </div>
            )}

            {/* Composer + Specialist Mode Strip + Inline Precise Reminder Time Picker Drawer */}
            <div className="shrink-0 border-t border-slate-200/80 bg-white/95 px-4 py-3 pb-safe dark:border-slate-800/80 dark:bg-[#0F141D]/95">
              <div className="mx-auto max-w-3xl space-y-2.5">
                {activeMessages.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {SPECIALIST_MODE_OPTIONS.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSpecialistMode(mode.id)}
                        className={`min-h-[30px] shrink-0 rounded-lg px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                          specialistMode === mode.id
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                )}
                {reminderComposerOpen && (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-[#141A24]">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400">
                        <Repeat className="h-3.5 w-3.5" />
                        <span>ضبط وقت التذكير والتكرار بدقة</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setReminderComposerOpen(false)}
                        aria-label="إغلاق محدد التذكير"
                        className="p-1 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={composerReminderTitle}
                        onChange={(e) => setComposerReminderTitle(e.target.value)}
                        placeholder="التذكير بإيه؟ (مثلاً: أراجع خطة اليوم)"
                        className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={composerReminderTime}
                          onChange={(e) => setComposerReminderTime(e.target.value)}
                          dir="ltr"
                          aria-label="تحديد وقت التذكير بدقة"
                          className="min-h-[40px] flex-1 rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm tabular-nums outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
                        />
                        <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {formatTimeArabic12(composerReminderTime)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {REMINDER_TIME_PRESETS.map((preset) => (
                        <button
                          key={preset.time24}
                          type="button"
                          onClick={() => setComposerReminderTime(preset.time24)}
                          className={`min-h-[30px] rounded-lg px-2.5 font-mono text-xs tabular-nums transition-colors ${
                            composerReminderTime === preset.time24
                              ? 'bg-teal-600 text-white'
                              : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>
                      {REMINDER_RECURRENCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setComposerReminderRecurrence(opt.id)}
                          className={`min-h-[30px] rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                            composerReminderRecurrence === opt.id
                              ? 'bg-teal-600 text-white'
                              : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {composerReminderRecurrence === 'weekly' && (
                      <div className="flex flex-wrap gap-1.5">
                        {ARABIC_ISO_WEEKDAYS.map((day) => {
                          const active = composerReminderDays.includes(day.isoDay);
                          return (
                            <button
                              key={day.isoDay}
                              type="button"
                              onClick={() =>
                                setComposerReminderDays((prev) =>
                                  prev.includes(day.isoDay)
                                    ? prev.filter((d) => d !== day.isoDay)
                                    : [...prev, day.isoDay],
                                )
                              }
                              className={`min-h-[32px] rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                                active
                                  ? 'bg-slate-900 text-white dark:bg-teal-500 dark:text-slate-950'
                                  : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {day.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDirectComposerSchedule}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500 whitespace-nowrap"
                      >
                        <AlarmClock className="h-3.5 w-3.5" />
                        <span>جدولة الآن</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const title = composerReminderTitle.trim() || 'مراجعة خطة يومي';
                          const recText = formatReminderRecurrenceArabic(
                            composerReminderRecurrence,
                            composerReminderRecurrence === 'weekly' ? composerReminderDays : [],
                          );
                          const prompt = `فكّرني ${recText} الساعة ${formatTimeArabic12(composerReminderTime)}: ${title}`;
                          setReminderComposerOpen(false);
                          void sendMessage(prompt);
                        }}
                        className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
                      >
                        إرسالها لـ Omar&apos;s personal assistant في المحادثة
                      </button>
                    </div>
                  </div>
                )}

                {(pendingImage || pendingDoc) && (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800/80">
                    <div className="flex items-center gap-2.5 truncate">
                      {pendingImage && (
                        <img
                          src={pendingImage}
                          alt="معاينة الصورة"
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      )}
                      <span className="truncate font-medium">
                        {pendingDoc ? pendingDoc.name : 'صورة جاهزة للتحليل'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingImage(null);
                        setPendingDoc(null);
                      }}
                      aria-label="إزالة المرفق"
                      className="p-1 text-slate-500 hover:text-rose-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImagePick}
                    className="hidden"
                  />
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.json,text/plain"
                    onChange={handleDocPick}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      if (!reminderComposerOpen && inputText.trim() && !composerReminderTitle) {
                        setComposerReminderTitle(inputText.trim());
                      }
                      setReminderComposerOpen((v) => !v);
                    }}
                    aria-label="تحديد وقت تذكير متكرر بدقة"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                      reminderComposerOpen
                        ? 'border-teal-500 bg-teal-600 text-white'
                        : 'border-slate-200 text-teal-600 hover:bg-slate-100 dark:border-slate-800 dark:text-teal-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Clock className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    aria-label="رفع صورة"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ImageIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    aria-label="إرفاق ملف نصي"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>

                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder={
                      voiceLang === 'en-US'
                        ? "Message Omar's personal assistant..."
                        : "اكتب أو اتكلم مع Omar's personal assistant..."
                    }
                    className="min-h-[44px] max-h-32 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-[#141A24]"
                  />

                  {inputText.trim() || pendingImage || pendingDoc ? (
                    <button
                      type="button"
                      disabled={isSending}
                      onClick={() => void sendMessage()}
                      aria-label="إرسال"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleToggleVoiceInput}
                      aria-label={isListening ? 'إيقاف الميكروفون' : 'تحدث بالصوت'}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors ${
                        isListening
                          ? 'bg-rose-600 hover:bg-rose-500'
                          : 'bg-teal-600 hover:bg-teal-500'
                      }`}
                    >
                      {isListening ? (
                        <Square className="h-4 w-4 fill-current" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Hands-Free Egyptian Arabic Live Voice Call */}
      <LiveVoiceCallModal
        open={liveCallOpen}
        userName={preferences.userName || 'عمر'}
        voiceLang={voiceLang}
        specialistMode={specialistMode}
        onChangeSpecialistMode={setSpecialistMode}
        onClose={() => setLiveCallOpen(false)}
        onSendVoiceTurn={(transcript) =>
          sendMessage(transcript, specialistMode, {suppressAutoSpeak: true})
        }
      />
    </div>
  );
};
