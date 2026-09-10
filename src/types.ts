export type SpenderId = 'husband' | 'wife';

export type SplitType = '50-50' | 'husband-full' | 'wife-full' | 'custom';

export type CategoryId =
  | 'dining'
  | 'groceries'
  | 'bills'
  | 'shopping'
  | 'transport'
  | 'entertainment'
  | 'health'
  | 'investments'
  | 'grey_area';

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
    splitType: SplitType;
    customHusbandPercent?: number;
    note?: string;
    resolvedAt?: string;
  };
  splitRatio: {
    husband: number; // percentage, e.g. 50
    wife: number; // percentage, e.g. 50
  };
  isSettlement?: boolean;
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
  transactions: Transaction[];
  goals: SavingsGoal[];
  categories: Category[];
  alerts: BudgetAlert[];
  lastSyncTime: string;
  connectedDevices: DeviceInfo[];
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
