import React, { useState } from 'react';
import {
  HelpCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Transaction, CategoryId, LedgerState, SpenderId } from '../types';
import { formatCurrency, formatDate, getCategoryIcon } from '../utils/helpers';

interface GreyAreaQueueProps {
  ledger: LedgerState;
  authenticatedUser: SpenderId;
  onResolve: (transactionId: string, category: CategoryId, note?: string) => Promise<void>;
  focusedTransactionId?: string | null;
}

export const GreyAreaQueue: React.FC<GreyAreaQueueProps> = ({
  ledger,
  authenticatedUser,
  onResolve,
  focusedTransactionId,
}) => {
  const { transactions, categories, husbandName, wifeName, currency } = ledger;

  const greyAreaTransactions = transactions.filter((t) => t.status === 'grey_area');
  const resolvedTransactions = transactions.filter((t) => t.status === 'resolved');

  // Active transaction being resolved
  const [activeTxId, setActiveTxId] = useState<string | null>(
    focusedTransactionId || (greyAreaTransactions[0]?.id ?? null)
  );

  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('bills');
  const [contextNote, setContextNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeTx = transactions.find((t) => t.id === activeTxId);

  const handleOpenResolve = (tx: Transaction) => {
    setActiveTxId(tx.id);
    setSelectedCategory(tx.category !== 'grey_area' ? tx.category : 'bills');
    setContextNote(tx.notes || '');
  };

  const handleConfirmResolve = async () => {
    if (!activeTx) return;

    setIsSubmitting(true);
    try {
      await onResolve(activeTx.id, selectedCategory, contextNote);
      const remaining = greyAreaTransactions.filter((t) => t.id !== activeTx.id);
      setActiveTxId(remaining[0]?.id || null);
    } catch (err) {
      console.error('Failed to resolve context:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
            Context Queue
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Clarify ambiguous payees or personal transfers to keep balances accurate.
          </p>
        </div>
        {greyAreaTransactions.length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold">
            {greyAreaTransactions.length} Pending
          </span>
        )}
      </div>

      {greyAreaTransactions.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            All Clear
          </h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Every transaction is properly categorized and split. New ambiguous transactions from SMS will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Transaction list */}
          <div className="lg:col-span-5 space-y-2">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-1">
              Select to Clarify
            </h3>

            <div className="space-y-2">
              {greyAreaTransactions.map((tx) => {
                const isSelected = tx.id === activeTxId;
                return (
                  <button
                    key={tx.id}
                    onClick={() => handleOpenResolve(tx)}
                    className={`w-full p-4 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'border-[#007AFF] bg-blue-50/20 dark:bg-blue-950/20 ring-1 ring-[#007AFF]'
                        : 'border-black/[0.04] dark:border-white/[0.06] bg-white dark:bg-neutral-900 hover:border-black/[0.1] dark:hover:border-white/[0.1]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                        {tx.title}
                      </span>
                      <span className="text-xs font-semibold text-neutral-900 dark:text-white ml-2">
                        {formatCurrency(tx.amount, currency)}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-400">
                      <span>{formatDate(tx.date)}</span>
                      <span>•</span>
                      <span>{tx.spender === 'husband' ? husbandName : wifeName}</span>
                      <span>•</span>
                      <span>{tx.paymentMode}</span>
                    </div>

                    {tx.greyAreaReason && (
                      <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2 rounded-lg">
                        {tx.greyAreaReason}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Resolution Panel */}
          <div className="lg:col-span-7">
            {activeTx && (
              <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-5">
                {/* Spouse Ownership Banner */}
                {activeTx.spender !== authenticatedUser ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-xs">
                      <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        Protected: Only {activeTx.spender === 'husband' ? husbandName : wifeName} can resolve this transaction
                      </span>
                    </div>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                      This expense was paid by <span className="font-semibold">{activeTx.spender === 'husband' ? husbandName : wifeName}</span>. Because you are signed in as <span className="font-semibold">{authenticatedUser === 'husband' ? husbandName : wifeName}</span> on this device, you cannot categorize or change the couple split for your partner's expense — ask them to resolve it on their own phone.
                    </p>
                  </div>
                ) : (
                  <div className="px-3.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-2 text-xs text-[#007AFF] font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>This is your expense. Please provide context to keep the couple balance synchronized.</span>
                  </div>
                )}

                {/* Context Question Callout */}
                <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border-l-2 border-amber-500 space-y-1">
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Clarification Prompt
                  </div>
                  <p className="text-xs italic text-neutral-800 dark:text-neutral-200">
                    "{activeTx.contextQuestion || 'How should this transaction be categorized and split?'}"
                  </p>
                </div>

                {/* Category Picker */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                    Assign Category
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {categories
                      .filter((c) => c.id !== 'grey_area')
                      .map((cat) => {
                        const isChosen = selectedCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`p-2 rounded-xl border text-xs flex items-center gap-2 transition-all ${
                              isChosen
                                ? 'border-[#007AFF] bg-blue-50/30 dark:bg-blue-950/20 font-semibold'
                                : 'border-black/[0.04] dark:border-white/[0.06] text-neutral-700 dark:text-neutral-300 hover:bg-black/[0.02]'
                            }`}
                          >
                            <div
                              className="w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0"
                              style={{ backgroundColor: cat.color }}
                            >
                              {getCategoryIcon(cat.icon, 'w-3 h-3')}
                            </div>
                            <span className="truncate text-left text-[11px]">
                              {cat.name}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Context Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                    Context Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={contextNote}
                    onChange={(e) => setContextNote(e.target.value)}
                    placeholder="e.g., Home maintenance, Electrician repair"
                    className="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
                  />
                </div>

                {/* Submit */}
                <div className="pt-2 flex justify-end">
                  {activeTx.spender === authenticatedUser ? (
                    <button
                      onClick={handleConfirmResolve}
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Context & Rebalance</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="px-4 py-2 rounded-xl bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 text-xs font-medium flex items-center gap-1.5 cursor-not-allowed"
                      title={`Only ${activeTx.spender === 'husband' ? husbandName : wifeName} can resolve this expense`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Locked (Spouse Expense)</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recently Resolved List */}
      {resolvedTransactions.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-1">
            Recently Resolved ({resolvedTransactions.length})
          </h3>

          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] divide-y divide-black/[0.04] dark:divide-white/[0.04] overflow-hidden">
            {resolvedTransactions.slice(0, 5).map((tx) => {
              const cat = categories.find((c) => c.id === tx.category) || categories[0];
              return (
                <div
                  key={tx.id}
                  className="p-3.5 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {tx.title}
                      </span>
                      {tx.notes && (
                        <span className="ml-2 text-neutral-400 text-[11px]">
                          • {tx.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {formatCurrency(tx.amount, currency)}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      {cat.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
