export interface AdAuditScores {
  hook: number;
  persuasion: number;
  pricing: number;
  clarityCta: number;
}

export interface AdPsychologyTrigger {
  principleAr: string;
  studyRef: string;
  status: 'strong' | 'weak' | 'missing';
  noteAr: string;
}

export interface AdRewrittenVariation {
  angleAr: string;
  headlineAr: string;
  bodyAr: string;
  ctaAr: string;
}

export interface AdPsychologyAuditResult {
  overallScore: number;
  verdictTitleAr: string;
  summaryAr: string;
  scores: AdAuditScores;
  psychologyTriggers: AdPsychologyTrigger[];
  weaknessesAr: string[];
  rewrittenVariations: AdRewrittenVariation[];
}

export const EGYPT_AUDIENCE_PRESETS = [
  'شباب مصري (18–30 سنة)',
  'أسر وأمهات في مصر',
  'فئة A/B+ (تجمع / زايد / معادي)',
  'أصحاب بيزنس ومشاريع (B2B)',
  'طلاب وجامعيين في مصر',
];

export const AD_GOAL_PRESETS = [
  'مبيعات أونلاين مباشرة',
  'رسائل واتساب / إنبوكس',
  'حجز موعد أو استشارة',
  'زيادة التفاعل والوعي بالبراند',
];

function clampScore(value: unknown, fallback = 5): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.max(1, Math.min(10, num)) * 10) / 10;
}

export function getScoreTone(score: number): 'emerald' | 'amber' | 'rose' {
  if (score >= 7.5) return 'emerald';
  if (score >= 5) return 'amber';
  return 'rose';
}

export function normalizeAdAuditResult(raw: unknown): AdPsychologyAuditResult {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawScores =
    obj.scores && typeof obj.scores === 'object' ? (obj.scores as Record<string, unknown>) : {};

  const hook = clampScore(rawScores.hook, 5.5);
  const persuasion = clampScore(rawScores.persuasion, 5.5);
  const pricing = clampScore(rawScores.pricing, 5.5);
  const clarityCta = clampScore(rawScores.clarityCta, 5.5);
  const computedAvg = Math.round(((hook + persuasion + pricing + clarityCta) / 4) * 10) / 10;

  const overallScore =
    typeof obj.overallScore === 'number' && Number.isFinite(obj.overallScore)
      ? clampScore(obj.overallScore, computedAvg)
      : computedAvg;

  const psychologyTriggers: AdPsychologyTrigger[] = Array.isArray(obj.psychologyTriggers)
    ? obj.psychologyTriggers
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 8)
        .map((item) => {
          const rawStatus = typeof item.status === 'string' ? item.status.toLowerCase() : '';
          const status: 'strong' | 'weak' | 'missing' =
            rawStatus === 'strong' || rawStatus === 'weak' || rawStatus === 'missing'
              ? rawStatus
              : 'weak';
          return {
            principleAr:
              typeof item.principleAr === 'string' && item.principleAr.trim()
                ? item.principleAr.trim()
                : 'مبدأ نفسي',
            studyRef: typeof item.studyRef === 'string' ? item.studyRef.trim() : '',
            status,
            noteAr: typeof item.noteAr === 'string' ? item.noteAr.trim() : '',
          };
        })
    : [];

  const weaknessesAr: string[] = Array.isArray(obj.weaknessesAr)
    ? obj.weaknessesAr
        .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
        .map((w) => w.trim())
        .slice(0, 6)
    : [];

  const rewrittenVariations: AdRewrittenVariation[] = Array.isArray(obj.rewrittenVariations)
    ? obj.rewrittenVariations
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 3)
        .map((item, idx) => ({
          angleAr:
            typeof item.angleAr === 'string' && item.angleAr.trim()
              ? item.angleAr.trim()
              : `النسخة المقترحة #${idx + 1}`,
          headlineAr: typeof item.headlineAr === 'string' ? item.headlineAr.trim() : '',
          bodyAr: typeof item.bodyAr === 'string' ? item.bodyAr.trim() : '',
          ctaAr: typeof item.ctaAr === 'string' ? item.ctaAr.trim() : '',
        }))
        .filter((v) => v.headlineAr || v.bodyAr)
    : [];

  return {
    overallScore,
    verdictTitleAr:
      typeof obj.verdictTitleAr === 'string' && obj.verdictTitleAr.trim()
        ? obj.verdictTitleAr.trim()
        : 'تحليل الإعلان بالسيكولوجي والتسويق',
    summaryAr:
      typeof obj.summaryAr === 'string' && obj.summaryAr.trim()
        ? obj.summaryAr.trim()
        : 'تم تحليل الإعلان بناءً على مبادئ علم النفس السلوكي وسلوك المستهلك المصري.',
    scores: {
      hook,
      persuasion,
      pricing,
      clarityCta,
    },
    psychologyTriggers,
    weaknessesAr,
    rewrittenVariations,
  };
}
