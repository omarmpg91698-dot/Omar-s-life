export type ReminderRecurrence = 'once' | 'daily' | 'weekly' | 'monthly';

export interface ScheduledReminderItem {
  id: string;
  title: string;
  reminderTime: string; // "HH:MM" 24-hour
  recurrence: ReminderRecurrence;
  daysOfWeek: number[]; // ISO 1=Monday..7=Sunday
  nextTriggerAt: number; // epoch ms
  enabled: boolean;
  createdAt: number;
}

export const REMINDER_RECURRENCE_OPTIONS: Array<{
  id: ReminderRecurrence;
  label: string;
}> = [
  {id: 'once', label: 'مرة واحدة'},
  {id: 'daily', label: 'كل يوم'},
  {id: 'weekly', label: 'أسبوعياً'},
  {id: 'monthly', label: 'شهرياً'},
];

export const ARABIC_ISO_WEEKDAYS: Array<{isoDay: number; label: string; shortLabel: string}> = [
  {isoDay: 6, label: 'السبت', shortLabel: 'سبت'},
  {isoDay: 7, label: 'الأحد', shortLabel: 'أحد'},
  {isoDay: 1, label: 'الإثنين', shortLabel: 'إثنين'},
  {isoDay: 2, label: 'الثلاثاء', shortLabel: 'ثلاثاء'},
  {isoDay: 3, label: 'الأربعاء', shortLabel: 'أربعاء'},
  {isoDay: 4, label: 'الخميس', shortLabel: 'خميس'},
  {isoDay: 5, label: 'الجمعة', shortLabel: 'جمعة'},
];

export const REMINDER_TIME_PRESETS: Array<{time24: string; label: string}> = [
  {time24: '07:00', label: '٧:٠٠ ص'},
  {time24: '08:00', label: '٨:٠٠ ص'},
  {time24: '13:00', label: '١:٠٠ م'},
  {time24: '21:00', label: '٩:٠٠ م'},
];

export function normalizeReminderRecurrence(raw: string | undefined | null): ReminderRecurrence {
  const clean = (raw ?? '').trim().toLowerCase();
  if (clean === 'daily' || clean === 'weekly' || clean === 'monthly') {
    return clean;
  }
  return 'once';
}

export function parseTime24(raw: string | undefined | null): {hour: number; minute: number} | null {
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return {hour, minute};
}

export function formatTime24(hour: number, minute: number): string {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  const m = Math.max(0, Math.min(59, Math.floor(minute)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeArabic12(time24: string): string {
  const parsed = parseTime24(time24);
  if (!parsed) return time24;
  const period = parsed.hour >= 12 ? 'م' : 'ص';
  const h12 = parsed.hour % 12 || 12;
  return `${h12}:${String(parsed.minute).padStart(2, '0')} ${period}`;
}

function getIsoDayOfWeek(date: Date): number {
  const jsDay = date.getDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun
}

/**
 * Computes the next trigger epoch timestamp strictly after `now`.
 */
export function computeNextReminderTrigger(
  time24: string,
  recurrence: ReminderRecurrence,
  daysOfWeek: number[] = [],
  now: Date = new Date(),
): number {
  const parsed = parseTime24(time24) ?? {hour: 8, minute: 0};
  const base = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    parsed.hour,
    parsed.minute,
    0,
    0,
  );

  if (recurrence === 'once' || recurrence === 'daily') {
    if (base.getTime() > now.getTime()) return base.getTime();
    base.setDate(base.getDate() + 1);
    return base.getTime();
  }

  if (recurrence === 'weekly') {
    const validDays = Array.from(
      new Set(daysOfWeek.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)),
    );
    const targets = validDays.length > 0 ? validDays : [getIsoDayOfWeek(now)];

    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = new Date(base.getTime());
      candidate.setDate(base.getDate() + offset);
      if (targets.includes(getIsoDayOfWeek(candidate)) && candidate.getTime() > now.getTime()) {
        return candidate.getTime();
      }
    }
    base.setDate(base.getDate() + 7);
    return base.getTime();
  }

  // Monthly with safe month-end clamping
  if (base.getTime() > now.getTime()) return base.getTime();
  const originalDay = base.getDate();
  const nextMonthIndex = base.getMonth() + 1;
  const nextYear = base.getFullYear() + Math.floor(nextMonthIndex / 12);
  const resolvedMonth = nextMonthIndex % 12;
  const daysInTargetMonth = new Date(nextYear, resolvedMonth + 1, 0).getDate();
  const clampedDay = Math.min(originalDay, daysInTargetMonth);
  return new Date(nextYear, resolvedMonth, clampedDay, parsed.hour, parsed.minute, 0, 0).getTime();
}

export function formatReminderRecurrenceArabic(
  recurrence: ReminderRecurrence,
  daysOfWeek: number[] = [],
): string {
  switch (recurrence) {
    case 'daily':
      return 'كل يوم';
    case 'weekly': {
      const valid = Array.from(new Set(daysOfWeek.filter((d) => d >= 1 && d <= 7)));
      if (valid.length === 0) return 'أسبوعياً';
      const labels = ARABIC_ISO_WEEKDAYS.filter((w) => valid.includes(w.isoDay)).map(
        (w) => w.label,
      );
      return `كل ${labels.join('، ')}`;
    }
    case 'monthly':
      return 'شهرياً';
    default:
      return 'مرة واحدة';
  }
}

