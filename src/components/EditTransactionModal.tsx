import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Lock,
  Trash2,
  Save,
  CheckCircle2,
  ShieldAlert,
  UserCheck,
  CreditCard,
  Tag,
  FileText,
} from 'lucide-react';
import { Transaction, Category, SpenderId, CategoryId } from '../types';
import { formatCurrency, formatDate, getCategoryIcon, getPaymentModeLabel } from '../utils/helpers';

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  authenticatedUser: SpenderId;
  husbandName: string;
  wifeName: string;
  currency: string;
  categories: Category[];
  onSave: (transactionId: string, updates: Partial<Transaction>) => Promise<void>;
  onDelete: (transactionId: string) => Promise<void>;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  isOpen,
  onClose,
  transaction,
  authenticatedUser,
  husbandName,
  wifeName,
  currency,
  categories,
  onSave,
  onDelete,
}) => {
  if (!isOpen || !transaction) return null;

  const isOwner = transaction.spender === authenticatedUser;
  const ownerName = transaction.spender === 'husband' ? husbandName : wifeName;
  const currentUserName = authenticatedUser === 'husband' ? husbandName : wifeName;

  const pad = (n: number) => String(n).padStart(2, '0');
  const toDateTimeStrs = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return {
        dateStr: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        timeStr: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      };
    }
    return {
      dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      timeStr: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  };

  // Form states
  const [title, setTitle] = useState(transaction.title);
  const [amount, setAmount] = useState<number | ''>(transaction.amount);
  const [category, setCategory] = useState<CategoryId>(transaction.category);
  const [paymentMode, setPaymentMode] = useState<Transaction['paymentMode']>(
    transaction.paymentMode
  );
  const [isRecurring, setIsRecurring] = useState(transaction.isRecurring || false);
  const [notes, setNotes] = useState(transaction.notes || '');
  const [dateStr, setDateStr] = useState(() => toDateTimeStrs(transaction.date).dateStr);
  const [timeStr, setTimeStr] = useState(() => toDateTimeStrs(transaction.date).timeStr);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state when transaction changes
  useEffect(() => {
    if (transaction) {
      setTitle(transaction.title);
      setAmount(transaction.amount);
      setCategory(transaction.category);
      setPaymentMode(transaction.paymentMode);
      setIsRecurring(transaction.isRecurring || false);
      setNotes(transaction.notes || '');
      const { dateStr: d, timeStr: t } = toDateTimeStrs(transaction.date);
      setDateStr(d);
      setTimeStr(t);
      setShowDeleteConfirm(false);
      setErrorMsg(null);
    }
  }, [transaction]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      setErrorMsg(`Access Denied: Only ${ownerName} can edit this expense.`);
      return;
    }

    if (!title.trim() || !amount || Number(amount) <= 0) {
      setErrorMsg('Please enter a valid title and positive amount.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const enteredDate = dateStr && timeStr ? new Date(`${dateStr}T${timeStr}:00`) : null;
      const isoDate = enteredDate && !isNaN(enteredDate.getTime()) ? enteredDate.toISOString() : undefined;

      await onSave(transaction.id, {
        title: title.trim(),
        amount: Number(amount),
        category,
        paymentMode,
        isRecurring,
        notes: notes.trim() || undefined,
        ...(isoDate ? { date: isoDate } : {}),
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwner) {
      setErrorMsg(`Access Denied: Only ${ownerName} can delete this expense.`);
      return;
    }

    setIsDeleting(true);
    setErrorMsg(null);

    try {
      await onDelete(transaction.id);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete expense.');
    } finally {
      setIsDeleting(false);
    }
  };

  const currentCategory = categories.find((c) => c.id === (isOwner ? category : transaction.category)) || categories[0];

  return (
    <>
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
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.05] dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isOwner ? 'bg-[#9333EA]/10 text-[#9333EA]' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              {isOwner ? <UserCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <span>{isOwner ? 'Edit Your Expense' : 'Expense Details'}</span>
                {!isOwner && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                    Read-Only
                  </span>
                )}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {isOwner
                  ? `Logged by you (${currentUserName})`
                  : `Logged by ${ownerName} • Protected`}
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

        {/* Security Ownership Banner */}
        {!isOwner ? (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                You cannot edit {ownerName}'s expenses
              </p>
              <p className="text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                You are currently signed in as <span className="font-semibold">{currentUserName}</span> on this device. To preserve financial integrity and personal accounting trust, couple expenses can only be edited or deleted by the spouse who logged them — ask {ownerName} to make this change on their own phone.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-lg bg-[#9333EA]/10 border border-[#9333EA]/20 flex items-center gap-2 text-xs text-[#9333EA] font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>You own this transaction and have full permission to modify or delete it.</span>
          </div>
        )}

        {/* Form or Read-Only Cards */}
        {isOwner ? (
          <form onSubmit={handleSave} className="space-y-4">
            {/* Title */}
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

            {/* Amount */}
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

            {/* Date & Time — stacked full-width, not a 2-column grid: iOS
                Safari's native date/time controls carry their own internal
                minimum render width that ignores min-width/width styling, so
                a side-by-side layout can still overflow on a real device
                even after measuring fine in a desktop browser. Stacking
                guarantees each control gets the full available width. */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#9333EA]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Time
                </label>
                <input
                  type="time"
                  required
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#9333EA]"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Category
              </label>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((cat) => (
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

            {/* Payment Mode */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Payment Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'Pluxee'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`py-2 rounded-xl border text-xs font-medium transition-all whitespace-nowrap ${
                      paymentMode === mode
                        ? 'border-[#9333EA] bg-blue-50/50 dark:bg-blue-950/30 text-[#9333EA] font-semibold'
                        : 'border-black/[0.06] dark:border-white/[0.06] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {getPaymentModeLabel(mode)}
                  </button>
                ))}
              </div>
            </div>

            {/* Recurring */}
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-black/[0.06] dark:border-white/[0.06] cursor-pointer">
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

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Notes & Context
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Dinner with college friends"
                className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons — compact icon+label; the top-right X already
                covers "cancel", so this row only needs the two real
                decisions. Delete opens a real confirmation pop-up rather
                than swapping in place, since destroying data deserves a
                harder stop. */}
            <div className="pt-3 flex items-center gap-3 border-t border-black/[0.05] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete expense"
                className="flex-1 h-12 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                title="Save changes"
                className="flex-1 h-12 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] active:scale-95 text-white shadow-md flex items-center justify-center gap-1.5 text-sm font-semibold transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Saving…' : 'Save'}</span>
              </button>
            </div>
          </form>
        ) : (
          /* READ-ONLY VIEW */
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/70 border border-black/[0.04] dark:border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-neutral-900 dark:text-white">
                    {transaction.title}
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {formatDate(transaction.date)} • {getPaymentModeLabel(transaction.paymentMode)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-neutral-900 dark:text-white">
                    {formatCurrency(transaction.amount, currency)}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {currentCategory.name}
                  </div>
                </div>
              </div>

              {/* Grid details */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-black/[0.04] dark:border-white/[0.06] text-xs">
                <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                  <Tag className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Category: {currentCategory.name}</span>
                </div>
                {transaction.bankName && (
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                    <CreditCard className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Bank: {transaction.bankName}</span>
                  </div>
                )}
                {transaction.upiRef && (
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                    <FileText className="w-3.5 h-3.5 text-neutral-400" />
                    <span>UPI Ref: {transaction.upiRef}</span>
                  </div>
                )}
              </div>

              {transaction.notes && (
                <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.06] text-xs">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Notes: </span>
                  <span className="italic text-neutral-600 dark:text-neutral-400">{transaction.notes}</span>
                </div>
              )}
            </div>

            {/* Read-Only Notice */}
            <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-neutral-400" />
                <span>Editing is restricted to the expense author ({ownerName}).</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-900 dark:text-white text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>

    {/* Delete confirmation — a real pop-up above the edit modal, rather
        than swapping the trigger button in place. */}
    {showDeleteConfirm && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && setShowDeleteConfirm(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="glass-sheet rounded-[24px] max-w-xs w-full p-5 border border-black/[0.06] dark:border-white/[0.1] space-y-4 text-center"
        >
          <div className="w-11 h-11 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Delete this expense?</h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              "{transaction.title}" ({formatCurrency(transaction.amount, currency)}) will be removed for good. This can't be undone.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2.5 rounded-lg border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
    </>
  );
};
