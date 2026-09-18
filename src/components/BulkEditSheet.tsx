import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Layers, ShieldAlert } from 'lucide-react';
import { Category, CategoryId, PaymentMode } from '../types';
import { getCategoryIcon, getPaymentModeLabel } from '../utils/helpers';

type BulkField = 'category' | 'paymentMode';

interface BulkEditSheetProps {
  field: BulkField;
  count: number;
  categories: Category[];
  onApply: (value: CategoryId | PaymentMode) => Promise<void>;
  onClose: () => void;
}

// A focused single-field bulk editor — opened from the floating selection bar
// with the field already decided ("Change Category" or "Change Payment
// Mode"), so this only has to ask "to what?" rather than re-presenting the
// whole transaction form.
export const BulkEditSheet: React.FC<BulkEditSheetProps> = ({ field, count, categories, onApply, onClose }) => {
  const [value, setValue] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!value) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onApply(value as CategoryId | PaymentMode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transactions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="glass-sheet rounded-[28px] max-w-lg w-full p-6 border border-black/[0.06] dark:border-white/[0.1] space-y-5 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.05] dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/10 text-[#007AFF]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                {field === 'category' ? 'Change Category' : 'Change Payment Mode'}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Applies to {count} selected transaction{count === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {field === 'category' ? (
          <div className="grid grid-cols-2 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setValue(cat.id)}
                className={`min-h-[48px] p-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 bg-white dark:bg-neutral-800 transition-all ${
                  value === cat.id
                    ? 'ring-2 ring-[#007AFF] border-blue-200 dark:border-blue-800 text-[#007AFF]'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
              >
                <div
                  className="w-4 h-4 rounded-md flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: cat.color }}
                >
                  {getCategoryIcon(cat.icon, 'w-2.5 h-2.5')}
                </div>
                <span className="min-w-0 leading-tight text-left">{cat.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'Pluxee'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setValue(mode)}
                className={`py-2 rounded-xl border text-xs font-medium transition-all whitespace-nowrap ${
                  value === mode
                    ? 'border-[#007AFF] bg-blue-50/50 dark:bg-blue-950/30 text-[#007AFF] font-semibold'
                    : 'border-black/[0.06] dark:border-white/[0.06] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
              >
                {getPaymentModeLabel(mode)}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-3 flex items-center justify-end gap-2 border-t border-black/[0.05] dark:border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!value || isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] active:scale-95 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Applying…' : `Apply to ${count}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
