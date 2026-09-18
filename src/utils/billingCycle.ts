// The household's billing cycle runs the 21st of one month through the 20th
// of the next, not the calendar month. Shared by every "this month" figure —
// Overview's KPIs, the Category tab's budget caps, and the server's own
// budget-threshold alerts — so "monthly" means the same window everywhere
// instead of some places drifting to all-time or calendar-month.
export function billingCycleStart(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth() - (d.getDate() < 21 ? 1 : 0), 21);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function billingCycleEnd(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth() + 1, 21);
}

export function billingCycleLabel(start: Date): string {
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 20);
  return `${start.getDate()}/${start.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`;
}

export function isInCurrentBillingCycle(dateStr: string, now: Date = new Date()): boolean {
  const start = billingCycleStart(now);
  const end = billingCycleEnd(start);
  const d = new Date(dateStr);
  return d >= start && d < end;
}
