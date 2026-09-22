import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, HandCoins, Check, XCircle, ShieldAlert } from 'lucide-react';
import { LedgerState, PendingAcknowledgement, CategoryId } from '../types';
import { formatCurrency, getCategoryIcon } from '../utils/helpers';

interface PendingAckModalProps {
  pending: PendingAcknowledgement;
  ledger: LedgerState;
  onClose: () => void;
  onAccept: (
    id: string,
    updates?: { title?: string; amount?: number; category?: CategoryId; notes?: string; date?: string }
  ) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

export const PendingAckModal: React.FC<PendingAckModalProps> = ({ pending, ledger, onClose, onAccept, onReject }) => {
  const { categories, husbandName, wifeName, currency } = ledger;
  const payerName = pending.paidBy === 'husband' ? husbandName : wifeName;
  const recipientName = pending.paidFor === 'husband' ? husbandName : wifeName;

  const pad = (n: number) => String(n).padStart(2, '0');
  const toDateTimeStrs = (iso: string) => {
    const d = new Date(iso);
    const safe = isNaN(d.getTime()) ? new Date() : d;
    return {
      dateStr: `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}`,
      timeStr: `${pad(safe.getHours())}:${pad(safe.getMinutes())}`,
    };
  };
  const initial = toDateTimeStrs(pending.date);

  const [title, setTitle] = useState(pending.title);
  const [amount, setAmount] = useState<number | ''>(pending.amount);
  const [category, setCategory] = useState<CategoryId>(pending.category);
  const [notes, setNotes] = useState(pending.notes || '');
  const [dateStr, setDateStr] = useState(initial.dateStr);
  const [timeStr, setTimeStr] = useState(initial.timeStr);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentCategory = categories.find((c) => c.id === category) || categories[0];

  const handleAccept = async () => {
    if (!title.trim() || !amount || Number(amount) <= 0) {
      setErrorMsg('Please enter a valid title and positive amount.');
      return;
    }
    setErrorMsg(null);
    setIsAccepting(true);
    try {
      const combined = new Date(`${dateStr}T${timeStr}:00`);
      await onAccept(pending.id, {
        title: title.trim(),
        amount: Number(amount),
        category,
        notes: notes.trim() || undefined,
        date: isNaN(combined.getTime()) ? undefined : combined.toISOString(),
      });
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject(pending.id);
    } finally {
      setIsRejecting(false);
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
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">{payerName} paid for you</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Review it, then accept to add it to your spending
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

        <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 font-medium">
          <HandCoins className="w-4 h-4 shrink-0" />
          <span>
            Accepting adds this to <strong>{recipientName}'s</strong> spend. Rejecting removes it — {payerName} won't be
            notified, so let them know if it was a mistake.
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Expense Title / Merchant
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-[#9333EA]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Amount ({currency})
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-semibold text-sm">
                {currency}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="w-full pl-8 pr-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>
          </div>

          {/* Date & Time — stacked full-width, not a 2-column grid: native
              date/time controls carry their own internal minimum render
              width that can overflow a narrow column on a real device. */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Date</label>
              <input
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Time</label>
              <input
                type="time"
                required
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {categories
                .filter((c) => c.id !== 'grey_area')
                .map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`min-h-[48px] p-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 bg-white dark:bg-neutral-800 transition-all ${
                      category === cat.id
                        ? 'ring-2 ring-[#9333EA] border-blue-200 dark:border-blue-800 text-[#9333EA]'
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
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Notes & Context
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-[#9333EA]"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-3 flex items-center justify-between gap-3 border-t border-black/[0.05] dark:border-white/[0.08]">
            {!showRejectConfirm ? (
              <button
                type="button"
                onClick={() => setShowRejectConfirm(true)}
                className="px-3.5 py-2.5 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isRejecting}
                  className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isRejecting ? 'Rejecting...' : 'Confirm Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectConfirm(false)}
                  className="px-2.5 py-2 rounded-lg border border-black/10 dark:border-white/10 text-xs text-neutral-500"
                >
                  Cancel
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleAccept}
              disabled={isAccepting}
              className="px-5 py-2.5 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] active:scale-95 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isAccepting ? 'Accepting...' : 'Accept & Add'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
