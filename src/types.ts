export type SpenderId = 'husband' | 'wife';

// A category id is any string — the built-in categories ('dining', 'groceries', etc.)
// plus whatever ids get generated for user-created custom categories. 'grey_area' is
// reserved: it's the system bucket for ambiguous transactions and can't be deleted.
export type CategoryId = string;

// The full set of icons offered when creating or editing a category. Kept as plain
// data (no React import) so both the client (icon picker, rendering) and the server
// (validating a submitted icon name) can share one list.
export const CATEGORY_ICON_OPTIONS = [
  'UtensilsCrossed',
  'ShoppingBag',
  'Zap',
  'Shirt',
  'Car',
  'Film',
  'HeartPulse',
  'TrendingUp',
  'Plane',
  'ShieldCheck',
  'Speaker',
  'Home',
  'Gift',
  'Wifi',
  'Coffee',
  'Dumbbell',
  'GraduationCap',
  'Wrench',
  'Music',
  'Gamepad2',
  'Fuel',
  'Baby',
  'PawPrint',
  'Briefcase',
  'Palette',
  'PiggyBank',
] as const;

export interface Category {
  id: CategoryId;
  name: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  icon: string;
  budgetMonthly: number;
}

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: 'debit' | 'credit';
  date: string; // ISO string or YYYY-MM-DD HH:mm
  spender: SpenderId;
  category: CategoryId;
  paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash';
  upiRef?: string;
  bankName?: string;
  rawSms?: string;
  status: 'verified' | 'grey_area' | 'resolved';
  greyAreaReason?: string;
  contextQuestion?: string;
  contextResolution?: {
    note?: string;
    resolvedAt?: string;
  };
  notes?: string;
}

export interface GoalContribution {
  id: string;
  contributor: SpenderId;
  amount: number;
  date: string;
}

export interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  icon: string;
  color: string;
  contributions: GoalContribution[];
}

export interface BudgetAlert {
  id: string;
  type: 'warning' | 'critical' | 'grey_area' | 'goal' | 'sync';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionType?: 'resolve_grey' | 'view_budget' | 'view_goal';
  targetId?: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  owner: SpenderId;
  deviceModel: string;
  lastActive: string;
  isOnline: boolean;
}

export interface LedgerState {
  familyId: string;
  familyName: string;
  husbandName: string;
  wifeName: string;
  currency: string;
  setupComplete: boolean;
  transactions: Transaction[];
  goals: SavingsGoal[];
  categories: Category[];
  alerts: BudgetAlert[];
  lastSyncTime: string;
  connectedDevices: DeviceInfo[];
}

export interface DeviceIdentity {
  role: SpenderId;
  setAt: string;
}

export interface ParseSmsRequest {
  smsText: string;
  defaultSpender?: SpenderId;
}

export interface ParseSmsResponse {
  success: boolean;
  transactions: Partial<Transaction>[];
  parsedCount: number;
  source: 'gemini' | 'heuristic';
  rawResponse?: string;
}
