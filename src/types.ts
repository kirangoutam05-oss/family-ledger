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
  paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'AmazonPayLater';
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

// Created when one spouse pays for something that's really the other's
// expense — it stays out of `transactions` entirely (so it never counts
// toward totals/trends) until the person it's for accepts it, at which
// point it becomes a real Transaction attributed to them.
export interface PendingAcknowledgement {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: CategoryId;
  paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'AmazonPayLater';
  notes?: string;
  bankName?: string;
  upiRef?: string;
  rawSms?: string;
  paidBy: SpenderId;
  paidFor: SpenderId;
  createdAt: string;
}

// A device-lock PIN reset, gated on the other partner's approval — created when
// someone taps "Forgot PIN" and chooses to ask their partner rather than use the
// invite-code fallback. Lives on the household (not the device) so the other
// partner's own polling picks it up regardless of which device they're on.
export interface LockResetRequest {
  id: string;
  requestedBy: SpenderId;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'approved';
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
  type: 'warning' | 'critical' | 'grey_area' | 'goal' | 'sync' | 'ack_needed' | 'lock_reset_requested';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionType?: 'resolve_grey' | 'view_budget' | 'view_goal' | 'review_ack' | 'approve_lock_reset';
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
  pendingAcknowledgements: PendingAcknowledgement[];
  lockResetRequests: LockResetRequest[];
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
