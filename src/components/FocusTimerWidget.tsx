import React from 'react';
import {
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  Timer,
  X,
} from 'lucide-react';
import {
  FOCUS_PRESETS,
  type FocusPresetMode,
  useLife,
} from '../context/LifeContext';

interface FocusTimerWidgetProps {
  variant?: 'card' | 'floating';
}

function formatSeconds(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const FocusTimerWidget: React.FC<FocusTimerWidgetProps> = ({variant = 'card'}) => {
  const {
    focusState,
    todayFocusMinutes,
    toggleFocusRunning,
    resetFocusTimer,
    setFocusPreset,
    clearFocusTask,
    completeFocusEarly,
    dismissFocusNotice,
    setActiveSection,
  } = useLife();

  const elapsedSeconds = focusState.totalSeconds - focusState.secondsLeft;
  const progressPct =
    focusState.totalSeconds > 0
      ? Math.min(100, Math.round((elapsedSeconds / focusState.totalSeconds) * 100))
      : 0;

  if (variant === 'floating') {
    if (!focusState.running && elapsedSeconds === 0) return null;
    return (
      <div className="fixed bottom-20 left-3 right-3 sm:left-6 sm:right-auto sm:w-80 lg:bottom-6 z-40 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('home')}
            className="flex items-center gap-2.5 min-w-0 text-right flex-1"
          >
            <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
              <Timer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
                {formatSeconds(focusState.secondsLeft)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-1">
                {focusState.taskTitle || FOCUS_PRESETS[focusState.mode].label}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleFocusRunning}
              aria-label={focusState.running ? 'إيقاف مؤقت' : 'استكمال التركيز'}
              className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center transition-colors"
            >
              {focusState.running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={resetFocusTimer}
              aria-label="إعادة ضبط"
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{width: `${progressPct}%`}}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <Timer className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              وضع التركيز (بومودورو)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              النهارده:{' '}
              <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                {todayFocusMinutes}
              </span>{' '}
              دقيقة تركيز
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 p-1">
          {(['focus', 'short', 'break'] as FocusPresetMode[]).map((mode) => {
            const active = focusState.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setFocusPreset(mode)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {FOCUS_PRESETS[mode].label}
              </button>
            );
          })}
        </div>
      </div>

      {focusState.taskTitle && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-700/70">
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              المهمة الحالية
            </span>
            <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {focusState.taskTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={clearFocusTask}
            aria-label="فك ربط المهمة"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {focusState.lastCompletedNotice && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">{focusState.lastCompletedNotice}</span>
          </div>
          <button
            type="button"
            onClick={dismissFocusNotice}
            className="p-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="flex items-baseline gap-3">
          <span
            dir="ltr"
            className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums"
          >
            {formatSeconds(focusState.secondsLeft)}
          </span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {focusState.running
              ? FOCUS_PRESETS[focusState.mode].isBreak
                ? 'وقت راحة...'
                : 'شغّال تركيز...'
              : 'جاهز للبدء'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={toggleFocusRunning}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[40px] rounded-xl bg-accent text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            {focusState.running ? (
              <>
                <Pause className="w-4 h-4" />
                <span>إيقاف مؤقت</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>{elapsedSeconds > 0 ? 'كمّل' : 'ابدأ'}</span>
              </>
            )}
          </button>

          {elapsedSeconds >= 60 && !FOCUS_PRESETS[focusState.mode].isBreak && (
            <button
              type="button"
              onClick={completeFocusEarly}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[40px] rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition-colors whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>سجّل الوقت</span>
            </button>
          )}

          <button
            type="button"
            onClick={resetFocusTimer}
            aria-label="إعادة ضبط المؤقت"
            className="inline-flex items-center justify-center gap-1 px-3 py-2.5 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            <span>إعادة</span>
          </button>
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{width: `${progressPct}%`}}
        />
      </div>
    </div>
  );
};
