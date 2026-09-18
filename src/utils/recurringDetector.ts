import { Transaction, CategoryId } from '../types';

export interface RecurringGroup {
  title: string;
  categoryId: CategoryId;
  occurrences: Transaction[];
  avgAmount: number;
  lastDate: string;
  nextExpectedDate: string;
}

const MIN_GAP_DAYS = 20;
const MAX_GAP_DAYS = 40;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / MS_PER_DAY;
}

function monthKey(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

// Groups debit transactions by normalized title and flags a group as recurring
// once it spans at least two different calendar months and *some* pair of its
// occurrences is spaced roughly a month apart (20-40 days) — deliberately not
// requiring every consecutive pair to line up, since one skipped/adjusted/
// double-billed month shouldn't erase an otherwise-monthly bill's flag.
export function detectRecurringGroups(transactions: Transaction[]): RecurringGroup[] {
  const byTitle = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (tx.type !== 'debit') continue;
    const key = tx.title.trim().toLowerCase();
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key)!.push(tx);
  }

  const groups: RecurringGroup[] = [];
  for (const occurrences of byTitle.values()) {
    if (occurrences.length < 2) continue;

    const sorted = [...occurrences].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const distinctMonths = new Set(sorted.map((t) => monthKey(t.date)));
    if (distinctMonths.size < 2) continue;

    const hasMonthlyPair = sorted.some((a, i) =>
      sorted.slice(i + 1).some((b) => {
        const gap = daysBetween(a.date, b.date);
        return gap >= MIN_GAP_DAYS && gap <= MAX_GAP_DAYS;
      })
    );
    if (!hasMonthlyPair) continue;

    const last = sorted[sorted.length - 1];
    const avgAmount =
      sorted.reduce((sum, t) => sum + t.amount, 0) / sorted.length;

    groups.push({
      title: last.title,
      categoryId: last.category,
      occurrences: sorted,
      avgAmount,
      lastDate: last.date,
      nextExpectedDate: new Date(new Date(last.date).getTime() + 30 * MS_PER_DAY).toISOString(),
    });
  }

  return groups;
}
