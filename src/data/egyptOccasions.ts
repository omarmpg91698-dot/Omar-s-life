// Egyptian official holidays and Islamic occasions (Ramadan, Eids, Hijri
// milestones) for 2026-2027. Fixed Gregorian dates are official; Hijri-based
// dates are the best astronomical estimates and are marked tentative
// (المواعيد الهجرية بتتأكد برؤية الهلال).
// Source for 2026 official dates: presidency.eg (العطلات الرسمية لعام ٢٠٢٦).

export type OccasionKind = 'official' | 'religious' | 'ramadan';

export interface EgyptOccasion {
  dateIso: string; // YYYY-MM-DD
  name: string;
  kind: OccasionKind;
  tentative?: boolean;
  emoji: string;
}

const FIXED_GREGORIAN: Array<{md: string; name: string; emoji: string}> = [
  {md: '01-07', name: 'عيد الميلاد المجيد', emoji: '🎄'},
  {md: '01-25', name: 'ثورة ٢٥ يناير وعيد الشرطة', emoji: '🇪🇬'},
  {md: '04-25', name: 'عيد تحرير سيناء', emoji: '🇪🇬'},
  {md: '05-01', name: 'عيد العمال', emoji: '👷'},
  {md: '06-30', name: 'ثورة ٣٠ يونيو', emoji: '🇪🇬'},
  {md: '07-23', name: 'ثورة ٢٣ يوليو', emoji: '🇪🇬'},
  {md: '10-06', name: 'عيد القوات المسلحة', emoji: '🇪🇬'},
];

const DATED: EgyptOccasion[] = [
  // --- 2026 (source: presidency.eg) ---
  {dateIso: '2026-02-18', name: 'أول أيام شهر رمضان ١٤٤٧', kind: 'ramadan', emoji: '🌙'},
  {dateIso: '2026-03-15', name: 'ليلة القدر (٢٧ رمضان)', kind: 'ramadan', tentative: true, emoji: '✨'},
  {dateIso: '2026-03-19', name: 'عيد الفطر المبارك — أول الأيام', kind: 'religious', emoji: '🌙'},
  {dateIso: '2026-03-20', name: 'عيد الفطر المبارك — تاني يوم', kind: 'religious', emoji: '🌙'},
  {dateIso: '2026-03-21', name: 'عيد الفطر المبارك — تالت يوم', kind: 'religious', emoji: '🌙'},
  {dateIso: '2026-04-13', name: 'شم النسيم', kind: 'official', emoji: '🌸'},
  {dateIso: '2026-05-26', name: 'وقفة عيد الأضحى (يوم عرفة)', kind: 'religious', emoji: '🕋'},
  {dateIso: '2026-05-27', name: 'عيد الأضحى المبارك — أول الأيام', kind: 'religious', emoji: '🐑'},
  {dateIso: '2026-05-28', name: 'عيد الأضحى المبارك — تاني يوم', kind: 'religious', emoji: '🐑'},
  {dateIso: '2026-05-29', name: 'عيد الأضحى المبارك — تالت يوم', kind: 'religious', emoji: '🐑'},
  {dateIso: '2026-06-18', name: 'رأس السنة الهجرية ١٤٤٨', kind: 'religious', emoji: '🌙'},
  {dateIso: '2026-08-27', name: 'المولد النبوي الشريف', kind: 'religious', emoji: '🕌'},

  // --- 2027 (Hijri dates are estimates — بتتأكد برؤية الهلال) ---
  {dateIso: '2027-02-08', name: 'أول أيام شهر رمضان ١٤٤٨', kind: 'ramadan', tentative: true, emoji: '🌙'},
  {dateIso: '2027-03-06', name: 'ليلة القدر (٢٧ رمضان)', kind: 'ramadan', tentative: true, emoji: '✨'},
  {dateIso: '2027-03-10', name: 'عيد الفطر المبارك — أول الأيام', kind: 'religious', tentative: true, emoji: '🌙'},
  {dateIso: '2027-03-11', name: 'عيد الفطر المبارك — تاني يوم', kind: 'religious', tentative: true, emoji: '🌙'},
  {dateIso: '2027-03-12', name: 'عيد الفطر المبارك — تالت يوم', kind: 'religious', tentative: true, emoji: '🌙'},
  {dateIso: '2027-05-03', name: 'شم النسيم', kind: 'official', tentative: true, emoji: '🌸'},
  {dateIso: '2027-05-16', name: 'وقفة عيد الأضحى (يوم عرفة)', kind: 'religious', tentative: true, emoji: '🕋'},
  {dateIso: '2027-05-17', name: 'عيد الأضحى المبارك — أول الأيام', kind: 'religious', tentative: true, emoji: '🐑'},
  {dateIso: '2027-05-18', name: 'عيد الأضحى المبارك — تاني يوم', kind: 'religious', tentative: true, emoji: '🐑'},
  {dateIso: '2027-05-19', name: 'عيد الأضحى المبارك — تالت يوم', kind: 'religious', tentative: true, emoji: '🐑'},
  {dateIso: '2027-06-07', name: 'رأس السنة الهجرية ١٤٤٩', kind: 'religious', tentative: true, emoji: '🌙'},
  {dateIso: '2027-08-16', name: 'المولد النبوي الشريف', kind: 'religious', tentative: true, emoji: '🕌'},
];

export const EGYPT_OCCASIONS: EgyptOccasion[] = [
  ...DATED,
  ...[2026, 2027].flatMap((year) =>
    FIXED_GREGORIAN.map((f) => ({
      dateIso: `${year}-${f.md}`,
      name: f.name,
      kind: 'official' as const,
      emoji: f.emoji,
    })),
  ),
];

const BY_DATE = new Map<string, EgyptOccasion[]>();
for (const occ of EGYPT_OCCASIONS) {
  const list = BY_DATE.get(occ.dateIso) ?? [];
  list.push(occ);
  BY_DATE.set(occ.dateIso, list);
}

export function occasionsForDate(dateIso: string): EgyptOccasion[] {
  return BY_DATE.get(dateIso) ?? [];
}

function dayDiff(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export interface UpcomingOccasion extends EgyptOccasion {
  daysAway: number;
}

export function upcomingOccasions(fromIso: string, limit = 4, windowDays = 150): UpcomingOccasion[] {
  return EGYPT_OCCASIONS.map((occ) => ({...occ, daysAway: dayDiff(fromIso, occ.dateIso)}))
    .filter((occ) => occ.daysAway >= 0 && occ.daysAway <= windowDays)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, limit);
}
