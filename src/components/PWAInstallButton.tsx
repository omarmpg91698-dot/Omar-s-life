import React, {useState} from 'react';
import {Check, Copy, Download, ExternalLink, Smartphone, WifiOff, X} from 'lucide-react';
import {useOnlineStatus, usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant: 'sidebar' | 'header' | 'card';
  onInstalled?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({variant, onInstalled}) => {
  const {isInstallable, isInstalled, isIOS, isAndroid, promptInstall} = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const appUrl =
    typeof window !== 'undefined' && window.location.origin.startsWith('http')
      ? window.location.origin
      : '';

  const handleTriggerInstall = async () => {
    if (isInstallable) {
      const result = await promptInstall();
      if (result === 'accepted') {
        onInstalled?.();
        return;
      }
    }
    setGuideOpen(true);
  };

  const handleCopyUrl = async () => {
    if (!appUrl) return;
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2200);
    } catch {
      // Fallback copy via temporary input
      try {
        const input = document.createElement('input');
        input.value = appUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        setCopiedUrl(true);
        window.setTimeout(() => setCopiedUrl(false), 2200);
      } catch {
        // Ignore clipboard errors in restricted frames
      }
    }
  };

  // Hide header/sidebar trigger once already installed in standalone mode
  if (isInstalled && variant !== 'card') {
    return null;
  }

  return (
    <>
      {variant === 'sidebar' && (
        <button
          type="button"
          onClick={() => void handleTriggerInstall()}
          className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">
            {isInstallable ? 'تثبيت التطبيق' : 'تثبيت على الموبايل'}
          </span>
        </button>
      )}

      {variant === 'header' && (
        <button
          type="button"
          onClick={() => void handleTriggerInstall()}
          aria-label="تثبيت التطبيق على الموبايل"
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-accent/30 bg-accent-soft px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden whitespace-nowrap sm:inline">تثبيت</span>
        </button>
      )}

      {variant === 'card' && (
        <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/90">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Smartphone className="h-4 w-4 text-accent" />
                <span>تثبيت التطبيق على الموبايل (Android / iOS)</span>
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {isInstalled
                  ? "التطبيق متثبت فعلاً على جهازك وشغّال كتطبيق مستقل بأيقونته الخاصة وأوفلاين."
                  : "ثبّت Omar's Life على شاشة موبايلك عشان يفتح بشاشة كاملة بدون شريط متصفح ويشتغل أوفلاين، أو حوّله لملف APK جاهز."}
              </p>
            </div>
            {isInstalled && (
              <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                <span>مثبّت على الجهاز</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isInstalled && (
              <button
                type="button"
                onClick={() => void handleTriggerInstall()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-opacity hover:opacity-95"
              >
                <Download className="h-4 w-4" />
                <span>{isInstallable ? 'تثبيت التطبيق الآن' : 'خطوات التثبيت / عمل APK'}</span>
              </button>
            )}

            {appUrl && (
              <button
                type="button"
                onClick={() => void handleCopyUrl()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>تم نسخ رابط التطبيق</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 text-accent" />
                    <span>نسخ رابط التطبيق</span>
                  </>
                )}
              </button>
            )}

            {isInstalled && (
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Smartphone className="h-4 w-4 text-accent" />
                <span>تثبيت على موبايل تاني / APK</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Guided Mobile Install & APK Packaging Modal */}
      {guideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setGuideOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-accent" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  تثبيت Omar&apos;s Life على موبايلك
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="إغلاق"
                className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Method 1: Instant Install on Android / iPhone */}
            <div className="space-y-2 rounded-xl border border-accent/25 bg-accent-soft/60 p-3.5 dark:bg-accent-soft/20">
              <p className="text-xs font-bold text-accent">
                الطريقة الأسرع (فوراً بدون ملفات — يشتغل كتطبيق كامل وأوفلاين)
              </p>
              {isIOS ? (
                <ol className="list-decimal space-y-1.5 ps-4 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                  <li>افتح رابط التطبيق في متصفح Safari على الآيفون.</li>
                  <li>اضغط على زر المشاركة (المربع اللي طالع منه سهم لفوق).</li>
                  <li>اختار «إضافة إلى الشاشة الرئيسية» ثم اضغط «إضافة».</li>
                </ol>
              ) : (
                <ol className="list-decimal space-y-1.5 ps-4 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                  <li>
                    {isAndroid
                      ? 'اضغط على قائمة Chrome (التلات نقط ⋮ فوق على اليمين أو الشمال).'
                      : 'افتح رابط التطبيق في متصفح Google Chrome على موبايلك الأندرويد.'}
                  </li>
                  <li>
                    اختار <strong>«تثبيت التطبيق»</strong> (Install app) أو{' '}
                    <strong>«إضافة إلى الشاشة الرئيسية»</strong>.
                  </li>
                  <li>
                    اضغط «تثبيت» — هينزل على شاشة الموبايل بأيقونة Omar&apos;s Life ويفتح بشاشة
                    كاملة وأوفلاين.
                  </li>
                </ol>
              )}
            </div>

            {/* Method 2: Generate a real .apk file via PWABuilder */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                لو محتاج ملف APK فعلي تنقله وتثبته على أندرويد
              </p>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                التطبيق جاهز بالكامل بمعايير PWA (الأيقونات + Manifest + Service Worker). تقدر تطلع
                ملف APK جاهز في دقيقة واحدة مجاناً:
              </p>
              <ol className="list-decimal space-y-1 ps-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <li>انشر التطبيق أولاً برابط عام (من زر Deploy / Share فوق) عشان PWABuilder يقدر يقرأه بدون شاشة تسجيل دخول.</li>
                <li>افتح موقع PWABuilder وحط الرابط العام واضغط Start.</li>
                <li>اختار Android ← Generate Package وهينزلك ملف .apk جاهز للتثبيت فوراً.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                {appUrl && (
                  <button
                    type="button"
                    onClick={() => void handleCopyUrl()}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-accent hover:text-accent dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-accent" />
                        <span>نسخ رابط التطبيق</span>
                      </>
                    )}
                  </button>
                )}
                <a
                  href="https://www.pwabuilder.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white hover:opacity-95"
                >
                  <span>فتح PWABuilder</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                تمام، فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>وضع الأوفلاين — شغّال عادي وبياناتك محفوظة على جهازك</span>
    </div>
  );
};
