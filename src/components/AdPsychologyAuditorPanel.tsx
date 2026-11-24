import React, {useRef, useState} from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  MinusCircle,
  Volume2,
  X,
} from 'lucide-react';
import {
  AD_GOAL_PRESETS,
  EGYPT_AUDIENCE_PRESETS,
  getScoreTone,
  type AdPsychologyAuditResult,
} from '../storage/adAuditTypes';

interface AdPsychologyAuditorPanelProps {
  compressImage: (file: File) => Promise<string>;
  onSpeakArabic: (text: string) => void;
}

const SCORE_LABELS: Array<{key: keyof AdPsychologyAuditResult['scores']; label: string}> = [
  {key: 'hook', label: 'قوة الـ Hook وأول ٣ ثواني'},
  {key: 'persuasion', label: 'الإقناع النفسي والعاطفي'},
  {key: 'pricing', label: 'سيكولوجية السعر والعرض'},
  {key: 'clarityCta', label: 'الوضوح والدعوة للإجراء (CTA)'},
];

export const AdPsychologyAuditorPanel: React.FC<AdPsychologyAuditorPanelProps> = ({
  compressImage,
  onSpeakArabic,
}) => {
  const [adCopy, setAdCopy] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [targetAudience, setTargetAudience] = useState(EGYPT_AUDIENCE_PRESETS[0]);
  const [goal, setGoal] = useState(AD_GOAL_PRESETS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdPsychologyAuditResult | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setImageDataUrl(compressed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'مقدرناش نقرأ الصورة دي.');
    }
  };

  const handleRunAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!adCopy.trim() && !imageDataUrl) || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/omar-ai/audit-ad', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          adCopy: adCopy.trim(),
          imageDataUrl: imageDataUrl ?? undefined,
          targetAudience,
          goal,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AdPsychologyAuditResult & {
        message?: string;
      };
      if (!res.ok) {
        setError(data.message || 'حصلت مشكلة في تحليل الإعلان، جرّب تاني.');
        return;
      }
      setResult(data);
    } catch {
      setError('تعذر الاتصال بخدمة محلّل الإعلانات دلوقتي.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyVariation = async (idx: number, headline: string, body: string, cta: string) => {
    const full = [headline, body, cta].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(full);
      setCopiedIndex(idx);
      window.setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      setError('النسخ التلقائي غير متاح في المتصفح ده، تقدر تحدد النص وتنسخه يدوياً.');
    }
  };

  const tone = result ? getScoreTone(result.overallScore) : 'amber';
  const toneClasses =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : tone === 'amber'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">محلّل الإعلانات والمحتوى بعلم النفس والتسويق</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            ارفع سكرين شوت لإعلان أو صفحة بيع أو تسعيرة، أو الصق نص الإعلان، و Omar&apos;s personal assistant هيقيّمهولك بدراسات علم النفس السلوكي ويكتبلك ٣ نسخ أقوى للسوق المصري.
          </p>
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => void handleRunAudit(e)}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Screenshot uploader */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                سكرين شوت الإعلان أو صفحة البيع (اختياري)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void handleFilePick(e)}
                className="hidden"
              />
              {imageDataUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <img
                    src={imageDataUrl}
                    alt="صورة الإعلان"
                    className="h-44 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImageDataUrl(null)}
                    aria-label="إزالة الصورة"
                    className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/75 text-white hover:bg-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-xs text-slate-500 transition-colors hover:border-teal-500 hover:text-teal-600 dark:border-slate-700 dark:bg-[#0B0F17] dark:text-slate-400"
                >
                  <ImageIcon className="h-7 w-7" />
                  <span className="font-semibold">اضغط لرفع سكرين شوت إعلان</span>
                  <span className="text-[11px] opacity-80">PNG / JPG / WebP</span>
                </button>
              )}
            </div>

            {/* Ad copy textarea */}
            <div className="space-y-2 md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                نص الإعلان / البوست / تفاصيل العرض والسعر
              </label>
              <textarea
                value={adCopy}
                onChange={(e) => setAdCopy(e.target.value)}
                rows={7}
                placeholder="الصق هنا نص الإعلان أو البوست أو عرض السعر... مثلاً: خصم 20% على كل الكوتشيات لآخر الأسبوع، اطلب دلوقتي من الرسايل!"
                className="h-44 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-[#0B0F17]"
              />
            </div>
          </div>

          {/* Egyptian Audience Presets */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              الجمهور المستهدف في مصر:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EGYPT_AUDIENCE_PRESETS.map((aud) => (
                <button
                  key={aud}
                  type="button"
                  onClick={() => setTargetAudience(aud)}
                  className={`min-h-[34px] rounded-xl px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                    targetAudience === aud
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {aud}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign Goal Presets */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              هدف الإعلان:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {AD_GOAL_PRESETS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGoal(g)}
                  className={`min-h-[34px] rounded-xl px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                    goal === g
                      ? 'bg-slate-900 text-white dark:bg-teal-500 dark:text-slate-950'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || (!adCopy.trim() && !imageDataUrl)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>بيحلل الإعلان بالسيكولوجي...</span>
                </>
              ) : (
                <>
                  <Megaphone className="h-4 w-4" />
                  <span>حلّل الإعلان واكتب ٣ نسخ أقوى</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                setAdCopy(
                  'عندنا خصم 20% على كل الساعات الأصلية لمدة 3 أيام! جودة عالية وشحن لكل محافظات مصر. ابعتلنا رسالة دلوقتي للحجز.',
                )
              }
              className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
            >
              جرّب مثال إعلان مصري جاهز
            </button>
          </div>
        </form>

        {/* Structured Audit Output */}
        {result && (
          <div className="space-y-5">
            {/* Hero Score + Sub-Scores */}
            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720] md:grid-cols-3">
              <div
                className={`flex flex-col items-center justify-center rounded-2xl border p-5 text-center ${toneClasses}`}
              >
                <span className="text-xs font-semibold">التقييم النفسي والتسويقي</span>
                <div className="mt-2 flex items-baseline gap-1 font-mono tabular-nums" dir="ltr">
                  <span className="text-4xl font-extrabold">{result.overallScore.toFixed(1)}</span>
                  <span className="text-base font-semibold opacity-75">/ 10</span>
                </div>
                <p className="mt-2 text-xs font-bold">{result.verdictTitleAr}</p>
              </div>

              <div className="space-y-3 md:col-span-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {result.summaryAr}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSpeakArabic(`${result.verdictTitleAr}. ${result.summaryAr}`)}
                    aria-label="سماع ملخص التحليل بالمصري"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-teal-500 hover:text-teal-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SCORE_LABELS.map(({key, label}) => {
                    const val = result.scores[key];
                    const barColor =
                      val >= 7.5
                        ? 'bg-emerald-500'
                        : val >= 5
                          ? 'bg-amber-500'
                          : 'bg-rose-500';
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            {label}
                          </span>
                          <span className="font-mono font-bold tabular-nums" dir="ltr">
                            {val.toFixed(1)}/10
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{width: `${Math.min(100, Math.max(8, val * 10))}%`}}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Psychological Triggers Matrix */}
            {result.psychologyTriggers.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]">
                <h2 className="text-base font-bold">تحليل المحفزات النفسية والدراسات العلمية</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {result.psychologyTriggers.map((tr, i) => (
                    <div
                      key={`${tr.principleAr}-${i}`}
                      className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-[#0B0F17]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">
                            {tr.principleAr}
                          </p>
                          {tr.studyRef && (
                            <p className="text-[11px] text-slate-400" dir="ltr">
                              {tr.studyRef}
                            </p>
                          )}
                        </div>
                        {tr.status === 'strong' ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            قوي
                          </span>
                        ) : tr.status === 'weak' ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3" />
                            ضعيف
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                            <MinusCircle className="h-3 w-3" />
                            ناقص
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {tr.noteAr}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weaknesses */}
            {result.weaknessesAr.length > 0 && (
              <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121720]">
                <h2 className="text-base font-bold">نقاط بتضيع عليك مبيعات في السوق المصري</h2>
                <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {result.weaknessesAr.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3 Stronger Egyptian Arabic Rewrites */}
            {result.rewrittenVariations.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold">٣ نسخ إعلانية أقوى جاهزة للسوق المصري</h2>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {result.rewrittenVariations.map((v, idx) => (
                    <div
                      key={`${v.angleAr}-${idx}`}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121720]"
                    >
                      <div className="space-y-2">
                        <span className="inline-block rounded-lg bg-teal-500/12 px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                          {v.angleAr}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {v.headlineAr}
                        </h3>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                          {v.bodyAr}
                        </p>
                        {v.ctaAr && (
                          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-teal-700 dark:bg-[#0B0F17] dark:text-teal-300">
                            CTA: {v.ctaAr}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyVariation(idx, v.headlineAr, v.bodyAr, v.ctaAr)
                          }
                          className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-500"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>تم النسخ</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>نسخ النسخة</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onSpeakArabic(`${v.headlineAr}. ${v.bodyAr}. ${v.ctaAr}`)
                          }
                          aria-label="سماع النسخة بالمصري"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-teal-500 hover:text-teal-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
