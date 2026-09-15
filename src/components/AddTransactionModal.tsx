import React, { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { Transaction, SpenderId, CategoryId, LedgerState } from '../types';
import { getCategoryIcon } from '../utils/helpers';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledger: LedgerState;
  onAddTransaction: (transaction: Transaction) => Promise<void>;
  authenticatedUser: SpenderId;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  ledger,
  onAddTransaction,
  authenticatedUser,
}) => {
  const { categories, husbandName, wifeName, currency } = ledger;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState<CategoryId>('groceries');
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'Card' | 'NetBanking' | 'Cash'>('UPI');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amount || Number(amount) <= 0) return;

    setIsSubmitting(true);

    const newTx: Transaction = {
      id: `tx-manual-${Date.now()}`,
      title: title.trim(),
      amount: Number(amount),
      type: 'debit',
      date: new Date().toISOString(),
      spender: authenticatedUser,
      category,
      paymentMode,
      bankName: paymentMode === 'UPI' ? 'GPay UPI' : 'Card',
      status: 'verified',
      notes: notes.trim(),
    };

    try {
      await onAddTransaction(newTx);
      onClose();
    } catch (err) {
      console.error('Failed to add transaction:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-md w-full p-6 border border-black/[0.08] dark:border-white/[0.08] shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
            Log New Family Expense
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              Payee or Expense Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Blue Tokai Coffee, DMart Weekly, Wifi Bill"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs font-medium px-3.5 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Paid By - Authenticated Spender */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 block mb-1">
              Paid By (Your Authenticated Account)
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

          {/* Category Selector Grid */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 block mb-1">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto pr-1">
              {categories
                .filter((c) => c.id !== 'grey_area')
                .map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                        isSelected
                          ? 'ring-2 ring-blue-500 bg-white dark:bg-neutral-800 shadow-xs'
                          : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40 text-neutral-700 dark:text-neutral-300'
                      } ${cat.badgeBorder}`}
                    >
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: cat.color }}
                      >
                        {getCategoryIcon(cat.icon, 'w-3 h-3')}
                      </div>
                      <span className="truncate text-[11px] font-semibold">
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
            <div className="grid grid-cols-4 gap-1.5">
              {(['UPI', 'Card', 'NetBanking', 'Cash'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`py-1.5 px-2 rounded-xl border text-xs font-medium transition-colors ${
                    paymentMode === mode
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !amount}
            className="w-full py-2.5 rounded-xl bg-[#007AFF] hover:bg-blue-600 text-white text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Add Transaction & Sync</span>
          </button>
        </form>
      </div>
    </div>
  );
};
