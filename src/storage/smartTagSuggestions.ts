import {normalizeSearchText} from './globalSearch';
import type {TaskItem} from '../types';

export interface SmartTagSuggestion {
  tag: string;
  matchedKeyword: string;
  source: 'keyword' | 'custom' | 'history';
  isNewTag: boolean;
}

interface KeywordRule {
  tag: string;
  keywords: string[];
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    tag: 'شغل',
    keywords: [
      'شغل',
      'عمل',
      'اجتماع',
      'اجتماعات',
      'ميتنج',
      'ميتينج',
      'تقرير',
      'تقارير',
      'عميل',
      'عملاء',
      'مشروع',
      'مكتب',
      'مدير',
      'فريق',
      'تيم',
      'موظف',
      'مكالمه',
      'كول',
      'زوم',
      'تعاقد',
      'عقد',
      'شيت',
      'اكسيل',
      'سلايدز',
      'ايميل',
      'بريد',
      'عرض',
      'برزنتيشن',
      'كود',
      'برمجه',
      'تسليم',
      'مقابله',
      'انترفيو',
      'شركه',
      'مبيعات',
      'تاسك',
      'تاسكات',
      'ديدلاين',
      'صفقه',
      'meeting',
      'report',
      'client',
      'email',
      'deploy',
      'sprint',
      'deadline',
      'office',
      'zoom',
      'call',
      'project',
      'work',
      'review',
    ],
  },
  {
    tag: 'بيت',
    keywords: [
      'بيت',
      'منزل',
      'شقه',
      'مطبخ',
      'تنظيف',
      'ترويق',
      'نظافه',
      'غسيل',
      'سوبرماركت',
      'سوبر ماركت',
      'طلبات',
      'خضار',
      'فاكهه',
      'بقاله',
      'سوق',
      'صيانه',
      'تصليح',
      'سباك',
      'كهربائي',
      'نجار',
      'طبخ',
      'عشاء',
      'غداء',
      'فطار',
      'مشتريات',
      'اثاث',
      'غرفه',
      'grocery',
      'groceries',
      'clean',
      'laundry',
      'home',
      'house',
      'repair',
      'kitchen',
      'cook',
    ],
  },
  {
    tag: 'شخصي',
    keywords: [
      'شخصي',
      'حلاق',
      'حلاقه',
      'عائله',
      'اسره',
      'ماما',
      'بابا',
      'اهلي',
      'اصحاب',
      'اصدقاء',
      'عيد ميلاد',
      'هديه',
      'اجازه',
      'بطاقه',
      'رخصه',
      'شخصيه',
      'عزومه',
      'خروجه',
      'family',
      'birthday',
      'gift',
      'personal',
      'friends',
    ],
  },
  {
    tag: 'صحة',
    keywords: [
      'دكتور',
      'طبيب',
      'عياده',
      'مستشفى',
      'كشف',
      'اشعه',
      'صيدليه',
      'دواء',
      'علاج',
      'تحليل',
      'فحص',
      'اسنان',
      'جيم',
      'تمرين',
      'رياضه',
      'جري',
      'مشي',
      'دايت',
      'وزن',
      'فيتامين',
      'doctor',
      'dentist',
      'clinic',
      'medicine',
      'gym',
      'workout',
      'health',
      'run',
    ],
  },
  {
    tag: 'دراسة',
    keywords: [
      'مذاكره',
      'امتحان',
      'امتحانات',
      'كورس',
      'محاضره',
      'واجب',
      'بحث',
      'جامعه',
      'كليه',
      'درس',
      'تخرج',
      'تعلم',
      'كتاب',
      'قراءه',
      'مراجعه',
      'study',
      'exam',
      'course',
      'lecture',
      'homework',
      'book',
      'learn',
      'read',
    ],
  },
  {
    tag: 'مالية',
    keywords: [
      'فاتوره',
      'فواتير',
      'ايجار',
      'بنك',
      'تحويل',
      'قسط',
      'اقساط',
      'ميزانيه',
      'مصاريف',
      'ضرائب',
      'فيزا',
      'كهرباء',
      'مياه',
      'غاز',
      'انترنت',
      'راتب',
      'مرتب',
      'bank',
      'bill',
      'bills',
      'rent',
      'invoice',
      'budget',
      'payment',
      'pay',
    ],
  },
  {
    tag: 'سفر',
    keywords: [
      'سفر',
      'تذكره',
      'طيران',
      'فندق',
      'حجز',
      'شنطه',
      'جواز',
      'رحله',
      'مطار',
      'قطار',
      'flight',
      'hotel',
      'trip',
      'travel',
      'passport',
      'airport',
      'booking',
    ],
  },
];

