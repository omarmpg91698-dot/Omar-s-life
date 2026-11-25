import 'dotenv/config';
import {GoogleGenAI, Type} from '@google/genai';
import express, {type Request, type Response} from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {inferReminderFieldsFromText} from './src/storage/reminderSchedule.ts';
import {
  detectSpecialistIntent,
  getRelevantStudiesContext,
  type EgyptShopResult,
  type GroundingSourceItem,
  type SpecialistMode,
} from './src/storage/psychologyMarketingKb.ts';
import {normalizeAdAuditResult} from './src/storage/adAuditTypes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const GMP_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

class QuotaExceededError extends Error {
  constructor(message = 'Google Maps Platform quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

function getMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  );
}

function isQuotaErrorPayload(status: number, body: unknown): boolean {
  if (status === 429) return true;
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  const topStatus = typeof obj.status === 'string' ? obj.status : '';
  if (topStatus === 'OVER_QUERY_LIMIT' || topStatus === 'OVER_DAILY_LIMIT') return true;
  const err = obj.error as Record<string, unknown> | undefined;
  if (err) {
    if (err.status === 'RESOURCE_EXHAUSTED' || err.code === 429) return true;
    const errorsList = Array.isArray(err.errors) ? err.errors : [];
    for (const entry of errorsList) {
      if (entry && typeof entry === 'object') {
        const reason = (entry as Record<string, unknown>).reason;
        if (reason === 'dailyLimitExceeded' || reason === 'userRateLimitExceeded') {
          return true;
        }
      }
    }
  }
  return false;
}

interface AddressComponentLike {
  longText?: string;
  long_name?: string;
  types?: string[];
}

function extractCityLabelFromComponents(components: AddressComponentLike[] | undefined): string {
  if (!Array.isArray(components) || components.length === 0) return '';
  const findByType = (typesToMatch: string[]): string => {
    for (const targetType of typesToMatch) {
      const found = components.find((c) => Array.isArray(c.types) && c.types.includes(targetType));
      const text = found?.longText || found?.long_name;
      if (text) return text;
    }
    return '';
  };

  const city = findByType([
    'locality',
    'administrative_area_level_2',
    'administrative_area_level_1',
    'sublocality',
  ]);
  const country = findByType(['country']);
  if (city && country && city !== country) return `${city}، ${country}`;
  return city || country || '';
}

const TIMEZONE_CITY_MAP: Record<string, {city: string; region: string}> = {
  'Africa/Cairo': {city: 'Cairo, Egypt', region: 'EG'},
  'Africa/Alexandria': {city: 'Alexandria, Egypt', region: 'EG'},
  'Asia/Riyadh': {city: 'Riyadh, Saudi Arabia', region: 'SA'},
  'Asia/Dubai': {city: 'Dubai, United Arab Emirates', region: 'AE'},
  'Asia/Kuwait': {city: 'Kuwait City, Kuwait', region: 'KW'},
  'Asia/Qatar': {city: 'Doha, Qatar', region: 'QA'},
  'Asia/Bahrain': {city: 'Manama, Bahrain', region: 'BH'},
  'Asia/Muscat': {city: 'Muscat, Oman', region: 'OM'},
  'Asia/Amman': {city: 'Amman, Jordan', region: 'JO'},
  'Asia/Beirut': {city: 'Beirut, Lebanon', region: 'LB'},
  'Asia/Baghdad': {city: 'Baghdad, Iraq', region: 'IQ'},
  'Africa/Tripoli': {city: 'Tripoli, Libya', region: 'LY'},
  'Africa/Tunis': {city: 'Tunis, Tunisia', region: 'TN'},
  'Africa/Algiers': {city: 'Algiers, Algeria', region: 'DZ'},
  'Africa/Casablanca': {city: 'Casablanca, Morocco', region: 'MA'},
  'Africa/Khartoum': {city: 'Khartoum, Sudan', region: 'SD'},
  'Asia/Gaza': {city: 'Gaza', region: 'PS'},
  'Asia/Hebron': {city: 'Hebron', region: 'PS'},
  'Asia/Aden': {city: 'Sanaa, Yemen', region: 'YE'},
  'Europe/Istanbul': {city: 'Istanbul, Turkey', region: 'TR'},
  'Europe/London': {city: 'London, United Kingdom', region: 'GB'},
  'Europe/Paris': {city: 'Paris, France', region: 'FR'},
  'Europe/Berlin': {city: 'Berlin, Germany', region: 'DE'},
  'America/New_York': {city: 'New York, United States', region: 'US'},
  'America/Los_Angeles': {city: 'Los Angeles, United States', region: 'US'},
  'America/Chicago': {city: 'Chicago, United States', region: 'US'},
  'America/Toronto': {city: 'Toronto, Canada', region: 'CA'},
};

function inferLocationHintFromTimezone(timeZone: string): {city: string; region?: string} | null {
  const cleanTz = timeZone.trim();
  if (!cleanTz || cleanTz.length > 64) return null;
  if (TIMEZONE_CITY_MAP[cleanTz]) {
    return TIMEZONE_CITY_MAP[cleanTz];
  }
  const parts = cleanTz.split('/');
  const rawCity = parts[parts.length - 1]?.replace(/_/g, ' ').trim();
  if (!rawCity || rawCity.toUpperCase() === 'UTC' || rawCity.toUpperCase() === 'GMT') {
    return null;
  }
  return {city: rawCity};
}

function normalizeRegionCode(rawRegion: string): string {
  const clean = rawRegion.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(clean) ? clean : '';
}

interface GeocodedCandidate {
  lat: number;
  lng: number;
  label: string;
  formattedAddress: string;
}

