import { Transaction, CategoryId } from '../types';

export interface RecurringGroup {
  title: string;
  categoryId: CategoryId;
  occurrences: Transaction[];
  avgAmount: number;
  lastDate: string;
  nextExpectedDate: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Groups debit transactions by normalized title, and treats a group as
// recurring only because someone said so — at least one of its occurrences
// carries isRecurring.
//
// This used to also guess, from two occurrences in different months spaced
// 20-40 days apart. Guessing was wrong often enough to be worse than not
// guessing: a fortnightly grocery run, two unrelated payments that happen to
// share a payee name, or a one-off repeated by coincidence all looked
// identical to a real monthly bill, and the badge then asserted something the
// app did not know. Marking is one tap in the add and edit forms, and a
// person knows in a way the shape of the data does not.
//
// Marking any one occurrence flags the whole title group, so you tag Netflix
// once rather than every month.
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
    const sorted = [...occurrences].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const userConfirmed = sorted.some((t) => t.isRecurring);
    if (!userConfirmed) continue;

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
