import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle2, HandCoins } from 'lucide-react';
import { Transaction, SpenderId, CategoryId, LedgerState } from '../types';
import { getCategoryIcon, getPaymentModeLabel } from '../utils/helpers';

interface AddTransactionModalProps {
  onClose: () => void;
  ledger: LedgerState;
  onAddTransaction: (transaction: Transaction) => Promise<void>;
  authenticatedUser: SpenderId;
  onFlagPendingAck: (pending: {
    title: string;
    amount: number;
    category: CategoryId;
    paymentMode: Transaction['paymentMode'];
    notes?: string;
    bankName?: string;
    date: string;
    paidBy: SpenderId;
    paidFor: SpenderId;
  }) => Promise<void>;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  onClose,
  ledger,
  onAddTransaction,
  authenticatedUser,
  onFlagPendingAck,
}) => {
  const { categories, husbandName, wifeName, currency } = ledger;
  const otherSpender: SpenderId = authenticatedUser === 'husband' ? 'wife' : 'husband';
  const otherName = otherSpender === 'husband' ? husbandName : wifeName;

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState<CategoryId>('groceries');
  const [paymentMode, setPaymentMode] = useState<Transaction['paymentMode']>('UPI');
  const [txType, setTxType] = useState<'debit' | 'credit'>('debit');
  const [isRecurring, setIsRecurring] = useState(false);
  const [notes, setNotes] = useState('');
  const [dateStr, setDateStr] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [timeStr, setTimeStr] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [paidForOther, setPaidForOther] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amount || Number(amount) <= 0) return;

    setIsSubmitting(true);

    const enteredDate = dateStr && timeStr ? new Date(`${dateStr}T${timeStr}:00`) : new Date();
    const isoDate = isNaN(enteredDate.getTime()) ? new Date().toISOString() : enteredDate.toISOString();

    try {
      if (paidForOther && txType === 'debit') {
        await onFlagPendingAck({
          title: title.trim(),
          amount: Number(amount),
          category,
          paymentMode,
          bankName: paymentMode === 'UPI' ? 'GPay UPI' : 'Card',
          notes: notes.trim() || undefined,
          date: isoDate,
          paidBy: authenticatedUser,
          paidFor: otherSpender,
        });
      } else {
        const newTx: Transaction = {
          id: `tx-manual-${Date.now()}`,
          title: title.trim(),
          amount: Number(amount),
          type: txType,
          date: isoDate,
          spender: authenticatedUser,
          category,
          paymentMode,
          bankName: txType === 'credit' ? undefined : paymentMode === 'UPI' ? 'GPay UPI' : 'Card',
          status: 'verified',
          notes: notes.trim(),
          isRecurring: isRecurring || undefined,
        };
        await onAddTransaction(newTx);
      }
      onClose();
    } catch (err) {
      console.error('Failed to add transaction:', err);
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
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="glass-sheet rounded-[28px] max-w-md w-full p-6 border border-black/[0.06] dark:border-white/[0.1] space-y-4 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
            {txType === 'credit' ? 'Log Household Income' : 'Log New Household Expense'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Money out vs money in. Until now this modal could only create a
              debit, so income could be recorded solely through the SMS parser
              - salary, refunds and transfers had no manual route in at all. */}
          <div className="p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex">
            {(['debit', 'credit'] as const).map((t) => {
              const active = txType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTxType(t);
                    if (t === 'credit') setPaidForOther(false);
                  }}
                  aria-pressed={active}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? t === 'credit'
                        ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  {t === 'debit' ? 'Money Out' : 'Money In'}
                </button>
              );
            })}
          </div>

          {/* Amount & Title */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 block mb-1">
              Amount ({currency})
            </label>
            <input
              type="number"
              required
              min="1"
              step="1"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full text-2xl font-black px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500 block mb-1">
              {txType === 'credit' ? 'Source of Income' : 'Payee or Expense Title'}
            </label>
            <input
              type="text"
              required
              placeholder={txType === 'credit' ? 'e.g. Salary, Refund, Transfer from savings' : 'e.g. Blue Tokai Coffee, DMart Weekly, Wifi Bill'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-11 text-xs font-medium px-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date & Time — stacked full-width rather than a 2-column grid.
              iOS Safari's native date/time controls have their own internal
              minimum render width that ignores min-width/width styling, so a
              side-by-side layout can overflow its box on a real device even
              when it measures fine in a desktop browser; stacking guarantees
              each control gets the full available width no matter how wide
              the OS renders it. */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-neutral-500 block mb-1">Date</label>
              <input
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full h-11 text-xs font-medium px-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500 block mb-1">Time</label>
              <input
                type="time"
                required
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full h-11 text-xs font-medium px-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Paid By - Authenticated Spender */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 block mb-1">
              {txType === 'credit' ? 'Received By (Your Authenticated Account)' : 'Paid By (Your Authenticated Account)'}
            </label>
            <div className="p-3 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-neutral-50 dark:bg-neutral-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-3 h-3 rounded-full ${
                    authenticatedUser === 'husband' ? 'bg-blue-500' : 'bg-purple-500'
                  }`}
                />
                <div>
                  <span className="text-xs font-bold text-neutral-900 dark:text-white block leading-tight">
                    {authenticatedUser === 'husband' ? husbandName : wifeName}
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Logged in • Only the paying spouse can log their own expenses
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                Verified
              </span>
            </div>
          </div>

          {/* Paid for the other spouse — held aside until they acknowledge
              it, instead of landing straight in the ledger under your name.
              Hidden for money in: you cannot pay someone else's salary. */}
          {txType === 'debit' && (
          <button
            type="button"
            onClick={() => setPaidForOther((v) => !v)}
            className={`w-full p-3 rounded-xl border flex items-center gap-2.5 text-left transition-colors ${
              paidForOther
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/80'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                paidForOther ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' : 'bg-black/5 dark:bg-white/10 text-neutral-500'
              }`}
            >
              <HandCoins className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-neutral-900 dark:text-white block leading-tight">
                This was actually for {otherName}
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Held until {otherName} acknowledges it — then it counts as their spend
              </span>
            </div>
            <div
              className={`w-9 h-5 rounded-full shrink-0 relative transition-colors ${
                paidForOther ? 'bg-amber-500' : 'bg-black/10 dark:bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                  paidForOther ? 'left-4' : 'left-0.5'
                }`}
              />
            </div>
          </button>
          )}

          {/* Category Selector Grid */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 block mb-2">
              Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories
                .filter((c) => c.id !== 'grey_area')
                .map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`min-h-[48px] p-2.5 rounded-xl border text-left flex items-center gap-2 bg-white dark:bg-neutral-800 transition-all ${
                        isSelected
                          ? 'ring-2 ring-blue-500 border-blue-200 dark:border-blue-800 shadow-xs'
                          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: cat.color }}
                      >
                        {getCategoryIcon(cat.icon, 'w-3 h-3')}
                      </div>
                      <span className="min-w-0 text-[11px] font-semibold leading-tight text-neutral-900 dark:text-white">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Payment Mode */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 block mb-1">
              Payment Mode
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'PayLater', 'Pluxee'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`py-1.5 px-2 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap ${
                    paymentMode === mode
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {getPaymentModeLabel(mode)}
                </button>
              ))}
            </div>
          </div>

          {!paidForOther && (
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                  This repeats every month
                </div>
                <div className="text-[10.5px] text-neutral-400 mt-0.5">
                  We'll flag it as recurring and remind you before it's due again
                </div>
              </div>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 accent-[#9333EA] shrink-0"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !amount}
            className={`w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-50 ${
              paidForOther ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#9333EA] hover:bg-[#7E22CE]'
            }`}
          >
            {paidForOther ? <HandCoins className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{paidForOther ? `Send to ${otherName} for Acknowledgement` : 'Add Transaction & Sync'}</span>
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};