async function resolveApproxCoordsViaGeolocationApi(
  apiKey: string,
): Promise<{lat: number; lng: number; accuracy?: number}> {
  const url = `https://www.googleapis.com/geolocation/v1/geolocate?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
    body: JSON.stringify({considerIp: true}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (isQuotaErrorPayload(res.status, data)) {
    throw new QuotaExceededError();
  }
  if (!res.ok) {
    throw new Error(`Geolocation API failed (${res.status})`);
  }
  const loc = data.location as {lat?: number; lng?: number} | undefined;
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') {
    throw new Error('Geolocation API returned no coordinates');
  }
  return {
    lat: loc.lat,
    lng: loc.lng,
    accuracy: typeof data.accuracy === 'number' ? data.accuracy : undefined,
  };
}

async function geocodeCityCandidates(
  cityQuery: string,
  apiKey: string,
  regionCode = '',
): Promise<GeocodedCandidate[]> {
  const safeRegion = normalizeRegionCode(regionCode);

  // Primary: Geocoding API v4
  const encodedAddress = encodeURIComponent(cityQuery);
  const v4Url = new URL(`https://geocode.googleapis.com/v4/geocode/address/${encodedAddress}`);
  v4Url.searchParams.set('languageCode', 'ar');
  if (safeRegion) {
    v4Url.searchParams.set('regionCode', safeRegion);
  }
  const v4Res = await fetch(v4Url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'results.location,results.formattedAddress,results.addressComponents',
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
  });
  const v4Data = (await v4Res.json().catch(() => ({}))) as Record<string, unknown>;
  if (isQuotaErrorPayload(v4Res.status, v4Data)) {
    throw new QuotaExceededError();
  }
  if (v4Res.ok && Array.isArray(v4Data.results) && v4Data.results.length > 0) {
    const candidates: GeocodedCandidate[] = [];
    for (const item of v4Data.results.slice(0, 5)) {
      const entry = item as {
        location?: {latitude?: number; longitude?: number};
        formattedAddress?: string;
        addressComponents?: AddressComponentLike[];
      };
      if (
        typeof entry.location?.latitude === 'number' &&
        typeof entry.location?.longitude === 'number'
      ) {
        const label =
          extractCityLabelFromComponents(entry.addressComponents) ||
          entry.formattedAddress ||
          cityQuery;
        candidates.push({
          lat: entry.location.latitude,
          lng: entry.location.longitude,
          label,
          formattedAddress: entry.formattedAddress || label,
        });
      }
    }
    if (candidates.length > 0) return candidates;
  }

  // Fallback: Standard Geocoding REST API
  const restUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  restUrl.searchParams.set('address', cityQuery);
  restUrl.searchParams.set('language', 'ar');
  if (safeRegion) {
    restUrl.searchParams.set('region', safeRegion.toLowerCase());
  }
  restUrl.searchParams.set('key', apiKey);
  const restRes = await fetch(restUrl.toString(), {
    method: 'GET',
    headers: {'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID},
  });
  const restData = (await restRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (isQuotaErrorPayload(restRes.status, restData)) {
    throw new QuotaExceededError();
  }
  if (restRes.ok && Array.isArray(restData.results) && restData.results.length > 0) {
    const candidates: GeocodedCandidate[] = [];
    for (const item of restData.results.slice(0, 5)) {
      const entry = item as {
        geometry?: {location?: {lat?: number; lng?: number}};
        formatted_address?: string;
        address_components?: AddressComponentLike[];
      };
      if (
        typeof entry.geometry?.location?.lat === 'number' &&
        typeof entry.geometry?.location?.lng === 'number'
      ) {
        const label =
          extractCityLabelFromComponents(entry.address_components) ||
          entry.formatted_address ||
          cityQuery;
        candidates.push({
          lat: entry.geometry.location.lat,
          lng: entry.geometry.location.lng,
          label,
          formattedAddress: entry.formatted_address || label,
        });
      }
    }
    if (candidates.length > 0) return candidates;
  }

  return [];
}

async function forwardGeocodeCity(
  cityQuery: string,
  apiKey: string,
  regionCode = '',
): Promise<{lat: number; lng: number; label: string} | null> {
  const candidates = await geocodeCityCandidates(cityQuery, apiKey, regionCode);
  return candidates[0] ?? null;
}

async function reverseGeocodeLabel(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<string> {
  try {
    const v4Url = new URL('https://geocode.googleapis.com/v4/geocode/location');
    v4Url.searchParams.set('location.latitude', String(lat));
    v4Url.searchParams.set('location.longitude', String(lng));
    v4Url.searchParams.set('languageCode', 'ar');

    const v4Res = await fetch(v4Url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'results.formattedAddress,results.addressComponents',
        'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
      },
    });
    const v4Data = (await v4Res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isQuotaErrorPayload(v4Res.status, v4Data)) {
      throw new QuotaExceededError();
    }
    if (v4Res.ok && Array.isArray(v4Data.results) && v4Data.results.length > 0) {
      const first = v4Data.results[0] as {
        formattedAddress?: string;
        addressComponents?: AddressComponentLike[];
      };
      const label =
        extractCityLabelFromComponents(first.addressComponents) || first.formattedAddress || '';
      if (label) return label;
    }

    // Fallback: Standard Geocoding REST API
    const restUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    restUrl.searchParams.set('latlng', `${lat},${lng}`);
    restUrl.searchParams.set('language', 'ar');
    restUrl.searchParams.set('key', apiKey);
    const restRes = await fetch(restUrl.toString(), {
      method: 'GET',
      headers: {'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID},
    });
    const restData = (await restRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (isQuotaErrorPayload(restRes.status, restData)) {
      throw new QuotaExceededError();
    }
    if (restRes.ok && Array.isArray(restData.results) && restData.results.length > 0) {
      const first = restData.results[0] as {
        formatted_address?: string;
        address_components?: AddressComponentLike[];
      };
      return (
        extractCityLabelFromComponents(first.address_components) || first.formatted_address || ''
      );
    }
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
  }
  return '';
}

async function fetchGoogleCurrentWeather(lat: number, lng: number, apiKey: string) {
  const url = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('location.latitude', String(lat));
  url.searchParams.set('location.longitude', String(lng));
  url.searchParams.set('unitsSystem', 'METRIC');
  url.searchParams.set('languageCode', 'ar');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (isQuotaErrorPayload(res.status, data)) {
    throw new QuotaExceededError();
  }
  if (!res.ok) {
    throw new Error(`Weather API error (${res.status})`);
  }
  return data;
}

async function fetchGoogleTodayForecast(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<{maxTempC: number | null; minTempC: number | null}> {
  try {
    const url = new URL('https://weather.googleapis.com/v1/forecast/days:lookup');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('location.latitude', String(lat));
    url.searchParams.set('location.longitude', String(lng));
    url.searchParams.set('days', '1');
    url.searchParams.set('pageSize', '1');
    url.searchParams.set('unitsSystem', 'METRIC');
    url.searchParams.set('languageCode', 'ar');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      forecastDays?: Array<{
        maxTemperature?: {degrees?: number};
        minTemperature?: {degrees?: number};
      }>;
    };
    if (isQuotaErrorPayload(res.status, data)) {
      throw new QuotaExceededError();
    }
    const today = res.ok && Array.isArray(data.forecastDays) ? data.forecastDays[0] : undefined;
    return {
      maxTempC:
        typeof today?.maxTemperature?.degrees === 'number'
          ? Math.round(today.maxTemperature.degrees)
          : null,
      minTempC:
        typeof today?.minTemperature?.degrees === 'number'
          ? Math.round(today.minTemperature.degrees)
          : null,
    };
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
    return {maxTempC: null, minTempC: null};
  }
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildAssistantSystemInstruction(lifeContext: Record<string, unknown>): string {
  const userName =
    typeof lifeContext.userName === 'string' && lifeContext.userName.trim()
      ? lifeContext.userName.trim()
      : 'عمر';
  const profile = (lifeContext.profile ?? {}) as {
    roleAndWork?: string;
    dailyRoutine?: string;
    topPriorities?: string;
    personalNotes?: string;
    tone?: string;
  };
  const toneGuide =
    profile.tone === 'direct'
      ? 'اكتب بأسلوب مختصر وعملي ومباشر بنقاط واضحة بدون تطويل.'
      : profile.tone === 'coach'
        ? 'اتكلم كمدرب شخصي محفّز وعملي، شجع المستخدم بصدق وحاسبه بلطف على التزامه وأهدافه.'
        : 'اتكلم بالعامية المصرية الطبيعية الودودة والمنظمة، كأنك مساعد شخصي فاهم حياة المستخدم كويس.';

  return [
    `أنت المساعد الشخصي الذكي الخاص بـ "${userName}" داخل تطبيق "Omar's Life".`,
    toneGuide,
    'مهمتك إنك تفهم حياة المستخدم الحقيقية (ملفه الشخصي، ذاكرته طويلة المدى، مهامه، أهدافه، عاداته، ملاحظاته) وتساعده ينظم يومه وحياته فعلياً.',
    '',
    'خبراتك وشخصيتك:',
    '1. علم نفس: تفهم المشاعر والضغوط والتحفيز والعادات النفسية. لما المستخدم يفضفض أو يكون متوتر أو محبط، اسمعه بجدية، طمّنه، وساعده بخطوات عملية صغيرة، من غير ما تلقي عليه محاضرات. لو لاحظت علامات اكتئاب شديد أو إيذاء للنفس، شجّعه بلطف إنه يكلم مختص حقيقي.',
    '2. استشاري علاقات زوجية: تدّي نصايح عملية ومتوازنة في العلاقة مع مراته (وهي حامل حالياً)، التواصل، حل الخلافات، الدعم في فترة الحمل والاستعداد للبيبي. خليك حيادي، محترم، ومش بتحكم على حد.',
    '3. استشاري تسويق خبير: المستخدم صاحب شركة "Misr Pyramids Group" للتجميل والعناية الشخصية في مصر. افهم سوق مستحضرات التجميل المصري: التوزيع في الصيدليات والسوبر ماركت والهايبر ماركت، التسعير، البراندينج، السوشيال ميديا، العروض، وإدارة فرق المبيعات والمناديب. لما يسأل عن التسويق أو البيع، ادّيه خطط وأفكار عملية قابلة للتنفيذ مش كلام نظري.',
    '4. خبير أماكن في مصر: تعرف كل حتة في مصر — المحافظات والمدن والمناطق والشوارع المشهورة والمولات والأسواق والمستشفيات والجامعات والمواصلات والمسافات التقريبية بين المدن. لما يسأل عن أي مكان في مصر، جاوبه بأكبر قدر من المعلومات المفيدة والمنظمة.',
    '5. لغتك: رد دايماً بالعامية المصرية الطبيعية زي ما بيتكلم، وافهم كتابته بالمصري مهما كانت عامية أو مختصرة أو فيها أخطاء إملائية.',
    '',
    'القواعد الصارمة لتنفيذ الأوامر (actions):',
    '1. أضف عناصر في مصفوفة actions فقط لما المستخدم يطلب فعل حقيقي (زي إضافة مهمة، ترتيب/جدولة يومه، إنهاء مهمة، إنشاء هدف بخطواته، تسجيل ملاحظة، إضافة عادة، أو لما يذكر معلومة شخصية دائمة عن حياته تستاهل الحفظ في الذاكرة).',
    '2. لو المستخدم مجرد بيسأل أو بيفضفض ومفيش حاجة تتعدل في التطبيق، خلّي actions فاضية [].',
    '3. لما المستخدم يقول معلومة شخصية جديدة ومفيدة عن حياته (زي مواعيد شغله، هدف شخصي، تفضيل، رياضة، اسم مكان أو روتين) ومش موجودة فعلاً في memories، أضف action من نوع "save_memory" عشان تتعلمها وتفتكرها في كل المحادثات الجاية.',
    '4. لما يطلب "رتّبلي يومي" أو "جدول مهامي"، استخدم "schedule_task" مع الـ taskId الحقيقي من قائمة tasks المتاحة، وحدد dueDate بصيغة YYYY-MM-DD و reminderTime بصيغة HH:MM (24 ساعة) مناسبة لروتينه والوقت الحالي.',
    '5. لما يطلب خطة لهدف جديد، استخدم "add_goal" مع initialTasks (مصفوفة من ٣ إلى ٥ مهام عملية واضحة).',
    '6. لو رفع صورة (ورقة مكتوبة أو لقطة شاشة أو جدول)، اقرأ محتواها بدقة واقترح أو نفّذ المهام/الملاحظات المطلوبة منها.',
    '7. في حقل reply، اشرح بوضوح وبشكل مريح إيه اللي عملته أو نصحتك بيه بناءً على بياناته الحقيقية، بدون رموز برمجية أو JSON داخل reply.',
    '8. في suggestedFollowUps، اقترح ٢ أو ٣ أسئلة أو أوامر قصيرة وعملية جداً يقدر يضغط عليها فوراً.',
    '',
    'بيانات حياة المستخدم الحقيقية الآن (JSON):',
    JSON.stringify(lifeContext),
  ].join('\n');
}

const ASSISTANT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: 'Natural Egyptian Arabic response grounded in the user life context.',
    },
    suggestedFollowUps: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: '2 to 3 short Arabic follow-up prompts the user can tap next.',
    },
    actions: {
      type: Type.ARRAY,
      description: 'Concrete actions to apply inside the app. Empty array if no mutations needed.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description:
              'One of: add_task, complete_task, schedule_task, add_goal, add_note, add_habit, save_memory',
          },
          taskId: {type: Type.STRING, description: 'Existing task ID for complete_task or schedule_task'},
          title: {type: Type.STRING, description: 'Title for task, goal, note, or habit'},
          dueDate: {type: Type.STRING, description: 'YYYY-MM-DD date or empty string'},
          priority: {type: Type.STRING, description: 'One of: مهم, متوسط, عادي'},
          reminderTime: {type: Type.STRING, description: 'HH:MM 24-hour time or empty string'},
          tags: {type: Type.ARRAY, items: {type: Type.STRING}},
          goalKind: {type: Type.STRING, description: 'هدف or مشروع'},
          description: {type: Type.STRING, description: 'Goal description'},
          initialTasks: {
            type: Type.ARRAY,
            items: {type: Type.STRING},
            description: 'Optional starter tasks linked to a new goal',
          },
          noteCategory: {
            type: Type.STRING,
            description: 'One of: شخصي, شغل, أفكار, حاجات مهمة',
          },
          content: {type: Type.STRING, description: 'Note body content'},
          pinned: {type: Type.BOOLEAN},
          memoryCategory: {
            type: Type.STRING,
            description: 'One of: شخصي, شغل, روتين, تفضيلات, علاقات, صحة',
          },
          fact: {type: Type.STRING, description: 'Personal life fact to save in long-term memory'},
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'suggestedFollowUps', 'actions'],
};