export function formatNextTriggerArabic(timestampMs: number): string {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function normalizeArabicDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export interface InferredReminderFields {
  reminderTime?: string;
  recurrence?: ReminderRecurrence;
  daysOfWeek?: number[];
}

/**
 * Extracts explicit clock time (HH:MM), recurrence, and ISO weekdays from natural
 * Egyptian Arabic / English reminder text when an AI tool call omits optional fields.
 */
export function inferReminderFieldsFromText(rawText: string): InferredReminderFields {
  const text = normalizeArabicDigits(rawText).toLowerCase();
  const result: InferredReminderFields = {};

  // 1. Extract weekdays (ISO 1=Mon..7=Sun)
  const weekdayPatterns: Array<{iso: number; re: RegExp}> = [
    {iso: 6, re: /(?:^|[\s،,و])(?:ال)?سبت(?=$|[\s،,.؟!])|\bsaturday\b/},
    {iso: 7, re: /(?:^|[\s،,و])(?:ال)?[أاإ]حد(?=$|[\s،,.؟!])|(?:^|[\s،,و])(?:ال)?حد(?=$|[\s،,.؟!])|\bsunday\b/},
    {iso: 1, re: /(?:^|[\s،,و])(?:ال)?[إاأ]ثنين(?=$|[\s،,.؟!])|(?:^|[\s،,و])(?:ال)?تنين(?=$|[\s،,.؟!])|\bmonday\b/},
    {iso: 2, re: /(?:^|[\s،,و])(?:ال)?ثلاثاء(?=$|[\s،,.؟!])|(?:^|[\s،,و])(?:ال)?تلات(?=$|[\s،,.؟!])|\btuesday\b/},
    {iso: 3, re: /(?:^|[\s،,و])(?:ال)?[أاإ]ربعاء(?=$|[\s،,.؟!])|(?:^|[\s،,و])(?:ال)?[أاإ]ربع(?=$|[\s،,.؟!])|\bwednesday\b/},
    {iso: 4, re: /(?:^|[\s،,و])(?:ال)?خميس(?=$|[\s،,.؟!])|\bthursday\b/},
    {iso: 5, re: /(?:^|[\s،,و])(?:ال)?جمعة(?=$|[\s،,.؟!])|(?:^|[\s،,و])(?:ال)?جمعه(?=$|[\s،,.؟!])|\bfriday\b/},
  ];
  const matchedDays = weekdayPatterns.filter((p) => p.re.test(text)).map((p) => p.iso);

  // 2. Extract recurrence
  if (/(?:كل\s*يوم|يومي[اً]?|\bdaily\b|\bevery\s*day\b)/.test(text)) {
    result.recurrence = 'daily';
  } else if (
    /(?:كل\s*شهر|شهري[اً]?|\bmonthly\b|\bevery\s*month\b)/.test(text)
  ) {
    result.recurrence = 'monthly';
  } else if (
    matchedDays.length > 0 ||
    /(?:كل\s*[أا]سبوع|[أا]سبوعي[اً]?|\bweekly\b|\bevery\s*week\b)/.test(text)
  ) {
    result.recurrence = 'weekly';
    if (matchedDays.length > 0) {
      result.daysOfWeek = matchedDays;
    }
  }

  // 3. Extract clock time (e.g. "8:30 الصبح", "الساعة 8 الصبح", "9 ونص بالليل", "21:15", "8 am")
  const strictTimeMatch =
    /(?:(?:الساع[ةه]\s*|at\s+)(\d{1,2})(?::(\d{2}))?|(\d{1,2}):(\d{2})|(\d{1,2})\s*(?:و\s*نص(?:ف)?|و\s*ربع|[إا]لا\s*ربع)?\s*(?:صباح[اً]?|الصبح|مساء[ً]?|بالليل|الظهر|الضهر|العصر|المغرب|am|pm))/.exec(
      text,
    );

  if (strictTimeMatch) {
    const matchedSegment = strictTimeMatch[0];
    const startIdx = strictTimeMatch.index;
    const windowAfter = text.slice(
      startIdx,
      Math.min(text.length, startIdx + matchedSegment.length + 28),
    );

    const numMatch = /(\d{1,2})(?::(\d{2}))?/.exec(matchedSegment);
    if (numMatch) {
      let hour = Number(numMatch[1]);
      let minute = numMatch[2] ? Number(numMatch[2]) : 0;

      if (!numMatch[2]) {
        if (/و\s*نص(?:ف)?/.test(windowAfter)) minute = 30;
        else if (/و\s*ربع/.test(windowAfter)) minute = 15;
        else if (/[إا]لا\s*ربع/.test(windowAfter)) {
          minute = 45;
          hour = hour === 1 ? 12 : hour - 1;
        }
      }

      const isPm = /(?:مساء|بالليل|ليل|العصر|المغرب|\bpm\b|(?:\s|^)م(?=$|[\s،,.؟!]))/.test(
        windowAfter,
      );
      const isAm = /(?:صباح|الصبح|الفجر|\bam\b|(?:\s|^)ص(?=$|[\s،,.؟!]))/.test(windowAfter);
      const isNoon = /(?:الظهر|الضهر)/.test(windowAfter);

      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        if (isPm && hour >= 1 && hour <= 11) {
          hour += 12;
        } else if (isAm && hour === 12) {
          hour = 0;
        } else if (isNoon && hour >= 1 && hour <= 4) {
          hour += 12;
        }
        result.reminderTime = formatTime24(hour, minute);
      }
    }
  }

  return result;
}

