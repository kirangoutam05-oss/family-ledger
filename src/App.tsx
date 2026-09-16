import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LedgerState,
  SpenderId,
  Transaction,
  CategoryId,
  Category,
  SavingsGoal,
  DeviceIdentity,
} from './types';
import { EMPTY_LEDGER_STATE } from './data/initialData';
import { AppleHeader } from './components/AppleHeader';
import { Dashboards } from './components/Dashboards';
import { SmsUpiParser } from './components/SmsUpiParser';
import { GreyAreaQueue } from './components/GreyAreaQueue';
import { SavingsGoals } from './components/SavingsGoals';
import { BudgetAlerts } from './components/BudgetAlerts';
import { CategoryManager } from './components/CategoryManager';
import { AccountSettings } from './components/AccountSettings';
import { DeviceSyncModal } from './components/DeviceSyncModal';
import { AddTransactionModal } from './components/AddTransactionModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { LiveOnMobileModal } from './components/LiveOnMobileModal';
import { HouseholdSetupScreen } from './components/HouseholdSetupScreen';
import { WhoAreYouScreen } from './components/WhoAreYouScreen';
import {
  LayoutDashboard,
  Sparkles,
  Target,
  UserCog,
  Tags,
} from 'lucide-react';

type NavTab =
  | 'dashboards'
  | 'auto_parser'
  | 'grey_areas'
  | 'categories'
  | 'savings_goals'
  | 'budget_alerts'
  | 'account';
const SPENDER_ORDER: (SpenderId | 'shared')[] = ['shared', 'husband', 'wife'];

// Bottom-nav tab switches (Overview/Grey Areas/Import SMS/Goals) get a plain fade.
// Switching between Shared/Kiran/Mageswari — by swipe or tapping the segmented
// control — gets a directional slide instead, since that's spatially meaningful.
interface ContentTransition {
  mode: 'fade' | 'slide';
  direction: number;
}
const contentVariants = {
  enter: ({ mode, direction }: ContentTransition) =>
    mode === 'slide' ? { opacity: 0, x: direction > 0 ? 28 : -28 } : { opacity: 0 },
  center: { opacity: 1, x: 0 },
  exit: ({ mode, direction }: ContentTransition) =>
    mode === 'slide' ? { opacity: 0, x: direction > 0 ? -28 : 28 } : { opacity: 0 },
};

const IDENTITY_STORAGE_KEY = 'family-ledger:identity';

function loadLocalIdentity(): DeviceIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.role === 'husband' || parsed?.role === 'wife') return parsed as DeviceIdentity;
    return null;
  } catch {
    return null;
  }
}

function saveLocalIdentity(role: SpenderId) {
  const identity: DeviceIdentity = { role, setAt: new Date().toISOString() };
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // localStorage unavailable (private mode, etc.) — identity just won't persist
  }
}

