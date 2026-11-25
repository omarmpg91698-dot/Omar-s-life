// Parses Egyptian-Arabic voice dictation into a task draft.
// Example: «فكرني دكتور الخميس الساعة 5» → title «دكتور», next Thursday, 17:00.

export interface ParsedVoiceTask {
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  reminderEnabled: boolean;
  reminderTime: string | null; // HH:MM
}

const AR_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

const normalize = (s: string): string =>
  s
    .replace(/[٠-٩]/g, (c) => AR_DIGITS[c] ?? c)
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();

// JS getDay(): 0=Sun..6=Sat
const WEEKDAYS: Array<[RegExp, number]> = [
  [/السبت/, 6],
  [/الاحد|الحد/, 0],
  [/الاتنين|الاثنين/, 1],
  [/الثلاثاء|التلات|التلاتاء/, 2],
  [/الاربعاء|الاربع/, 3],
  [/الخميس/, 4],
  [/الجمعه|الجمعة/, 5],
];

const pad = (n: number) => String(n).padStart(2, '0');

const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseVoiceTask(utterance: string, now: Date = new Date()): ParsedVoiceTask | null {
  let text = ` ${normalize(utterance).trim()} `;
  if (!text.trim()) return null;

  // 1) Strip leading intent phrases («فكرني», «ذكرني», «ضيف مهمة», «عايز افتكر» ...)
  const intentRe =
    /(متنساناش|متنسينيش|متنسانيش|افتكر|افتكرلي|فكرني|فكرنا|ذكرني|ذكرنا|قولي|قوليلي|ضيفلي|ضيف|اضيف|سجللي|سجلي|سجل|اعملي|اعمل|عملي|عايزه|عايز|عاوزه|عاوز|محتاج|اكتبلي|اكتب|مهمه|مهمة|جديده|جديدة)/g;
  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(/^\s+/, '').replace(new RegExp(`^(${intentRe.source})\\s+`), '');
    // also allow «ان»/«اني» connectors
    text = text.replace(/^(ان|اني|إني|ب)\s+/, '');
  }
  text = ` ${text.trim()} `;

  // 2) Day extraction
  let dueDate: string | null = null;
  const dayPatterns: Array<[RegExp, number | 'weekday', number?]> = [
    [/ بعد بكر[هة] /, 2],
    [/ بكر[هة] /, 1],
    [/ النهارد[هة] | اليوم /, 0],
  ];
  for (const [re, offset] of dayPatterns) {
    const m = text.match(re);
    if (m) {
      const d = new Date(now);
      d.setDate(d.getDate() + (offset as number));
      dueDate = toIso(d);
      text = text.replace(re, ' ');
      break;
    }
  }
  if (!dueDate) {
    for (const [re, jsDay] of WEEKDAYS) {
      const m = text.match(new RegExp(`( يوم)? ?${re.source}`));
      if (m) {
        const d = new Date(now);
        let delta = (jsDay - d.getDay() + 7) % 7;
        if (delta === 0) delta = 0; // same day = today
        d.setDate(d.getDate() + delta);
        dueDate = toIso(d);
        text = text.replace(m[0], ' ');
        break;
      }
    }
  }

  // 3) Time extraction: «الساعة 5», «الساعة ٥ ونص», «5 الصبح», «٧ ونص بالليل»
  let hour: number | null = null;
  let minute = 0;
  let timeMatched = '';
  const timeRe =
    / ?الساع[هة]\s*(\d{1,2})(?:\s*(ونص|ونصف|وتلت|تلت|الا ربع|إلا ربع))?(?:\s*(\d{1,2}))?\s*(الصبح|صباحا|صباحاً|الفجر|بالليل|الليل|مساء|بعد الضهر|بعد الظهر|العصر|المغرب)? ?/;
  const mTime = text.match(timeRe);
  if (mTime) {
    hour = parseInt(mTime[1], 10);
    const frac = mTime[2] ?? '';
    if (frac.startsWith('ونص') || frac === 'ونصف') minute = 30;
    else if (frac.includes('تلت')) minute = 15;
    else if (frac.includes('ربع')) {
      minute = 45;
      hour = hour - 1;
    }
    timeMatched = mTime[0];
    const marker = mTime[4] ?? '';
    if (marker) {
      if (/الصبح|صباحا|صباحاً|الفجر/.test(marker)) {
        if (hour === 12) hour = 0;
      } else {
        // evening markers → PM
        if (hour < 12) hour += 12;
      }
    } else if (hour >= 1 && hour <= 6) {
      hour += 12; // «الساعة 5» without marker reads as 5 PM in Egyptian usage
    } else if (hour === 12) {
      hour = 12;
    }
  } else {
    const looseRe = / ?(\d{1,2})\s*(الصبح|صباحا|بالليل|مساء|العصر|المغرب) ?/;
    const mLoose = text.match(looseRe);
    if (mLoose) {
      hour = parseInt(mLoose[1], 10);
      const marker = mLoose[2];
      if (/الصبح|صباحا/.test(marker)) {
        if (hour === 12) hour = 0;
      } else if (hour < 12) hour += 12;
      timeMatched = mLoose[0];
    }
  }

  if (hour !== null && (hour < 0 || hour > 23)) hour = null;

  let reminderEnabled = false;
  let reminderTime: string | null = null;
  if (hour !== null) {
    reminderEnabled = true;
    reminderTime = `${pad(hour)}:${pad(minute)}`;
    text = text.replace(timeMatched, ' ');
    if (!dueDate) {
      const candidate = new Date(now);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate.getTime() <= now.getTime()) {
        candidate.setDate(candidate.getDate() + 1);
      }
      dueDate = toIso(candidate);
    }
  }

  // 4) Whatever is left is the title
  const title = text.replace(/ يوم /g, ' ').replace(/\s+/g, ' ').trim();
  if (!title) return null;

  return {title, dueDate, reminderEnabled, reminderTime};
}
