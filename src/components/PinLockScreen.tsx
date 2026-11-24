import React, {useEffect, useState} from 'react';
import {Delete, Lock, ShieldCheck} from 'lucide-react';
import {verifyLocalPin} from '../storage/productivityUtils';

interface PinLockScreenProps {
  expectedHash: string;
  userName: string;
  onUnlock: () => void;
}

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  expectedHash,
  userName,
  onUnlock,
}) => {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleDigit = (d: string) => {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    setError(null);
    if (next.length === 4) {
      if (verifyLocalPin(next, expectedHash)) {
        onUnlock();
      } else {
        setError('الرقم السري غلط، جرّب تاني.');
        window.setTimeout(() => {
          setDigits('');
        }, 350);
      }
    }
  };

  const handleBackspace = () => {
    setDigits((prev) => prev.slice(0, -1));
    setError(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4"
    >
      <div className="w-full max-w-xs rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl text-center space-y-6">
        <div className="space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
            أهلاً يا {userName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            اكتب الرقم السري (٤ أرقام) لفتح Omar&apos;s Life
          </p>
        </div>

        {/* 4 PIN dots */}
        <div className="flex items-center justify-center gap-3.5" dir="ltr">
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < digits.length;
            return (
              <span
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  error
                    ? 'border-rose-500 bg-rose-500/20'
                    : filled
                      ? 'border-accent bg-accent scale-110'
                      : 'border-slate-300 dark:border-slate-600 bg-transparent'
                }`}
              />
            );
          })}
        </div>

        {error ? (
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 min-h-[18px]">
            {error}
          </p>
        ) : (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 min-h-[18px] inline-flex items-center gap-1 justify-center">
            <ShieldCheck className="w-3.5 h-3.5" />
            بياناتك محمية محلياً على جهازك
          </p>
        )}

        {/* Numeric keypad */}
        <div className="grid grid-cols-3 gap-2.5" dir="ltr">
          {KEYPAD_DIGITS.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="h-14 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-xl font-bold text-slate-900 dark:text-white tabular-nums transition-all"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-xl font-bold text-slate-900 dark:text-white tabular-nums transition-all"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="مسح رقم"
            className="h-14 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-all"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
