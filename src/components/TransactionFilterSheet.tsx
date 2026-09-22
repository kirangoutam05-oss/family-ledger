import React from 'react';
import { motion } from 'motion/react';
import { X, RotateCcw } from 'lucide-react';
import { Category, SpenderId } from '../types';
import { getCategoryIcon, getPaymentModeLabel } from '../utils/helpers';

export type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export interface TransactionFilters {
  categories: string[];
  paymentModes: string[];
  type: 'all' | 'debit' | 'credit';
  spender: 'all' | SpenderId;
  dateFrom: string;
  dateTo: string;
  sortBy: SortOption;
}

export const EMPTY_FILTERS: TransactionFilters = {
  categories: [],
  paymentModes: [],
  type: 'all',
  spender: 'all',
  dateFrom: '',
  dateTo: '',
  sortBy: 'date_desc',
};

export function countActiveFilters(f: TransactionFilters): number {
  let n = 0;
  if (f.categories.length > 0) n++;
  if (f.paymentModes.length > 0) n++;
  if (f.type !== 'all') n++;
  if (f.spender !== 'all') n++;
  if (f.dateFrom || f.dateTo) n++;
  return n;
}

const PAYMENT_MODES = ['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'Pluxee'] as const;

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: 'date_desc', label: 'Newest first' },
  { id: 'date_asc', label: 'Oldest first' },
  { id: 'amount_desc', label: 'Amount: High to low' },
  { id: 'amount_asc', label: 'Amount: Low to high' },
];

interface TransactionFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  isShared: boolean;
  husbandName: string;
  wifeName: string;
}

export const TransactionFilterSheet: React.FC<TransactionFilterSheetProps> = ({
  isOpen,
  onClose,
  categories,
  filters,
  onChange,
  isShared,
  husbandName,
  wifeName,
}) => {
  if (!isOpen) return null;

  const toggleCategory = (id: string) => {
    const has = filters.categories.includes(id);
    onChange({
      ...filters,
      categories: has ? filters.categories.filter((c) => c !== id) : [...filters.categories, id],
    });
  };

  const togglePaymentMode = (mode: string) => {
    const has = filters.paymentModes.includes(mode);
    onChange({
      ...filters,
      paymentModes: has ? filters.paymentModes.filter((m) => m !== mode) : [...filters.paymentModes, mode],
    });
  };

  const activeCount = countActiveFilters(filters);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="glass-sheet rounded-t-[28px] sm:rounded-[28px] max-w-md w-full p-6 border border-black/[0.06] dark:border-white/[0.1] space-y-5 max-h-[88dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white leading-tight">
              Filter & Sort
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Narrow down and order the transaction list
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sort */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Sort by</label>
          <div className="grid grid-cols-2 gap-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ ...filters, sortBy: opt.id })}
                className={`px-2.5 py-2 rounded-xl text-[11px] font-medium text-left transition-colors ${
                  filters.sortBy === opt.id
                    ? 'bg-[#9333EA] text-white'
                    : 'bg-black/[0.04] dark:bg-white/[0.06] text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Type</label>
          <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-xl text-[11px] font-medium">
            {(['all', 'debit', 'credit'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...filters, type: t })}
                className={`flex-1 py-1.5 rounded-lg capitalize transition-colors ${
                  filters.type === t
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {t === 'all' ? 'All' : t === 'debit' ? 'Money Out' : 'Money In'}
              </button>
            ))}
          </div>
        </div>

        {/* Spender — only meaningful in the shared/household view */}
        {isShared && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Paid by</label>
            <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-xl text-[11px] font-medium">
              {(['all', 'husband', 'wife'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...filters, spender: s })}
                  className={`flex-1 py-1.5 rounded-lg truncate px-1 transition-colors ${
                    filters.spender === s
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                      : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  {s === 'all' ? 'Everyone' : s === 'husband' ? husbandName : wifeName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category multi-select */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const active = filters.categories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition-colors ${
                    active
                      ? 'text-white border-transparent'
                      : 'bg-black/[0.03] dark:bg-white/[0.05] border-black/[0.06] dark:border-white/[0.08] text-neutral-600 dark:text-neutral-300'
                  }`}
                  style={active ? { backgroundColor: cat.color } : undefined}
                >
                  {getCategoryIcon(cat.icon, 'w-3 h-3')}
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment mode multi-select */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Payment mode</label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_MODES.map((mode) => {
              const active = filters.paymentModes.includes(mode);
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => togglePaymentMode(mode)}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                    active
                      ? 'bg-[#9333EA] text-white border-transparent'
                      : 'bg-black/[0.03] dark:bg-white/[0.05] border-black/[0.06] dark:border-white/[0.08] text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {getPaymentModeLabel(mode)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date range — stacked, not side-by-side: native date inputs carry
            their own internal minimum width that can overflow a narrow
            column on a real device regardless of min-width/width styling. */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Date range</label>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-xs text-neutral-900 dark:text-white border-none focus:ring-1 focus:ring-[#9333EA] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-xs text-neutral-900 dark:text-white border-none focus:ring-1 focus:ring-[#9333EA] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            disabled={activeCount === 0 && filters.sortBy === 'date_desc'}
            className="flex-1 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-neutral-600 dark:text-neutral-300 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.97] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-[#9333EA] text-white text-xs font-semibold active:scale-[0.97] transition-all"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
