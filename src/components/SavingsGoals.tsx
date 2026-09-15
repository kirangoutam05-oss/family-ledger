import React, { useState } from 'react';
import {
  SavingsGoal,
  SpenderId,
  LedgerState,
} from '../types';
import { formatCurrency, formatDate, getCategoryIcon } from '../utils/helpers';
import {
  Plus,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

interface SavingsGoalsProps {
  ledger: LedgerState;
  onContribute: (goalId: string, contributor: SpenderId, amount: number) => Promise<void>;
  onAddGoal: (newGoal: SavingsGoal) => Promise<void>;
  activeSpender: SpenderId | 'shared';
}

export const SavingsGoals: React.FC<SavingsGoalsProps> = ({
  ledger,
  onContribute,
  onAddGoal,
  activeSpender,
}) => {
  const { goals, husbandName, wifeName, currency } = ledger;

  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState<number>(0);
  const [selectedContributor, setSelectedContributor] = useState<SpenderId>(
    activeSpender === 'wife' ? 'wife' : 'husband'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewGoalModal, setShowNewGoalModal] = useState(false);

  // New goal state
  const [newTitle, setNewTitle] = useState('');
  const [newTargetAmount, setNewTargetAmount] = useState<number | ''>('');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [newColor, setNewColor] = useState('#007AFF');

  const selectedGoal = goals.find((g) => g.id === activeGoalId);

  const handleContributeSubmit = async () => {
    if (!activeGoalId || contributeAmount <= 0) return;
    setIsSubmitting(true);
    try {
      await onContribute(activeGoalId, selectedContributor, contributeAmount);
      setActiveGoalId(null);
    } catch (err) {
      console.error('Failed to contribute:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newTargetAmount || Number(newTargetAmount) <= 0 || !newTargetDate) return;

    const goal: SavingsGoal = {
      id: `goal-${Date.now()}`,
      title: newTitle,
      targetAmount: Number(newTargetAmount),
      currentAmount: 0,
      targetDate: newTargetDate,
      icon: 'Target',
      color: newColor,
      contributions: [],
    };

    await onAddGoal(goal);
    setShowNewGoalModal(false);
    setNewTitle('');
    setNewTargetAmount('');
    setNewTargetDate('');
  };

  const totalSavedAcrossAll = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTargetAcrossAll = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const overallProgress =
    totalTargetAcrossAll > 0
      ? Math.round((totalSavedAcrossAll / totalTargetAcrossAll) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header & Quick Summary */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
            Savings Goals
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {formatCurrency(totalSavedAcrossAll, currency)} of {formatCurrency(totalTargetAcrossAll, currency)} total saved ({overallProgress}%)
          </p>
        </div>

        <button
          onClick={() => setShowNewGoalModal(true)}
          className="px-3 py-1.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Goal</span>
        </button>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.map((goal) => {
          const percent = Math.min(
            Math.round((goal.currentAmount / goal.targetAmount) * 100),
            100
          );
          const isCompleted = goal.currentAmount >= goal.targetAmount;

          const husbandTotal = goal.contributions
            .filter((c) => c.contributor === 'husband')
            .reduce((s, c) => s + c.amount, 0);

          const wifeTotal = goal.contributions
            .filter((c) => c.contributor === 'wife')
            .reduce((s, c) => s + c.amount, 0);

          return (
            <div
              key={goal.id}
              className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: goal.color }}
                    >
                      {getCategoryIcon(goal.icon, 'w-4 h-4')}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {goal.title}
                      </h3>
                      <div className="flex items-center gap-1 text-[11px] text-neutral-400 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>Target: {formatDate(goal.targetDate)}</span>
                      </div>
                    </div>
                  </div>

                  {isCompleted && (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Completed
                    </span>
                  )}
                </div>

                {/* Amount & Progress */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                        {formatCurrency(goal.currentAmount, currency)}
                      </span>
                      <span className="text-xs text-neutral-400 ml-1">
                        / {formatCurrency(goal.targetAmount, currency)}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-neutral-500">
                      {percent}%
                    </span>
                  </div>

                  {/* Dual-color contributor progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden flex">
                    <div
                      title={`${husbandName}: ${formatCurrency(husbandTotal, currency)}`}
                      className="h-full bg-blue-500 transition-all"
                      style={{
                        width: `${
                          goal.targetAmount > 0
                            ? (husbandTotal / goal.targetAmount) * 100
                            : 0
                        }%`,
                      }}
                    />
                    <div
                      title={`${wifeName}: ${formatCurrency(wifeTotal, currency)}`}
                      className="h-full bg-purple-500 transition-all"
                      style={{
                        width: `${
                          goal.targetAmount > 0
                            ? (wifeTotal / goal.targetAmount) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  {/* Partner contributions */}
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span>{husbandName}: {formatCurrency(husbandTotal, currency)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      <span>{wifeName}: {formatCurrency(wifeTotal, currency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveGoalId(goal.id);
                  setContributeAmount(0);
                }}
                className="w-full py-2 px-3 rounded-xl bg-black/[0.04] hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-xs font-medium text-neutral-800 dark:text-neutral-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-[#007AFF]" />
                <span>Contribute</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Contribution Sheet */}
      {selectedGoal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-sm w-full p-6 border border-black/[0.06] dark:border-white/[0.08] shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Contribute to {selectedGoal.title}
              </h3>
              <button
                onClick={() => setActiveGoalId(null)}
                className="text-xs text-neutral-400 hover:text-neutral-600"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-500 block mb-1">
                  Partner
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedContributor('husband')}
                    className={`py-1.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      selectedContributor === 'husband'
                        ? 'border-[#007AFF] bg-blue-50/40 dark:bg-blue-950/20 text-[#007AFF] font-semibold'
                        : 'border-black/[0.06] dark:border-white/[0.08] text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>{husbandName}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedContributor('wife')}
                    className={`py-1.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      selectedContributor === 'wife'
                        ? 'border-purple-500 bg-purple-50/40 dark:bg-purple-950/20 text-purple-600 font-semibold'
                        : 'border-black/[0.06] dark:border-white/[0.08] text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span>{wifeName}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-500 block mb-1">
                  Amount ({currency})
                </label>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {[1000, 2500, 5000, 10000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setContributeAmount(amt)}
                      className={`py-1 rounded-lg text-xs font-medium border ${
                        contributeAmount === amt
                          ? 'border-[#007AFF] bg-blue-50 text-[#007AFF] font-semibold'
                          : 'border-black/[0.06] dark:border-white/[0.08] text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {formatCurrency(amt, currency)}
                    </button>
                  ))}
                </div>

                <input
                  type="number"
                  min="100"
                  step="100"
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-sm font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
                />
              </div>

              <button
                onClick={handleContributeSubmit}
                disabled={isSubmitting || contributeAmount <= 0}
                className="w-full py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-medium shadow-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Deposit {formatCurrency(contributeAmount, currency)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Goal Modal */}
      {showNewGoalModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGoal}
            className="bg-white dark:bg-neutral-900 rounded-2xl max-w-sm w-full p-6 border border-black/[0.06] dark:border-white/[0.08] shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                New Savings Goal
              </h3>
              <button
                type="button"
                onClick={() => setShowNewGoalModal(false)}
                className="text-xs text-neutral-400 hover:text-neutral-600"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-500 block mb-1">
                  Goal Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Vacation Fund, Emergency Savings"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-500 block mb-1">
                  Target Amount ({currency})
                </label>
                <input
                  type="number"
                  min="1000"
                  step="500"
                  required
                  placeholder="e.g. 50000"
                  value={newTargetAmount}
                  onChange={(e) => setNewTargetAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-500 block mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  required
                  value={newTargetDate}
                  onChange={(e) => setNewTargetDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-500 block mb-1">
                  Color Tag
                </label>
                <div className="flex items-center gap-2">
                  {['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#00C7BE'].map(
                    (color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewColor(color)}
                        className={`w-6 h-6 rounded-full transition-transform ${
                          newColor === color ? 'scale-125 ring-2 ring-offset-2 ring-black/[0.2]' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    )
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-medium shadow-xs transition-colors"
              >
                Create Goal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
