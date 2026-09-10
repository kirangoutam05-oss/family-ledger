import React, { useState, useEffect, useCallback } from 'react';
import {
  LedgerState,
  SpenderId,
  Transaction,
  CategoryId,
  SplitType,
  SavingsGoal,
  DeviceInfo,
} from './types';
import { INITIAL_LEDGER_STATE } from './data/initialData';
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
import { StartupScreen } from './components/StartupScreen';
import { BiometricAuthScreen } from './components/BiometricAuthScreen';
import { AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Sparkles,
  HelpCircle,
  Target,
  Bell,
  Smartphone,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';

type NavTab = 'dashboards' | 'auto_parser' | 'grey_areas' | 'savings_goals' | 'budget_alerts';

export default function App() {
  const [ledger, setLedger] = useState<LedgerState>(INITIAL_LEDGER_STATE);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboards');
  const [activeSpender, setActiveSpender] = useState<SpenderId | 'shared'>('shared');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeviceFrame, setIsDeviceFrame] = useState(false);

  // Active simulated device
  const [currentDevice, setCurrentDevice] = useState<DeviceInfo>(
    INITIAL_LEDGER_STATE.connectedDevices[0]
  );

  // Security & Modals state
  const [isBiometricUnlocked, setIsBiometricUnlocked] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<SpenderId>('husband');
  const [showStartupScreen, setShowStartupScreen] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettleUpModal, setShowSettleUpModal] = useState(false);
  const [showLiveMobileModal, setShowLiveMobileModal] = useState(false);
  const [focusedGreyTxId, setFocusedGreyTxId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const handleBiometricSuccess = (spender: SpenderId) => {
    setIsBiometricUnlocked(true);
    setAuthenticatedUser(spender);
    setActiveSpender(spender);
    setShowStartupScreen(true);
  };

  const handleSwitchUser = () => {
    setIsBiometricUnlocked(false);
    setShowStartupScreen(false);
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

  // Reset demo data
  const handleResetDemo = async () => {
    try {
      const res = await fetch('/api/ledger/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      setLedger(INITIAL_LEDGER_STATE);
    }
  };

  // Switch device
  const handleSwitchDevice = (device: DeviceInfo) => {
    setCurrentDevice(device);
    setActiveSpender(device.owner);
  };

  // Direct jump to resolve grey area
  const handleOpenGreyAreaDirect = (txId: string) => {
    setFocusedGreyTxId(txId);
    setActiveTab('grey_areas');
  };

  const unreadAlertsCount = ledger.alerts.filter((a) => !a.read).length;
  const pendingGreyAreaCount = ledger.transactions.filter((t) => t.status === 'grey_area').length;

  return (
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white flex flex-col font-sans transition-colors selection:bg-blue-500/20">
      {/* Device Frame Wrapper or Full Screen */}
      <div
        className={`w-full transition-all duration-300 mx-auto flex-1 flex flex-col ${
          isDeviceFrame
            ? 'max-w-md my-6 rounded-[48px] shadow-2xl border-[8px] border-neutral-800 bg-[#F2F2F7] dark:bg-[#1C1C1E] overflow-hidden ring-1 ring-black/10'
            : 'max-w-6xl'
        }`}
      >
        {/* Dynamic Island / Device Notch simulation when in device frame */}
        {isDeviceFrame && (
          <div className="w-full bg-[#F2F2F7] dark:bg-[#1C1C1E] pt-3 pb-1 px-6 flex items-center justify-between text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
            <span>9:41</span>
            <div className="w-24 h-5 rounded-full bg-black flex items-center justify-end px-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <span>5G • 100%</span>
          </div>
        )}

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
          currentDevice={currentDevice}
          isDeviceFrame={isDeviceFrame}
          onToggleDeviceFrame={() => setIsDeviceFrame(!isDeviceFrame)}
          onOpenLiveMobile={() => setShowLiveMobileModal(true)}
          onShowStartupScreen={() => setShowStartupScreen(true)}
          onLockLedger={() => setIsBiometricUnlocked(false)}
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
              onSwitchUser={handleSwitchUser}
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
        onResetDemo={handleResetDemo}
        currentDevice={currentDevice}
        onSwitchDevice={handleSwitchDevice}
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
          ledger={ledger}
          authenticatedUser={authenticatedUser}
          onUpdateTransaction={handleUpdateTransaction}
          onDeleteTransaction={handleDeleteTransaction}
        />
      )}

      {/* Settlement Balance Modal */}
      <SettleUpModal
        isOpen={showSettleUpModal}
        onClose={() => setShowSettleUpModal(false)}
        ledger={ledger}
        onAddTransaction={handleAddTransaction}
      />

      {/* Live On Mobile & QR Code Modal */}
      <LiveOnMobileModal
        isOpen={showLiveMobileModal}
        onClose={() => setShowLiveMobileModal(false)}
        ledger={ledger}
        currentDevice={currentDevice}
        onAddTransaction={handleAddTransaction}
      />

      {/* Local-only Biometric Authentication Layer (Face ID / Touch ID / Passcode) */}
      <AnimatePresence>
        {!isBiometricUnlocked && (
          <BiometricAuthScreen
            onAuthenticated={handleBiometricSuccess}
            familyName={ledger.familyName}
            husbandName={ledger.husbandName}
            wifeName={ledger.wifeName}
          />
        )}
      </AnimatePresence>

      {/* Apple-style Startup Splash Screen */}
      <AnimatePresence>
        {isBiometricUnlocked && showStartupScreen && (
          <StartupScreen
            onComplete={() => setShowStartupScreen(false)}
            familyName={ledger.familyName}
            husbandName={ledger.husbandName}
            wifeName={ledger.wifeName}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
