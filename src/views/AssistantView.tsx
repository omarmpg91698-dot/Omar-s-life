import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  ArrowUpLeft,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  MicOff,
  Plus,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {
  chatWithAssistantClientSide,
  uploadFileToGemini,
  type AssistantAttachment,
} from '../services/geminiAssistant';
import {
  ASSISTANT_TONE_OPTIONS,
  MEMORY_CATEGORIES,
  buildLifeContextSnapshot,
} from '../storage/assistantContext';
import {createSimpleId, formatFriendlyDate, getTodayIso} from '../storage/localStore';
import type {
  AssistantActionLog,
  AssistantChatMessage,
  AssistantMemoryCategory,
  AssistantTone,
  GoalKind,
  NoteCategory,
  TaskPriority,
} from '../types';

type AssistantTab = 'chat' | 'memory';

interface ServerActionPayload {
  type?: string;
  taskId?: string;
  title?: string;
  dueDate?: string;
  priority?: string;
  reminderTime?: string;
  tags?: string[];
  goalKind?: string;
  description?: string;
  initialTasks?: string[];
  noteCategory?: string;
  content?: string;
  pinned?: boolean;
  memoryCategory?: string;
  fact?: string;
}

const GEMINI_API_KEY = ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? '').trim();

// Hosted (AI Studio preview) uses the server route; the installed Android
// build has no server, so fall back to calling Gemini directly.
async function requestAssistantReply(payload: {
  message: string;
  imageDataUrl?: string;
  attachments?: AssistantAttachment[];
  history: Array<{role: string; text: string}>;
  lifeContext: Record<string, unknown>;
  onPartial?: (text: string) => void;
}): Promise<
  | {ok: true; reply?: string; suggestedFollowUps?: string[]; actions?: ServerActionPayload[]}
  | {ok: false; message: string}
