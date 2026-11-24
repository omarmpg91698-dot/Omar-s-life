import type {GoalColor} from '../types';

export type ResolvedGoalTone = 'slate' | 'amber' | 'blue' | 'teal' | 'emerald' | 'rose' | 'violet';

export interface GoalPalette {
  tone: ResolvedGoalTone;
  ribbon: string;
  bar: string;
  text: string;
  iconBg: string;
  swatch: string;
  ring: string;
  hex: string;
}

export interface GoalColorOption {
  id: GoalColor;
  label: string;
  swatch: string;
}

export const GOAL_COLOR_OPTIONS: GoalColorOption[] = [
  {id: 'auto', label: 'تلقائي حسب الإنجاز', swatch: 'bg-gradient-to-tr from-amber-500 via-blue-500 to-emerald-500'},
  {id: 'teal', label: 'فيروزي', swatch: 'bg-teal-500'},
  {id: 'blue', label: 'أزرق', swatch: 'bg-blue-500'},
  {id: 'emerald', label: 'أخضر', swatch: 'bg-emerald-500'},
  {id: 'amber', label: 'كهرماني', swatch: 'bg-amber-500'},
  {id: 'rose', label: 'وردي', swatch: 'bg-rose-500'},
  {id: 'violet', label: 'بنفسجي', swatch: 'bg-violet-500'},
];

const PALETTES: Record<ResolvedGoalTone, GoalPalette> = {
  slate: {
    tone: 'slate',
    ribbon: 'bg-gradient-to-l from-slate-400 to-slate-300 dark:from-slate-600 dark:to-slate-500',
    bar: 'bg-gradient-to-l from-slate-500 to-slate-400',
    text: 'text-slate-600 dark:text-slate-300',
    iconBg: 'bg-slate-100 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300',
    swatch: 'bg-slate-400',
    ring: 'ring-slate-400/40',
    hex: '#64748b',
  },
  amber: {
    tone: 'amber',
    ribbon: 'bg-gradient-to-l from-amber-500 via-orange-500 to-amber-400',
    bar: 'bg-gradient-to-l from-amber-500 to-orange-400',
    text: 'text-amber-700 dark:text-amber-400',
    iconBg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    swatch: 'bg-amber-500',
    ring: 'ring-amber-500/40',
    hex: '#f59e0b',
  },
  blue: {
    tone: 'blue',
    ribbon: 'bg-gradient-to-l from-blue-600 via-indigo-500 to-sky-400',
    bar: 'bg-gradient-to-l from-blue-600 to-sky-400',
    text: 'text-blue-700 dark:text-blue-400',
    iconBg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    swatch: 'bg-blue-500',
    ring: 'ring-blue-500/40',
    hex: '#2563eb',
  },
  teal: {
    tone: 'teal',
    ribbon: 'bg-gradient-to-l from-teal-600 via-teal-500 to-cyan-400',
    bar: 'bg-gradient-to-l from-teal-600 to-cyan-400',
    text: 'text-teal-700 dark:text-teal-400',
    iconBg: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    swatch: 'bg-teal-500',
    ring: 'ring-teal-500/40',
    hex: '#0d9488',
  },
  emerald: {
    tone: 'emerald',
    ribbon: 'bg-gradient-to-l from-emerald-600 via-emerald-500 to-teal-400',
    bar: 'bg-gradient-to-l from-emerald-600 to-teal-400',
    text: 'text-emerald-700 dark:text-emerald-400',
    iconBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    swatch: 'bg-emerald-500',
    ring: 'ring-emerald-500/40',
    hex: '#059669',
  },
  rose: {
    tone: 'rose',
    ribbon: 'bg-gradient-to-l from-rose-600 via-rose-500 to-pink-400',
    bar: 'bg-gradient-to-l from-rose-600 to-pink-400',
    text: 'text-rose-700 dark:text-rose-400',
    iconBg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    swatch: 'bg-rose-500',
    ring: 'ring-rose-500/40',
    hex: '#e11d48',
  },
  violet: {
    tone: 'violet',
    ribbon: 'bg-gradient-to-l from-violet-600 via-purple-500 to-indigo-400',
    bar: 'bg-gradient-to-l from-violet-600 to-indigo-400',
    text: 'text-violet-700 dark:text-violet-400',
    iconBg: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    swatch: 'bg-violet-500',
    ring: 'ring-violet-500/40',
    hex: '#7c3aed',
  },
};

export function resolveGoalPalette(progress: number, color?: GoalColor | null): GoalPalette {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  if (color && color !== 'auto' && color in PALETTES) {
    return PALETTES[color as ResolvedGoalTone];
  }
  if (clamped >= 100) return PALETTES.emerald;
  if (clamped >= 70) return PALETTES.teal;
  if (clamped >= 35) return PALETTES.blue;
  if (clamped > 0) return PALETTES.amber;
  return PALETTES.slate;
}

export function getGoalStatusLabel(progress: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  if (clamped >= 100) return 'مكتمل';
  if (clamped >= 70) return 'قربت تخلص';
  if (clamped >= 35) return 'شغال عليه';
  if (clamped > 0) return 'في البداية';
  return 'لسه ما بدأش';
}

export interface TargetCountdownInfo {
  label: string;
  isOverdue: boolean;
  isUrgent: boolean;
}

export function getTargetDateCountdown(
  targetDate: string | null,
  progress: number,
  todayIso: string,
): TargetCountdownInfo | null {
  if (!targetDate) return null;
  if (progress >= 100) {
    return {label: 'تم الإنجاز', isOverdue: false, isUrgent: false};
  }
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [gy, gm, gd] = targetDate.split('-').map(Number);
  if (!ty || !tm || !td || !gy || !gm || !gd) return null;

  const todayMs = Date.UTC(ty, tm - 1, td);
  const targetMs = Date.UTC(gy, gm - 1, gd);
  const diffDays = Math.round((targetMs - todayMs) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) {
    const lateDays = Math.abs(diffDays);
    return {
      label: lateDays === 1 ? 'متأخر يوم' : `متأخر ${lateDays} يوم`,
      isOverdue: true,
      isUrgent: true,
    };
  }
  if (diffDays === 0) {
    return {label: 'آخر يوم النهارده', isOverdue: false, isUrgent: true};
  }
  if (diffDays === 1) {
    return {label: 'باقي يوم واحد', isOverdue: false, isUrgent: true};
  }
  if (diffDays <= 7) {
    return {label: `باقي ${diffDays} أيام`, isOverdue: false, isUrgent: true};
  }
  return {label: `باقي ${diffDays} يوم`, isOverdue: false, isUrgent: false};
}
