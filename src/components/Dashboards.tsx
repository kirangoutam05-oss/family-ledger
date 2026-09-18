import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Transaction,
  SpenderId,
  LedgerState,
  CategoryId,
} from '../types';
import { formatCurrency, formatDate, getCategoryIcon, getPaymentModeIcon, getPaymentModeLabel, localDateKey } from '../utils/helpers';
import { detectRecurringGroups } from '../utils/recurringDetector';
import { ExportSection } from './ExportSection';
import { BulkEditSheet } from './BulkEditSheet';
import { TransactionFilterSheet, TransactionFilters, EMPTY_FILTERS, countActiveFilters } from './TransactionFilterSheet';
import {
  TrendingDown,
  TrendingUp,
  Users,
  HelpCircle,
  Search,
  Lock,
  Edit3,
  BarChart3,
  SlidersHorizontal,
  Repeat,
  CheckSquare,
  Square,
  X,
  Tag,
  CreditCard,
} from 'lucide-react';

// The household's billing cycle runs the 21st of one month through the 20th
// of the next, not the calendar month — shared by the "This Month" KPI and
// the Spending Trends month view so both agree on what a "month" means.
function billingCycleStart(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth() - (d.getDate() < 21 ? 1 : 0), 21);
  start.setHours(0, 0, 0, 0);
  return start;
}

function billingCycleLabel(start: Date): string {
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 20);
  return `${start.getDate()}/${start.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`;
}

interface DashboardsProps {
  ledger: LedgerState;
  activeSpender: SpenderId | 'shared';
  authenticatedUser: SpenderId;
  onSelectSpender: (spender: SpenderId | 'shared') => void;
  onResolveGreyArea: (transactionId: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onBulkUpdateTransactions: (
    transactionIds: string[],
    updates: { category?: CategoryId; paymentMode?: Transaction['paymentMode'] }
  ) => Promise<{ updatedCount: number; skippedIds: string[] }>;
}

export const Dashboards: React.FC<DashboardsProps> = ({
  ledger,
  activeSpender,
  authenticatedUser,
  onResolveGreyArea,
  onEditTransaction,
  onBulkUpdateTransactions,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const RECENT_ACTIVITY_PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(RECENT_ACTIVITY_PAGE_SIZE);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditField, setBulkEditField] = useState<'category' | 'paymentMode' | null>(null);

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

  // "This Month" — scoped to the current 21st-to-20th billing cycle, not
  // all-time, so the headline number reads as an actual monthly cash flow.
  const currentCycleStart = billingCycleStart(new Date());
  const currentCycleEnd = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, 21);
  const currentCycleDebitTxs = relevantTransactions.filter((t) => {
    if (t.type !== 'debit') return false;
    const d = new Date(t.date);
    return d >= currentCycleStart && d < currentCycleEnd;
  });
  const currentCycleDebits = currentCycleDebitTxs.reduce((sum, t) => sum + t.amount, 0);
  const currentCycleLabel = billingCycleLabel(currentCycleStart);