function clearLocalIdentity() {
  try {
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function App() {
  const [ledger, setLedger] = useState<LedgerState>(EMPTY_LEDGER_STATE);
  const [isLedgerLoaded, setIsLedgerLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboards');
  const [activeSpender, setActiveSpender] = useState<SpenderId | 'shared'>('shared');
  const [isSyncing, setIsSyncing] = useState(false);

  // Real per-device identity, persisted locally — not a fake auth flow
  const [identity, setIdentity] = useState<DeviceIdentity | null>(() => loadLocalIdentity());
  const authenticatedUser: SpenderId = identity?.role ?? 'husband';

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLiveMobileModal, setShowLiveMobileModal] = useState(false);
  const [focusedGreyTxId, setFocusedGreyTxId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Bottom-nav tab switches fade; switching Shared/Kiran/Mageswari (from the
  // header dropdown) slides in the direction of the tapped item instead.
  // This used to also trigger on a left/right swipe anywhere in the content
  // area, but that gesture kept firing accidentally while scrolling charts
  // and lists — picking a spender is now only done via the dropdown.
  const [slideDirection, setSlideDirection] = useState(1);
  const [transitionMode, setTransitionMode] = useState<'fade' | 'slide'>('fade');

  const handleTabChange = (tab: NavTab) => {
    setTransitionMode('fade');
    setActiveTab(tab);
  };

  const handleSelectSpender = (spender: SpenderId | 'shared') => {
    const fromIndex = SPENDER_ORDER.indexOf(activeSpender);
    const toIndex = SPENDER_ORDER.indexOf(spender);
    setTransitionMode('slide');
    setSlideDirection(toIndex >= fromIndex ? 1 : -1);
    setActiveSpender(spender);
  };

  // Tapping the household name in the header: jump straight back to the
  // shared Overview tab, from wherever the user currently is.
  const handleGoToOverview = () => {
    handleSelectSpender('shared');
    handleTabChange('dashboards');
  };

  const registerDevice = async (role: SpenderId) => {
    try {
      const res = await fetch('/api/ledger/register-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.warn('Could not register device:', err);
    }
  };

  const handleHouseholdSetup = async (details: {
    familyName: string;
    husbandName: string;
    wifeName: string;
    currency: string;
    myRole: SpenderId;
  }) => {
    const res = await fetch('/api/household/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to set up household');
    }
    const data = await res.json();
    if (data.ledger) setLedger(data.ledger);
    saveLocalIdentity(details.myRole);
    setIdentity({ role: details.myRole, setAt: new Date().toISOString() });
    setActiveSpender('shared');
    await registerDevice(details.myRole);
  };

  const handleUpdateHousehold = async (details: {
    familyName: string;
    husbandName: string;
    wifeName: string;
    currency: string;
  }) => {
    const res = await fetch('/api/household/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to update household');
    }
    const data = await res.json();
    if (data.ledger) setLedger(data.ledger);
  };

  const handleWhoAreYou = async (role: SpenderId) => {
    saveLocalIdentity(role);
    setIdentity({ role, setAt: new Date().toISOString() });
    setActiveSpender('shared');
    await registerDevice(role);
  };

  const handleSwitchUser = () => {
    clearLocalIdentity();
    setIdentity(null);
  };

  // Update transaction with spouse ownership enforcement
  const handleUpdateTransaction = async (tx: Transaction) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/ledger/transaction/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: tx,
          authenticatedSpender: authenticatedUser,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update transaction');
      }
    } catch (err: any) {
      console.error('Failed to update transaction:', err);
      alert(err.message || 'Permission denied: You can only edit your own expenses.');
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  // Delete transaction with spouse ownership enforcement
  const handleDeleteTransaction = async (transactionId: string) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/ledger/transaction/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          authenticatedSpender: authenticatedUser,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete transaction');
      }
    } catch (err: any) {
      console.error('Failed to delete transaction:', err);
      alert(err.message || 'Permission denied: You can only delete your own expenses.');
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch ledger from server
  const fetchLedger = useCallback(async () => {
    try {
      const res = await fetch('/api/ledger');
      if (res.ok) {
        const data = await res.json();
        setLedger(data);
      }
    } catch (err) {
      console.warn('Could not fetch server ledger, using local state:', err);
    } finally {
      setIsLedgerLoaded(true);
    }
  }, []);

  // Periodic polling for multi-device sync
  useEffect(() => {
    fetchLedger();
    const interval = setInterval(fetchLedger, 4000);
    return () => clearInterval(interval);
  }, [fetchLedger]);

  // Sync state to server
  const syncLedgerToServer = async (updatedLedger: LedgerState) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/ledger/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedLedger),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.error('Failed to sync to server:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Add transaction
  const handleAddTransaction = async (tx: Transaction) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/ledger/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      } else {
        // Fallback local update
        setLedger((prev) => ({
          ...prev,
          transactions: [tx, ...prev.transactions],
          lastSyncTime: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error('Failed to post transaction:', err);
      setLedger((prev) => ({
        ...prev,
        transactions: [tx, ...prev.transactions],
        lastSyncTime: new Date().toISOString(),
      }));
    } finally {
      setIsSyncing(false);
    }
  };

  // Resolve grey area context
  const handleResolveGreyArea = async (
    transactionId: string,
    category: CategoryId,
    note?: string,
    title?: string
  ) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/ledger/resolve-grey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          category,
          note,
          title,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      } else {
        // Fallback local update
        setLedger((prev) => {
          const updatedTxs = prev.transactions.map((t) => {
            if (t.id === transactionId) {
              return {
                ...t,
                status: 'resolved' as const,
                category,
                title: title?.trim() ? title.trim() : t.title,
                notes: note ? (t.notes ? `${t.notes} • ${note}` : note) : t.notes,
              };
            }
            return t;
          });

          return {
            ...prev,
            transactions: updatedTxs,
            alerts: prev.alerts.filter((a) => a.targetId !== transactionId),
            lastSyncTime: new Date().toISOString(),
          };
        });
      }
    } catch (err) {
      console.error('Failed to resolve grey area:', err);
    } finally {
      setIsSyncing(false);
      setFocusedGreyTxId(null);
    }
  };

  // Contribute to savings goal
  const handleContributeGoal = async (
    goalId: string,
    contributor: SpenderId,
    amount: number
  ) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/ledger/goal-contribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, contributor, amount }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.error('Failed to contribute goal:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Add new savings goal
  const handleAddGoal = async (goal: SavingsGoal) => {
    const updated = {
      ...ledger,
      goals: [goal, ...ledger.goals],
      lastSyncTime: new Date().toISOString(),
    };
    setLedger(updated);
    await syncLedgerToServer(updated);
  };

  // Update category budget
  const handleUpdateBudget = async (categoryId: CategoryId, newLimit: number) => {
    const updatedCategories = ledger.categories.map((c) =>
      c.id === categoryId ? { ...c, budgetMonthly: newLimit } : c
    );
    const updated = {
      ...ledger,
      categories: updatedCategories,
      lastSyncTime: new Date().toISOString(),
    };
    setLedger(updated);
    await syncLedgerToServer(updated);
  };

  // Add a new custom category
  const handleAddCategory = async (details: { name: string; icon: string; color: string; budgetMonthly: number }) => {
    const res = await fetch('/api/ledger/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to add category');
    }
    const data = await res.json();
    if (data.ledger) setLedger(data.ledger);
  };

  // Update an existing category's name, icon, color, or budget
  const handleUpdateCategory = async (
    categoryId: string,
    updates: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'budgetMonthly'>>
  ) => {
    const res = await fetch('/api/ledger/categories/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, ...updates }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to update category');
    }
    const data = await res.json();
    if (data.ledger) setLedger(data.ledger);
  };

  // Delete a category (its transactions get reassigned server-side)
  const handleDeleteCategory = async (categoryId: string) => {
    const res = await fetch('/api/ledger/categories/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to delete category');
    }
    const data = await res.json();
    if (data.ledger) setLedger(data.ledger);
  };

  // Dismiss alert
  const handleDismissAlert = (alertId: string) => {
    const updated = {
      ...ledger,
      alerts: ledger.alerts.filter((a) => a.id !== alertId),
    };
    setLedger(updated);
    syncLedgerToServer(updated);
  };

  // Wipe all household data (transactions/goals/alerts), keeping household setup intact
  const handleResetHousehold = async () => {
    try {
      const res = await fetch('/api/ledger/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.error('Failed to reset household data:', err);
    }
  };

  // Direct jump to resolve grey area
  const handleOpenGreyAreaDirect = (txId: string) => {
    setFocusedGreyTxId(txId);
    handleTabChange('grey_areas');
  };

  const unreadAlertsCount = ledger.alerts.filter((a) => !a.read).length;

  // Wait for the initial fetch before deciding which screen to show, so a
  // returning user doesn't flash the setup screen while the real ledger loads.
  if (!isLedgerLoaded) {
    return <div className="min-h-dvh bg-gradient-to-b from-[#F7F7FB] to-[#EBEBF0] dark:from-[#0A0A0C] dark:to-[#000000]" />;
  }

  if (!ledger.setupComplete) {
    return <HouseholdSetupScreen onComplete={handleHouseholdSetup} />;
  }

  if (!identity) {
    return (
      <WhoAreYouScreen
        familyName={ledger.familyName}
        husbandName={ledger.husbandName}
        wifeName={ledger.wifeName}
        onSelect={handleWhoAreYou}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#F7F7FB] to-[#EBEBF0] dark:from-[#0A0A0C] dark:to-[#000000] text-neutral-900 dark:text-white flex flex-col font-sans transition-colors selection:bg-blue-500/20">
      <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col">
        {/* Apple Top Navigation Bar */}
        <AppleHeader
          familyName={ledger.familyName}
          activeSpender={activeSpender}
          authenticatedUser={authenticatedUser}
          onSelectSpender={handleSelectSpender}
          onGoToOverview={handleGoToOverview}
          husbandName={ledger.husbandName}
          wifeName={ledger.wifeName}
          unreadAlertsCount={unreadAlertsCount}
          onOpenNotifications={() => handleTabChange('budget_alerts')}
          onOpenSyncModal={() => setShowSyncModal(true)}
          onOpenAddModal={() => setShowAddModal(true)}
          isSyncing={isSyncing}
          lastSyncTime={ledger.lastSyncTime}
          onLockLedger={handleSwitchUser}
          onSwitchUser={handleSwitchUser}
        />

        {/* Main Body Content */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-28 overflow-x-hidden">
          <AnimatePresence mode="wait" custom={{ mode: transitionMode, direction: slideDirection }} initial={false}>
            <motion.div
              key={`${activeTab}-${activeSpender}`}
              custom={{ mode: transitionMode, direction: slideDirection }}
              variants={contentVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'dashboards' && (
                <Dashboards
                  ledger={ledger}
                  activeSpender={activeSpender}
                  authenticatedUser={authenticatedUser}
                  onSelectSpender={handleSelectSpender}
                  onResolveGreyArea={handleOpenGreyAreaDirect}
                  onEditTransaction={(tx) => setEditingTransaction(tx)}
                />
              )}

              {activeTab === 'auto_parser' && (
                <SmsUpiParser
                  ledger={ledger}
                  activeSpender={activeSpender}
                  onAddTransaction={handleAddTransaction}
                />
              )}

              {activeTab === 'grey_areas' && (
                <GreyAreaQueue
                  ledger={ledger}
                  authenticatedUser={authenticatedUser}
                  onResolve={handleResolveGreyArea}
                  focusedTransactionId={focusedGreyTxId}
                />
              )}

              {activeTab === 'categories' && (
                <CategoryManager
                  ledger={ledger}
                  onAddCategory={handleAddCategory}
                  onUpdateCategory={handleUpdateCategory}
                  onDeleteCategory={handleDeleteCategory}
                />
              )}

              {activeTab === 'savings_goals' && (
                <SavingsGoals
                  ledger={ledger}
                  onContribute={handleContributeGoal}
                  onAddGoal={handleAddGoal}
                  activeSpender={activeSpender}
                />
              )}

              {activeTab === 'budget_alerts' && (
                <BudgetAlerts
                  ledger={ledger}
                  onDismissAlert={handleDismissAlert}
                  onUpdateBudget={handleUpdateBudget}
                  onResolveGreyArea={handleOpenGreyAreaDirect}
                />
              )}

              {activeTab === 'account' && (
                <AccountSettings
                  ledger={ledger}
                  authenticatedUser={authenticatedUser}
                  onUpdateHousehold={handleUpdateHousehold}
                  onSwitchUser={handleSwitchUser}
                  onOpenSyncModal={() => setShowSyncModal(true)}
                  onOpenLiveMobile={() => setShowLiveMobileModal(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Floating Liquid-Glass tab bar — inset from the edges rather than flush,
            so it reads as a distinct navigation layer hovering over content. */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <div className="glass-nav w-full max-w-md rounded-[28px] border border-black/[0.06] dark:border-white/[0.1] shadow-xl shadow-black/10 dark:shadow-black/40 pt-2 pb-2 px-4 flex items-center justify-around transition-all">
            <button
              onClick={() => handleTabChange('dashboards')}
              className={`flex-1 py-1 flex flex-col items-center gap-0.5 transition-all active:scale-90 ${
                activeTab === 'dashboards'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">Overview</span>
            </button>

            <button
              onClick={() => handleTabChange('categories')}
              className={`flex-1 py-1 flex flex-col items-center gap-0.5 transition-all active:scale-90 ${
                activeTab === 'categories'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <Tags className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">Category</span>
            </button>

            {/* Import SMS — elevated, highlighted center action */}
            <div className="flex-1 flex flex-col items-center">
              <button
                onClick={() => handleTabChange('auto_parser')}
                className={`-mt-7 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30 ring-4 ring-white dark:ring-[#1C1C1E] transition-transform active:scale-95 ${
                  activeTab === 'auto_parser' ? 'scale-105' : ''
                }`}
                style={{ background: 'linear-gradient(135deg, #0A84FF, #5856D6)' }}
              >
                <Sparkles className="w-6 h-6 text-white" />
              </button>
              <span
                className={`text-[10px] font-medium tracking-tight mt-0.5 ${
                  activeTab === 'auto_parser' ? 'text-[#007AFF]' : 'text-neutral-400 dark:text-neutral-500'
                }`}
              >
                Import SMS
              </span>
            </div>

            <button
              onClick={() => handleTabChange('savings_goals')}
              className={`flex-1 py-1 flex flex-col items-center gap-0.5 transition-all active:scale-90 ${
                activeTab === 'savings_goals'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <Target className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">Goals</span>
            </button>

            <button
              onClick={() => handleTabChange('account')}
              className={`flex-1 py-1 flex flex-col items-center gap-0.5 transition-all active:scale-90 ${
                activeTab === 'account'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <UserCog className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">Account</span>
            </button>
          </div>
        </nav>
      </div>

      <AnimatePresence>
        {/* Cross-Device Cloud Sync Modal */}
        {showSyncModal && (
          <DeviceSyncModal
            key="sync-modal"
            isOpen={showSyncModal}
            onClose={() => setShowSyncModal(false)}
            ledger={ledger}
            onTriggerSync={fetchLedger}
            isSyncing={isSyncing}
            onResetHousehold={handleResetHousehold}
            authenticatedUser={authenticatedUser}
            onSwitchUser={() => {
              setShowSyncModal(false);
              handleSwitchUser();
            }}
          />
        )}

        {/* Manual Add Expense Modal */}
        {showAddModal && (
          <AddTransactionModal
            key="add-modal"
            onClose={() => setShowAddModal(false)}
            ledger={ledger}
            onAddTransaction={handleAddTransaction}
            authenticatedUser={authenticatedUser}
          />
        )}

        {/* Edit / Inspect Transaction Modal with Ownership Security */}
        {editingTransaction && (
          <EditTransactionModal
            key="edit-modal"
            isOpen={!!editingTransaction}
            onClose={() => setEditingTransaction(null)}
            transaction={editingTransaction}
            authenticatedUser={authenticatedUser}
            husbandName={ledger.husbandName}
            wifeName={ledger.wifeName}
            currency={ledger.currency}
            categories={ledger.categories}
            onSave={(transactionId, updates) =>
              handleUpdateTransaction({ ...editingTransaction, id: transactionId, ...updates } as Transaction)
            }
            onDelete={handleDeleteTransaction}
          />
        )}

        {/* Live On Mobile & QR Code Modal (invite your partner to install) */}
        {showLiveMobileModal && (
          <LiveOnMobileModal
            key="live-mobile-modal"
            isOpen={showLiveMobileModal}
            onClose={() => setShowLiveMobileModal(false)}
          />
        )}

      </AnimatePresence>
    </div>
  );
}
