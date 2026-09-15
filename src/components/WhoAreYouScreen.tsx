import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { SpenderId } from '../types';

interface WhoAreYouScreenProps {
  familyName: string;
  husbandName: string;
  wifeName: string;
  onSelect: (role: SpenderId) => Promise<void>;
}

export const WhoAreYouScreen: React.FC<WhoAreYouScreenProps> = ({
  familyName,
  husbandName,
  wifeName,
  onSelect,
}) => {
  const [selected, setSelected] = useState<SpenderId | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    await onSelect(selected);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-16 h-16 rounded-[22px] overflow-hidden shadow-lg border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center">
            <img
              src="/app-logo.jpg?v=3"
              alt="Family Ledger Logo"
              className="w-full h-full object-cover object-center block"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{familyName}</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Which one of you is using this phone?
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSelected('husband')}
            className={`py-6 px-3 rounded-2xl border-2 text-base font-semibold transition-all ${
              selected === 'husband'
                ? 'border-[#007AFF] bg-blue-50 dark:bg-blue-950/30 text-[#007AFF]'
                : 'border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200'
            }`}
          >
            {husbandName}
          </button>
          <button
            type="button"
            onClick={() => setSelected('wife')}
            className={`py-6 px-3 rounded-2xl border-2 text-base font-semibold transition-all ${
              selected === 'wife'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 text-purple-600'
                : 'border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200'
            }`}
          >
            {wifeName}
          </button>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected || isSubmitting}
          className="w-full py-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
        >
          <span>{isSubmitting ? 'Setting up this phone…' : "That's me"}</span>
          {!isSubmitting && <ArrowRight className="w-4 h-4" />}
        </button>

        <p className="text-[11px] text-neutral-400">
          This device will remember your choice. You can switch anytime from the account menu.
        </p>
      </div>
    </div>
  );
};
