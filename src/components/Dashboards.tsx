import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Transaction,
  SpenderId,
  LedgerState,
} from '../types';
import { formatCurrency, formatDate, getCategoryIcon, getPaymentModeIcon, getPaymentModeLabel } from '../utils/helpers';
import {
  TrendingDown,
  TrendingUp,
  Users,
  HelpCircle,
  Search,
  X,
  Lock,
  Edit3,
  BarChart3,
} from 'lucide-react';

interface DashboardsProps {
  ledger: LedgerState;
  activeSpender: SpenderId | 'shared';
  authenticatedUser: SpenderId;
  onSelectSpender: (spender: SpenderId | 'shared') => void;
  onResolveGreyArea: (transactionId: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onOpenCategoryManager: () => void;
}

export const Dashboards: React.FC<DashboardsProps> = ({
  ledger,
  activeSpender,
  authenticatedUser,
  onResolveGreyArea,
  onEditTransaction,
  onOpenCategoryManager,
}) => {
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week' | 'month'>('day');

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

  // Household spending breakdown by partner (informational — not a debt/balance)
  const husbandSpent = transactions
    .filter((t) => t.type === 'debit' && t.spender === 'husband')
    .reduce((sum, t) => sum + t.amount, 0);
  const wifeSpent = transactions
    .filter((t) => t.type === 'debit' && t.spender === 'wife')
    .reduce((sum, t) => sum + t.amount, 0);
  const householdTotal = husbandSpent + wifeSpent;
  const husbandSharePercent = householdTotal > 0 ? Math.round((husbandSpent / householdTotal) * 100) : 50;

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

  const isShared = activeSpender === 'shared';

  // Per-person category totals — the Overview chart overlays both partners'
  // bars per category; an individual view only ever needed its own total,
  // already isolated above via relevantTransactions/categoryTotals.
  const categoryPersonTotals: Record<string, { husband: number; wife: number }> = {};
  categories.forEach((cat) => {
    categoryPersonTotals[cat.id] = { husband: 0, wife: 0 };
  });
  transactions.forEach((tx) => {
    if (tx.type === 'debit') {
      if (!categoryPersonTotals[tx.category]) categoryPersonTotals[tx.category] = { husband: 0, wife: 0 };
      categoryPersonTotals[tx.category][tx.spender] += tx.amount;
    }
  });

  // Ranked category spend for the bar chart — highest first, system grey-area bucket excluded
  const categoryBarData = categories
    .filter((cat) => cat.id !== 'grey_area')
    .map((cat) => {
      const split = categoryPersonTotals[cat.id] || { husband: 0, wife: 0 };
      const spent = isShared ? split.husband + split.wife : categoryTotals[cat.id]?.total || 0;
      return { cat, spent, husband: split.husband, wife: split.wife };
    })
    .filter((row) => row.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const maxCategorySpend = isShared
    ? Math.max(...categoryBarData.map((row) => Math.max(row.husband, row.wife)), 1)
    : Math.max(...categoryBarData.map((row) => row.spent), 1);

  // Spending Trends — the Day/Week/Month filter drives an auto-generated bar
  // chart of a rolling window (7 days / 6 weeks / 6 months), scoped to
  // whichever spender is active, same as the rest of this screen.
  function buildTrendBuckets(txs: Transaction[], granularity: 'day' | 'week' | 'month') {
    const debits = txs.filter((t) => t.type === 'debit');
    const now = new Date();
    const buckets: { key: string; label: string; amount: number }[] = [];

    if (granularity === 'day') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        buckets.push({
          key: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
          amount: 0,
        });
      }
      debits.forEach((tx) => {
        const key = tx.date.slice(0, 10);
        const bucket = buckets.find((b) => b.key === key);
        if (bucket) bucket.amount += tx.amount;
      });
    } else if (granularity === 'week') {
      const mondayOf = (d: Date) => {
        const monday = new Date(d);
        const day = monday.getDay();
        monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
        monday.setHours(0, 0, 0, 0);
        return monday;
      };
      for (let i = 5; i >= 0; i--) {
        const ref = new Date(now);
        ref.setDate(ref.getDate() - i * 7);
        const monday = mondayOf(ref);
        buckets.push({
          key: monday.toISOString().slice(0, 10),
          label: `${monday.getDate()}/${monday.getMonth() + 1}`,
          amount: 0,
        });
      }
      debits.forEach((tx) => {
        const key = mondayOf(new Date(tx.date)).toISOString().slice(0, 10);
        const bucket = buckets.find((b) => b.key === key);
        if (bucket) bucket.amount += tx.amount;
      });
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({
          key: `${d.getFullYear()}-${d.getMonth()}`,
          label: d.toLocaleDateString('en-IN', { month: 'short' }),
          amount: 0,
        });
      }
      debits.forEach((tx) => {
        const txDate = new Date(tx.date);
        const key = `${txDate.getFullYear()}-${txDate.getMonth()}`;
        const bucket = buckets.find((b) => b.key === key);
        if (bucket) bucket.amount += tx.amount;
      });
    }