const OMAR_AI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description:
        'Concise, intelligent, friendly response in natural Egyptian Arabic (or English if the user writes in English).',
    },
    language: {
      type: Type.STRING,
      description: 'Detected response language code: ar-EG or en-US.',
    },
    suggestedFollowUps: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: '2 to 3 concise follow-up prompts.',
    },
    toolCalls: {
      type: Type.ARRAY,
      description:
        'Structured Android phone & assistant tool calls. Empty array when no tool action is needed.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description:
              'One of: open_app, dial_number, open_website, create_calendar_event, create_reminder, create_task, complete_task, share_content, save_memory, compose_email, create_note, send_message',
          },
          requiresConfirmation: {
            type: Type.BOOLEAN,
            description:
              'True for important phone actions (dialer, calendar, reminders, emails, messages, notes, opening apps/links, or saving personal memories).',
          },
          confirmationPrompt: {
            type: Type.STRING,
            description: 'Clear Arabic/English confirmation sentence asking the user before executing.',
          },
          appName: {type: Type.STRING},
          phoneNumber: {type: Type.STRING},
          url: {type: Type.STRING},
          title: {type: Type.STRING},
          description: {type: Type.STRING},
          startTimeIso: {type: Type.STRING},
          delayMinutes: {type: Type.INTEGER},
          reminderTime: {
            type: Type.STRING,
            description:
              'REQUIRED for create_reminder when a clock time is mentioned. Exact 24-hour HH:MM (e.g. "08:00", "21:30").',
          },
          recurrence: {
            type: Type.STRING,
            description:
              'Reminder recurrence: "once", "daily", "weekly", or "monthly".',
          },
          daysOfWeek: {
            type: Type.ARRAY,
            items: {type: Type.INTEGER},
            description:
              'ISO days of week (1=Monday .. 6=Saturday, 7=Sunday) when recurrence is "weekly".',
          },
          taskId: {type: Type.STRING},
          dueDateIso: {type: Type.STRING},
          shareText: {type: Type.STRING},
          memoryCategory: {type: Type.STRING},
          memoryFact: {type: Type.STRING},
          isSensitiveMemory: {type: Type.BOOLEAN},
          recipientEmail: {
            type: Type.STRING,
            description: 'Recipient email address for compose_email (leave empty if user did not specify one).',
          },
          recipientName: {
            type: Type.STRING,
            description: 'Contact or recipient name for compose_email or send_message.',
          },
          subject: {
            type: Type.STRING,
            description: 'Email subject line for compose_email.',
          },
          body: {
            type: Type.STRING,
            description: 'Complete ready-to-send email body template for compose_email.',
          },
          content: {
            type: Type.STRING,
            description: 'Full note text content for create_note.',
          },
          noteCategory: {
            type: Type.STRING,
            description: 'One of: شخصي, شغل, أفكار, حاجات مهمة (for create_note).',
          },
          openInPhoneNotes: {
            type: Type.BOOLEAN,
            description: 'True if user wants to also open/export the note to Samsung Notes or Google Keep.',
          },
          channel: {
            type: Type.STRING,
            description: 'Messaging channel for send_message: "whatsapp" or "sms".',
          },
          messageText: {
            type: Type.STRING,
            description: 'Complete ready-to-send message body for send_message.',
          },
        },
        required: ['type', 'requiresConfirmation', 'confirmationPrompt'],
      },
    },
  },
  required: ['reply', 'language', 'suggestedFollowUps', 'toolCalls'],
};

function buildOmarAiSystemInstruction(ctx: {
  userName: string;
  personalBio: string;
  preferredLanguage: string;
  deviceTimeIso: string;
  deviceTimeZone: string;
  specialistMode?: SpecialistMode;
  relevantStudies?: Array<{
    titleAr: string;
    titleEn: string;
    researcher: string;
    year: string;
    summaryAr: string;
    practicalTakeawayAr: string;
  }>;
  memories: Array<{category: string; fact: string}>;
  tasks: Array<{id: string; title: string; dueDateIso?: string | null; completed?: boolean}>;
}): string {
  const modeGuidance =
    ctx.specialistMode === 'psychology'
      ? [
          'التخصص الحالي: علم النفس والدراسات النفسية (Behavioral & Cognitive Psychology).',
          '- اشرح النظريات والدراسات النفسية بالعامية المصرية السلسة مع ذكر اسم الباحث/النظرية بالإنجليزي بين قوسين عشان الدقة العلمية.',
          '- استند للدراسات الموثقة من بحث جوجل الحي ومن المراجع المرفقة، وقدم خطوات عملية واضحة يقدر المستخدم يطبقها في حياته اليومية.',
          '- ملاحظة مهنية: لو الموضوع يتعلق بحالة صحية نفسية حادة، قدّم دعم واعي وانصح باستشارة مختص نفسي مرخّص بجانب التوعية العلمية.',
        ].join('\n')
      : ctx.specialistMode === 'marketing'
        ? [
            'التخصص الحالي: التسويق الحديث وعلم نفس المستهلك (Marketing & Consumer Psychology).',
            '- اربط بين أحدث معلومات واستراتيجيات التسويق من الإنترنت وبين مبادئ علم النفس السلوكي (الإقناع، التسعير، التموضع، كتابة الإعلانات، وتجربة العميل).',
            '- اعطي أمثلة عملية مناسبة للسوق المصري (السوشيال ميديا، البراندات المحلية، سلوك المشتري المصري) بخطوات قابلة للتنفيذ فوراً.',
          ].join('\n')
        : ctx.specialistMode === 'egypt_shops'
          ? [
              'التخصص الحالي: دليل المحلات والأماكن الحقيقية في مصر (خرائط جوجل).',
              '- ممنوع تماماً تألف أو تخمّن أسماء محلات أو عناوين أو أرقام تليفونات من خيالك. اعتمد فقط على النتائج الحقيقية الواردة من خرائط جوجل.',
              '- رشّح للمستخدم أحسن المحلات بالعامية المصرية ووضّح المنطقة والتقييم ولو مفتوح دلوقتي.',
            ].join('\n')
          : 'التخصص الحالي: المساعد الشخصي الذكي الشامل بالمصري (تنظيم اليوم، تذكيرات، علم نفس، تسويق، وأماكن في مصر).';

  return [
    `أنت "Omar's personal assistant"، المساعد الشخصي الذكي الخاص بـ "${ctx.userName}".`,
    'شخصيتك: صاحب ذكي، هادئ، مثقف في علم النفس والتسويق، وفاهم الشارع المصري — بتتكلم عامية مصرية طبيعية ١٠٠٪ (زي ما بنتكلم في القاهرة بودّ وذكاء، من غير تكلف ولا فصحى جامدة).',
    'اللغة: اتكلم دايماً بالعامية المصرية الطبيعية السلسة، إلا لو المستخدم كتب أو اتكلم بالإنجليزي فساعتها رد بإنجليزي طبيعي واضبط language على "en-US"، غير كده خلي language = "ar-EG".',
    'الاختصار والوضوح: قدم إجابات مركّزة ومنظمة ومباشرة، واستخدم نقاط قصيرة لما الشرح يحتاج ترتيب.',
    '',
    modeGuidance,
    '',
    'قواعد الأدوات (toolCalls) — التزم بيها حرفياً في وضع المحادثة المهيكل:',
    '1. أضف toolCalls فقط لما المستخدم يطلب إجراء فعلي أو يشارك معلومة شخصية مفيدة تستاهل الحفظ في الذاكرة.',
    '2. ممنوع تماماً تدّعي إنك نفّذت إجراء فعلي في الرد قبل ما المستخدم يأكّده، أو لو القدرة غير متاحة رسمياً على أندرويد. في الإيميل وواتساب وSMS، وضح بصدق إنك جهّزت الرسالة وهتفتح التطبيق جاهز على ضغطة الإرسال بعد تأكيده.',
    '3. لأي إجراء مهم (dial_number, create_calendar_event, create_reminder, open_app, open_website, save_memory, compose_email, create_note, send_message)، اجعل requiresConfirmation = true واكتب confirmationPrompt واضح وودود.',
    '4. أدوات الإيميل والنوتس والرسائل:',
    '   - تجهيز تمبليت إيميل (compose_email): املا subject و body (نص الإيميل الكامل جاهز للإرسال بأسلوب احترافي أو مناسب لطلب المستخدم)، واملا recipientEmail و recipientName لو اتذكروا. التطبيق هيفتح Gmail بكل الخانات جاهزة.',
    '   - كتابة نوت في الموبايل (create_note): املا title و content و noteCategory ("شخصي" | "شغل" | "أفكار" | "حاجات مهمة")، وخلي openInPhoneNotes = true لو المستخدم طلب حفظها في نوتس الموبايل / Samsung Notes / Keep.',
    '   - إرسال رسالة لحد (send_message): املا channel ("whatsapp" لو قال واتساب أو مقالش نوع، أو "sms" لو قال رسالة SMS)، واملا recipientName و phoneNumber (لو اتذكر رقم) و messageText بنص الرسالة الجاهز.',
    '5. عند جدولة التذكيرات (create_reminder) — يجب دائماً ملء الحقول المناسبة وعدم إضافة حقول غير مطلوبة مثل url أو phoneNumber:',
    '   - املا title بعنوان التذكير بوضوح.',
    '   - املا reminderTime بصيغة HH:MM (24 ساعة) دائماً لو اتذكر وقت (مثال: "الساعة ٨ الصبح" -> reminderTime: "08:00"، "٩ ونص بالليل" -> reminderTime: "21:30").',
    '   - املا recurrence دائماً بقيمة من ("once" | "daily" | "weekly" | "monthly"): "كل يوم" -> "daily"، "كل أسبوع" أو أيام معينة (مثل "كل سبت وتلات") -> "weekly" مع daysOfWeek (الإثنين=1، الثلاثاء=2، الأربعاء=3، الخميس=4، الجمعة=5، السبت=6، الأحد=7)، "كل شهر" -> "monthly"، غير كده -> "once".',
    '   - مثال دقيق لطلب "فكرني كل يوم الساعة 8 الصبح أشرب مية": {"type":"create_reminder","requiresConfirmation":true,"confirmationPrompt":"أأكدلك ضبط تذكير يومي الساعة 8:00 الصبح لشرب المية؟","title":"شرب المية","reminderTime":"08:00","recurrence":"daily"}.',
    '   - لو طلب مدة نسبية فقط (زي "بعد ٣٠ دقيقة") بدون ساعة محددة، استخدم delayMinutes مع recurrence: "once".',
    '6. ممنوع وضع قيم وهمية (مثل url: "https://example.com") في أي أداة لا تحتاجها. املأ فقط الحقول الخاصة بنوع الأداة.',
    '7. ممنوع تقترح حفظ معلومات حساسة (باسوردات، بطاقات بنكية، بيانات خاصة جداً) إلا لو المستخدم طلب صراحةً، وساعتها اجعل isSensitiveMemory = true و requiresConfirmation = true.',
    '7. لو المستخدم رفع صورة أو لقطة شاشة أو إيصال أو مستند، اقرأه بدقة، لخّصه بوضوح، ولو فيه موعد أو مهمة اقترح toolCall مناسب.',
    '8. استخدم التوقيت الحالي للجهاز في حساب المواعيد والتذكيرات.',
    '',
    'سياق المستخدم الحالي والمراجع العلمية (JSON):',
    JSON.stringify(ctx),
  ].join('\n');
}