  // "Today" — the other half of the Outflow card, alongside the cycle total.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const todayDebitTxs = relevantTransactions.filter((t) => {
    if (t.type !== 'debit') return false;
    const d = new Date(t.date);
    return d >= todayStart && d < todayEnd;
  });
  const todayDebits = todayDebitTxs.reduce((sum, t) => sum + t.amount, 0);

  // Which person's data is on screen gets its own colour — blue for Kiran,
  // purple for Mageswari, teal for the combined household view — carried
  // through the Outflow card so the active selection stays visually clear
  // without needing to reopen the header dropdown.
  const spenderAccent =
    activeSpender === 'husband'
      ? { text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' }
      : activeSpender === 'wife'
      ? { text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' }
      : { text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-500/10' };
  const outflowCardLabel =
    activeSpender === 'shared' ? 'Household Outflow' : `${activeSpender === 'husband' ? husbandName : wifeName}'s Outflow`;

  // Household spending breakdown by partner (informational — not a debt/balance),
  // scoped to the current billing cycle so it reads as "this month" rather than
  // an ever-growing all-time figure — same cycle as the Outflow card's "This Month".
  const husbandSpent = transactions
    .filter((t) => t.type === 'debit' && t.spender === 'husband')
    .filter((t) => {
      const d = new Date(t.date);
      return d >= currentCycleStart && d < currentCycleEnd;
    })
    .reduce((sum, t) => sum + t.amount, 0);
  const wifeSpent = transactions
    .filter((t) => t.type === 'debit' && t.spender === 'wife')
    .filter((t) => {
      const d = new Date(t.date);
      return d >= currentCycleStart && d < currentCycleEnd;
    })
    .reduce((sum, t) => sum + t.amount, 0);
  const householdTotal = husbandSpent + wifeSpent;
  const husbandSharePercent = householdTotal > 0 ? Math.round((husbandSpent / householdTotal) * 100) : 50;

  // "Amount vs Category" window — a shared household setting (both partners
  // see the same view), defaulting to the current billing cycle for anyone
  // who hasn't set it yet.
  const categoryBreakdownPeriod = ledger.categoryBreakdownPeriod ?? 'month';
  const currentYear = new Date().getFullYear();
  const categoryPeriodTransactions = relevantTransactions.filter((t) => {
    if (categoryBreakdownPeriod === 'all') return true;
    const d = new Date(t.date);
    if (categoryBreakdownPeriod === 'year') return d.getFullYear() === currentYear;
    return d >= currentCycleStart && d < currentCycleEnd;
  });

  // Category breakdown
  const categoryTotals: Record<string, { total: number; count: number }> = {};
  categories.forEach((cat) => {
    categoryTotals[cat.id] = { total: 0, count: 0 };
  });

  categoryPeriodTransactions.forEach((tx) => {
    if (tx.type === 'debit') {
      if (!categoryTotals[tx.category]) {
        categoryTotals[tx.category] = { total: 0, count: 0 };
      }
      categoryTotals[tx.category].total += tx.amount;
      categoryTotals[tx.category].count += 1;
    }
  });

  // Titles that look like a recurring bill/subscription (same title, roughly
  // once a month, across 2+ months) — computed from the full history, not just
  // whatever's currently filtered, so the badge doesn't flicker off as you filter.
  const recurringTitles = useMemo(
    () => new Set(detectRecurringGroups(transactions).map((g) => g.title)),
    [transactions]
  );

  // Filtered + sorted transactions for the list
  const displayTransactions = relevantTransactions
    .filter((tx) => {
      const q = searchQuery.toLowerCase();
      return (
        !q ||
        tx.title.toLowerCase().includes(q) ||
        (tx.notes && tx.notes.toLowerCase().includes(q)) ||
        (tx.upiRef && tx.upiRef.toLowerCase().includes(q))
      );
    })
    .filter((tx) => filters.categories.length === 0 || filters.categories.includes(tx.category))
    .filter((tx) => filters.paymentModes.length === 0 || filters.paymentModes.includes(tx.paymentMode))
    .filter((tx) => filters.type === 'all' || tx.type === filters.type)
    .filter((tx) => filters.spender === 'all' || tx.spender === filters.spender)
    .filter((tx) => !filters.dateFrom || localDateKey(new Date(tx.date)) >= filters.dateFrom)
    .filter((tx) => !filters.dateTo || localDateKey(new Date(tx.date)) <= filters.dateTo)
    .sort((a, b) => {
      switch (filters.sortBy) {
        case 'date_asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount_desc':
          return b.amount - a.amount;
        case 'amount_asc':
          return a.amount - b.amount;
        case 'date_desc':
        default:
          return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });

  const activeFilterCount = countActiveFilters(filters);
  const pagedTransactions = displayTransactions.slice(0, visibleCount);

  // Collapse the list back to one page whenever the search/filter/spender
  // scope changes, so "View More" always starts from the top of a new result set.
  useEffect(() => {
    setVisibleCount(RECENT_ACTIVITY_PAGE_SIZE);
  }, [searchQuery, filters, activeSpender]);

  const isShared = activeSpender === 'shared';

  // Per-person category totals — the Overview chart overlays both partners'
  // bars per category; an individual view only ever needed its own total,
  // already isolated above via relevantTransactions/categoryTotals. Reuses
  // categoryPeriodTransactions since, when isShared, relevantTransactions
  // (and therefore categoryPeriodTransactions) already covers both spenders.
  const categoryPersonTotals: Record<string, { husband: number; wife: number }> = {};
  categories.forEach((cat) => {
    categoryPersonTotals[cat.id] = { husband: 0, wife: 0 };
  });
  categoryPeriodTransactions.forEach((tx) => {
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
      // Window grows to cover all history (min 7 days, capped at 90) so the
      // strip scrolls through every day you've logged, not just last week.
      let daysBack = 6;
      if (debits.length > 0) {
        const earliest = debits.reduce(
          (min, t) => (new Date(t.date) < min ? new Date(t.date) : min),
          new Date(debits[0].date)
        );
        const diffDays = Math.floor((now.getTime() - earliest.getTime()) / (24 * 60 * 60 * 1000));
        daysBack = Math.max(daysBack, Math.min(diffDays, 89));
      }
      for (let i = daysBack; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        buckets.push({
          key: localDateKey(d),
          label: daysBack > 6 ? `${d.getDate()}/${d.getMonth() + 1}` : d.toLocaleDateString('en-IN', { weekday: 'short' }),
          amount: 0,
        });
      }
      debits.forEach((tx) => {
        const key = localDateKey(new Date(tx.date));
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
      // Same idea as "day" — grows to cover all history (min 6 weeks, capped
      // at ~2 years) instead of a fixed 6-week window.
      let weeksBack = 5;
      if (debits.length > 0) {
        const earliest = debits.reduce(
          (min, t) => (new Date(t.date) < min ? new Date(t.date) : min),
          new Date(debits[0].date)
        );
        const diffWeeks = Math.round((mondayOf(now).getTime() - mondayOf(earliest).getTime()) / (7 * 24 * 60 * 60 * 1000));
        weeksBack = Math.max(weeksBack, Math.min(diffWeeks, 103));
      }
      for (let i = weeksBack; i >= 0; i--) {
        const ref = new Date(now);
        ref.setDate(ref.getDate() - i * 7);
        const monday = mondayOf(ref);
        buckets.push({
          key: localDateKey(monday),
          label: `${monday.getDate()}/${monday.getMonth() + 1}`,
          amount: 0,
        });
      }
      debits.forEach((tx) => {
        const key = localDateKey(mondayOf(new Date(tx.date)));
        const bucket = buckets.find((b) => b.key === key);
        if (bucket) bucket.amount += tx.amount;
      });
    } else {
      // "Month" here tracks the household's actual billing cycle — the 21st
      // of one month through the 20th of the next — not the calendar month.
      // The window reaches back to the earliest transaction's cycle (min 6,
      // capped at 24) so the chart grows as more history is added, and the
      // bar strip scrolls horizontally like a slider instead of squeezing
      // everything into a fixed 6-bar view.
      const cycleStart = billingCycleStart(now);
      let cyclesBack = 5;
      if (debits.length > 0) {
        const earliest = debits.reduce(
          (min, t) => (new Date(t.date) < min ? new Date(t.date) : min),
          new Date(debits[0].date)
        );
        const earliestCycleStart = billingCycleStart(earliest);
        const monthsDiff =
          (cycleStart.getFullYear() - earliestCycleStart.getFullYear()) * 12 +
          (cycleStart.getMonth() - earliestCycleStart.getMonth());
        cyclesBack = Math.max(cyclesBack, Math.min(monthsDiff, 23));
      }
      for (let i = cyclesBack; i >= 0; i--) {
        const start = new Date(cycleStart.getFullYear(), cycleStart.getMonth() - i, 21);
        buckets.push({
          key: `${start.getFullYear()}-${start.getMonth()}`,
          label: billingCycleLabel(start),
          amount: 0,
        });
      }
      debits.forEach((tx) => {
        const start = billingCycleStart(new Date(tx.date));
        const key = `${start.getFullYear()}-${start.getMonth()}`;
        const bucket = buckets.find((b) => b.key === key);
        if (bucket) bucket.amount += tx.amount;
      });
    }

    return buckets;
  }

  const trendBuckets = buildTrendBuckets(relevantTransactions, trendGranularity);
  const maxTrendAmount = Math.max(...trendBuckets.map((b) => b.amount), 1);
  const trendTotal = trendBuckets.reduce((sum, b) => sum + b.amount, 0);
  const trendAverage = Math.round(trendTotal / trendBuckets.length);
  const trendPeak = trendBuckets.reduce((peak, b) => (b.amount > peak.amount ? b : peak), trendBuckets[0]);
  const trendPeriodLabel = trendGranularity === 'day' ? 'day' : trendGranularity === 'week' ? 'week' : 'cycle';
  const trendBarWidth = trendGranularity === 'month' ? 84 : trendGranularity === 'week' ? 48 : 40;
  // Rough count of bars that fit in the visible strip at this width, used
  // only to decide whether to show the "swipe for more" hint.
  const trendBarsVisible = Math.max(1, Math.floor(300 / (trendBarWidth + 8)));

  // The bar strip scrolls horizontally like a slider once there's more
  // history than fits on screen — keep it scrolled to the latest period by
  // default, so the user swipes left to go back in time.
  const trendScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trendScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [trendGranularity, trendBuckets.length]);

  return (
    <div className={`space-y-6 ${isSelectMode && selectedIds.size > 0 ? 'pb-20' : ''}`}>
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Outflow Card — Today alongside the current billing cycle, both
            tinted with the active spender's colour. */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-4">
            <span>{outflowCardLabel}</span>
            <span className={`p-1 rounded-md ${spenderAccent.bg} ${spenderAccent.text}`}>
              <TrendingDown className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-black/[0.06] dark:divide-white/[0.08]">
            <div className="pr-4">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Today</div>
              <div className={`text-2xl font-bold tracking-tight ${spenderAccent.text}`}>
                {formatCurrency(todayDebits, currency)}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1">
                {todayDebitTxs.length} transaction{todayDebitTxs.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="pl-4">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">This Month</div>
              <div className={`text-2xl font-bold tracking-tight ${spenderAccent.text}`}>
                {formatCurrency(currentCycleDebits, currency)}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1">
                {currentCycleDebitTxs.length} txns • {currentCycleLabel}
              </div>
            </div>
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
            <span className="text-xs text-neutral-400">This month's split ({currentCycleLabel}), no balance owed</span>
          </div>
        </div>
      </div>

      {/* Amount vs Category — Overview overlays both partners' bars per
          category; an individual view (Kiran/Mageswari) shows only that
          person's bars. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Amount vs Category</span>
            </h2>
            <p className="text-[10px] text-neutral-400 mt-0.5">
              {categoryBreakdownPeriod === 'month'
                ? `This month (${currentCycleLabel})`
                : categoryBreakdownPeriod === 'year'
                ? `This year (${currentYear})`
                : 'All time'}
              {' · change in Account settings'}
            </p>
          </div>
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

      {/* Spending Trends — Day/Week/Month filter drives an auto-generated bar
          chart. This is the primary chart on the page now that Category
          Budgets moved to the Category tab, so it runs bigger and carries
          summary stats alongside the bars. */}
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

        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-5">
          {trendGranularity === 'month' && (
            <p className="text-[11px] text-neutral-400 -mt-1">
              Tracked as a billing cycle — the 21st of one month through the 20th of the next.
            </p>
          )}

          {trendBuckets.every((b) => b.amount === 0) ? (
            <p className="text-xs text-neutral-400 py-10 text-center">
              No expenses recorded yet. This chart fills in as you log some.
            </p>
          ) : (
            <>
              {/* Summary stat row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.04]">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">Total</div>
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white mt-0.5">
                    {formatCurrency(trendTotal, currency)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.04]">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">Avg / {trendPeriodLabel}</div>
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white mt-0.5">
                    {formatCurrency(trendAverage, currency)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.04]">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">Peak</div>
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white mt-0.5 truncate" title={trendPeak.label}>
                    {formatCurrency(trendPeak.amount, currency)}
                  </div>
                </div>
              </div>

              {/* Bar chart — a horizontal slider once there's more history
                  than fits; scrolled to the latest period by default. */}
              <div className="space-y-1.5">
                {trendBuckets.length > trendBarsVisible && (
                  <p className="text-[10px] text-neutral-400 text-right">← Swipe to see more history</p>
                )}
                <div
                  ref={trendScrollRef}
                  className="flex items-end gap-2 sm:gap-3 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth snap-x snap-mandatory"
                >
                  {/* Bars only ever grow to BAR_MAX_PCT of the container's
                      height — the rest is reserved headroom so every amount
                      label sits above its bar, outside the bar's own fill,
                      never crowding the container's top edge even at peak. */}
                  {trendBuckets.map((b, index) => {
                    const BAR_MAX_PCT = 72;
                    const rawPct = Math.max((b.amount / maxTrendAmount) * 100, b.amount > 0 ? 4 : 0);
                    const barHeightPct = (rawPct / 100) * BAR_MAX_PCT;
                    return (
                      <div
                        key={b.key}
                        className="shrink-0 snap-start flex flex-col items-center"
                        style={{ width: trendBarWidth }}
                        title={`${b.label}: ${formatCurrency(b.amount, currency)}`}
                      >
                        <div className="w-full h-44 sm:h-52 relative">
                          <motion.div
                            className={`absolute bottom-0 left-0 w-full rounded-t-md ${
                              b.key === trendPeak.key ? 'bg-[#0A84FF]' : 'bg-[#0A84FF]/50'
                            }`}
                            initial={{ height: 0 }}
                            animate={{ height: `${barHeightPct}%` }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: index * 0.03 }}
                          />
                          {b.amount > 0 && (
                            <motion.span
                              className="absolute left-0 w-full text-center text-[9px] sm:text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 truncate px-0.5"
                              initial={{ bottom: '4px', opacity: 0 }}
                              animate={{ bottom: `calc(${barHeightPct}% + 8px)`, opacity: 1 }}
                              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: index * 0.03 }}
                            >
                              {formatCurrency(b.amount, currency)}
                            </motion.span>
                          )}
                        </div>
                        <span className="text-[9px] sm:text-[10px] text-neutral-400 mt-1 text-center leading-tight whitespace-nowrap">
                          {b.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Export — CSV/XLSX/PDF/DOC of the transaction list, plus the charts above */}
      <ExportSection ledger={ledger} activeSpender={activeSpender} relevantTransactions={relevantTransactions} trendBuckets={trendBuckets} trendGranularity={trendGranularity} categoryBarData={categoryBarData} />

      {/* Transaction List - Apple Wallet Grouped View */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Recent Activity
          </h2>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-neutral-900 dark:text-white border-none focus:ring-1 focus:ring-[#007AFF] w-full sm:w-44 outline-none placeholder:text-neutral-400"
              />
            </div>

            {/* Filters trigger */}
            <button
              type="button"
              onClick={() => setIsFilterSheetOpen(true)}
              className={`relative shrink-0 p-1.5 rounded-lg transition-colors ${
                activeFilterCount > 0
                  ? 'bg-[#007AFF] text-white'
                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-neutral-600 dark:text-neutral-300'
              }`}
              title="Filter & sort transactions"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Select mode toggle — bulk-editing only ever applies to the
                signed-in user's own transactions, matching the single-edit
                ownership rule below. */}
            <button
              type="button"
              onClick={() => {
                setIsSelectMode((v) => !v);
                setSelectedIds(new Set());
              }}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                isSelectMode
                  ? 'bg-[#007AFF] text-white'
                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {isSelectMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center justify-between px-1 -mt-1">
            <p className="text-[11px] text-neutral-400">
              {displayTransactions.length} of {relevantTransactions.length} transactions match your filters
            </p>
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-[11px] font-medium text-[#007AFF]"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Grouped Table View */}
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs overflow-hidden divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {displayTransactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              No transactions match your search{activeFilterCount > 0 ? ' and filters' : ''}.
            </div>
          ) : (
            pagedTransactions.map((tx, index) => {
              const cat = categories.find((c) => c.id === tx.category) || categories[0];
              const isGrey = tx.status === 'grey_area';
              const isMine = tx.spender === authenticatedUser;
              const ownerName = tx.spender === 'husband' ? husbandName : wifeName;
              const isSelected = selectedIds.has(tx.id);
              const isSelectable = isSelectMode && isMine;

              const handleRowClick = () => {
                if (isSelectMode) {
                  if (!isMine) return;
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(tx.id)) next.delete(tx.id);
                    else next.add(tx.id);
                    return next;
                  });
                  return;
                }
                onEditTransaction(tx);
              };

              return (
                <div
                  key={tx.id}
                  onClick={handleRowClick}
                  className={`animate-fade-slide-up p-4 flex items-center justify-between gap-3 transition-colors group ${
                    isSelectMode && !isMine ? 'cursor-default opacity-50' : 'cursor-pointer'
                  } ${
                    isSelected
                      ? 'bg-blue-50/60 dark:bg-blue-950/20'
                      : isGrey
                      ? 'bg-amber-50/40 dark:bg-amber-950/15'
                      : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
                  }`}
                  style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Category icon avatar — swaps to a checkbox in select
                        mode for the user's own transactions only. */}
                    {isSelectable ? (
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-[#007AFF] text-white' : 'bg-black/[0.04] dark:bg-white/[0.08] text-neutral-400'
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </div>
                    ) : (
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: isGrey ? '#FF9500' : cat.color }}
                      >
                        {getCategoryIcon(cat.icon, 'w-5 h-5')}
                      </div>
                    )}

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

                        {recurringTitles.has(tx.title) && (
                          <span
                            className="px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-medium flex items-center gap-1 shrink-0"
                            title="This expense recurs roughly monthly"
                          >
                            <Repeat className="w-2.5 h-2.5" />
                            Recurring
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

                    <div className={`items-center ${isSelectMode ? 'hidden' : 'hidden sm:flex'}`}>
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

        {displayTransactions.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((v) => v + RECENT_ACTIVITY_PAGE_SIZE)}
            className="w-full py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] text-xs font-semibold text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            View more ({displayTransactions.length - visibleCount} left)
          </button>
        )}
      </div>

      <TransactionFilterSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        categories={categories}
        filters={filters}
        onChange={setFilters}
        isShared={isShared}
        husbandName={husbandName}
        wifeName={wifeName}
      />

      {/* Floating bulk-action bar — only ever acts on the selected ids, which
          only ever contain the signed-in user's own transactions. */}
      {isSelectMode && selectedIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 w-[calc(100%-1.5rem)] max-w-md px-4 py-3 rounded-2xl bg-neutral-900 dark:bg-neutral-800 text-white shadow-xl flex items-center justify-between gap-3"
        >
          <span className="text-xs font-semibold shrink-0">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkEditField('category')}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Category</span>
            </button>
            <button
              type="button"
              onClick={() => setBulkEditField('paymentMode')}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Payment</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSelectMode(false);
                setSelectedIds(new Set());
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {bulkEditField && (
        <BulkEditSheet
          field={bulkEditField}
          count={selectedIds.size}
          categories={categories}
          onClose={() => setBulkEditField(null)}
          onApply={async (value) => {
            const updates =
              bulkEditField === 'category' ? { category: value as CategoryId } : { paymentMode: value as Transaction['paymentMode'] };
            await onBulkUpdateTransactions(Array.from(selectedIds), updates);
            setSelectedIds(new Set());
            setIsSelectMode(false);
          }}
        />
      )}
    </div>
  );
};
