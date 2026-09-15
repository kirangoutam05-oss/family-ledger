import React, { useState, useEffect, useCallback } from 'react';
import {
  LedgerState,
  SpenderId,
  Transaction,
  CategoryId,
  SplitType,
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
import { DeviceSyncModal } from './components/DeviceSyncModal';
import { AddTransactionModal } from './components/AddTransactionModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { SettleUpModal } from './components/SettleUpModal';
import { LiveOnMobileModal } from './components/LiveOnMobileModal';
import { HouseholdSetupScreen } from './components/HouseholdSetupScreen';
import { WhoAreYouScreen } from './components/WhoAreYouScreen';
import {
  LayoutDashboard,
  Sparkles,
  HelpCircle,
  Target,
  Bell,
} from 'lucide-react';

type NavTab = 'dashboards' | 'auto_parser' | 'grey_areas' | 'savings_goals' | 'budget_alerts';

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
  const [showSettleUpModal, setShowSettleUpModal] = useState(false);
  const [showLiveMobileModal, setShowLiveMobileModal] = useState(false);
  const [focusedGreyTxId, setFocusedGreyTxId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

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
    splitType: SplitType,
    customHusbandPercent?: number,
    note?: string
  ) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/ledger/resolve-grey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          category,
          splitType,
          customHusbandPercent,
          note,
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
              let hSplit = 50;
              let wSplit = 50;
              if (splitType === 'husband-full') {
                hSplit = 100;
                wSplit = 0;
              } else if (splitType === 'wife-full') {
                hSplit = 0;
                wSplit = 100;
              } else if (splitType === 'custom' && customHusbandPercent !== undefined) {
                hSplit = customHusbandPercent;
                wSplit = 100 - customHusbandPercent;
              }

              return {
                ...t,
                status: 'resolved' as const,
                category,
                splitRatio: { husband: hSplit, wife: wSplit },
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
    setActiveTab('grey_areas');
  };

  const unreadAlertsCount = ledger.alerts.filter((a) => !a.read).length;
  const pendingGreyAreaCount = ledger.transactions.filter((t) => t.status === 'grey_area').length;

  // Wait for the initial fetch before deciding which screen to show, so a
  // returning user doesn't flash the setup screen while the real ledger loads.
  if (!isLedgerLoaded) {
    return <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#000000]" />;
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
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white flex flex-col font-sans transition-colors selection:bg-blue-500/20">
      <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col">
        {/* Apple Top Navigation Bar */}
        <AppleHeader
          familyName={ledger.familyName}
          activeSpender={activeSpender}
          authenticatedUser={authenticatedUser}
          onSelectSpender={setActiveSpender}
          husbandName={ledger.husbandName}
          wifeName={ledger.wifeName}
          unreadAlertsCount={unreadAlertsCount}
          onOpenNotifications={() => setActiveTab('budget_alerts')}
          onOpenSyncModal={() => setShowSyncModal(true)}
          onOpenAddModal={() => setShowAddModal(true)}
          isSyncing={isSyncing}
          lastSyncTime={ledger.lastSyncTime}
          onOpenLiveMobile={() => setShowLiveMobileModal(true)}
          onLockLedger={handleSwitchUser}
          onSwitchUser={handleSwitchUser}
        />

        {/* Main Body Content */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-28">
          {activeTab === 'dashboards' && (
            <Dashboards
              ledger={ledger}
              activeSpender={activeSpender}
              authenticatedUser={authenticatedUser}
              onSelectSpender={setActiveSpender}
              onResolveGreyArea={handleOpenGreyAreaDirect}
              onEditTransaction={(tx) => setEditingTransaction(tx)}
              onSettleUp={() => setShowSettleUpModal(true)}
            />
          )}

          {activeTab === 'auto_parser' && (
            <SmsUpiParser
              ledger={ledger}
              activeSpender={activeSpender}
              onAddTransaction={handleAddTransaction}
              onResolveGreyArea={handleOpenGreyAreaDirect}
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
        </main>

        {/* Clean Apple iOS Tab Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-xl border-t border-black/[0.06] dark:border-white/[0.08] pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] px-4 transition-all">
          <div className="max-w-md mx-auto flex items-center justify-around">
            <button
              onClick={() => setActiveTab('dashboards')}
              className={`flex-1 py-1 flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'dashboards'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('auto_parser')}
              className={`flex-1 py-1 flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'auto_parser'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <Sparkles className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">Import SMS</span>
            </button>

            <button
              onClick={() => setActiveTab('grey_areas')}
              className={`relative flex-1 py-1 flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'grey_areas'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <div className="relative">
                <HelpCircle className="w-5 h-5" />
                {pendingGreyAreaCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {pendingGreyAreaCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium tracking-tight">Grey Areas</span>
            </button>

            <button
              onClick={() => setActiveTab('savings_goals')}
              className={`flex-1 py-1 flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'savings_goals'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <Target className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">Goals</span>
            </button>

            <button
              onClick={() => setActiveTab('budget_alerts')}
              className={`relative flex-1 py-1 flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'budget_alerts'
                  ? 'text-[#007AFF]'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <div className="relative">
                <Bell className="w-5 h-5" />
                {unreadAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadAlertsCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium tracking-tight">Alerts</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Cross-Device Cloud Sync Modal */}
      <DeviceSyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        ledger={ledger}
        onTriggerSync={fetchLedger}
        isSyncing={isSyncing}
        onResetHousehold={handleResetHousehold}
      />

      {/* Manual Add Expense Modal */}
      <AddTransactionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        ledger={ledger}
        onAddTransaction={handleAddTransaction}
        authenticatedUser={authenticatedUser}
      />

      {/* Edit / Inspect Transaction Modal with Ownership Security */}
      {editingTransaction && (
        <EditTransactionModal
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

      {/* Settlement Balance Modal */}
      <SettleUpModal
        isOpen={showSettleUpModal}
        onClose={() => setShowSettleUpModal(false)}
        ledger={ledger}
        onAddTransaction={handleAddTransaction}
      />

      {/* Live On Mobile & QR Code Modal (invite your partner to install) */}
      <LiveOnMobileModal
        isOpen={showLiveMobileModal}
        onClose={() => setShowLiveMobileModal(false)}
      />
    </div>
  );
}