function extractGroundingSources(response: unknown): GroundingSourceItem[] {
  const candidates = (response as {candidates?: Array<Record<string, unknown>>})?.candidates;
  const meta = candidates?.[0]?.groundingMetadata as
    | {
        groundingChunks?: Array<{
          web?: {uri?: string; title?: string};
          maps?: {uri?: string; title?: string};
        }>;
      }
    | undefined;

  const chunks = Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : [];
  const seen = new Set<string>();
  const sources: GroundingSourceItem[] = [];

  for (const chunk of chunks) {
    if (chunk.maps?.uri) {
      const uri = chunk.maps.uri.trim();
      if ((uri.startsWith('https://') || uri.startsWith('http://')) && !seen.has(uri)) {
        seen.add(uri);
        sources.push({
          title: (chunk.maps.title || 'موقع على خرائط جوجل').trim().slice(0, 120),
          uri,
          kind: 'maps',
        });
      }
    } else if (chunk.web?.uri) {
      const uri = chunk.web.uri.trim();
      if ((uri.startsWith('https://') || uri.startsWith('http://')) && !seen.has(uri)) {
        seen.add(uri);
        sources.push({
          title: (chunk.web.title || 'مصدر من الإنترنت').trim().slice(0, 120),
          uri,
          kind: 'web',
        });
      }
    }
    if (sources.length >= 8) break;
  }

  return sources;
}

// Places API (New) Text Search for real shops & places in Egypt (compliant with X-Goog-FieldMask + Solution ID)
async function searchEgyptShopsViaPlacesApi(params: {
  query: string;
  area?: string;
  openNow?: boolean;
  lat?: number;
  lng?: number;
  apiKey: string;
}): Promise<EgyptShopResult[]> {
  const cleanQuery = params.query.trim().slice(0, 160);
  const cleanArea = (params.area ?? '').trim().slice(0, 60);
  const hasEgyptMention = /(?:مصر|القاهر|الجيز|المعادي|مدينة\s*نصر|التجمع|زايد|أكتوبر|الزمالك|وسط\s*البلد|المهندسين|إسكندري|المنصور|طنطا|egypt|cairo|giza|alexandria)/i.test(
    `${cleanQuery} ${cleanArea}`,
  );
  const textQuery = [cleanQuery, cleanArea, hasEgyptMention ? '' : 'في مصر']
    .filter(Boolean)
    .join(' ');

  const requestBody: Record<string, unknown> = {
    textQuery,
    languageCode: 'ar',
    regionCode: 'EG',
    pageSize: 6,
  };

  if (params.openNow) {
    requestBody.openNow = true;
  }

  if (
    typeof params.lat === 'number' &&
    typeof params.lng === 'number' &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng) &&
    params.lat >= 21 &&
    params.lat <= 32 &&
    params.lng >= 24 &&
    params.lng <= 37
  ) {
    requestBody.locationBias = {
      circle: {
        center: {latitude: params.lat, longitude: params.lng},
        radius: 25000.0,
      },
    };
  } else {
    requestBody.locationBias = {
      circle: {
        center: {latitude: 30.0444, longitude: 31.2357},
        radius: 50000.0,
      },
    };
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': params.apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.currentOpeningHours.openNow,places.nationalPhoneNumber,places.primaryTypeDisplayName',
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
    body: JSON.stringify(requestBody),
  });

  const data = (await res.json().catch(() => ({}))) as {
    places?: Array<{
      id?: string;
      displayName?: {text?: string};
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      googleMapsUri?: string;
      currentOpeningHours?: {openNow?: boolean};
      nationalPhoneNumber?: string;
      primaryTypeDisplayName?: {text?: string};
    }>;
  };

  if (isQuotaErrorPayload(res.status, data as Record<string, unknown>)) {
    throw new QuotaExceededError();
  }
  if (!res.ok || !Array.isArray(data.places)) {
    return [];
  }

  return data.places
    .filter((p) => Boolean(p.displayName?.text && p.googleMapsUri))
    .slice(0, 6)
    .map((p) => ({
      id: p.id || `place-${Math.random().toString(36).slice(2, 9)}`,
      name: p.displayName?.text || '',
      address: p.formattedAddress || 'مصر',
      rating: typeof p.rating === 'number' ? p.rating : null,
      ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      openNow:
        typeof p.currentOpeningHours?.openNow === 'boolean'
          ? p.currentOpeningHours.openNow
          : null,
      phone: p.nationalPhoneNumber || null,
      googleMapsUri: p.googleMapsUri || '',
      primaryType: p.primaryTypeDisplayName?.text || undefined,
    }));
}

function sanitizeTextForSpeech(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>~]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1400);
}

async function generateWithTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fn();
    } catch (innerErr) {
      const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
      const isTransient = innerMsg.includes('503') || innerMsg.includes('UNAVAILABLE');
      if (attempt === 0 && isTransient) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      throw innerErr;
    }
  }
  throw new Error('Retry loop exhausted');
}

