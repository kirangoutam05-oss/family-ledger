import { Category, LedgerState } from '../types';

export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'dining',
    name: 'Food & Dining',
    color: '#FF3B30', // Apple System Red
    badgeBg: 'bg-red-50 dark:bg-red-950/30',
    badgeText: 'text-red-700 dark:text-red-400',
    badgeBorder: 'border-red-200 dark:border-red-800/40',
    icon: 'UtensilsCrossed',
    budgetMonthly: 16000,
  },
  {
    id: 'groceries',
    name: 'Groceries & Daily',
    color: '#34C759', // Apple System Green
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    badgeText: 'text-emerald-700 dark:text-emerald-400',
    badgeBorder: 'border-emerald-200 dark:border-emerald-800/40',
    icon: 'ShoppingBag',
    budgetMonthly: 22000,
  },
  {
    id: 'bills',
    name: 'Utilities & Rent',
    color: '#007AFF', // Apple System Blue
    badgeBg: 'bg-blue-50 dark:bg-blue-950/30',
    badgeText: 'text-blue-700 dark:text-blue-400',
    badgeBorder: 'border-blue-200 dark:border-blue-800/40',
    icon: 'Zap',
    budgetMonthly: 35000,
  },
  {
    id: 'shopping',
    name: 'Shopping & Style',
    color: '#5856D6', // Apple System Purple
    badgeBg: 'bg-purple-50 dark:bg-purple-950/30',
    badgeText: 'text-purple-700 dark:text-purple-400',
    badgeBorder: 'border-purple-200 dark:border-purple-800/40',
    icon: 'Shirt',
    budgetMonthly: 12000,
  },
  {
    id: 'transport',
    name: 'Travel & Fuel',
    color: '#FF9500', // Apple System Orange
    badgeBg: 'bg-amber-50 dark:bg-amber-950/30',
    badgeText: 'text-amber-700 dark:text-amber-400',
    badgeBorder: 'border-amber-200 dark:border-amber-800/40',
    icon: 'Car',
    budgetMonthly: 9000,
  },
  {
    id: 'entertainment',
    name: 'Entertainment & OTT',
    color: '#FF2D55', // Apple System Pink
    badgeBg: 'bg-pink-50 dark:bg-pink-950/30',
    badgeText: 'text-pink-700 dark:text-pink-400',
    badgeBorder: 'border-pink-200 dark:border-pink-800/40',
    icon: 'Film',
    budgetMonthly: 5000,
  },
  {
    id: 'health',
    name: 'Health & Wellness',
    color: '#AF52DE', // Apple System Indigo
    badgeBg: 'bg-violet-50 dark:bg-violet-950/30',
    badgeText: 'text-violet-700 dark:text-violet-400',
    badgeBorder: 'border-violet-200 dark:border-violet-800/40',
    icon: 'HeartPulse',
    budgetMonthly: 8000,
  },
  {
    id: 'investments',
    name: 'Investments & SIP',
    color: '#00C7BE', // Apple System Teal
    badgeBg: 'bg-teal-50 dark:bg-teal-950/30',
    badgeText: 'text-teal-700 dark:text-teal-400',
    badgeBorder: 'border-teal-200 dark:border-teal-800/40',
    icon: 'TrendingUp',
    budgetMonthly: 40000,
  },
  {
    id: 'grey_area',
    name: 'Grey Area / Needs Context',
    color: '#8E8E93', // Apple System Gray
    badgeBg: 'bg-amber-100/70 dark:bg-amber-950/40',
    badgeText: 'text-amber-900 dark:text-amber-300 font-medium',
    badgeBorder: 'border-amber-300 dark:border-amber-700/60',
    icon: 'HelpCircle',
    budgetMonthly: 0,
  },
];

function generateFamilyId(): string {
  return `FAM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Real starting state for a brand-new household: no seeded people, transactions,
// goals, alerts, or devices. Categories keep sensible default budgets, which
// remain fully editable from the Budget Alerts screen.
export const EMPTY_LEDGER_STATE: LedgerState = {
  familyId: generateFamilyId(),
  familyName: '',
  husbandName: '',
  wifeName: '',
  currency: '₹',
  setupComplete: false,
  lastSyncTime: new Date().toISOString(),
  connectedDevices: [],
  categories: INITIAL_CATEGORIES,
  goals: [],
  alerts: [],
  transactions: [],
  pendingAcknowledgements: [],
};
