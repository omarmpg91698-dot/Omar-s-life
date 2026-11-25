import {
  Baby,
  Banknote,
  Cake,
  Bell,
  Bike,
  BookOpen,
  Briefcase,
  Camera,
  Car,
  ClipboardList,
  Coffee,
  CreditCard,
  Dumbbell,
  FileText,
  Flower2,
  Gem,
  Gift,
  GraduationCap,
  Hammer,
  Heart,
  Home,
  Key,
  Landmark,
  Laptop,
  Lightbulb,
  ListChecks,
  Mail,
  MapPin,
  Moon,
  Music,
  Paintbrush,
  PartyPopper,
  PawPrint,
  PenLine,
  Phone,
  Pill,
  Plane,
  Scissors,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Star,
  Stethoscope,
  Sun,
  Target,
  Trophy,
  Tv,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface TaskIconOption {
  id: string;
  label: string;
  Icon: LucideIcon;
}

// Colorful badge classes per category (light + dark), keyed by icon id.
const C = (light: string, dark: string): string =>
  `${light} dark:${dark}`;
export const TASK_ICON_COLORS: Record<string, string> = {
  clipboard: C('bg-slate-100 text-slate-500 border-slate-200', 'bg-slate-800 text-slate-300 border-slate-700'),
  star: C('bg-amber-100 text-amber-600 border-amber-200', 'bg-amber-950 text-amber-300 border-amber-800'),
  heart: C('bg-rose-100 text-rose-600 border-rose-200', 'bg-rose-950 text-rose-300 border-rose-800'),
  baby: C('bg-pink-100 text-pink-600 border-pink-200', 'bg-pink-950 text-pink-300 border-pink-800'),
  stethoscope: C('bg-sky-100 text-sky-600 border-sky-200', 'bg-sky-950 text-sky-300 border-sky-800'),
  pill: C('bg-teal-100 text-teal-600 border-teal-200', 'bg-teal-950 text-teal-300 border-teal-800'),
  cart: C('bg-emerald-100 text-emerald-600 border-emerald-200', 'bg-emerald-950 text-emerald-300 border-emerald-800'),
  basket: C('bg-green-100 text-green-600 border-green-200', 'bg-green-950 text-green-300 border-green-800'),
  car: C('bg-indigo-100 text-indigo-600 border-indigo-200', 'bg-indigo-950 text-indigo-300 border-indigo-800'),
  bike: C('bg-cyan-100 text-cyan-600 border-cyan-200', 'bg-cyan-950 text-cyan-300 border-cyan-800'),
  wallet: C('bg-orange-100 text-orange-600 border-orange-200', 'bg-orange-950 text-orange-300 border-orange-800'),
  banknote: C('bg-lime-100 text-lime-600 border-lime-200', 'bg-lime-950 text-lime-300 border-lime-800'),
  card: C('bg-violet-100 text-violet-600 border-violet-200', 'bg-violet-950 text-violet-300 border-violet-800'),
  bank: C('bg-blue-100 text-blue-600 border-blue-200', 'bg-blue-950 text-blue-300 border-blue-800'),
  briefcase: C('bg-neutral-100 text-neutral-600 border-neutral-200', 'bg-neutral-800 text-neutral-300 border-neutral-700'),
  users: C('bg-purple-100 text-purple-600 border-purple-200', 'bg-purple-950 text-purple-300 border-purple-800'),
  dumbbell: C('bg-red-100 text-red-600 border-red-200', 'bg-red-950 text-red-300 border-red-800'),
  book: C('bg-yellow-100 text-yellow-700 border-yellow-200', 'bg-yellow-950 text-yellow-300 border-yellow-800'),
  graduation: C('bg-fuchsia-100 text-fuchsia-600 border-fuchsia-200', 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-800'),
  plane: C('bg-sky-100 text-sky-700 border-sky-300', 'bg-sky-950 text-sky-200 border-sky-700'),
  phone: C('bg-green-100 text-green-700 border-green-300', 'bg-green-950 text-green-200 border-green-700'),
  mail: C('bg-blue-100 text-blue-500 border-blue-200', 'bg-blue-950 text-blue-300 border-blue-800'),
  home: C('bg-amber-100 text-amber-700 border-amber-300', 'bg-amber-950 text-amber-200 border-amber-700'),
  key: C('bg-stone-100 text-stone-600 border-stone-200', 'bg-stone-800 text-stone-300 border-stone-700'),
  gift: C('bg-rose-100 text-rose-500 border-rose-300', 'bg-rose-950 text-rose-200 border-rose-700'),
  cake: C('bg-pink-100 text-pink-500 border-pink-300', 'bg-pink-950 text-pink-200 border-pink-700'),
  party: C('bg-orange-100 text-orange-500 border-orange-300', 'bg-orange-950 text-orange-200 border-orange-700'),
  food: C('bg-red-100 text-red-500 border-red-200', 'bg-red-950 text-red-300 border-red-800'),
  coffee: C('bg-amber-100 text-amber-800 border-amber-300', 'bg-amber-950 text-amber-200 border-amber-700'),
  moon: C('bg-violet-100 text-violet-700 border-violet-300', 'bg-violet-950 text-violet-200 border-violet-700'),
  wrench: C('bg-slate-100 text-slate-700 border-slate-300', 'bg-slate-800 text-slate-200 border-slate-600'),
  hammer: C('bg-orange-100 text-orange-700 border-orange-200', 'bg-orange-950 text-orange-300 border-orange-800'),
  scissors: C('bg-fuchsia-100 text-fuchsia-500 border-fuchsia-300', 'bg-fuchsia-950 text-fuchsia-200 border-fuchsia-700'),
  shirt: C('bg-indigo-100 text-indigo-500 border-indigo-200', 'bg-indigo-950 text-indigo-300 border-indigo-800'),
  laptop: C('bg-neutral-100 text-neutral-700 border-neutral-300', 'bg-neutral-800 text-neutral-200 border-neutral-600'),
  wifi: C('bg-cyan-100 text-cyan-700 border-cyan-300', 'bg-cyan-950 text-cyan-200 border-cyan-700'),
  tv: C('bg-purple-100 text-purple-500 border-purple-200', 'bg-purple-950 text-purple-300 border-purple-800'),
  camera: C('bg-teal-100 text-teal-700 border-teal-300', 'bg-teal-950 text-teal-200 border-teal-700'),
  music: C('bg-violet-100 text-violet-500 border-violet-200', 'bg-violet-950 text-violet-300 border-violet-800'),
  flower: C('bg-lime-100 text-lime-700 border-lime-300', 'bg-lime-950 text-lime-200 border-lime-700'),
  paw: C('bg-orange-100 text-orange-800 border-orange-300', 'bg-orange-950 text-orange-200 border-orange-700'),
  shield: C('bg-emerald-100 text-emerald-700 border-emerald-300', 'bg-emerald-950 text-emerald-200 border-emerald-700'),
  mapPin: C('bg-red-100 text-red-600 border-red-300', 'bg-red-950 text-red-200 border-red-700'),
  bell: C('bg-amber-100 text-amber-600 border-amber-300', 'bg-amber-950 text-amber-200 border-amber-700'),
  file: C('bg-stone-100 text-stone-500 border-stone-300', 'bg-stone-800 text-stone-300 border-stone-600'),
  pen: C('bg-blue-100 text-blue-700 border-blue-300', 'bg-blue-950 text-blue-200 border-blue-700'),
  idea: C('bg-yellow-100 text-yellow-600 border-yellow-300', 'bg-yellow-950 text-yellow-200 border-yellow-700'),
  target: C('bg-red-100 text-red-700 border-red-300', 'bg-red-950 text-red-200 border-red-700'),
  trophy: C('bg-amber-100 text-amber-500 border-amber-300', 'bg-amber-950 text-amber-200 border-amber-700'),
  gem: C('bg-cyan-100 text-cyan-500 border-cyan-300', 'bg-cyan-950 text-cyan-200 border-cyan-700'),
  paint: C('bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300', 'bg-fuchsia-950 text-fuchsia-200 border-fuchsia-700'),
  sun: C('bg-yellow-100 text-yellow-500 border-yellow-300', 'bg-yellow-950 text-yellow-200 border-yellow-700'),
  sparkles: C('bg-purple-100 text-purple-700 border-purple-300', 'bg-purple-950 text-purple-200 border-purple-700'),
  list: C('bg-slate-100 text-slate-600 border-slate-300', 'bg-slate-800 text-slate-200 border-slate-600'),
};
export function iconColorClasses(iconId: string): string {
  return TASK_ICON_COLORS[iconId] ?? TASK_ICON_COLORS.clipboard;
}

export const TASK_ICON_OPTIONS: TaskIconOption[] = [
  {id: 'clipboard', label: 'مهمة', Icon: ClipboardList},
  {id: 'star', label: 'مميزة', Icon: Star},
  {id: 'heart', label: 'عيلة', Icon: Heart},
  {id: 'baby', label: 'بيبي', Icon: Baby},
  {id: 'stethoscope', label: 'دكتور', Icon: Stethoscope},
  {id: 'pill', label: 'دواء', Icon: Pill},
  {id: 'cart', label: 'مشتريات', Icon: ShoppingCart},
  {id: 'basket', label: 'سوبرماركت', Icon: ShoppingBasket},
  {id: 'car', label: 'عربية', Icon: Car},
  {id: 'bike', label: 'مشوار', Icon: Bike},
  {id: 'wallet', label: 'فلوس', Icon: Wallet},
  {id: 'banknote', label: 'كاش', Icon: Banknote},
  {id: 'card', label: 'بطاقة', Icon: CreditCard},
  {id: 'bank', label: 'بنك', Icon: Landmark},
  {id: 'briefcase', label: 'شغل', Icon: Briefcase},
  {id: 'users', label: 'اجتماع', Icon: Users},
  {id: 'dumbbell', label: 'رياضة', Icon: Dumbbell},
  {id: 'book', label: 'قراءة', Icon: BookOpen},
  {id: 'graduation', label: 'مذاكرة', Icon: GraduationCap},
  {id: 'plane', label: 'سفر', Icon: Plane},
  {id: 'phone', label: 'مكالمة', Icon: Phone},
  {id: 'mail', label: 'ميل', Icon: Mail},
  {id: 'home', label: 'بيت', Icon: Home},
  {id: 'key', label: 'مفتاح', Icon: Key},
  {id: 'gift', label: 'هدية', Icon: Gift},
  {id: 'cake', label: 'عيد ميلاد', Icon: Cake},
  {id: 'party', label: 'فرح/احتفال', Icon: PartyPopper},
  {id: 'sparkles', label: 'مناسبة', Icon: Sparkles},
  {id: 'food', label: 'أكل', Icon: UtensilsCrossed},
  {id: 'coffee', label: 'قهوة', Icon: Coffee},
  {id: 'moon', label: 'عبادة', Icon: Moon},
  {id: 'wrench', label: 'صيانة', Icon: Wrench},
  {id: 'hammer', label: 'تصليح', Icon: Hammer},
  {id: 'scissors', label: 'حلاقة', Icon: Scissors},
  {id: 'shirt', label: 'هدوم', Icon: Shirt},
  {id: 'laptop', label: 'لابتوب', Icon: Laptop},
  {id: 'wifi', label: 'نت', Icon: Wifi},
  {id: 'tv', label: 'تلفزيون', Icon: Tv},
  {id: 'camera', label: 'تصوير', Icon: Camera},
  {id: 'music', label: 'موسيقى', Icon: Music},
  {id: 'flower', label: 'زرع', Icon: Flower2},
  {id: 'paw', label: 'حيوان أليف', Icon: PawPrint},
  {id: 'shield', label: 'تأمين', Icon: ShieldCheck},
  {id: 'mapPin', label: 'مكان', Icon: MapPin},
  {id: 'bell', label: 'تنبيه', Icon: Bell},
  {id: 'file', label: 'ورق', Icon: FileText},
  {id: 'pen', label: 'كتابة', Icon: PenLine},
  {id: 'idea', label: 'فكرة', Icon: Lightbulb},
  {id: 'target', label: 'هدف', Icon: Target},
  {id: 'trophy', label: 'إنجاز', Icon: Trophy},
  {id: 'gem', label: 'دبلة', Icon: Gem},
  {id: 'paint', label: 'ألوان', Icon: Paintbrush},
  {id: 'sun', label: 'صباح', Icon: Sun},
  {id: 'list', label: 'قائمة', Icon: ListChecks},
];

export const TASK_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  TASK_ICON_OPTIONS.map((o) => [o.id, o.Icon]),
);

export const DEFAULT_TASK_ICON = ClipboardList;

const normalizeArabic = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

// Order matters: first match wins.
const KEYWORD_ICON: Array<[string[], string]> = [
  [['عيد ميلاد', 'ميلاد', 'تورته', 'تورتة', 'برثداي'], 'cake'],
  [['خطوب', 'خطيبتي', 'خطيبي', 'فاتحه', 'فاتحة', 'كتب الكتاب', 'كتب كتاب', 'دبله', 'دبلة'], 'gem'],
  [['فرح', 'جواز', 'ويدنج', 'زفاف', 'عرس'], 'party'],
  [['ذكري', 'ذكرى', 'مناسبه', 'مناسبة'], 'sparkles'],
  [['دكتور', 'دكتوره', 'دكتورة', 'كشف', 'تحاليل', 'تحليل', 'دكاتره'], 'stethoscope'],
  [['دواء', 'دوا', 'علاج', 'صيدليه', 'صيدلية', 'فيتامين'], 'pill'],
  [['حمل', 'بيبي', 'طفل', 'رضيع', 'حضانه', 'حضانة', 'بجه'], 'baby'],
  [['مستلزمات', 'مشتريات', 'سوبرماركت', 'بقاله', 'بقالة'], 'basket'],
  [['شراء', 'اشتري', 'اشري', 'شوبينج', 'تسوق'], 'cart'],
  [['عربيه', 'عربية', 'رخصه', 'رخصة', 'عفشه', 'عفشة', 'كاوتش', 'بنزين', 'غسيل عربيه'], 'car'],
  [['مشوار', 'مواصلات', 'اوبر', 'أوبر', 'ميكروباص'], 'bike'],
  [['ميزانيه', 'ميزانية', 'مرتب', 'حساب', 'فلوس', 'مصاريف', 'مصروف'], 'wallet'],
  [['فاتوره', 'فاتورة', 'فواتير', 'شحن رصيد', 'كاش'], 'banknote'],
  [['بطاقه', 'بطاقة', 'فيزا', 'كريديت'], 'card'],
  [['بنك', 'تحويل', 'حواله', 'حوالة', 'انستاباي'], 'bank'],
  [['اجتماع', 'ميتنج', 'مقابله', 'مقابلة', 'انترفيو'], 'users'],
  [['شغل', 'عمل', 'برزنتيشن', 'عرض', 'تسليم', 'مدير', 'عميل'], 'briefcase'],
  [['جيم', 'رياضه', 'رياضة', 'تمرين', 'مشي', 'جري', 'كوره', 'كرة'], 'dumbbell'],
  [['كتاب', 'قراءه', 'قراءة', 'اقرا', 'روايه', 'رواية'], 'book'],
  [['مذاكره', 'مذاكرة', 'كورس', 'امتحان', 'دراسه', 'دراسة', 'مدرسه', 'مدرسة'], 'graduation'],
  [['سفر', 'طيران', 'طياره', 'طيارة', 'رحله', 'رحلة', 'حجز طيران', 'مطار'], 'plane'],
  [['مكالمه', 'مكالمة', 'اتصال', 'اكلم', 'اكلمه', 'كلم'], 'phone'],
  [['ايميل', 'إيميل', 'ميل', 'بريد'], 'mail'],
  [['بيت', 'شقه', 'شقة', 'تنضيف', 'تنظيف', 'غسيل', 'ترتيب'], 'home'],
  [['سكن', 'ايجار', 'إيجار', 'مفتاح'], 'key'],
  [['هديه', 'هدية'], 'gift'],
  [['اكل', 'أكل', 'مطعم', 'غدا', 'عشا', 'فطار', 'فطور', 'تعشي'], 'food'],
  [['قهوه', 'قهوة', 'كافيه', 'كافية', 'شاي'], 'coffee'],
  [['صلاه', 'صلاة', 'اذان', 'قران', 'قرآن', 'مسجد', 'اذكار', 'جمعه', 'جمعة'], 'moon'],
  [['صيانه', 'صيانة', 'تصليح', 'سباك', 'كهربائي', 'نجار'], 'wrench'],
  [['حلاقه', 'حلاقة', 'كوافير', 'شعر'], 'scissors'],
  [['هدوم', 'ملابس', 'غسيل هدوم', 'كي'], 'shirt'],
  [['لابتوب', 'لاب', 'كمبيوتر', 'موبايل', 'موبيل'], 'laptop'],
  [['نت', 'انترنت', 'إنترنت', 'واي فاي', 'راوتر'], 'wifi'],
  [['تصوير', 'صور', 'كاميرا', 'فوتو'], 'camera'],
  [['اغاني', 'أغاني', 'موسيقي', 'موسيقى', 'سماعات'], 'music'],
  [['زرع', 'نبات', 'نباتات', 'ورد'], 'flower'],
  [['قطه', 'قطة', 'كلب', 'حيوان'], 'paw'],
  [['تامين', 'تأمين', 'رخصه قياده', 'بطاقه رقم'], 'shield'],
  [['ورق', 'مستند', 'عقد', 'استمارة', 'نموذج'], 'file'],
  [['اكتب', 'كتابه', 'كتابة', 'مقال', 'بوست'], 'pen'],
  [['فكره', 'فكرة', 'افكار', 'أفكار'], 'idea'],
  [['تنبيه', 'فكرني', 'فكرنى', 'منبه'], 'bell'],
  [['مكان', 'عنوان', 'موقع'], 'mapPin'],
  [['مراتي', 'زوجتي', 'جوزي', 'حبيبي', 'ماما', 'بابا', 'اخويا', 'اخواتي', 'عيله', 'عيلة'], 'heart'],
  [['صباح', 'الصبح'], 'sun'],
];

export function autoIconForTitle(title: string): string {
  const t = normalizeArabic(title ?? '');
  for (const [keywords, iconId] of KEYWORD_ICON) {
    for (const kw of keywords) {
      if (kw && t.includes(normalizeArabic(kw))) return iconId;
    }
  }
  return 'clipboard';
}

export function iconIdForTask(task: {title: string; icon?: string | null}): string {
  if (task.icon && TASK_ICON_MAP[task.icon]) return task.icon;
  return autoIconForTitle(task.title);
}

export function iconForTask(task: {title: string; icon?: string | null}): LucideIcon {
  if (task.icon && TASK_ICON_MAP[task.icon]) return TASK_ICON_MAP[task.icon];
  return TASK_ICON_MAP[autoIconForTitle(task.title)] ?? DEFAULT_TASK_ICON;
}
