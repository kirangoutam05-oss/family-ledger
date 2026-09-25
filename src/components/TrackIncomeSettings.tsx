import React, { useState } from 'react';
import { Wallet } from 'lucide-react';

interface TrackIncomeSettingsProps {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}

// Some households want a ledger that answers "what did we spend?" and nothing
// more; putting salary into it just adds a number they never asked for. This
// turns money in off everywhere at once — the Overview card stops showing it,
// and logging an expense stops offering the Money In option — rather than
// leaving people to ignore a feature they don't want.
//
// Existing credits are kept either way. Turning this off hides income from
// the summaries, it does not delete anything, so switching back restores the
// figures rather than rebuilding them.
export const TrackIncomeSettings: React.FC<TrackIncomeSettingsProps> = ({ enabled, onChange }) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onChange(!enabled);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Track money in</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {enabled
                ? 'Salary and other income count towards what you have left'
                : 'Spending only — income is hidden from the summaries'}
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Track money in"
          disabled={isSaving}
          onClick={handleToggle}
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
            enabled ? 'bg-[#9333EA]' : 'bg-black/10 dark:bg-white/20'
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
              enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {!enabled && (
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
          Any income already recorded is kept, just not shown. Turn this back on
          to see it again.
        </p>
      )}
    </div>
  );
};