> {
  const isInstalledBuild =
    typeof window !== 'undefined' && window.location.hostname === 'appassets.androidplatform.net';
  let serverMessage: string | null = null;
  if (!isInstalledBuild) {
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        suggestedFollowUps?: string[];
        actions?: ServerActionPayload[];
        message?: string;
      };
      if (res.ok) {
        return {
          ok: true,
          reply: data.reply,
          suggestedFollowUps: data.suggestedFollowUps,
          actions: data.actions,
        };
      }
      serverMessage = data.message || null;
    } catch {
      // No reachable server (installed build) - fall through to client-side.
    }
  }

  if (!GEMINI_API_KEY) {
    return {
      ok: false,
      message:
        serverMessage || 'تعذّر الاتصال بالخادم. اتأكد من اتصال الإنترنت وجرّب تاني.',
    };
  }
  const out = await chatWithAssistantClientSide(
    {...payload, apiKey: GEMINI_API_KEY},
    payload.onPartial,
  );
  if (out.error) return {ok: false, message: out.error};
  return {
    ok: true,
    reply: out.reply,
    suggestedFollowUps: out.suggestedFollowUps,
    actions: out.actions as ServerActionPayload[] | undefined,
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الصورة.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذّر معالجة الصورة.'));
      img.onload = () => {
        const maxDim = 1024;
        let {width, height} = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const VALID_PRIORITIES: TaskPriority[] = ['مهم', 'متوسط', 'عادي'];
const VALID_NOTE_CATEGORIES: NoteCategory[] = ['شخصي', 'شغل', 'أفكار', 'حاجات مهمة'];
const VALID_GOAL_KINDS: GoalKind[] = ['هدف', 'مشروع'];

const QUICK_STARTERS = [
  {
    title: 'رتّبلي يومي النهارده',
    subtitle: 'جدول مهامي المفتوحة على ساعات اليوم حسب روتيني',
    prompt: 'رتّبلي يومي النهارده وجدول مهامي المفتوحة على ساعات مناسبة لروتيني والوقت الحالي.',
  },
  {
    title: 'ملخص وضعي دلوقتي',
    subtitle: 'تحليل مهامي وأهدافي وعاداتي وأهم أولوية أبدأ بيها',
    prompt: 'لخّصلي وضعي النهارده في المهام والأهداف والعادات، وقولي أبدأ بإيه دلوقتي؟',
  },
  {
    title: 'حوّل فكرة لخطة هدف',
    subtitle: 'إنشاء هدف جديد مع مهام مرتبطة تلقائياً',
    prompt: 'عايز أبني خطة عملية لهدف جديد في حياتي — اسألني الأول إيه الهدف عشان تكسرهولي لمهام واضحة.',
  },
  {
    title: 'عالجلي المهام المتأخرة',
    subtitle: 'ترتيب المتأخر وتوزيعه بدون ضغط',
    prompt: 'راجع المهام المتأخرة عندي واقترحلي نجدولها إمتى أو نخلص إيه منها النهارده.',
  },
];

export const AssistantView: React.FC = () => {
  const {
    store,
    tasks,
    goals,
    habits,
    preferences,
    assistantProfile,
    assistantMemories,
    assistantMessages,
    updateAssistantProfile,
    addAssistantMemory,
    deleteAssistantMemory,
    appendAssistantMessages,
    clearAssistantChat,
    addTask,
    updateTask,
    addGoalWithTasks,
    addNote,
    addHabit,
    setActiveSection,
  } = useLife();

  const [activeTab, setActiveTab] = useState<AssistantTab>('chat');
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AssistantAttachment | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Profile form local state
  const [roleAndWork, setRoleAndWork] = useState(assistantProfile.roleAndWork);
  const [dailyRoutine, setDailyRoutine] = useState(assistantProfile.dailyRoutine);
  const [topPriorities, setTopPriorities] = useState(assistantProfile.topPriorities);
  const [personalNotes, setPersonalNotes] = useState(assistantProfile.personalNotes);
  const [tone, setTone] = useState<AssistantTone>(assistantProfile.tone);
  const [profileSavedMsg, setProfileSavedMsg] = useState('');

  // Manual memory add state
  const [memoryCategory, setMemoryCategory] = useState<AssistantMemoryCategory>('شخصي');
  const [memoryFact, setMemoryFact] = useState('');
  const [memoryFilter, setMemoryFilter] = useState<'الكل' | AssistantMemoryCategory>('الكل');

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const supportsVoice = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  useEffect(() => {
    setRoleAndWork(assistantProfile.roleAndWork);
    setDailyRoutine(assistantProfile.dailyRoutine);
    setTopPriorities(assistantProfile.topPriorities);
    setPersonalNotes(assistantProfile.personalNotes);
    setTone(assistantProfile.tone);
  }, [assistantProfile]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }
  }, [assistantMessages.length, isSending, streamingText, activeTab]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const openTasksCount = useMemo(
    () => tasks.filter((t) => t.status !== 'خلصت').length,
    [tasks],
  );

  const profileFilledCount = useMemo(() => {
    let count = 0;
    if (assistantProfile.roleAndWork.trim()) count += 1;
    if (assistantProfile.dailyRoutine.trim()) count += 1;
    if (assistantProfile.topPriorities.trim()) count += 1;
    if (assistantProfile.personalNotes.trim()) count += 1;
    return count;
  }, [assistantProfile]);

  const executeServerActions = (rawActions: ServerActionPayload[]): AssistantActionLog[] => {
    const logs: AssistantActionLog[] = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const todayIso = getTodayIso();

    for (const action of rawActions) {
      if (!action || typeof action.type !== 'string') continue;

      switch (action.type) {
        case 'add_task': {
          const title = typeof action.title === 'string' ? action.title.trim() : '';
          if (!title) break;
          const dueDate =
            typeof action.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(action.dueDate)
              ? action.dueDate
              : todayIso;
          const priority = VALID_PRIORITIES.includes(action.priority as TaskPriority)
            ? (action.priority as TaskPriority)
            : preferences.defaultPriority;
          const reminderTime =
            typeof action.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(action.reminderTime)
              ? action.reminderTime
              : null;
          const tags = Array.isArray(action.tags)
            ? action.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            : [];
          addTask({
            title,
            dueDate,
            priority,
            tags,
            reminderEnabled: true,
            reminderTime,
          });
          logs.push({
            kind: 'add_task',
            summary: `تمت إضافة مهمة: "${title}" (${formatFriendlyDate(dueDate)}${
              reminderTime ? ` · ${reminderTime}` : ''
            })`,
          });
          break;
        }

        case 'complete_task': {
          const id = typeof action.taskId === 'string' ? action.taskId : '';
          const existing = taskMap.get(id);
          if (!existing) break;
          updateTask(id, {status: 'خلصت'});
          logs.push({
            kind: 'complete_task',
            summary: `تم إنهاء المهمة: "${existing.title}"`,
          });
          break;
        }

        case 'schedule_task': {
          const id = typeof action.taskId === 'string' ? action.taskId : '';
          const existing = taskMap.get(id);
          if (!existing) break;
          const dueDate =
            typeof action.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(action.dueDate)
              ? action.dueDate
              : existing.dueDate || todayIso;
          const reminderTime =
            typeof action.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(action.reminderTime)
              ? action.reminderTime
              : existing.reminderTime;
          updateTask(id, {dueDate, reminderTime: reminderTime ?? null});
          logs.push({
            kind: 'schedule_task',
            summary: `تمت جدولة "${existing.title}" في ${formatFriendlyDate(dueDate)}${
              reminderTime ? ` الساعة ${reminderTime}` : ''
            }`,
          });
          break;
        }

        case 'add_goal': {
          const title = typeof action.title === 'string' ? action.title.trim() : '';
          if (!title) break;
          const kind = VALID_GOAL_KINDS.includes(action.goalKind as GoalKind)
            ? (action.goalKind as GoalKind)
            : 'هدف';
          const description = typeof action.description === 'string' ? action.description.trim() : '';
          const targetDate =
            typeof action.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(action.dueDate)
              ? action.dueDate
              : null;
          const initialTasks = Array.isArray(action.initialTasks)
            ? action.initialTasks.filter(
                (t): t is string => typeof t === 'string' && t.trim().length > 0,
              )
            : [];
          addGoalWithTasks({
            kind,
            title,
            description,
            targetDate,
            color: 'auto',
            taskTitles: initialTasks,
          });
          logs.push({
            kind: 'add_goal',
            summary:
              initialTasks.length > 0
                ? `تم إنشاء ${kind}: "${title}" مع ${initialTasks.length} مهام مرتبطة`
                : `تم إنشاء ${kind}: "${title}"`,
          });
          break;
        }

        case 'add_note': {
          const title = typeof action.title === 'string' ? action.title.trim() : '';
          const content = typeof action.content === 'string' ? action.content.trim() : '';
          if (!title && !content) break;
          const category = VALID_NOTE_CATEGORIES.includes(action.noteCategory as NoteCategory)
            ? (action.noteCategory as NoteCategory)
            : 'شخصي';
          addNote({
            title: title || content.slice(0, 40),
            content,
            category,
            pinned: Boolean(action.pinned),
          });
          logs.push({
            kind: 'add_note',
            summary: `تم حفظ ملاحظة: "${title || content.slice(0, 40)}"`,
          });
          break;
        }

        case 'add_habit': {
          const title = typeof action.title === 'string' ? action.title.trim() : '';
          if (!title) break;
          addHabit(title);
          logs.push({
            kind: 'add_habit',
            summary: `تمت إضافة عادة يومية: "${title}"`,
          });
          break;
        }

        case 'save_memory': {
          const fact = typeof action.fact === 'string' ? action.fact.trim() : '';
          if (!fact) break;
          const cat = MEMORY_CATEGORIES.includes(action.memoryCategory as AssistantMemoryCategory)
            ? (action.memoryCategory as AssistantMemoryCategory)
            : 'شخصي';
          addAssistantMemory({category: cat, fact});
          logs.push({
            kind: 'save_memory',
            summary: `اتحفظت معلومة في ذاكرة حياتك (${cat}): "${fact}"`,
          });
          break;
        }
      }
    }

    return logs;
  };

  const sendMessage = async (overridePrompt?: string) => {
    const cleanText = (overridePrompt ?? inputText).trim();
    const imageToSend = overridePrompt ? null : attachedImage;
    const fileToSend = overridePrompt ? null : attachedFile;
    if ((!cleanText && !imageToSend && !fileToSend) || isSending || isUploadingFile) return;

    setErrorMsg('');
    setIsSending(true);
    setStreamingText('');
    if (!overridePrompt) {
      setInputText('');
      setAttachedImage(null);
      setAttachedFile(null);
    }

    const userMsg: AssistantChatMessage = {
      id: createSimpleId(),
      role: 'user',
      text:
        cleanText ||
        (imageToSend ? 'اقرأ الصورة دي وساعدني فيها' : 'اقرأ الملف ده وساعدني فيه'),
      hasImage: Boolean(imageToSend),
      fileName: fileToSend?.name,
      createdAt: Date.now(),
    };

    const historyForApi = assistantMessages.slice(-10).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    const lifeContext = buildLifeContextSnapshot(store);

    const result = await requestAssistantReply({
      message: cleanText,
      imageDataUrl: imageToSend || undefined,
      attachments: fileToSend ? [fileToSend] : undefined,
      history: historyForApi,
      lifeContext: lifeContext as unknown as Record<string, unknown>,
      onPartial: (text: string) => setStreamingText(text),
    });

    if (!result.ok) {
      setStreamingText('');
      setErrorMsg(result.message);
      if (!overridePrompt) {
        setInputText(cleanText);
        if (imageToSend) setAttachedImage(imageToSend);
        if (fileToSend) setAttachedFile(fileToSend);
      }
      setIsSending(false);
      return;
    }

    {
      const executedLogs = executeServerActions(
        Array.isArray(result.actions) ? result.actions : [],
      );

      const assistantMsg: AssistantChatMessage = {
        id: createSimpleId(),
        role: 'assistant',
        text: result.reply || 'تمام، أنا معاك. محتاج نعمل إيه دلوقتي؟',
        actions: executedLogs.length > 0 ? executedLogs : undefined,
        suggestedFollowUps: Array.isArray(result.suggestedFollowUps)
          ? result.suggestedFollowUps.slice(0, 3)
          : undefined,
        createdAt: Date.now() + 1,
      };

      appendAssistantMessages([userMsg, assistantMsg]);
      setIsSending(false);
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setErrorMsg('');
      const compressed = await compressImageToDataUrl(file);
      setAttachedImage(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر إرفاق الصورة.');
    }
  };

  const INLINE_FILE_LIMIT = 15 * 1024 * 1024;

  const handleDocPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImageToDataUrl(file);
        setAttachedImage(compressed);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'تعذّر إرفاق الصورة.');
      }
      return;
    }
    const mimeType = file.type || 'application/octet-stream';
    if (file.size <= INLINE_FILE_LIMIT) {
      try {
        const buf = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, i + chunk)),
          );
        }
        setAttachedFile({
          name: file.name,
          mimeType,
          data: btoa(binary),
        });
      } catch {
        setErrorMsg('تعذّر قراءة الملف، جرّب ملف تاني.');
      }
      return;
    }
    if (!GEMINI_API_KEY) {
      setErrorMsg('الملف أكبر من 15 ميجا — الرفع المباشر محتاج نسخة التطبيق المثبتة.');
      return;
    }
    setIsUploadingFile(true);
    try {
      const uploaded = await uploadFileToGemini(file, GEMINI_API_KEY);
      setAttachedFile({name: file.name, mimeType, fileUri: uploaded.uri});
    } catch {
      setErrorMsg('تعذّر رفع الملف الكبير. اتأكد من الإنترنت وجرّب تاني.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = 'ar-EG';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        const transcript = ev.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateAssistantProfile({
      roleAndWork: roleAndWork.trim(),
      dailyRoutine: dailyRoutine.trim(),
      topPriorities: topPriorities.trim(),
      personalNotes: personalNotes.trim(),
      tone,
    });
    setProfileSavedMsg('تم حفظ ملف حياتك! المساعد بقى فاهمك أكتر في كل محادثة.');
    window.setTimeout(() => setProfileSavedMsg(''), 3500);
  };

  const handleAddManualMemory = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = memoryFact.trim();
    if (!clean) return;
    addAssistantMemory({category: memoryCategory, fact: clean});
    setMemoryFact('');
  };

  const filteredMemories = useMemo(() => {
    if (memoryFilter === 'الكل') return assistantMemories;
    return assistantMemories.filter((m) => m.category === memoryFilter);
  }, [assistantMemories, memoryFilter]);

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            مساعدك الشخصي
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            متصل بحياتك: {openTasksCount} مهمة مفتوحة · {goals.length} هدف · {habits.length} عادة ·{' '}
            {assistantMemories.length} معلومة محفوظة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${
                activeTab === 'chat'
                  ? 'bg-accent text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>المحادثة</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('memory')}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors tabular-nums ${
                activeTab === 'memory'
                  ? 'bg-accent text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Brain className="h-3.5 w-3.5" />
              <span>ذاكرة حياتي ({assistantMemories.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Onboarding hint if life profile is empty */}
      {activeTab === 'chat' && profileFilledCount === 0 && assistantMemories.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              درّب المساعد على حياتك في دقيقتين
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              اكتب شغلك وروتينك وأولوياتك في «ذاكرة حياتي»، أو احكيله عن نفسك في الشات وهو هيحفظها تلقائياً.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-accent bg-accent-soft px-3.5 text-xs font-semibold text-accent transition-colors"
          >
            <Brain className="h-3.5 w-3.5" />
            <span>تجهيز ذاكرة حياتي</span>
          </button>
        </div>
      )}

      {/* CHAT TAB */}
      {activeTab === 'chat' && (
        <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90">
          {/* Chat Top Bar */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  مساعد {preferences.userName} الشخصي
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  يقدر يضيف مهام، يرتب يومك، يبني أهداف، يقرأ صور، ويفتكر تفاصيل حياتك
                </p>
              </div>
            </div>

            {assistantMessages.length > 0 && (
              <button
                type="button"
                onClick={clearAssistantChat}
                aria-label="مسح المحادثة"
                title="بدء محادثة جديدة"
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 px-2.5 text-xs font-medium text-slate-500 transition-colors hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">محادثة جديدة</span>
              </button>
            )}
          </div>

          {/* Messages Area */}
          <div className="min-h-[360px] max-h-[58vh] space-y-4 overflow-y-auto p-4 sm:p-5">
            {assistantMessages.length === 0 ? (
              <div className="space-y-5 py-4">
                <div className="mx-auto max-w-md text-center">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    أهلاً يا {preferences.userName}! أساعدك في إيه النهارده؟
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    اسألني عن يومك، اطلب مني أرتبلك جدولك، ارفعلي صورة ورقة أو جدول، أو احكيلي معلومة عن حياتك عشان أفتكرها دايماً.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {QUICK_STARTERS.map((starter) => (
                    <button
                      key={starter.title}
                      type="button"
                      disabled={isSending}
                      onClick={() => void sendMessage(starter.prompt)}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-start transition-colors hover:border-accent hover:bg-accent-soft/40 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-accent"
                    >
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {starter.title}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {starter.subtitle}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              assistantMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isLatestAssistant =
                  !isUser && idx === assistantMessages.length - 1;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[90%] space-y-2.5 rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[82%] ${
                        isUser
                          ? 'bg-accent text-white'
                          : 'border border-slate-200/80 bg-slate-50 text-slate-800 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-100'
                      }`}
                    >
                      {msg.hasImage && (
                        <p className="text-[11px] font-medium opacity-85">
                          [مرفق صورة]
                        </p>
                      )}
                      {msg.fileName && (
                        <p className="text-[11px] font-medium opacity-85">
                          [مرفق ملف: {msg.fileName}]
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {/* Executed Actions Receipt */}
                      {!isUser && msg.actions && msg.actions.length > 0 && (
                        <div className="space-y-1.5 border-t border-slate-200/80 pt-2.5 dark:border-slate-700/80">
                          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            تم تنفيذ {msg.actions.length} إجراء تلقائياً في التطبيق:
                          </p>
                          <ul className="space-y-1">
                            {msg.actions.map((act, i) => (
                              <li
                                key={`${msg.id}-act-${i}`}
                                className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-200"
                              >
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                <span>{act.summary}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-semibold text-accent">
                            {msg.actions.some(
                              (a) =>
                                a.kind === 'add_task' ||
                                a.kind === 'complete_task' ||
                                a.kind === 'schedule_task',
                            ) && (
                              <button
                                type="button"
                                onClick={() => setActiveSection('tasks')}
                                className="inline-flex items-center gap-0.5 hover:underline"
                              >
                                <span>افتح مهامي</span>
                                <ArrowUpLeft className="h-3 w-3" />
                              </button>
                            )}
                            {msg.actions.some((a) => a.kind === 'add_goal') && (
                              <button
                                type="button"
                                onClick={() => setActiveSection('goals')}
                                className="inline-flex items-center gap-0.5 hover:underline"
                              >
                                <span>افتح أهدافي</span>
                                <ArrowUpLeft className="h-3 w-3" />
                              </button>
                            )}
                            {msg.actions.some((a) => a.kind === 'add_note') && (
                              <button
                                type="button"
                                onClick={() => setActiveSection('notes')}
                                className="inline-flex items-center gap-0.5 hover:underline"
                              >
                                <span>افتح ملاحظاتي</span>
                                <ArrowUpLeft className="h-3 w-3" />
                              </button>
                            )}
                            {msg.actions.some((a) => a.kind === 'save_memory') && (
                              <button
                                type="button"
                                onClick={() => setActiveTab('memory')}
                                className="inline-flex items-center gap-0.5 hover:underline"
                              >
                                <span>عرض ذاكرة حياتي</span>
                                <ArrowUpLeft className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Interactive Follow-up Suggestions */}
                    {isLatestAssistant &&
                      !isSending &&
                      msg.suggestedFollowUps &&
                      msg.suggestedFollowUps.length > 0 && (
                        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                          {msg.suggestedFollowUps.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => void sendMessage(prompt)}
                              className="min-h-[34px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                );
              })
            )}

            {isSending && streamingText.trim().length > 0 && (
              <div className="flex items-start justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                  {streamingText}
                  <span className="ms-1 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-accent align-middle" />
                </div>
              </div>
            )}

            {isSending && (
              <div className="flex items-center justify-end">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  <span>
                    {streamingText.trim().length > 0 ? 'بيكمّل التفاصيل...' : 'بيفكر وبيراجع بياناتك...'}
                  </span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Error Notice */}
          {errorMsg && (
            <div
              role="alert"
              className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </span>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                aria-label="إغلاق التنبيه"
                className="rounded-lg p-1 hover:bg-red-100 dark:hover:bg-red-900/40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Multimodal Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3 dark:border-slate-700/80 dark:bg-slate-900/40 sm:p-4"
          >
            {attachedImage && (
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                <img
                  src={attachedImage}
                  alt="صورة مرفقة للمساعد"
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <span className="flex-1 text-xs text-slate-600 dark:text-slate-300">
                  صورة جاهزة للتحليل مع رسالتك
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedImage(null)}
                  aria-label="إزالة الصورة"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {attachedFile && (
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                <Paperclip className="h-5 w-5 shrink-0 text-accent" />
                <span className="flex-1 truncate text-xs text-slate-600 dark:text-slate-300">
                  {attachedFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  aria-label="إزالة الملف"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {isUploadingFile && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span>برفع الملف الكبير...</span>
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImagePick}
                className="hidden"
              />
              <input
                ref={docInputRef}
                type="file"
                accept="*/*"
                onChange={handleDocPick}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={isSending || isUploadingFile}
                title="إرفاق ملف (PDF، إكسل، مستند، أي صيغة)"
                aria-label="إرفاق ملف"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-accent hover:text-accent disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                title="إرفاق صورة (ورقة، جدول، سكرين شوت)"
                aria-label="إرفاق صورة"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-accent hover:text-accent disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <ImagePlus className="h-4 w-4" />
              </button>

              {supportsVoice && (
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={isSending}
                  title={isListening ? 'إيقاف التسجيل الصوتي' : 'تحدث بالصوت'}
                  aria-label={isListening ? 'إيقاف التسجيل الصوتي' : 'تحدث بالصوت'}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
                    isListening
                      ? 'border-red-400 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}

              <textarea
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={
                  isListening
                    ? 'بتكلم دلوقتي... قولي عايز إيه'
                    : 'اكتب أمرك أو سؤالك... (مثال: ضيف مهمة بكره الساعة ٥ أو احفظ إن...)'
                }
                className="min-h-[44px] max-h-28 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />

              <button
                type="submit"
                disabled={isSending || isUploadingFile || (!inputText.trim() && !attachedImage && !attachedFile)}
                aria-label="إرسال"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-colors disabled:opacity-40"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizontal className="h-4 w-4 rotate-180" />
                )}
                <span className="hidden sm:inline">إرسال</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* LIFE MEMORY & TRAINING TAB */}
      {activeTab === 'memory' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Life Profile Trainer */}
          <form
            onSubmit={handleSaveProfile}
            className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90 sm:p-5 lg:col-span-7"
          >
            <div className="border-b border-slate-100 pb-3 dark:border-slate-700/80">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                ملف حياتك الشخصي
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                كل معلومة تكتبها هنا بتدرّب المساعد على طبيعة يومك وظروفك عشان ردوده وجدولته تبقى مفصلة عليك.
              </p>
            </div>

            {/* Tone Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                أسلوب كلام المساعد معاك
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {ASSISTANT_TONE_OPTIONS.map((opt) => {
                  const active = tone === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTone(opt.id)}
                      className={`rounded-xl border p-3 text-start transition-colors ${
                        active
                          ? 'border-accent bg-accent-soft/70 text-slate-900 dark:text-slate-100'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
                      }`}
                    >
                      <p className="text-xs font-bold">{opt.label}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  شغلك أو دراستك ومجالك
                </span>
                <input
                  type="text"
                  value={roleAndWork}
                  onChange={(e) => setRoleAndWork(e.target.value)}
                  placeholder="مثال: مهندس برمجيات شغال ريموت من ٩ لـ ٥، أو طالب جامعي..."
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  روتينك اليومي وأفضل أوقات تركيزك
                </span>
                <textarea
                  rows={2}
                  value={dailyRoutine}
                  onChange={(e) => setDailyRoutine(e.target.value)}
                  placeholder="مثال: بصحى ٧ الصبح، أعلى تركيز عندي من ٩ لـ ١ الضهر، الجيم ٧ مساءً، بنام ١١:٣٠..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  أهم أولوياتك الفترة دي
                </span>
                <textarea
                  rows={2}
                  value={topPriorities}
                  onChange={(e) => setTopPriorities(e.target.value)}
                  placeholder="مثال: تطوير مستوايا في الإنجليزي، تنظيم النوم، وإنهاء مشروعي الشخصي قبل آخر السنة..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  تفاصيل شخصية إضافية (اختياري)
                </span>
                <textarea
                  rows={2}
                  value={personalNotes}
                  onChange={(e) => setPersonalNotes(e.target.value)}
                  placeholder="أي تفاصيل تانية تحب المساعد ياخدها في حسابه لما ينصحك أو يرتبلك يومك..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/80">
              {profileSavedMsg ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  <span>{profileSavedMsg}</span>
                </span>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  بياناتك محفوظة محلياً على جهازك وتتزامن مع Google Drive لو مفعّله.
                </span>
              )}

              <button
                type="submit"
                className="min-h-[42px] shrink-0 whitespace-nowrap rounded-xl bg-accent px-5 text-xs font-semibold text-white transition-colors"
              >
                حفظ ملف حياتك
              </button>
            </div>
          </form>

          {/* Long-Term Memory Bank */}
          <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/90 sm:p-5 lg:col-span-5">
            <div className="border-b border-slate-100 pb-3 dark:border-slate-700/80">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                بنك الذاكرة طويلة المدى
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                المساعد بيحفظ تلقائياً المعلومات الجديدة اللي بتحكيها عن حياتك في الشات، وتقدر تضيف أو تمسح أي معلومة من هنا.
              </p>
            </div>

            {/* Add Memory Form */}
            <form onSubmit={handleAddManualMemory} className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={memoryCategory}
                  onChange={(e) => setMemoryCategory(e.target.value as AssistantMemoryCategory)}
                  aria-label="تصنيف المعلومة"
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {MEMORY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={memoryFact}
                  onChange={(e) => setMemoryFact(e.target.value)}
                  placeholder="مثال: بحب أذاكر الصبح بدري قبل الشغل"
                  className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={!memoryFact.trim()}
                className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-colors disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة للذاكرة</span>
              </button>
            </form>

            {/* Category Filter */}
            {assistantMemories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {(['الكل', ...MEMORY_CATEGORIES] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setMemoryFilter(cat)}
                    className={`min-h-[32px] whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors ${
                      memoryFilter === cat
                        ? 'bg-accent text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Memories List */}
            {filteredMemories.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {assistantMemories.length === 0
                  ? 'مفيش معلومات محفوظة لسه. احكي للمساعد عن حياتك في الشات أو ضيف أول معلومة فوق.'
                  : 'مفيش معلومات في التصنيف ده.'}
              </p>
            ) : (
              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700/80">
                {filteredMemories.map((mem) => (
                  <div key={mem.id} className="flex items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-relaxed text-slate-800 dark:text-slate-100">
                        {mem.fact}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {mem.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteAssistantMemory(mem.id)}
                      aria-label={`مسح المعلومة: ${mem.fact}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