    return buckets;
  }

  const trendBuckets = buildTrendBuckets(relevantTransactions, trendGranularity);
  const maxTrendAmount = Math.max(...trendBuckets.map((b) => b.amount), 1);

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Household Spending Breakdown Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <span>Household Spending</span>
            <span className="p-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              <Users className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="my-2 space-y-2">
            <div className="w-full h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden flex">
              <motion.div
                className="h-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${husbandSharePercent}%` }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.div
                className="h-full bg-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${100 - husbandSharePercent}%` }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {husbandName}: {formatCurrency(husbandSpent, currency)}
              </span>
              <span className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                {wifeName}: {formatCurrency(wifeSpent, currency)}
              </span>
            </div>
          </div>

          <div className="pt-1">
            <span className="text-xs text-neutral-400">Combined household total, no balance owed</span>
          </div>
        </div>
      </div>

      {/* Amount vs Category — Overview overlays both partners' bars per
          category; an individual view (Kiran/Mageswari) shows only that
          person's bars. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Amount vs Category</span>
          </h2>
          {isShared && (
            <div className="flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{husbandName}</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" />{wifeName}</span>
            </div>
          )}
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs">
          {categoryBarData.length === 0 ? (
            <p className="text-xs text-neutral-400 py-6 text-center">
              No expenses recorded yet. Bars will appear here once you log some.
            </p>
          ) : (
            <div className="space-y-4">
              {categoryBarData.map(({ cat, spent, husband, wife }, index) => {
                const shareOfTotal = totalDebits > 0 ? Math.round((spent / totalDebits) * 100) : 0;
                return (
                  <div
                    key={cat.id}
                    className="group animate-fade-slide-up"
                    style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
                  >
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 min-w-0">
                        <span
                          className="w-4 h-4 rounded-md flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: cat.color }}
                        >
                          {getCategoryIcon(cat.icon, 'w-2.5 h-2.5')}
                        </span>
                        <span className="truncate min-w-0">{cat.name}</span>
                      </span>
                      <span className="text-xs font-semibold text-neutral-900 dark:text-white shrink-0">
                        {formatCurrency(spent, currency)}
                        <span className="hidden sm:inline text-neutral-400 font-normal"> ({shareOfTotal}%)</span>
                      </span>
                    </div>

                    {isShared ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden"
                            title={`${husbandName}: ${formatCurrency(husband, currency)}`}
                          >
                            <motion.div
                              className="h-full rounded-full bg-blue-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.max((husband / maxCategorySpend) * 100, husband > 0 ? 3 : 0)}%` }}
                              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
                            />
                          </div>
                          <span className="text-[10px] text-neutral-400 w-16 text-right shrink-0">
                            {formatCurrency(husband, currency)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden"
                            title={`${wifeName}: ${formatCurrency(wife, currency)}`}
                          >
                            <motion.div
                              className="h-full rounded-full bg-purple-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.max((wife / maxCategorySpend) * 100, wife > 0 ? 3 : 0)}%` }}
                              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
                            />
                          </div>
                          <span className="text-[10px] text-neutral-400 w-16 text-right shrink-0">
                            {formatCurrency(wife, currency)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="w-full h-2 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden"
                        title={`${cat.name}: ${formatCurrency(spent, currency)} (${shareOfTotal}% of total spend)`}
                      >
                        <motion.div
                          className="h-full rounded-full group-hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: cat.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max((spent / maxCategorySpend) * 100, 3)}%` }}
                          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Spending Trends — Day/Week/Month filter drives an auto-generated bar chart */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Spending Trends</span>
          </h2>
          <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-lg text-[11px] font-medium">
            {(['day', 'week', 'month'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setTrendGranularity(g)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  trendGranularity === g
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs">
          {trendBuckets.every((b) => b.amount === 0) ? (
            <p className="text-xs text-neutral-400 py-6 text-center">
              No expenses recorded yet. This chart fills in as you log some.
            </p>
          ) : (
            <div className="flex items-end justify-between gap-1.5 sm:gap-2">
              {trendBuckets.map((b, index) => (
                <div key={b.key} className="flex-1 flex flex-col items-center min-w-0">
                  <span className="text-[9px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1 truncate w-full text-center">
                    {b.amount > 0 ? formatCurrency(b.amount, currency) : ''}
                  </span>
                  <div className="w-full h-24 flex items-end">
                    <motion.div
                      className="w-full rounded-t-md bg-[#0A84FF]"
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max((b.amount / maxTrendAmount) * 100, b.amount > 0 ? 4 : 0)}%` }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: index * 0.03 }}
                    />
                  </div>
                  <span className="text-[9px] text-neutral-400 mt-1 truncate w-full text-center">{b.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category Budgets - Apple Style Compact Clean Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <span>Category Budgets</span>
            <button
              onClick={onOpenCategoryManager}
              className="p-1 rounded-md text-neutral-400 hover:text-[#007AFF] hover:bg-black/5 dark:hover:bg-white/5 transition-colors normal-case tracking-normal"
              title="Add or edit categories"
            >
              <Edit3 className="w-3 h-3" />
            </button>
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
            .map((cat, index) => {
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
                  className={`animate-fade-slide-up p-3 rounded-xl border text-left transition-all active:scale-[0.97] ${
                    isSelected
                      ? 'border-[#007AFF] bg-blue-50/40 dark:bg-blue-950/20'
                      : 'border-black/[0.04] dark:border-white/[0.06] bg-white dark:bg-neutral-900 hover:border-black/[0.1] dark:hover:border-white/[0.1]'
                  }`}
                  style={{ animationDelay: `${Math.min(index * 40, 320)}ms` }}
                >
                  <div className="flex items-center justify-between mb-2 gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: cat.color }}
                      >
                        {getCategoryIcon(cat.icon, 'w-3.5 h-3.5')}
                      </div>
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate min-w-0">
                        {cat.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-neutral-400 shrink-0">
                      {percent}%
                    </span>
                  </div>

                  <div className="w-full h-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden mb-1.5">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: spent > budget ? '#FF3B30' : cat.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
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
            displayTransactions.map((tx, index) => {
              const cat = categories.find((c) => c.id === tx.category) || categories[0];
              const isGrey = tx.status === 'grey_area';
              const isMine = tx.spender === authenticatedUser;
              const ownerName = tx.spender === 'husband' ? husbandName : wifeName;

              return (
                <div
                  key={tx.id}
                  onClick={() => onEditTransaction(tx)}
                  className={`animate-fade-slide-up p-4 flex items-center justify-between gap-3 transition-colors cursor-pointer group ${
                    isGrey
                      ? 'bg-amber-50/40 dark:bg-amber-950/15'
                      : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
                  }`}
                  style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
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
                        <span>{getPaymentModeLabel(tx.paymentMode)}</span>
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
