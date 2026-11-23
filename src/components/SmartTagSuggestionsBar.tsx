import React from 'react';
import {Lightbulb, Plus, X} from 'lucide-react';
import type {SmartTagSuggestion} from '../storage/smartTagSuggestions';

interface SmartTagSuggestionsBarProps {
  suggestions: SmartTagSuggestion[];
  onAcceptTag: (suggestion: SmartTagSuggestion) => void;
  onAcceptAll?: () => void;
  onDismissTag?: (tag: string) => void;
}

export const SmartTagSuggestionsBar: React.FC<SmartTagSuggestionsBarProps> = ({
  suggestions,
  onAcceptTag,
  onAcceptAll,
  onDismissTag,
}) => {
  if (suggestions.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="اقتراحات تصنيف تلقائية"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft/45 px-3 py-2 text-xs"
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-accent">
        <Lightbulb className="h-3.5 w-3.5 shrink-0" />
        <span>اقتراح تلقائي:</span>
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {suggestions.map((item) => (
          <div
            key={item.tag}
            className="inline-flex items-center overflow-hidden rounded-lg border border-accent/40 bg-white dark:bg-slate-900"
          >
            <button
              type="button"
              onClick={() => onAcceptTag(item)}
              title={`مقترح تلقائياً بسبب كلمة «${item.matchedKeyword}»`}
              className="inline-flex min-h-[30px] items-center gap-1.5 whitespace-nowrap px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white dark:hover:bg-accent dark:hover:text-white"
            >
              <Plus className="h-3 w-3 shrink-0" />
              <span>#{item.tag}</span>
              <span className="text-[10px] font-normal opacity-75">
                ({item.matchedKeyword})
              </span>
              {item.isNewTag && (
                <span className="text-[10px] font-normal opacity-75">· جديد</span>
              )}
            </button>

            {onDismissTag && (
              <button
                type="button"
                onClick={() => onDismissTag(item.tag)}
                aria-label={`تجاهل اقتراح ${item.tag}`}
                title="تجاهل الاقتراح"
                className="flex min-h-[30px] min-w-[26px] items-center justify-center border-s border-accent/25 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        {suggestions.length > 1 && onAcceptAll && (
          <button
            type="button"
            onClick={onAcceptAll}
            className="min-h-[30px] whitespace-nowrap rounded-lg px-2 text-[11px] font-semibold text-accent hover:underline"
          >
            تطبيق الكل
          </button>
        )}
      </div>
    </div>
  );
};
