import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Category,
  LedgerState,
  CategoryId,
  SpenderId,
} from '../types';
import { formatCurrency, getCategoryIcon } from '../utils/helpers';
import {
  AlertTriangle,
  AlertOctagon,
  TrendingUp,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Check,
  HandCoins,
  KeyRound,
  Receipt,
  Repeat,
  BellRing,
} from 'lucide-react';

interface BudgetAlertsProps {
  ledger: LedgerState;
  authenticatedUser: SpenderId;
  onDismissAlert: (alertId: string) => void;
  onClearAllAlerts: () => void;
  onUpdateBudget: (categoryId: CategoryId, newLimit: number) => void;
  onResolveGreyArea: (transactionId: string) => void;
  onReviewAck: (pendingId: string) => void;
  onReviewLockReset: (requestId: string) => void;
}

export const BudgetAlerts: React.FC<BudgetAlertsProps> = ({
  ledger,
  authenticatedUser,
  onDismissAlert,
  onClearAllAlerts,
  onUpdateBudget,
  onResolveGreyArea,
  onReviewAck,
  onReviewLockReset,
}) => {
  const { categories, transactions, currency } = ledger;

  // Some alerts (e.g. "your partner added an expense") are only meant for the
  // one spouse they're about — everything else has no `forSpender` and stays
  // visible to both, matching every alert that existed before this filter.
  const alerts = ledger.alerts.filter(
    (a) => !a.forSpender || a.forSpender === authenticatedUser
  );

  const [editingCatId, setEditingCatId] = useState<CategoryId | null>(null);
  const [editLimit, setEditLimit] = useState<number>(0);

  // "Review" alerts (paid-for-spouse, lock-reset requests) point at something
  // that still needs a decision elsewhere — clearing them here would just hide
  // the alert while leaving the underlying request stranded, so "Clear All"
  // only touches alerts that already support an individual Dismiss.
  const dismissibleCount = alerts.filter(
    (a) => a.actionType !== 'review_ack' && a.actionType !== 'approve_lock_reset'
  ).length;

  // Compute spending per category
  const categorySpend: Record<string, number> = {};
  transactions
    .filter((t) => t.type === 'debit')
    .forEach((t) => {
      categorySpend[t.category] = (categorySpend[t.category] || 0) + t.amount;
    });

  const handleStartEdit = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditLimit(cat.budgetMonthly);
  };

  const handleSaveBudget = (catId: CategoryId) => {
    onUpdateBudget(catId, editLimit);
    setEditingCatId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
            Notifications & Limits
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Spending threshold warnings and monthly category caps.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {alerts.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
              {alerts.length} Active
            </span>
          )}
          {dismissibleCount > 0 && (
            <button
              type="button"
              onClick={onClearAllAlerts}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Active Alerts List */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] text-center space-y-1.5">
            <ShieldCheck className="w-6 h-6 text-emerald-500 mx-auto" />
            <div className="text-xs font-semibold text-neutral-900 dark:text-white">
              No Pending Alerts
            </div>
            <p className="text-[11px] text-neutral-400 max-w-xs mx-auto">
              Spending across all categories is currently within healthy limits.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
            {alerts.map((alert, index) => {
              const isCritical = alert.type === 'critical';
              const isWarning = alert.type === 'warning';
              const isGrey = alert.type === 'grey_area';
              const isAck = alert.type === 'ack_needed';
              const isLockReset = alert.type === 'lock_reset_requested';
              const isExpenseAdded = alert.type === 'expense_added';
              const isRecurring = alert.type === 'recurring_due';
              const isDailyReminder = alert.type === 'daily_reminder';

              return (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 120, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3), ease: [0.16, 1, 0.3, 1] }}
                  className="p-3.5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isCritical
                          ? 'bg-red-500/10 text-red-600'
                          : isWarning
                          ? 'bg-amber-500/10 text-amber-600'
                          : isGrey
                          ? 'bg-orange-500/10 text-orange-600'
                          : isAck
                          ? 'bg-amber-500/10 text-amber-600'
                          : isLockReset
                          ? 'bg-amber-500/10 text-amber-600'
                          : isRecurring || isDailyReminder
                          ? 'bg-violet-500/10 text-violet-600'
                          : 'bg-blue-500/10 text-blue-600'
                      }`}
                    >
                      {isCritical ? (
                        <AlertOctagon className="w-4 h-4" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : isGrey ? (
                        <HelpCircle className="w-4 h-4" />
                      ) : isAck ? (
                        <HandCoins className="w-4 h-4" />
                      ) : isLockReset ? (
                        <KeyRound className="w-4 h-4" />
                      ) : isExpenseAdded ? (
                        <Receipt className="w-4 h-4" />
                      ) : isRecurring ? (
                        <Repeat className="w-4 h-4" />
                      ) : isDailyReminder ? (
                        <BellRing className="w-4 h-4" />
                      ) : (
                        <TrendingUp className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                          {alert.title}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          {alert.timestamp}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                        {alert.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {alert.actionType === 'resolve_grey' && alert.targetId && (
                      <button
                        onClick={() => onResolveGreyArea(alert.targetId!)}
                        className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <span>Clarify</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {alert.actionType === 'review_ack' && alert.targetId && (
                      <button
                        onClick={() => onReviewAck(alert.targetId!)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <span>Review</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {alert.actionType === 'approve_lock_reset' && alert.targetId && (
                      <button
                        onClick={() => onReviewLockReset(alert.targetId!)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <span>Review</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {alert.actionType !== 'review_ack' && alert.actionType !== 'approve_lock_reset' && (
                      <button
                        onClick={() => onDismissAlert(alert.id)}
                        className="px-2.5 py-1 rounded-lg text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Category Budgets Configuration */}
      <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Category Spending Caps
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Adjust monthly allowances per category
          </p>
        </div>

        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {categories
            .filter((c) => c.id !== 'grey_area')
            .map((cat) => {
              const spent = categorySpend[cat.id] || 0;
              const budget = cat.budgetMonthly || 1;
              const percent = Math.min(Math.round((spent / budget) * 100), 100);
              const isOver = spent > budget;
              const isEditing = editingCatId === cat.id;

              return (
                <div
                  key={cat.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: cat.color }}
                    >
                      {getCategoryIcon(cat.icon, 'w-4 h-4')}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                        <span>{cat.name}</span>
                        {isOver && (
                          <span className="text-[10px] text-red-500">
                            (Over by {formatCurrency(spent - budget, currency)})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        {formatCurrency(spent, currency)} of {formatCurrency(cat.budgetMonthly, currency)} limit
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="w-24 h-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden hidden sm:block">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: isOver ? '#FF3B30' : cat.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>

                    <span className="text-xs font-mono font-medium text-neutral-500">
                      {percent}%
                    </span>

                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="1000"
                          value={editLimit}
                          onChange={(e) => setEditLimit(Number(e.target.value))}
                          className="w-24 px-2 py-1 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-xs font-semibold dark:bg-neutral-800"
                        />
                        <button
                          onClick={() => handleSaveBudget(cat.id)}
                          className="p-1 rounded-lg bg-[#007AFF] text-white hover:bg-[#0071E3]"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(cat)}
                        className="px-2.5 py-1 rounded-lg text-xs text-[#007AFF] hover:bg-[#007AFF]/10 transition-colors font-medium"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
