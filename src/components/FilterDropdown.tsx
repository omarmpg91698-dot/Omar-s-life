import React, {useEffect, useId, useRef, useState} from 'react';
import {Check, ChevronDown} from 'lucide-react';

export interface FilterDropdownOption {
  value: string;
  label: string;
  count?: number;
  dotClass?: string;
  icon?: React.ReactNode;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  defaultValue?: string;
  ariaLabel?: string;
  className?: string;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  value,
  options,
  onChange,
  icon,
  defaultValue = 'الكل',
  ariaLabel,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value) ?? options[0];
  const isFiltered = value !== defaultValue;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, {passive: true});
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel ?? `${label}: ${selectedOption?.label ?? ''}`}
        className={`inline-flex min-h-[38px] items-center justify-between gap-2 rounded-xl border px-3 text-xs font-medium transition-colors whitespace-nowrap ${
          isFiltered
            ? 'border-accent bg-accent-soft text-accent dark:border-accent dark:bg-accent-soft/80 dark:text-accent'
            : open
              ? 'border-accent bg-white text-slate-900 dark:border-accent dark:bg-slate-900 dark:text-slate-100'
              : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="text-slate-500 dark:text-slate-400">{label}:</span>
          {selectedOption?.dotClass && (
            <span className={`h-2 w-2 shrink-0 rounded-full ${selectedOption.dotClass}`} />
          )}
          <span
            className={`font-semibold ${
              isFiltered ? 'text-accent' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {selectedOption?.label ?? value}
          </span>
          {selectedOption?.count !== undefined && (
            <span className="font-mono text-[11px] opacity-80 tabular-nums">
              ({selectedOption.count})
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel ?? label}
          className="absolute start-0 top-full z-40 mt-1.5 max-h-64 min-w-[210px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex min-h-[36px] w-full items-center justify-between gap-3 rounded-lg px-2.5 text-start text-xs font-medium transition-colors ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {opt.dotClass && (
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        active ? 'bg-white' : opt.dotClass
                      }`}
                    />
                  )}
                  {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {opt.count !== undefined && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        active ? 'text-white/90' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      ({opt.count})
                    </span>
                  )}
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