function listAndroidProjectFiles(rootDir: string): Array<{path: string; bytes: number}> {
  const results: Array<{path: string; bytes: number}> = [];
  if (!fs.existsSync(rootDir)) return results;

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'build') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const stat = fs.statSync(full);
        results.push({
          path: path.relative(rootDir, full).replace(/\\/g, '/'),
          bytes: stat.size,
        });
      }
    }
  };
  walk(rootDir);
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '6mb'}));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true, app: "Omar's Life", timestamp: Date.now()});
  });

  app.post('/api/assistant/chat', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'gemini_key_missing',
        message: 'خدمة المساعد الذكي غير مفعّلة حالياً على الخادم.',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      message?: unknown;
      imageDataUrl?: unknown;
      history?: unknown;
      lifeContext?: unknown;
    };

    const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
    const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';

    if (!userMessage && !imageDataUrl) {
      res.status(400).json({
        error: 'empty_message',
        message: 'اكتب رسالتك أو أرفق صورة الأول.',
      });
      return;
    }

    if (userMessage.length > 4000) {
      res.status(400).json({
        error: 'message_too_long',
        message: 'الرسالة طويلة جداً، جرّب تختصرها شوية.',
      });
      return;
    }

    const lifeContext =
      body.lifeContext && typeof body.lifeContext === 'object'
        ? (body.lifeContext as Record<string, unknown>)
        : {};

    const rawHistory = Array.isArray(body.history) ? body.history.slice(-10) : [];
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{text?: string; inlineData?: {mimeType: string; data: string}}>;
    }> = [];

    for (const entry of rawHistory) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as {role?: unknown; text?: unknown};
      if (typeof item.text !== 'string' || !item.text.trim()) continue;
      contents.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{text: item.text.slice(0, 1500)}],
      });
    }

    const currentParts: Array<{text?: string; inlineData?: {mimeType: string; data: string}}> = [];

    if (imageDataUrl) {
      const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
        imageDataUrl,
      );
      if (!match) {
        res.status(400).json({
          error: 'invalid_image',
          message: 'صيغة الصورة غير مدعومة. استخدم PNG أو JPG أو WebP.',
        });
        return;
      }
      currentParts.push({
        inlineData: {
          mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
          data: match[2],
        },
      });
    }

    currentParts.push({
      text:
        userMessage ||
        'اقرأ الصورة دي كويس ولخّصلي اللي فيها، ولو فيها مهام أو مواعيد مهمّة اقترح أو أضفها.',
    });

    contents.push({role: 'user', parts: currentParts});

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction: buildAssistantSystemInstruction(lifeContext),
          responseMimeType: 'application/json',
          responseSchema: ASSISTANT_RESPONSE_SCHEMA,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'empty_response',
          message: 'المساعد مردّش بنص واضح المرة دي، جرّب تاني.',
        });
        return;
      }

      let parsed: {
        reply?: string;
        suggestedFollowUps?: string[];
        actions?: Array<Record<string, unknown>>;
      };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = {reply: rawText, suggestedFollowUps: [], actions: []};
      }

      res.json({
        reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : rawText,
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
          ? parsed.suggestedFollowUps
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .slice(0, 3)
          : [],
        actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 12) : [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Assistant API error:', msg);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'quota_exceeded',
          message: 'وصلت للحد المؤقت لاستخدام المساعد الذكي. استنى شوية وجرّب تاني.',
        });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        res.status(403).json({
          error: 'api_key_invalid',
          message: 'فيه مشكلة في صلاحية مفتاح الذكاء الاصطناعي. راجع الإعدادات.',
        });
        return;
      }
      res.status(502).json({
        error: 'assistant_failed',
        message: 'حصلت مشكلة مؤقتة أثناء الاتصال بالمساعد الذكي. جرّب تبعت رسالتك تاني.',
      });
    }
  });

  // Dedicated Omar AI (Muse-Inspired Native Android + Companion) Chat & Tool-Calling API
  app.post('/api/omar-ai/chat', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'gemini_key_missing',
        message: "خدمة Omar's personal assistant غير مفعّلة حالياً على الخادم.",
      });
      return;
    }

    const body = (req.body ?? {}) as {
      message?: unknown;
      imageDataUrl?: unknown;
      attachedDocName?: unknown;
      attachedDocText?: unknown;
      history?: unknown;
      memories?: unknown;
      tasks?: unknown;
      userName?: unknown;
      personalBio?: unknown;
      preferredLanguage?: unknown;
      deviceTimeIso?: unknown;
      deviceTimeZone?: unknown;
      specialistMode?: unknown;
      userLocation?: unknown;
    };

    const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
    const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
    const attachedDocName =
      typeof body.attachedDocName === 'string' ? body.attachedDocName.trim().slice(0, 120) : '';
    const attachedDocText =
      typeof body.attachedDocText === 'string' ? body.attachedDocText.trim().slice(0, 12_000) : '';

    if (!userMessage && !imageDataUrl && !attachedDocText) {
      res.status(400).json({
        error: 'empty_message',
        message: 'اكتب رسالتك أو اتكلم أو أرفق صورة/ملف الأول.',
      });
      return;
    }

    if (userMessage.length > 4000) {
      res.status(400).json({
        error: 'message_too_long',
        message: 'الرسالة طويلة جداً، جرّب تختصرها شوية.',
      });
      return;
    }

    const rawHistory = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{text?: string; inlineData?: {mimeType: string; data: string}}>;
    }> = [];

    for (const entry of rawHistory) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as {role?: unknown; text?: unknown};
      if (typeof item.text !== 'string' || !item.text.trim()) continue;
      contents.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{text: item.text.slice(0, 1800)}],
      });
    }

    const currentParts: Array<{text?: string; inlineData?: {mimeType: string; data: string}}> = [];

    if (imageDataUrl) {
      const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
        imageDataUrl,
      );
      if (!match) {
        res.status(400).json({
          error: 'invalid_image',
          message: 'صيغة الصورة غير مدعومة. استخدم PNG أو JPG أو WebP.',
        });
        return;
      }
      currentParts.push({
        inlineData: {
          mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
          data: match[2],
        },
      });
    }

    const combinedText = [
      attachedDocText
        ? `[محتوى الملف المرفق: ${attachedDocName || 'مستند'}]\n${attachedDocText}\n[نهاية الملف]`
        : '',
      userMessage ||
        (imageDataUrl
          ? 'اقرأ وحلّل الصورة دي بالتفصيل المفيد ولخّص اللي فيها.'
          : 'لخّصلي الملف المرفق ده بوضوح.'),
    ]
      .filter(Boolean)
      .join('\n\n');

    currentParts.push({text: combinedText});
    contents.push({role: 'user', parts: currentParts});

    const safeMemories = Array.isArray(body.memories)
      ? body.memories
          .filter((m): m is {category: string; fact: string} => {
            if (!m || typeof m !== 'object') return false;
            const obj = m as Record<string, unknown>;
            return typeof obj.fact === 'string' && obj.fact.trim().length > 0;
          })
          .slice(0, 60)
          .map((m) => ({
            category: typeof m.category === 'string' ? m.category.slice(0, 30) : 'شخصي',
            fact: m.fact.slice(0, 240),
          }))
      : [];

    const safeTasks = Array.isArray(body.tasks)
      ? body.tasks
          .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
          .slice(0, 30)
          .map((t) => ({
            id: typeof t.id === 'string' ? t.id.slice(0, 64) : '',
            title: typeof t.title === 'string' ? t.title.slice(0, 160) : '',
            dueDateIso: typeof t.dueDateIso === 'string' ? t.dueDateIso.slice(0, 20) : null,
            completed: Boolean(t.completed),
          }))
          .filter((t) => t.title.length > 0)
      : [];

    const rawMode = typeof body.specialistMode === 'string' ? body.specialistMode : 'general';
    const explicitMode: SpecialistMode =
      rawMode === 'psychology' || rawMode === 'marketing' || rawMode === 'egypt_shops'
        ? rawMode
        : 'general';

    const rawLoc =
      body.userLocation && typeof body.userLocation === 'object'
        ? (body.userLocation as {lat?: unknown; lng?: unknown})
        : null;
    const validLat =
      typeof rawLoc?.lat === 'number' && Number.isFinite(rawLoc.lat) ? rawLoc.lat : undefined;
    const validLng =
      typeof rawLoc?.lng === 'number' && Number.isFinite(rawLoc.lng) ? rawLoc.lng : undefined;

    const intent = detectSpecialistIntent(userMessage, explicitMode);
    const relevantStudies =
      intent.resolvedMode === 'psychology' || intent.resolvedMode === 'marketing'
        ? getRelevantStudiesContext(userMessage, intent.resolvedMode)
        : [];

    const systemInstruction = buildOmarAiSystemInstruction({
      userName:
        typeof body.userName === 'string' && body.userName.trim()
          ? body.userName.trim().slice(0, 40)
          : 'عمر',
      personalBio: typeof body.personalBio === 'string' ? body.personalBio.slice(0, 1200) : '',
      preferredLanguage: body.preferredLanguage === 'en-US' ? 'en-US' : 'ar-EG',
      deviceTimeIso:
        typeof body.deviceTimeIso === 'string' && body.deviceTimeIso.trim()
          ? body.deviceTimeIso.trim().slice(0, 40)
          : new Date().toISOString(),
      deviceTimeZone:
        typeof body.deviceTimeZone === 'string' && body.deviceTimeZone.trim()
          ? body.deviceTimeZone.trim().slice(0, 60)
          : 'Africa/Cairo',
      specialistMode: intent.resolvedMode,
      relevantStudies: relevantStudies.map((s) => ({
        titleAr: s.titleAr,
        titleEn: s.titleEn,
        researcher: s.researcher,
        year: s.year,
        summaryAr: s.summaryAr,
        practicalTakeawayAr: s.practicalTakeawayAr,
      })),
      memories: safeMemories,
      tasks: safeTasks,
    });

    const isMostlyEnglish =
      body.preferredLanguage === 'en-US' ||
      (userMessage.length > 0 &&
        !/[\u0600-\u06FF]/.test(userMessage) &&
        /[a-zA-Z]{3,}/.test(userMessage));

    try {
      // PATH A: Real Egypt Shops Lookup (Places API (New) + Gemini Google Maps Grounding fallback)
      if (intent.useEgyptShopsLookup && !imageDataUrl && !attachedDocText) {
        const mapsApiKey = getMapsApiKey();
        let places: EgyptShopResult[] = [];
        let sources: GroundingSourceItem[] = [];

        if (mapsApiKey) {
          try {
            places = await searchEgyptShopsViaPlacesApi({
              query: userMessage,
              lat: validLat,
              lng: validLng,
              apiKey: mapsApiKey,
            });
            sources = places.map((p) => ({
              title: p.name,
              uri: p.googleMapsUri,
              kind: 'maps' as const,
            }));
          } catch (placesErr) {
            if (placesErr instanceof QuotaExceededError) {
              console.warn('Places API quota hit, falling back to Gemini Google Maps Grounding');
            }
          }
        }

        if (places.length > 0) {
          let replyText = '';
          try {
            const summaryResponse = await generateWithTransientRetry(() =>
              ai.models.generateContent({
                model: 'gemini-4-hydrogen',
                contents: [
                  ...contents.slice(0, -1),
                  {
                    role: 'user',
                    parts: [
                      {
                        text: [
                          `سؤال المستخدم: ${userMessage}`,
                          '',
                          'دي المحلات والأماكن الحقيقية اللي لقيناها دلوقتي من خرائط جوجل في مصر (ممنوع تضيف أي محل مش موجود في القائمة دي):',
                          JSON.stringify(places),
                          '',
                          'رد على المستخدم بالعامية المصرية الودودة ورشّحله أبرز المحلات دي مع عنوانها وتقييمها وقوله يقدر يفتح موقع أي محل على خرائط جوجل من البطاقات اللي تحت الرد.',
                        ].join('\n'),
                      },
                    ],
                  },
                ],
                config: {
                  systemInstruction,
                },
              }),
            );
            replyText = (summaryResponse.text ?? '').trim();
          } catch (summaryErr) {
            console.warn(
              'Places summary fallback triggered:',
              summaryErr instanceof Error ? summaryErr.message : summaryErr,
            );
            const topNames = places
              .slice(0, 3)
              .map((p) => (p.rating ? `${p.name} (تقييم ${p.rating.toFixed(1)})` : p.name))
              .join('، ');
            replyText = `دورتلك على خرائط جوجل في مصر ولقيتلك ${places.length} أماكن حقيقية وموثقة، من أبرزها: ${topNames}. تقدر تشوف العنوان والتليفون وتفتح الموقع مباشرة على الخريطة من البطاقات اللي تحت.`;
          }

          res.json({
            reply:
              replyText ||
              'لقيتلك مجموعة محلات حقيقية في مصر على خرائط جوجل، تقدر تشوف العناوين والتقييمات وتفتح الموقع مباشرة من البطاقات تحت.',
            language: isMostlyEnglish ? 'en-US' : 'ar-EG',
            resolvedMode: 'egypt_shops',
            suggestedFollowUps: [
              'اقترحلي محلات تانية في منطقة قريبة',
              'إزاي أقيّم جودة المحل قبل ما أشتري منه؟',
              'اعمل لي تذكير أزور المحل ده بكرة',
            ],
            toolCalls: [],
            sources,
            places,
          });
          return;
        }

        // Fallback to Gemini Google Maps Grounding (no responseMimeType / responseSchema)
        const mapsGroundingResponse = await generateWithTransientRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents,
            config: {
              systemInstruction: `${systemInstruction}\nاستخدم أداة خرائط جوجل للبحث عن أماكن ومحلات حقيقية في مصر فقط واذكر العنوان والمنطقة بدقة بالعامية المصرية.`,
              tools: [{googleMaps: {}}],
              toolConfig: {
                retrievalConfig: {
                  latLng: {
                    latitude: validLat ?? 30.0444,
                    longitude: validLng ?? 31.2357,
                  },
                },
              },
            },
          }),
        );

        const groundedReply = (mapsGroundingResponse.text ?? '').trim();
        sources = extractGroundingSources(mapsGroundingResponse);
        res.json({
          reply:
            groundedReply ||
            'جرّب تحدد اسم المنطقة في مصر (مثلاً المعادي أو مدينة نصر أو الإسكندرية) عشان أجيبلك أقرب المحلات المضمونة.',
          language: isMostlyEnglish ? 'en-US' : 'ar-EG',
          resolvedMode: 'egypt_shops',
          suggestedFollowUps: [
            'محلات في المعادي أو التجمع الخامس',
            'محلات في مدينة نصر أو وسط البلد',
            'محلات في الشيخ زايد أو 6 أكتوبر',
          ],
          toolCalls: [],
          sources,
          places: [],
        });
        return;
      }

      // PATH B: Live Google Search Grounding for Psychology Studies, Marketing & Web Research
      if (intent.useGoogleSearch && !imageDataUrl && !attachedDocText) {
        let groundedReply = '';
        let sources: GroundingSourceItem[] = [];
        try {
          const searchResponse = await generateWithTransientRetry(() =>
            ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents,
              config: {
                systemInstruction: [
                  systemInstruction,
                  '',
                  'استخدم بحث جوجل الحي (Google Search) عشان تجيب أحدث الدراسات النفسية والمعلومات الموثقة من الإنترنت في علم النفس والتسويق.',
                  'جاوب بالعامية المصرية الطبيعية والواضحة في نقاط منظمة، واذكر أسماء الدراسات أو الباحثين اللي اعتمدت عليهم، من غير ما تحط روابط خام جوه النص لأن المصادر هتظهر تلقائياً تحت الرد.',
                ].join('\n'),
                tools: [{googleSearch: {}}],
              },
            }),
          );
          groundedReply = (searchResponse.text ?? '').trim();
          sources = extractGroundingSources(searchResponse);
        } catch (searchErr) {
          const searchMsg = searchErr instanceof Error ? searchErr.message : String(searchErr);
          console.warn('Google Search grounding fallback triggered:', searchMsg);
          // Graceful fallback to gemini-3.1-flash-lite with Google Search, then without tool
          try {
            const liteSearch = await generateWithTransientRetry(() =>
              ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents,
                config: {
                  systemInstruction: [
                    systemInstruction,
                    '',
                    'استخدم بحث جوجل الحي (Google Search) عشان تجيب أحدث الدراسات النفسية والمعلومات الموثقة من الإنترنت في علم النفس والتسويق بالعامية المصرية.',
                  ].join('\n'),
                  tools: [{googleSearch: {}}],
                },
              }),
            );
            groundedReply = (liteSearch.text ?? '').trim();
            sources = extractGroundingSources(liteSearch);
          } catch {
            const kbResponse = await generateWithTransientRetry(() =>
              ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents,
                config: {
                  systemInstruction: [
                    systemInstruction,
                    '',
                    'جاوب بالعامية المصرية الطبيعية والواضحة في نقاط منظمة اعتماداً على الدراسات العلمية الموثقة في علم النفس والتسويق، واذكر أسماء الدراسات والباحثين بدقة.',
                  ].join('\n'),
                },
              }),
            );
            groundedReply = (kbResponse.text ?? '').trim();
          }
        }
        const followUps =
          intent.resolvedMode === 'psychology'
            ? [
                'إديني تطبيق عملي للدراسة دي في يومي',
                'إيه دراسات نفسية تانية مرتبطة بالموضوع ده؟',
                'فكّرني كل يوم الصبح أطبق الخطوة دي',
              ]
            : intent.resolvedMode === 'marketing'
              ? [
                  'اعمل لي مثال إعلان عملي للسوق المصري بالكلام ده',
                  'إزاي أربط ده بسيكولوجية التسعير والإقناع؟',
                  'ابحثلي عن أحدث أرقام وترندات السوق المصري',
                ]
              : [
                  'لخّصلي الكلام ده في ٣ خطوات عملية',
                  'هاتلي تفاصيل ومصادر أكتر من النت',
                  'احفظلي الخلاصة دي في ذاكرتك',
                ];

        res.json({
          reply: groundedReply || 'مقدرتش أجمع نتيجة واضحة المرة دي، جرّب تصيغ السؤال بشكل مختلف.',
          language: isMostlyEnglish ? 'en-US' : 'ar-EG',
          resolvedMode: intent.resolvedMode,
          suggestedFollowUps: followUps,
          toolCalls: [],
          sources,
          places: [],
        });
        return;
      }

      // PATH C: General Personal Assistant with Structured Phone Tool-Calling
      let response;
      try {
        response = await generateWithTransientRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: OMAR_AI_RESPONSE_SCHEMA,
            },
          }),
        );
      } catch (primaryErr) {
        const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        if (primaryMsg.includes('403') || primaryMsg.includes('API_KEY_INVALID')) throw primaryErr;
        console.warn('Omar AI chat falling back to gemini-3.1-flash-lite:', primaryMsg);
        response = await generateWithTransientRetry(() =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: OMAR_AI_RESPONSE_SCHEMA,
            },
          }),
        );
      }

      const rawText = (response?.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'empty_response',
          message: "Omar's personal assistant مردّش بنص واضح المرة دي، جرّب تاني.",
        });
        return;
      }

      let parsed: {
        reply?: string;
        language?: string;
        suggestedFollowUps?: string[];
        toolCalls?: Array<Record<string, unknown>>;
      };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = {reply: rawText, language: 'ar-EG', suggestedFollowUps: [], toolCalls: []};
      }

      const sanitizedToolCalls = Array.isArray(parsed.toolCalls)
        ? parsed.toolCalls.slice(0, 8).map((rawTool) => {
            const tool: Record<string, unknown> = {...rawTool};
            const type = typeof tool.type === 'string' ? tool.type : '';
            if (type !== 'open_website') {
              delete tool.url;
            }
            if (type !== 'dial_number' && type !== 'send_message') {
              delete tool.phoneNumber;
            }
            if (type === 'compose_email') {
              tool.requiresConfirmation = true;
              if (typeof tool.recipientEmail === 'string') {
                const email = tool.recipientEmail.trim().slice(0, 160);
                tool.recipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
              }
              if (typeof tool.subject === 'string') tool.subject = tool.subject.trim().slice(0, 200);
              if (typeof tool.body === 'string') tool.body = tool.body.trim().slice(0, 4000);
            }
            if (type === 'create_note') {
              tool.requiresConfirmation = true;
              if (typeof tool.title === 'string') tool.title = tool.title.trim().slice(0, 140);
              if (typeof tool.content === 'string') tool.content = tool.content.trim().slice(0, 4000);
              const validNoteCats = new Set(['شخصي', 'شغل', 'أفكار', 'حاجات مهمة']);
              if (typeof tool.noteCategory !== 'string' || !validNoteCats.has(tool.noteCategory)) {
                tool.noteCategory = 'شخصي';
              }
            }
            if (type === 'send_message') {
              tool.requiresConfirmation = true;
              const rawCh = typeof tool.channel === 'string' ? tool.channel.toLowerCase().trim() : '';
              tool.channel = rawCh === 'sms' ? 'sms' : 'whatsapp';
              if (typeof tool.recipientName === 'string') {
                tool.recipientName = tool.recipientName.trim().slice(0, 100);
              }
              if (typeof tool.phoneNumber === 'string') {
                tool.phoneNumber = tool.phoneNumber.replace(/[^0-9+]/g, '').slice(0, 20);
              }
              if (typeof tool.messageText === 'string') {
                tool.messageText = tool.messageText.trim().slice(0, 2000);
              }
            }
            if (type === 'create_reminder') {
              tool.requiresConfirmation = true;
              const inferred = inferReminderFieldsFromText(
                `${userMessage} ${typeof tool.confirmationPrompt === 'string' ? tool.confirmationPrompt : ''}`,
              );

              if (typeof tool.reminderTime === 'string') {
                const m = /^(\d{1,2}):(\d{2})$/.exec(tool.reminderTime.trim());
                if (m) {
                  const hh = Math.max(0, Math.min(23, Number(m[1])));
                  const mm = Math.max(0, Math.min(59, Number(m[2])));
                  tool.reminderTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                } else {
                  delete tool.reminderTime;
                }
              }
              if (!tool.reminderTime && inferred.reminderTime) {
                tool.reminderTime = inferred.reminderTime;
              }

              const rawRec =
                typeof tool.recurrence === 'string' ? tool.recurrence.toLowerCase() : '';
              if (rawRec === 'daily' || rawRec === 'weekly' || rawRec === 'monthly') {
                tool.recurrence = rawRec;
              } else if (inferred.recurrence) {
                tool.recurrence = inferred.recurrence;
              } else {
                tool.recurrence = 'once';
              }

              if (Array.isArray(tool.daysOfWeek)) {
                const cleanDays = Array.from(
                  new Set(
                    tool.daysOfWeek.filter(
                      (d): d is number =>
                        typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7,
                    ),
                  ),
                );
                if (cleanDays.length > 0) {
                  tool.daysOfWeek = cleanDays;
                } else {
                  delete tool.daysOfWeek;
                }
              }
              if (
                tool.recurrence === 'weekly' &&
                !tool.daysOfWeek &&
                inferred.daysOfWeek &&
                inferred.daysOfWeek.length > 0
              ) {
                tool.daysOfWeek = inferred.daysOfWeek;
              }
            }
            return tool;
          })
        : [];

      res.json({
        reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : rawText,
        language: parsed.language === 'en-US' ? 'en-US' : 'ar-EG',
        resolvedMode: intent.resolvedMode,
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
          ? parsed.suggestedFollowUps
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .slice(0, 3)
          : [],
        toolCalls: sanitizedToolCalls,
        sources: [],
        places: [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Omar AI API error:', msg);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'quota_exceeded',
          message: "وصلت للحد المؤقت لاستخدام Omar's personal assistant. استنى شوية وجرّب تاني.",
        });
        return;
      }
      if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
        res.status(503).json({
          error: 'service_busy',
          message: 'خدمة الذكاء الاصطناعي عليها ضغط مؤقت دلوقتي، جرّب تبعت رسالتك كمان ثواني.',
        });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        res.status(403).json({
          error: 'api_key_invalid',
          message: 'فيه مشكلة في صلاحية مفتاح الذكاء الاصطناعي على الخادم.',
        });
        return;
      }
      res.status(502).json({
        error: 'omar_ai_failed',
        message: "حصلت مشكلة مؤقتة أثناء الاتصال بـ Omar's personal assistant. جرّب تاني.",
      });
    }
  });

  // Direct Egypt Shop Locator powered by Google Maps Platform Places API (New) + Maps Grounding fallback
  app.post('/api/omar-ai/egypt-shops', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = (req.body ?? {}) as {
      query?: unknown;
      area?: unknown;
      openNow?: unknown;
      lat?: unknown;
      lng?: unknown;
    };

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const area = typeof body.area === 'string' ? body.area.trim() : '';
    const openNow = Boolean(body.openNow);
    const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : undefined;
    const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : undefined;

    if (!query || query.length > 160) {
      res.status(400).json({
        error: 'invalid_query',
        message: 'اكتب اسم المحل أو نوع المنتجات اللي بتدور عليها في مصر.',
      });
      return;
    }

    const mapsApiKey = getMapsApiKey();
    try {
      if (mapsApiKey) {
        const places = await searchEgyptShopsViaPlacesApi({
          query,
          area,
          openNow,
          lat,
          lng,
          apiKey: mapsApiKey,
        });
        if (places.length > 0) {
          res.json({
            places,
            sources: places.map((p) => ({
              title: p.name,
              uri: p.googleMapsUri,
              kind: 'maps',
            })),
            summary: '',
            provider: 'places_api_new',
          });
          return;
        }
      }

      // Fallback to Gemini Google Maps Grounding when Places API key isn't active or returned empty
      const ai = getGeminiClient();
      if (!ai) {
        res.json({places: [], sources: [], summary: '', provider: 'none'});
        return;
      }
      const fullPrompt = [query, area ? `في ${area}` : '', 'في مصر'].filter(Boolean).join(' ');
      const grounded = await generateWithTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `رشّحلي أحسن وأشهر الأماكن الحقيقية لـ: ${fullPrompt}. اذكر الاسم والمنطقة والعنوان بالعامية المصرية.`,
          config: {
            tools: [{googleMaps: {}}],
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude: lat ?? 30.0444,
                  longitude: lng ?? 31.2357,
                },
              },
            },
          },
        }),
      );
      res.json({
        places: [],
        sources: extractGroundingSources(grounded),
        summary: (grounded.text ?? '').trim(),
        provider: 'google_maps_grounding',
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        res.status(429).json({
          error: 'quota_exceeded',
          status: 'RESOURCE_EXHAUSTED',
          message: 'تم الوصول للحد اليومي لخدمة خرائط جوجل.',
        });
        return;
      }
      console.error('Egypt shops lookup error:', err instanceof Error ? err.message : err);
      res.status(502).json({
        error: 'shops_lookup_failed',
        message: 'مقدرناش نجيب أماكن المحلات دلوقتي، جرّب تاني كمان شوية.',
      });
    }
  });

  // Natural Egyptian Arabic Neural Text-to-Speech via Gemini 3.8 Flash Lite TTS
  app.post('/api/omar-ai/tts', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'gemini_key_missing',
        message: 'خدمة الصوت الذكي غير مفعّلة حالياً على الخادم.',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      text?: unknown;
      language?: unknown;
      voiceName?: unknown;
    };
    const rawText = typeof body.text === 'string' ? body.text : '';
    const cleanText = sanitizeTextForSpeech(rawText);
    if (!cleanText) {
      res.status(400).json({error: 'empty_text', message: 'مفيش نص للقراءة.'});
      return;
    }

    const allowedVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
    const voiceName =
      typeof body.voiceName === 'string' && allowedVoices.has(body.voiceName)
        ? body.voiceName
        : 'Charon';
    const isArabic = /[\u0600-\u06FF]/.test(cleanText) || body.language !== 'en-US';
    const style = isArabic
      ? 'Warm, friendly, natural Egyptian Arabic personal assistant speaking smoothly in authentic Cairo colloquial dialect (العامية المصرية)'
      : 'Warm, clear, friendly personal assistant speaking naturally';

    try {
      let response;
      try {
        response = await generateWithTransientRetry(() =>
          ai.models.generateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: cleanText,
                    speechMetadata: {style},
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {voiceName},
                },
              },
            },
          }),
        );
      } catch (metaErr) {
        const metaMsg = metaErr instanceof Error ? metaErr.message : String(metaErr);
        if (metaMsg.includes('429') || metaMsg.includes('RESOURCE_EXHAUSTED')) {
          throw metaErr;
        }
        // Retry with flagship TTS model / clean text part in case primary TTS model is unavailable
        response = await generateWithTransientRetry(() =>
          ai.models.generateContent({
            model: 'gemini-3.8-flash-tts',
            contents: [
              {
                role: 'user',
                parts: [{text: cleanText}],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {voiceName},
                },
              },
            },
          }),
        );
      }

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({
          error: 'tts_empty',
          message: 'مقدرناش نولّد الصوت المصري المرة دي.',
        });
        return;
      }

      // Unary Gemini 3.8 TTS returns a complete WAV file (audio/wav, 24kHz mono 16-bit)
      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Omar AI TTS error:', msg);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'quota_exceeded',
          message: 'وصلنا للحد المؤقت للصوت الذكي، تم التحويل تلقائياً لصوت الجهاز.',
        });
        return;
      }
      res.status(502).json({
        error: 'tts_failed',
        message: 'حصلت مشكلة مؤقتة في توليد الصوت المصري.',
      });
    }
  });

  // Egyptian Arabic & English Audio Transcription via Gemini 3.5 Transcribe
  app.post('/api/omar-ai/transcribe', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'gemini_key_missing',
        message: 'خدمة تفريغ الصوت غير مفعّلة حالياً على الخادم.',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      audioBase64?: unknown;
      mimeType?: unknown;
    };
    const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64.trim() : '';
    const rawMime = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : 'audio/webm';
    const baseMime = rawMime.split(';')[0];
    const allowedAudioMimes = new Set([
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
    ]);

    if (!audioBase64 || audioBase64.length > 5_000_000 || !allowedAudioMimes.has(baseMime)) {
      res.status(400).json({
        error: 'invalid_audio',
        message: 'صيغة التسجيل الصوتي غير مدعومة أو الملف كبير جداً.',
      });
      return;
    }

    try {
      const response = await generateWithTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: baseMime,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe this Egyptian Arabic (العامية المصرية) or English voice message accurately into clean text only. Do not add notes or translation.',
              },
            ],
          },
        }),
      );

      const transcript = (response.text ?? '').trim();
      res.json({transcript});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Omar AI Transcribe error:', msg);
      res.status(502).json({
        error: 'transcribe_failed',
        message: 'مقدرتش أفرّغ التسجيل الصوتي دلوقتي، جرّب تاني.',
      });
    }
  });

  // Ad & Copy Psychology Auditor (Screenshot + Copy -> Behavioral Psychology Audit + 3 Egyptian Ad Rewrites)
  const AD_PSYCHOLOGY_AUDIT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      overallScore: {type: Type.NUMBER},
      verdictTitleAr: {type: Type.STRING},
      summaryAr: {type: Type.STRING},
      scores: {
        type: Type.OBJECT,
        properties: {
          hook: {type: Type.NUMBER},
          persuasion: {type: Type.NUMBER},
          pricing: {type: Type.NUMBER},
          clarityCta: {type: Type.NUMBER},
        },
        required: ['hook', 'persuasion', 'pricing', 'clarityCta'],
      },
      psychologyTriggers: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            principleAr: {type: Type.STRING},
            studyRef: {type: Type.STRING},
            status: {
              type: Type.STRING,
              description: 'One of: strong, weak, missing',
            },
            noteAr: {type: Type.STRING},
          },
          required: ['principleAr', 'studyRef', 'status', 'noteAr'],
        },
      },
      weaknessesAr: {
        type: Type.ARRAY,
        items: {type: Type.STRING},
      },
      rewrittenVariations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            angleAr: {type: Type.STRING},
            headlineAr: {type: Type.STRING},
            bodyAr: {type: Type.STRING},
            ctaAr: {type: Type.STRING},
          },
          required: ['angleAr', 'headlineAr', 'bodyAr', 'ctaAr'],
        },
      },
    },
    required: [
      'overallScore',
      'verdictTitleAr',
      'summaryAr',
      'scores',
      'psychologyTriggers',
      'weaknessesAr',
      'rewrittenVariations',
    ],
  };

  app.post('/api/omar-ai/audit-ad', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'gemini_key_missing',
        message: 'خدمة محلّل الإعلانات غير مفعّلة حالياً على الخادم.',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      adCopy?: unknown;
      imageDataUrl?: unknown;
      targetAudience?: unknown;
      goal?: unknown;
    };

    const adCopy = typeof body.adCopy === 'string' ? body.adCopy.trim().slice(0, 4000) : '';
    const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
    const targetAudience =
      typeof body.targetAudience === 'string' && body.targetAudience.trim()
        ? body.targetAudience.trim().slice(0, 120)
        : 'الجمهور المصري';
    const goal =
      typeof body.goal === 'string' && body.goal.trim()
        ? body.goal.trim().slice(0, 120)
        : 'مبيعات أونلاين مباشرة';

    if (!adCopy && !imageDataUrl) {
      res.status(400).json({
        error: 'empty_input',
        message: 'ارفع سكرين شوت للإعلان أو اكتب نص الإعلان الأول عشان أحللهولك.',
      });
      return;
    }

    const parts: Array<{text?: string; inlineData?: {mimeType: string; data: string}}> = [];
    if (imageDataUrl) {
      const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
        imageDataUrl,
      );
      if (!match) {
        res.status(400).json({
          error: 'invalid_image',
          message: 'صيغة الصورة غير مدعومة. استخدم PNG أو JPG أو WebP.',
        });
        return;
      }
      parts.push({
        inlineData: {
          mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
          data: match[2],
        },
      });
    }

    parts.push({
      text: [
        'أنت خبير عالمي في علم نفس المستهلك والتسويق الإقناعي (Consumer Psychology & Direct-Response Marketing) ومتخصص في السوق المصري.',
        `الجمهور المستهدف: ${targetAudience}`,
        `هدف الإعلان: ${goal}`,
        adCopy ? `نص الإعلان / العرض:\n"""\n${adCopy}\n"""` : 'تم إرفاق صورة/سكرين شوت للإعلان — اقرأ النص والتصميم والسعر منها بدقة.',
        '',
        'المطلوب ترجع JSON منظم بالعامية المصرية المهذبة والواضحة يحتوي على:',
        '1) overallScore من 1 إلى 10 و verdictTitleAr و summaryAr سريع وعملي.',
        '2) scores من 1 إلى 10 لكل من: hook (قوة أول ٣ ثواني/العنوان), persuasion (الإقناع النفسي), pricing (سيكولوجية السعر والعرض), clarityCta (الوضوح والدعوة لاتخاذ إجراء).',
        '3) psychologyTriggers (من 4 إلى 6 مبادئ نفسية علمية زي: Loss Aversion لكانيمان وتفيرسكي، Social Proof أو Scarcity لتشالديني، Anchoring/Decoy Effect لدان أريلي، B=MAP لـ BJ Fogg، Zeigarnik Effect، Cognitive Fluency) مع حالة كل مبدأ (strong / weak / missing) وملاحظة تطبيقية بالمصري.',
        '4) weaknessesAr (3 إلى 5 نقاط ضعف حقيقية بتقلل التحويل عند العميل المصري).',
        '5) rewrittenVariations (بالظبط 3 نسخ إعلانية أقوى مكتوبة بالعامية المصرية الطبيعية المناسبة للسوق المصري، كل نسخة بزاوية مختلفة: زاوية ألم/خسارة Loss Aversion، زاوية إثبات اجتماعي وقصة Social Proof، زاوية عرض ذكي ووضوح B=MAP — وكل نسخة فيها angleAr و headlineAr و bodyAr و ctaAr).',
      ].join('\n'),
    });

    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [{role: 'user', parts}],
          config: {
            responseMimeType: 'application/json',
            responseSchema: AD_PSYCHOLOGY_AUDIT_SCHEMA,
          },
        });
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        if (msg.includes('403') || msg.includes('API_KEY_INVALID')) throw primaryErr;
        console.warn('Omar AI Ad Auditor falling back to gemini-3.1-flash-lite:', msg);
        response = await generateWithTransientRetry(() =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: [{role: 'user', parts}],
            config: {
              responseMimeType: 'application/json',
              responseSchema: AD_PSYCHOLOGY_AUDIT_SCHEMA,
            },
          }),
        );
      }

      const rawText = (response?.text ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      if (!rawText) {
        res.status(502).json({
          error: 'empty_audit',
          message: 'مقدرناش نطلع التحليل المرة دي، جرّب تاني.',
        });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json(normalizeAdAuditResult(parsed));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Omar AI Ad Auditor error:', msg);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'quota_exceeded',
          message: 'وصلت للحد المؤقت لتحليل الإعلانات. استنى ثواني وجرّب تاني.',
        });
        return;
      }
      if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
        res.status(503).json({
          error: 'service_busy',
          message: 'خدمة تحليل الإعلانات عليها ضغط مؤقت دلوقتي، جرّب تاني بعد ثواني.',
        });
        return;
      }
      res.status(502).json({
        error: 'audit_failed',
        message: 'حصلت مشكلة مؤقتة في تحليل الإعلان، جرّب تاني.',
      });
    }
  });

  // Read-only manifest of the generated Native Android Studio project files
  app.get('/api/omar-ai/project-manifest', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const androidRoot = path.resolve(__dirname, 'android-omar-ai');
    const zipFile = path.resolve(__dirname, 'public', 'downloads', 'OmarAI-AndroidStudio-Project.zip');
    const files = listAndroidProjectFiles(androidRoot);
    const zipStat = fs.existsSync(zipFile) ? fs.statSync(zipFile) : null;
    res.json({
      projectName: 'OmarAI',
      packageName: 'com.omarai.assistant',
      minSdk: 26,
      targetSdk: 35,
      apkBuiltInSandbox: false,
      zipAvailable: Boolean(zipStat),
      zipBytes: zipStat?.size ?? 0,
      fileCount: files.length,
      files,
    });
  });

  // Direct download for the complete Native Android Studio project ZIP
  app.get('/api/omar-ai/project-zip', (_req: Request, res: Response) => {
    const downloadsDir = path.resolve(__dirname, 'public', 'downloads');
    const zipPath = path.resolve(downloadsDir, 'OmarAI-AndroidStudio-Project.zip');
    if (!zipPath.startsWith(downloadsDir + path.sep) || !fs.existsSync(zipPath)) {
      res.status(404).json({
        error: 'zip_not_found',
        message: 'ملف مشروع Android Studio غير متوفر حالياً.',
      });
      return;
    }
    res.download(zipPath, 'OmarAI-AndroidStudio-Project.zip');
  });

  // Direct download for the standalone high-res Omar app logo PNG (1024x1024)
  app.get('/api/omar-ai/logo', (_req: Request, res: Response) => {
    const downloadsDir = path.resolve(__dirname, 'public', 'downloads');
    const logoPath = path.resolve(downloadsDir, 'omar-logo.png');
    if (!logoPath.startsWith(downloadsDir + path.sep) || !fs.existsSync(logoPath)) {
      res.status(404).json({
        error: 'logo_not_found',
        message: 'ملف الشعار غير متوفر حالياً.',
      });
      return;
    }
    res.download(logoPath, 'omar-assistant-logo.png');
  });

  app.get('/api/weather/search', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'api_key_missing',
        message: 'مفتاح Google Maps Platform مش متوفر حالياً على الخادم.',
      });
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tzParam = typeof req.query.tz === 'string' ? req.query.tz.trim() : '';
    const regionParam = typeof req.query.region === 'string' ? req.query.region.trim() : '';
    const inferredRegion = regionParam || inferLocationHintFromTimezone(tzParam)?.region || '';

    if (!q || q.length > 100) {
      res.status(400).json({error: 'invalid_query', results: []});
      return;
    }

    try {
      const results = await geocodeCityCandidates(q, apiKey, inferredRegion);
      res.json({results});
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        res.status(429).json({
          error: 'quota_exceeded',
          status: 'RESOURCE_EXHAUSTED',
          message: 'تم الوصول للحد اليومي لاستخدام خدمة المواقع.',
        });
        return;
      }
      res.status(502).json({error: 'search_failed', results: []});
    }
  });

  app.get('/api/weather', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'api_key_missing',
        message: 'مفتاح Google Maps Platform مش متوفر حالياً على الخادم.',
      });
      return;
    }

    try {
      const cityParam = typeof req.query.city === 'string' ? req.query.city.trim() : '';
      const latParam = typeof req.query.lat === 'string' ? Number(req.query.lat) : NaN;
      const lngParam = typeof req.query.lng === 'string' ? Number(req.query.lng) : NaN;
      const modeParam = typeof req.query.mode === 'string' ? req.query.mode : '';
      const tzParam = typeof req.query.tz === 'string' ? req.query.tz.trim() : '';
      const regionParam = typeof req.query.region === 'string' ? req.query.region.trim() : '';
      const sourceParam = typeof req.query.source === 'string' ? req.query.source.trim() : '';
      const labelParam = typeof req.query.label === 'string' ? req.query.label.trim() : '';

      const tzHint = inferLocationHintFromTimezone(tzParam);
      const effectiveRegion = normalizeRegionCode(regionParam || tzHint?.region || '');

      let lat: number;
      let lng: number;
      let locationLabel = '';
      let locationSource: 'gps' | 'timezone' | 'approx' | 'city' = 'approx';

      if (cityParam) {
        if (cityParam.length > 100) {
          res.status(400).json({error: 'invalid_city', message: 'اسم المدينة طويل جداً.'});
          return;
        }
        const geo = await forwardGeocodeCity(cityParam, apiKey, effectiveRegion);
        if (!geo) {
          res.status(404).json({
            error: 'city_not_found',
            message: 'مقدرناش نلاقي المدينة دي، جرّب تكتب اسم مدينة تاني.',
          });
          return;
        }
        lat = geo.lat;
        lng = geo.lng;
        locationLabel = geo.label;
        locationSource = 'city';
      } else if (
        Number.isFinite(latParam) &&
        Number.isFinite(lngParam) &&
        latParam >= -90 &&
        latParam <= 90 &&
        lngParam >= -180 &&
        lngParam <= 180
      ) {
        lat = latParam;
        lng = lngParam;
        locationLabel = labelParam.slice(0, 120);
        locationSource = sourceParam === 'city' ? 'city' : 'gps';
      } else if (modeParam === 'approx' || (!cityParam && Number.isNaN(latParam))) {
        // Avoid geolocating the Cloud Run server's IP (e.g. London) when browser timezone is available.
        let resolvedFromTz = false;
        if (tzHint) {
          const geoFromTz = await forwardGeocodeCity(tzHint.city, apiKey, tzHint.region ?? '');
          if (geoFromTz) {
            lat = geoFromTz.lat;
            lng = geoFromTz.lng;
            locationLabel = geoFromTz.label;
            locationSource = 'timezone';
            resolvedFromTz = true;
          }
        }
        if (!resolvedFromTz) {
          const approx = await resolveApproxCoordsViaGeolocationApi(apiKey);
          lat = approx.lat;
          lng = approx.lng;
          locationSource = 'approx';
        }
      } else {
        res.status(400).json({error: 'invalid_coords', message: 'إحداثيات الموقع غير صالحة.'});
        return;
      }

      const [weatherRaw, todayForecast, resolvedLabel] = await Promise.all([
        fetchGoogleCurrentWeather(lat!, lng!, apiKey),
        fetchGoogleTodayForecast(lat!, lng!, apiKey),
        locationLabel ? Promise.resolve(locationLabel) : reverseGeocodeLabel(lat!, lng!, apiKey),
      ]);

      const weather = weatherRaw as {
        currentTime?: string;
        timeZone?: {id?: string};
        isDaytime?: boolean;
        weatherCondition?: {
          type?: string;
          iconBaseUri?: string;
          description?: {text?: string};
        };
        temperature?: {degrees?: number; unit?: string};
        feelsLikeTemperature?: {degrees?: number; unit?: string};
        relativeHumidity?: number;
        uvIndex?: number;
        cloudCover?: number;
        wind?: {
          speed?: {value?: number; unit?: string};
          direction?: {degrees?: number; cardinal?: string};
        };
        precipitation?: {
          probability?: {percent?: number; type?: string};
        };
        currentConditionsHistory?: {
          maxTemperature?: {degrees?: number};
          minTemperature?: {degrees?: number};
        };
      };

      const historyMax =
        typeof weather.currentConditionsHistory?.maxTemperature?.degrees === 'number'
          ? Math.round(weather.currentConditionsHistory.maxTemperature.degrees)
          : null;
      const historyMin =
        typeof weather.currentConditionsHistory?.minTemperature?.degrees === 'number'
          ? Math.round(weather.currentConditionsHistory.minTemperature.degrees)
          : null;

      res.json({
        location: {
          label: resolvedLabel || `${lat!.toFixed(2)}, ${lng!.toFixed(2)}`,
          latitude: lat!,
          longitude: lng!,
          source: locationSource,
        },
        currentTime: weather.currentTime ?? new Date().toISOString(),
        timeZoneId: weather.timeZone?.id ?? null,
        isDaytime: weather.isDaytime ?? true,
        conditionType: weather.weatherCondition?.type ?? 'UNKNOWN',
        conditionText: weather.weatherCondition?.description?.text ?? '',
        iconBaseUri: weather.weatherCondition?.iconBaseUri ?? null,
        temperatureC:
          typeof weather.temperature?.degrees === 'number'
            ? Math.round(weather.temperature.degrees)
            : null,
        feelsLikeC:
          typeof weather.feelsLikeTemperature?.degrees === 'number'
            ? Math.round(weather.feelsLikeTemperature.degrees)
            : null,
        maxTempC: todayForecast.maxTempC ?? historyMax,
        minTempC: todayForecast.minTempC ?? historyMin,
        humidity:
          typeof weather.relativeHumidity === 'number' ? weather.relativeHumidity : null,
        windKmh:
          typeof weather.wind?.speed?.value === 'number'
            ? Math.round(weather.wind.speed.value)
            : null,
        precipChance:
          typeof weather.precipitation?.probability?.percent === 'number'
            ? weather.precipitation.probability.percent
            : null,
        uvIndex: typeof weather.uvIndex === 'number' ? weather.uvIndex : null,
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        res.status(429).json({
          error: 'quota_exceeded',
          status: 'RESOURCE_EXHAUSTED',
          message: 'تم الوصول للحد اليومي لاستخدام خدمة الطقس والمواقع.',
        });
        return;
      }
      console.error('Weather proxy error:', err instanceof Error ? err.message : err);
      res.status(502).json({
        error: 'weather_unavailable',
        message: 'مقدرناش نحدّث حالة الطقس دلوقتي. جرّب تاني أو اكتب اسم مدينتك.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true, hmr: false},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Service-Worker-Allowed', '/');
          }
        },
      }),
    );
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Omar's Life server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Omar's Life server:", err);
  process.exit(1);
});
