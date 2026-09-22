import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';

type Period = 'month' | 'year' | 'all';

interface CategoryPeriodSettingsProps {
  period: Period;
  onChange: (period: Period) => Promise<void>;
}

const OPTIONS: { value: Period; label: string }[] = [
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

// A shared household setting (both partners see the same view) for how far
// back the Overview tab's "Amount vs Category" card sums spending.
export const CategoryPeriodSettings: React.FC<CategoryPeriodSettingsProps> = ({ period, onChange }) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleSelect = async (value: Period) => {
    if (value === period || isSaving) return;
    setIsSaving(true);
    try {
      await onChange(value);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shrink-0">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900 dark:text-white">Amount vs Category window</div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            How far back the Category tab's spending bars sum up
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={isSaving}
            onClick={() => handleSelect(opt.value)}
            className={`py-2 rounded-xl border text-xs font-semibold transition-all disabled:opacity-50 ${
              period === opt.value
                ? 'bg-[#9333EA] border-[#9333EA] text-white shadow-xs'
                : 'border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};
