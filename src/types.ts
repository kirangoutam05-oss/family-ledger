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
  'Repeat',
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

export type PaymentMode = 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'AmazonPayLater' | 'Pluxee';

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: 'debit' | 'credit';
  date: string; // ISO string or YYYY-MM-DD HH:mm
  spender: SpenderId;
  category: CategoryId;
  paymentMode: PaymentMode;
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
  // Set by the person logging it, not inferred — "yes, this repeats" is a
  // stronger, immediate signal than waiting for the same title to reappear
  // for two months before the recurring detector notices on its own.
  isRecurring?: boolean;
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
  paymentMode: PaymentMode;
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
  type:
    | 'warning'
    | 'critical'
    | 'grey_area'
    | 'goal'
    | 'sync'
    | 'ack_needed'
    | 'lock_reset_requested'
    | 'expense_added'
    | 'recurring_due'
    | 'daily_reminder';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionType?: 'resolve_grey' | 'view_budget' | 'view_goal' | 'review_ack' | 'approve_lock_reset';
  targetId?: string;
  // When set, this alert is only shown to that spender's own device (e.g. "your
  // partner added an expense" shouldn't also show up for the partner who added
  // it). Left unset for every existing alert type, which stays visible to both.
  forSpender?: SpenderId;
}

// The JSON shape returned by PushSubscription.toJSON() in the browser — stored
// as-is so it can be handed straight to web-push's sendNotification on the server.
export interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface DeviceInfo {
  id: string;
  name: string;
  owner: SpenderId;
  deviceModel: string;
  lastActive: string;
  isOnline: boolean;
  pushSubscription?: StoredPushSubscription;
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
  // ISO date (YYYY-MM-DD) the daily-reminder cron last ran for this household —
  // keeps a second same-day ping from re-sending everything.
  lastReminderRun?: string;
  // Which window the "Amount vs Category" card sums over. Unset (older
  // households) is treated as 'month' client-side.
  categoryBreakdownPeriod?: 'month' | 'year' | 'all';
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
