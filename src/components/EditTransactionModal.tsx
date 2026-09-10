import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Trash2,
  Save,
  CheckCircle2,
  ShieldAlert,
  UserCheck,
  Calendar,
  CreditCard,
  Tag,
  FileText,
  Percent,
} from 'lucide-react';
import { Transaction, Category, SpenderId, CategoryId } from '../types';
import { formatCurrency, formatDate, getCategoryIcon } from '../utils/helpers';

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
  onSwitchUser?: () => void;
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
  onSwitchUser,
}) => {
  if (!isOpen || !transaction) return null;

  const isOwner = transaction.spender === authenticatedUser;
  const ownerName = transaction.spender === 'husband' ? husbandName : wifeName;
  const currentUserName = authenticatedUser === 'husband' ? husbandName : wifeName;

  // Form states
  const [title, setTitle] = useState(transaction.title);
  const [amount, setAmount] = useState<number | ''>(transaction.amount);
  const [category, setCategory] = useState<CategoryId>(transaction.category);
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'Card' | 'NetBanking' | 'Cash'>(
    transaction.paymentMode
  );
  const [splitType, setSplitType] = useState<'50-50' | 'husband-full' | 'wife-full' | 'custom'>(() => {
    const h = transaction.splitRatio?.husband ?? 50;
    if (h === 50) return '50-50';
    if (h === 100) return 'husband-full';
    if (h === 0) return 'wife-full';
    return 'custom';
  });
  const [customHusbandPercent, setCustomHusbandPercent] = useState<number>(
    transaction.splitRatio?.husband ?? 50
  );
  const [notes, setNotes] = useState(transaction.notes || '');
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
      const h = transaction.splitRatio?.husband ?? 50;
      if (h === 50) setSplitType('50-50');
      else if (h === 100) setSplitType('husband-full');
      else if (h === 0) setSplitType('wife-full');
      else setSplitType('custom');
      setCustomHusbandPercent(h);
      setNotes(transaction.notes || '');
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

    let hSplit = 50;
    if (splitType === 'husband-full') hSplit = 100;
    else if (splitType === 'wife-full') hSplit = 0;
    else if (splitType === 'custom') hSplit = customHusbandPercent;

    try {
      await onSave(transaction.id, {
        title: title.trim(),
        amount: Number(amount),
        category,
        paymentMode,
        splitRatio: {
          husband: hSplit,
          wife: 100 - hSplit,
        },
        notes: notes.trim() || undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 border border-black/[0.08] dark:border-white/[0.08] shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.05] dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isOwner ? 'bg-blue-500/10 text-[#007AFF]' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
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
                You are currently authenticated as <span className="font-semibold">{currentUserName}</span>. To preserve financial integrity and personal accounting trust, couple expenses can only be edited or deleted by the spouse who logged them.
              </p>
              {onSwitchUser && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchUser();
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] shadow-xs transition-colors"
                >
                  <Lock className="w-3 h-3" />
                  <span>Switch Account to {ownerName}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-2 text-xs text-[#007AFF] font-medium">
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
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]"
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
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Category
              </label>
              <div className="grid grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all ${
                      category === cat.id
                        ? 'border-[#007AFF] bg-blue-50/50 dark:bg-blue-950/30 text-[#007AFF]'
                        : 'border-black/[0.06] dark:border-white/[0.06] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-md flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: cat.color }}
                    >
                      {getCategoryIcon(cat.icon, 'w-2.5 h-2.5')}
                    </div>
                    <span className="truncate">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Split Ratio */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Split Ratio Between Couple
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSplitType('50-50')}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                    splitType === '50-50'
                      ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                      : 'border-black/[0.08] dark:border-white/[0.08] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  50 / 50 Shared
                </button>
                <button
                  type="button"
                  onClick={() => setSplitType('husband-full')}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                    splitType === 'husband-full'
                      ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                      : 'border-black/[0.08] dark:border-white/[0.08] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  100% {husbandName}
                </button>
                <button
                  type="button"
                  onClick={() => setSplitType('wife-full')}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                    splitType === 'wife-full'
                      ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                      : 'border-black/[0.08] dark:border-white/[0.08] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  100% {wifeName}
                </button>
                <button
                  type="button"
                  onClick={() => setSplitType('custom')}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                    splitType === 'custom'
                      ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                      : 'border-black/[0.08] dark:border-white/[0.08] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  Custom %
                </button>
              </div>

              {splitType === 'custom' && (
                <div className="mt-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-black/[0.04] dark:border-white/[0.06] space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-[#007AFF]">
                      {husbandName}: {customHusbandPercent}%
                    </span>
                    <span className="text-purple-500">
                      {wifeName}: {100 - customHusbandPercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={customHusbandPercent}
                    onChange={(e) => setCustomHusbandPercent(Number(e.target.value))}
                    className="w-full accent-[#007AFF]"
                  />
                </div>
              )}
            </div>

            {/* Payment Mode */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Payment Mode
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['UPI', 'Card', 'NetBanking', 'Cash'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                      paymentMode === mode
                        ? 'border-[#007AFF] bg-blue-50/50 dark:bg-blue-950/30 text-[#007AFF] font-semibold'
                        : 'border-black/[0.06] dark:border-white/[0.06] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

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
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]"
              />
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 flex items-center justify-between gap-3 border-t border-black/[0.05] dark:border-white/[0.08]">
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3.5 py-2.5 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Expense</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2.5 py-2 rounded-xl border border-black/10 dark:border-white/10 text-xs text-neutral-500"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] active:scale-95 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
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
                    {formatDate(transaction.date)} • {transaction.paymentMode}
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
                <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                  <Percent className="w-3.5 h-3.5 text-neutral-400" />
                  <span>
                    Split: {husbandName} {transaction.splitRatio?.husband}% / {wifeName}{' '}
                    {transaction.splitRatio?.wife}%
                  </span>
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
      </div>
    </div>
  );
};
