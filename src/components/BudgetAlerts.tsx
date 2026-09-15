import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Category,
  LedgerState,
  CategoryId,
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
} from 'lucide-react';

interface BudgetAlertsProps {
  ledger: LedgerState;
  onDismissAlert: (alertId: string) => void;
  onUpdateBudget: (categoryId: CategoryId, newLimit: number) => void;
  onResolveGreyArea: (transactionId: string) => void;
}

export const BudgetAlerts: React.FC<BudgetAlertsProps> = ({
  ledger,
  onDismissAlert,
  onUpdateBudget,
  onResolveGreyArea,
}) => {
  const { alerts, categories, transactions, currency } = ledger;

  const [editingCatId, setEditingCatId] = useState<CategoryId | null>(null);
  const [editLimit, setEditLimit] = useState<number>(0);

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
        {alerts.length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
            {alerts.length} Active
          </span>
        )}
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
            {alerts.map((alert, index) => {
              const isCritical = alert.type === 'critical';
              const isWarning = alert.type === 'warning';
              const isGrey = alert.type === 'grey_area';

              return (
                <div
                  key={alert.id}
                  className="animate-fade-slide-up p-3.5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
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
                          : 'bg-blue-500/10 text-blue-600'
                      }`}
                    >
                      {isCritical ? (
                        <AlertOctagon className="w-4 h-4" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : isGrey ? (
                        <HelpCircle className="w-4 h-4" />
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

                    <button
                      onClick={() => onDismissAlert(alert.id)}
                      className="px-2.5 py-1 rounded-lg text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
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
