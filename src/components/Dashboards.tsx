import React, { useState } from 'react';
import {
  Transaction,
  SpenderId,
  LedgerState,
} from '../types';
import { formatCurrency, formatDate, getCategoryIcon, getPaymentModeIcon } from '../utils/helpers';
import {
  TrendingDown,
  Scale,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Search,
  SlidersHorizontal,
  X,
  Lock,
  Edit3,
  ShieldCheck,
} from 'lucide-react';

interface DashboardsProps {
  ledger: LedgerState;
  activeSpender: SpenderId | 'shared';
  authenticatedUser: SpenderId;
  onSelectSpender: (spender: SpenderId | 'shared') => void;
  onResolveGreyArea: (transactionId: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onSettleUp: () => void;
}

export const Dashboards: React.FC<DashboardsProps> = ({
  ledger,
  activeSpender,
  authenticatedUser,
  onResolveGreyArea,
  onEditTransaction,
  onSettleUp,
}) => {
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { transactions, categories, husbandName, wifeName, currency } = ledger;

  // Filter transactions based on activeSpender
  const relevantTransactions = transactions.filter((t) => {
    if (activeSpender === 'shared') return true;
    return t.spender === activeSpender;
  });

  // Calculate stats
  const totalDebits = relevantTransactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  // Shared vs Individual split calculation
  let husbandPaidForShared = 0;
  let wifePaidForShared = 0;
  let husbandShareOwed = 0;
  let wifeShareOwed = 0;
  let settledFromWife = 0;
  let settledFromHusband = 0;

  transactions.forEach((tx) => {
    if (tx.type !== 'debit') return;

    if (tx.isSettlement) {
      if (tx.spender === 'wife') settledFromWife += tx.amount;
      else settledFromHusband += tx.amount;
      return;
    }

    const hPercent = tx.splitRatio.husband;
    const wPercent = tx.splitRatio.wife;

    // Shared expense
    if (!(hPercent === 100 && wPercent === 0) && !(wPercent === 100 && hPercent === 0)) {
      if (tx.spender === 'husband') {
        husbandPaidForShared += tx.amount;
      } else {
        wifePaidForShared += tx.amount;
      }
      husbandShareOwed += (tx.amount * hPercent) / 100;
      wifeShareOwed += (tx.amount * wPercent) / 100;
    }
  });

  // Settlement: Husband net = (husbandPaidForShared - husbandShareOwed) - settledFromWife + settledFromHusband
  const husbandNet = (husbandPaidForShared - husbandShareOwed) - settledFromWife + settledFromHusband;

  // Category breakdown
  const categoryTotals: Record<string, { total: number; count: number }> = {};
  categories.forEach((cat) => {
    categoryTotals[cat.id] = { total: 0, count: 0 };
  });

  relevantTransactions.forEach((tx) => {
    if (tx.type === 'debit') {
      if (!categoryTotals[tx.category]) {
        categoryTotals[tx.category] = { total: 0, count: 0 };
      }
      categoryTotals[tx.category].total += tx.amount;
      categoryTotals[tx.category].count += 1;
    }
  });

  // Filtered transactions for the list
  const displayTransactions = relevantTransactions.filter((tx) => {
    const matchesCat = selectedCategoryFilter === 'all' || tx.category === selectedCategoryFilter;
    const matchesSearch =
      tx.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.notes && tx.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tx.upiRef && tx.upiRef.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const greyAreaCount = transactions.filter((t) => t.status === 'grey_area').length;

  return (
    <div className="space-y-6">
      {/* 3 Clean Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Outflow Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <span>
              {activeSpender === 'shared'
                ? 'Total Outflow'
                : `${activeSpender === 'husband' ? husbandName : wifeName}'s Outflow`}
            </span>
            <span className="p-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              <TrendingDown className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="my-3">
            <span className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              {formatCurrency(totalDebits, currency)}
            </span>
          </div>
          <div className="text-xs text-neutral-400">
            {relevantTransactions.filter((t) => t.type === 'debit').length} transactions recorded
          </div>
        </div>

        {/* Shared Settlement Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <span>Shared Settlement</span>
            <span className="p-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              <Scale className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="my-2">
            {Math.abs(husbandNet) < 1 ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-lg font-medium">All Settled 50/50</span>
              </div>
            ) : (
              <div>
                <div className="text-xs text-neutral-500">
                  {husbandNet > 0 ? `${wifeName} owes ${husbandName}` : `${husbandName} owes ${wifeName}`}
                </div>
                <div className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white mt-0.5">
                  {formatCurrency(Math.abs(husbandNet), currency)}
                </div>
              </div>
            )}
          </div>

          <div className="pt-1">
            {Math.abs(husbandNet) >= 1 ? (
              <button
                onClick={onSettleUp}
                className="text-xs font-medium text-[#007AFF] hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                <span>Record Settlement</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              <span className="text-xs text-neutral-400">No pending balance</span>
            )}
          </div>
        </div>

        {/* Grey Area Prompt Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <span>Context Queue</span>
            <span
              className={`p-1 rounded-md ${
                greyAreaCount > 0
                  ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              {greyAreaCount === 0 ? 'All Clear' : `${greyAreaCount} to Verify`}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {greyAreaCount === 0
                ? 'All transactions accurately categorized.'
                : 'Ambiguous UPI transfers waiting for your input.'}
            </p>
          </div>

          <div className="pt-1">
            {greyAreaCount > 0 ? (
              <button
                onClick={() => onResolveGreyArea(transactions.find((t) => t.status === 'grey_area')?.id || '')}
                className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center gap-1 transition-colors"
              >
                <span>Review Transactions</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              <span className="text-xs text-neutral-400">No action required</span>
            )}
          </div>
        </div>
      </div>

      {/* Category Budgets - Apple Style Compact Clean Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Category Budgets
          </h2>
          {selectedCategoryFilter !== 'all' && (
            <button
              onClick={() => setSelectedCategoryFilter('all')}
              className="text-xs text-[#007AFF] hover:underline flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Reset filter</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {categories
            .filter((cat) => cat.id !== 'grey_area')
            .map((cat) => {
              const spent = categoryTotals[cat.id]?.total || 0;
              const budget = cat.budgetMonthly || 1;
              const percent = Math.min(Math.round((spent / budget) * 100), 100);
              const isSelected = selectedCategoryFilter === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() =>
                    setSelectedCategoryFilter(isSelected ? 'all' : cat.id)
                  }
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-[#007AFF] bg-blue-50/40 dark:bg-blue-950/20'
                      : 'border-black/[0.04] dark:border-white/[0.06] bg-white dark:bg-neutral-900 hover:border-black/[0.1] dark:hover:border-white/[0.1]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-white"
                        style={{ backgroundColor: cat.color }}
                      >
                        {getCategoryIcon(cat.icon, 'w-3.5 h-3.5')}
                      </div>
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                        {cat.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-neutral-400">
                      {percent}%
                    </span>
                  </div>

                  <div className="w-full h-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden mb-1.5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: spent > budget ? '#FF3B30' : cat.color,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {formatCurrency(spent, currency)}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      / {formatCurrency(cat.budgetMonthly, currency)}
                    </span>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* Transaction List - Apple Wallet Grouped View */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Recent Activity
          </h2>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-neutral-900 dark:text-white border-none focus:ring-1 focus:ring-[#007AFF] w-36 sm:w-44 outline-none placeholder:text-neutral-400"
              />
            </div>
          </div>
        </div>

        {/* Grouped Table View */}
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs overflow-hidden divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {displayTransactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              No transactions match your search.
            </div>
          ) : (
            displayTransactions.map((tx) => {
              const cat = categories.find((c) => c.id === tx.category) || categories[0];
              const isGrey = tx.status === 'grey_area';
              const isMine = tx.spender === authenticatedUser;
              const ownerName = tx.spender === 'husband' ? husbandName : wifeName;

              return (
                <div
                  key={tx.id}
                  onClick={() => onEditTransaction(tx)}
                  className={`p-4 flex items-center justify-between gap-3 transition-colors cursor-pointer group ${
                    isGrey
                      ? 'bg-amber-50/40 dark:bg-amber-950/15'
                      : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Category icon avatar */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: isGrey ? '#FF9500' : cat.color }}
                    >
                      {getCategoryIcon(cat.icon, 'w-5 h-5')}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                          {tx.title}
                        </span>

                        {isMine ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-[#007AFF] text-[10px] font-semibold">
                            You
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-medium flex items-center gap-1" title={`Protected: Only ${ownerName} can edit or delete this expense`}>
                            <Lock className="w-2.5 h-2.5" />
                            <span>{ownerName}</span>
                          </span>
                        )}

                        {isGrey && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                            <HelpCircle className="w-3 h-3" />
                            Context needed
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-neutral-400 truncate">
                        <span>{formatDate(tx.date)}</span>
                        <span>•</span>
                        <span>{tx.paymentMode}</span>
                        <span>•</span>
                        <span className={isMine ? 'text-[#007AFF] font-medium' : 'text-neutral-600 dark:text-neutral-300'}>
                          {ownerName}
                        </span>
                        {tx.notes && (
                          <>
                            <span>•</span>
                            <span className="italic truncate max-w-[140px] sm:max-w-xs">{tx.notes}</span>
                          </>
                        )}
                      </div>

                      {isGrey && tx.contextQuestion && (
                        <div className="mt-1 flex items-center gap-2">
                          <p className="text-[11px] text-amber-700 dark:text-amber-300 italic">
                            "{tx.contextQuestion}"
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onResolveGreyArea(tx.id);
                            }}
                            className="text-[11px] font-medium text-amber-700 dark:text-amber-400 underline shrink-0 hover:text-amber-800"
                          >
                            Answer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Amount & Action */}
                  <div className="text-right shrink-0 flex items-center gap-3">
                    <div>
                      <div
                        className={`text-sm font-semibold tracking-tight ${
                          tx.type === 'credit'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-neutral-900 dark:text-white'
                        }`}
                      >
                        {tx.type === 'credit' ? '+' : '-'}
                        {formatCurrency(tx.amount, currency)}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {cat.name}
                      </div>
                    </div>

                    <div className="hidden sm:flex items-center">
                      {isMine ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTransaction(tx);
                          }}
                          className="px-2 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[#007AFF] hover:text-white text-neutral-600 dark:text-neutral-300 text-xs font-medium flex items-center gap-1 transition-all"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      ) : (
                        <div
                          className="p-1.5 rounded-lg text-neutral-300 dark:text-neutral-600"
                          title={`Protected: Only ${ownerName} can edit or delete this expense.`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
