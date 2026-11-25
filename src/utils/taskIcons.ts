import {
  Baby,
  Banknote,
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
  {id: 'gem', label: 'قيمة', Icon: Gem},
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
  [['هديه', 'هدية', 'عيد ميلاد', 'مناسبه', 'مناسبة', 'فرح'], 'gift'],
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

export function iconForTask(task: {title: string; icon?: string | null}): LucideIcon {
  if (task.icon && TASK_ICON_MAP[task.icon]) return TASK_ICON_MAP[task.icon];
  return TASK_ICON_MAP[autoIconForTitle(task.title)] ?? DEFAULT_TASK_ICON;
}