const STOP_WORDS = new Set([
  'في',
  'من',
  'على',
  'الي',
  'عن',
  'مع',
  'او',
  'ان',
  'هذا',
  'هذه',
  'كل',
  'بعد',
  'قبل',
  'يوم',
  'غدا',
  'اليوم',
  'النهارده',
  'بكره',
  'the',
  'and',
  'for',
  'with',
  'from',
  'to',
  'of',
  'in',
  'on',
  'at',
]);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(normalizedTitle: string, normalizedTokens: string[], keyword: string): boolean {
  const normKw = normalizeSearchText(keyword);
  if (!normKw) return false;

  if (normKw.includes(' ')) {
    return normalizedTitle.includes(normKw);
  }

  // ASCII word boundary match for English keywords
  if (/^[a-z0-9]+$/.test(normKw)) {
    const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(normKw)}([^a-z0-9]|$)`);
    return regex.test(normalizedTitle);
  }

  // Arabic token match (allow common prefix "ال", "و", "ب", "ل", "ف")
  for (const token of normalizedTokens) {
    if (token === normKw) return true;
    const stripped = token.replace(/^(وال|بال|كال|فال|لل|ال|و|ب|ل)/, '');
    if (stripped === normKw) return true;
    if (normKw.length >= 4 && (token.startsWith(normKw) || stripped.startsWith(normKw))) {
      return true;
    }
  }
  return false;
}

export function suggestSmartTaskTags(params: {
  title: string;
  availableTags: string[];
  selectedTags: string[];
  dismissedTags?: string[];
  existingTasks?: TaskItem[];
  maxSuggestions?: number;
}): SmartTagSuggestion[] {
  const {
    title,
    availableTags,
    selectedTags,
    dismissedTags = [],
    existingTasks = [],
    maxSuggestions = 3,
  } = params;
  const normalizedTitle = normalizeSearchText(title);
  if (normalizedTitle.length < 2) return [];

  const normalizedTokens = normalizedTitle
    .split(/[^a-z0-9\u0621-\u064a]+/)
    .filter((token) => token.length >= 2);

  if (normalizedTokens.length === 0) return [];

  const excludedSet = new Set([
    ...selectedTags.map((t) => normalizeSearchText(t)),
    ...dismissedTags.map((t) => normalizeSearchText(t)),
  ]);
  const availableMap = new Map<string, string>();
  for (const tag of availableTags) {
    availableMap.set(normalizeSearchText(tag), tag);
  }

  const scored = new Map<
    string,
    {suggestion: SmartTagSuggestion; score: number}
  >();

  const upsertCandidate = (
    rawTag: string,
    matchedKeyword: string,
    source: SmartTagSuggestion['source'],
    score: number,
  ) => {
    const normTag = normalizeSearchText(rawTag);
    if (!normTag || excludedSet.has(normTag)) return;

    const canonicalTag = availableMap.get(normTag) ?? rawTag;
    const isNewTag = !availableMap.has(normTag);
    const boostedScore = isNewTag ? score : score + 15;

    const existing = scored.get(normTag);
    if (!existing || boostedScore > existing.score) {
      scored.set(normTag, {
        suggestion: {
          tag: canonicalTag,
          matchedKeyword,
          source,
          isNewTag,
        },
        score: boostedScore,
      });
    }
  };

  // 1. Direct match against user's own custom/configured tags
  for (const tag of availableTags) {
    if (matchesKeyword(normalizedTitle, normalizedTokens, tag)) {
      upsertCandidate(tag, tag, 'custom', 90);
    }
  }

  // 2. Built-in Arabic & English keyword dictionary
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (matchesKeyword(normalizedTitle, normalizedTokens, kw)) {
        upsertCandidate(rule.tag, kw, 'keyword', 70);
        break;
      }
    }
  }

  // 3. Lightweight learning from user's previously tagged tasks
  const meaningfulTokens = normalizedTokens.filter(
    (t) => t.length >= 3 && !STOP_WORDS.has(t),
  );
  if (meaningfulTokens.length > 0 && existingTasks.length > 0) {
    const historyCounts = new Map<string, {count: number; keyword: string; tag: string}>();
    for (const task of existingTasks) {
      if (!task.tags || task.tags.length === 0) continue;
      const pastTokens = new Set(
        normalizeSearchText(task.title)
          .split(/[^a-z0-9\u0621-\u064a]+/)
          .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
      );
      const matched = meaningfulTokens.find((t) => pastTokens.has(t));
      if (!matched) continue;

      for (const pastTag of task.tags) {
        const normTag = normalizeSearchText(pastTag);
        if (excludedSet.has(normTag)) continue;
        const prev = historyCounts.get(normTag);
        historyCounts.set(normTag, {
          count: (prev?.count ?? 0) + 1,
          keyword: prev?.keyword ?? matched,
          tag: pastTag,
        });
      }
    }

    for (const entry of historyCounts.values()) {
      upsertCandidate(entry.tag, entry.keyword, 'history', 50 + Math.min(entry.count * 8, 24));
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map((entry) => entry.suggestion);
}
