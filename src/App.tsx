import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LedgerState,
  SpenderId,
  Transaction,
  CategoryId,
  Category,
  SavingsGoal,
  DeviceIdentity,
  PendingAcknowledgement,
  LockResetRequest,
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
import { PendingAckModal } from './components/PendingAckModal';
import { LockResetApprovalModal } from './components/LockResetApprovalModal';
import { LiveOnMobileModal } from './components/LiveOnMobileModal';
import { HouseholdSetupScreen } from './components/HouseholdSetupScreen';
import { WhoAreYouScreen } from './components/WhoAreYouScreen';
import { GetStartedScreen } from './components/GetStartedScreen';
import { InvitePartnerScreen } from './components/InvitePartnerScreen';
import { AppLockSetupScreen } from './components/AppLockSetupScreen';
import { AppLockScreen } from './components/AppLockScreen';
import { StartupScreen } from './components/StartupScreen';
import {
  LayoutDashboard,
  Sparkles,
  Target,
  UserCog,
  Tags,
} from 'lucide-react';
import {
  apiFetch,
  buildInviteUrl,
  extractHouseholdIdFromText,
  resolveHouseholdIdOnBoot,
  setStoredHouseholdId,
} from './utils/household';
import { LockConfig, clearLockConfig, isLockSkipped, loadLockConfig, setLockSkipped } from './utils/appLock';

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

// Which "paid for you" acknowledgements have already been shown as a pop-up
// on this device — so a still-pending item only interrupts once (the first
// time it's seen), and otherwise just sits quietly in Budget Alerts.
const SEEN_ACK_POPUPS_KEY = 'family-ledger:seen-ack-popups';

function loadSeenAckPopupIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_ACK_POPUPS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markAckPopupSeen(id: string) {
  try {
    const seen = loadSeenAckPopupIds();
    seen.add(id);
    localStorage.setItem(SEEN_ACK_POPUPS_KEY, JSON.stringify([...seen]));
  } catch {
    // ignore
  }
}

// Same one-time-interrupt pattern as the ack popups, for "my partner is
// locked out and wants me to approve a PIN reset" requests.
const SEEN_LOCK_RESET_POPUPS_KEY = 'family-ledger:seen-lock-reset-popups';

function loadSeenLockResetPopupIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_LOCK_RESET_POPUPS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markLockResetPopupSeen(id: string) {
  try {
    const seen = loadSeenLockResetPopupIds();
    seen.add(id);
    localStorage.setItem(SEEN_LOCK_RESET_POPUPS_KEY, JSON.stringify([...seen]));
  } catch {
    // ignore
  }
}

// How long the app can sit backgrounded before it re-locks on return — long
// enough that a quick switch to reply to a text doesn't re-prompt, short
// enough that a phone left down for real stays protected.
const RELOCK_GRACE_MS = 45_000;

export default function App() {
  const [ledger, setLedger] = useState<LedgerState>(EMPTY_LEDGER_STATE);
  const [isLedgerLoaded, setIsLedgerLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboards');
  const [activeSpender, setActiveSpender] = useState<SpenderId | 'shared'>('shared');
  const [isSyncing, setIsSyncing] = useState(false);

  // Real per-device identity, persisted locally — not a fake auth flow
  const [identity, setIdentity] = useState<DeviceIdentity | null>(() => loadLocalIdentity());
  const authenticatedUser: SpenderId = identity?.role ?? 'husband';

  // Which household this device belongs to — resolved once on first mount from
  // a /join/<id> link, a previously stored id, or (for devices that already had
  // an identity before multi-tenancy shipped) the original single household.
  const [household] = useState(() => resolveHouseholdIdOnBoot(!!loadLocalIdentity()));
  const [householdId, setHouseholdId] = useState<string | null>(household.householdId);
  const [justInvited, setJustInvited] = useState(false);

  // Device-level app lock (Face ID/Touch ID/PIN) — always starts locked; only
  // AppLockSetupScreen/AppLockScreen ever flip it to true.
  const [lockConfig, setLockConfig] = useState<LockConfig | null>(() => loadLockConfig());
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasSkippedLock, setHasSkippedLock] = useState(() => isLockSkipped());
  const lastHiddenAt = useRef<number | null>(null);

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLiveMobileModal, setShowLiveMobileModal] = useState(false);
  const [focusedGreyTxId, setFocusedGreyTxId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [reviewingPendingAck, setReviewingPendingAck] = useState<PendingAcknowledgement | null>(null);
  const [reviewingLockResetRequest, setReviewingLockResetRequest] = useState<LockResetRequest | null>(null);

  // A freshly clicked /join/<id> link is password-equivalent — persist it, then
  // scrub it out of the URL bar/history immediately rather than leaving it
  // sitting there.
  useEffect(() => {
    if (household.fromJoinLink && household.householdId) {
      setStoredHouseholdId(household.householdId);
      window.history.replaceState({}, '', '/');
    }
  }, [household]);

  // Re-lock after the app has been backgrounded past the grace period —
  // switching away briefly (e.g. to reply to a text) doesn't re-prompt, but a
  // phone left down for real does.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        lastHiddenAt.current = Date.now();
      } else if (lastHiddenAt.current !== null && Date.now() - lastHiddenAt.current > RELOCK_GRACE_MS) {
        setIsUnlocked(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const handleHouseholdReady = (id: string) => {
    setStoredHouseholdId(id);
    setHouseholdId(id);
  };

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
      const res = await apiFetch('/api/ledger/register-device', {
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
    const res = await apiFetch('/api/household/setup', {
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
    setJustInvited(true);
    await registerDevice(details.myRole);
  };

  const handleUpdateHousehold = async (details: {
    familyName: string;
    husbandName: string;
    wifeName: string;
    currency: string;
  }) => {
    const res = await apiFetch('/api/household/update', {
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

  const handleLockSetupComplete = () => {
    setLockConfig(loadLockConfig());
    setIsUnlocked(true);
  };

  // Not everyone wants a PIN gate on a shared expense app — this skips it
  // entirely rather than forcing one, and can be turned back on anytime from
  // Account Settings.
  const handleSkipLock = () => {
    setLockSkipped(true);
    setHasSkippedLock(true);
  };

  const handleEnableLock = () => {
    setLockSkipped(false);
    setHasSkippedLock(false);
  };

  // No PIN can be recovered on its own (there's no server-known secret behind
  // it) — the normal path is asking the other partner to approve a reset from
  // their own, already-unlocked device; see the lock-reset-request effect below
  // for how an approval on the server gets noticed and consumed on this end.
  const handleRequestLockReset = async () => {
    try {
      const res = await apiFetch('/api/ledger/lock-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: authenticatedUser }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.error('Failed to request a PIN reset:', err);
    }
  };

  const handleCancelLockReset = async () => {
    const mine = ledger.lockResetRequests.find((r) => r.requestedBy === authenticatedUser);
    if (!mine) return;
    try {
      const res = await apiFetch('/api/ledger/lock-reset/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mine.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.error('Failed to cancel the PIN reset request:', err);
    }
  };

  const handleApproveLockReset = async (id: string) => {
    try {
      const res = await apiFetch('/api/ledger/lock-reset/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approvedBy: authenticatedUser }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to approve the PIN reset.');
      }
    } catch (err) {
      console.error('Failed to approve the PIN reset:', err);
    } finally {
      setReviewingLockResetRequest(null);
    }
  };

  const handleDenyLockReset = async (id: string) => {
    try {
      const res = await apiFetch('/api/ledger/lock-reset/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.error('Failed to deny the PIN reset:', err);
    } finally {
      setReviewingLockResetRequest(null);
    }
  };

  const handleOpenReviewLockReset = (id: string) => {
    const request = ledger.lockResetRequests.find((r) => r.id === id);
    if (request) setReviewingLockResetRequest(request);
  };

  // The "both forgot" fallback: proving you know the household's own invite
  // code/link is the same bar as joining a device in the first place, so it's
  // allowed to reset this device's lock without needing partner approval.
  const handleResetWithInviteCode = (code: string): boolean => {
    const parsed = extractHouseholdIdFromText(code);
    if (!parsed || parsed !== householdId) return false;
    clearLockConfig();
    setLockConfig(null);
    return true;
  };

  // Update transaction with spouse ownership enforcement
  const handleUpdateTransaction = async (tx: Transaction) => {
    setIsSyncing(true);
    try {
      const res = await apiFetch('/api/ledger/transaction/update', {
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
      const res = await apiFetch('/api/ledger/transaction/delete', {
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
      const res = await apiFetch('/api/ledger');
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

  // Periodic polling for multi-device sync — doesn't start until a household is
  // known, since there's nothing to fetch yet on a brand new device.
  useEffect(() => {
    if (!householdId) return;
    fetchLedger();
    const interval = setInterval(fetchLedger, 4000);
    return () => clearInterval(interval);
  }, [fetchLedger, householdId]);

  // The first time a "paid for you" expense shows up for this device's
  // signed-in person, interrupt with a pop-up instead of leaving it to be
  // found in Budget Alerts — every later poll of the same still-pending item
  // is silent (loadSeenAckPopupIds), so it doesn't re-pop on every reopen.
  useEffect(() => {
    if (!isLedgerLoaded) return;

    // If whatever's open got resolved from elsewhere (another device, or a
    // second tab) while this modal sat open, don't leave it showing a stale
    // item — close it so the effect below is free to surface anything new.
    if (reviewingPendingAck && !ledger.pendingAcknowledgements.some((p) => p.id === reviewingPendingAck.id)) {
      setReviewingPendingAck(null);
      return;
    }
    if (reviewingPendingAck) return;

    const seen = loadSeenAckPopupIds();
    const unseen = ledger.pendingAcknowledgements.find(
      (p) => p.paidFor === authenticatedUser && !seen.has(p.id)
    );
    if (unseen) {
      setReviewingPendingAck(unseen);
      markAckPopupSeen(unseen.id);
    }
  }, [ledger.pendingAcknowledgements, authenticatedUser, isLedgerLoaded, reviewingPendingAck]);

  // Same one-time-interrupt treatment for "my partner forgot their PIN and
  // wants me to approve a reset" — surfaced to whichever of us didn't ask.
  useEffect(() => {
    if (!isLedgerLoaded) return;

    if (
      reviewingLockResetRequest &&
      !ledger.lockResetRequests.some((r) => r.id === reviewingLockResetRequest.id && r.status === 'pending')
    ) {
      setReviewingLockResetRequest(null);
      return;
    }
    if (reviewingLockResetRequest) return;

    const seen = loadSeenLockResetPopupIds();
    const unseen = ledger.lockResetRequests.find(
      (r) => r.status === 'pending' && r.requestedBy !== authenticatedUser && !seen.has(r.id)
    );
    if (unseen) {
      setReviewingLockResetRequest(unseen);
      markLockResetPopupSeen(unseen.id);
    }
  }, [ledger.lockResetRequests, authenticatedUser, isLedgerLoaded, reviewingLockResetRequest]);

  // The requester's own device notices its request was approved (via the
  // regular 4s ledger poll, which keeps running even while this device is
  // locked) and finishes the job: clear the local lock so AppLockSetupScreen
  // reappears, then tell the server this request has been used.
  useEffect(() => {
    if (!isLedgerLoaded) return;
    const approved = ledger.lockResetRequests.find(
      (r) => r.requestedBy === authenticatedUser && r.status === 'approved'
    );
    if (!approved) return;

    clearLockConfig();
    setLockConfig(null);
    apiFetch('/api/ledger/lock-reset/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: approved.id, requestedBy: authenticatedUser }),
    })
      .then((res) => res.ok && res.json())
      .then((data) => data?.ledger && setLedger(data.ledger))
      .catch((err) => console.error('Failed to consume the approved PIN reset:', err));
  }, [ledger.lockResetRequests, authenticatedUser, isLedgerLoaded]);

  // Sync state to server
  const syncLedgerToServer = async (updatedLedger: LedgerState) => {
    setIsSyncing(true);
    try {
      const res = await apiFetch('/api/ledger/sync', {
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
      const res = await apiFetch('/api/ledger/transaction', {
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
      const res = await apiFetch('/api/ledger/resolve-grey', {
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

  // Flag an expense as paid on the other spouse's behalf — held server-side
  // outside the real transaction list until they accept it.
  const handleFlagPendingAck = async (pending: {
    title: string;
    amount: number;
    category: CategoryId;
    paymentMode: Transaction['paymentMode'];
    notes?: string;
    bankName?: string;
    upiRef?: string;
    rawSms?: string;
    date: string;
    paidBy: SpenderId;
    paidFor: SpenderId;
  }) => {
    setIsSyncing(true);
    try {
      const res = await apiFetch('/api/ledger/pending-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.error('Failed to flag pending acknowledgement:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAcceptPendingAck = async (
    id: string,
    updates?: Partial<Pick<Transaction, 'title' | 'amount' | 'category' | 'notes' | 'date'>>
  ) => {
    setIsSyncing(true);
    try {
      const res = await apiFetch('/api/ledger/pending-ack/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, authenticatedSpender: authenticatedUser, updates }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to accept the expense.');
      }
    } catch (err: unknown) {
      console.error('Failed to accept pending acknowledgement:', err);
      alert(err instanceof Error ? err.message : 'Failed to accept the expense.');
    } finally {
      setIsSyncing(false);
      setReviewingPendingAck(null);
    }
  };

  const handleRejectPendingAck = async (id: string) => {
    setIsSyncing(true);
    try {
      const res = await apiFetch('/api/ledger/pending-ack/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, authenticatedSpender: authenticatedUser }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ledger) setLedger(data.ledger);
      }
    } catch (err) {
      console.error('Failed to reject pending acknowledgement:', err);
    } finally {
      setIsSyncing(false);
      setReviewingPendingAck(null);
    }
  };

  const handleOpenReviewAck = (id: string) => {
    const pending = ledger.pendingAcknowledgements.find((p) => p.id === id);
    if (pending) setReviewingPendingAck(pending);
  };

  // Contribute to savings goal
  const handleContributeGoal = async (
    goalId: string,
    contributor: SpenderId,
    amount: number
  ) => {
    setIsSyncing(true);
    try {
      const res = await apiFetch('/api/ledger/goal-contribution', {
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
    const res = await apiFetch('/api/ledger/categories', {
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
    const res = await apiFetch('/api/ledger/categories/update', {
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
    const res = await apiFetch('/api/ledger/categories/delete', {
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

  // Clear every dismissible alert at once — "review" alerts (paid-for-spouse,
  // lock-reset requests) are left alone since they point at a pending request
  // that still needs a decision, not just a notice to acknowledge. Alerts
  // targeted at the *other* spender (e.g. "your partner added an expense")
  // are left alone too — clicking Clear All on this device shouldn't wipe out
  // a notice the other spouse hasn't seen yet.
  const handleClearAllAlerts = () => {
    const updated = {
      ...ledger,
      alerts: ledger.alerts.filter(
        (a) =>
          a.actionType === 'review_ack' ||
          a.actionType === 'approve_lock_reset' ||
          (a.forSpender && a.forSpender !== authenticatedUser)
      ),
    };
    setLedger(updated);
    syncLedgerToServer(updated);
  };

  // Wipe all household data (transactions/goals/alerts), keeping household setup intact
  const handleResetHousehold = async () => {
    try {
      const res = await apiFetch('/api/ledger/reset', { method: 'POST' });
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

  // A genuinely new device with no household yet — nothing to fetch, so this
  // check comes before the ledger-loaded gate below.
  if (!householdId) {
    return <GetStartedScreen onHouseholdReady={handleHouseholdReady} />;
  }

  // Wait for the initial fetch before deciding which screen to show, so a
  // returning user doesn't flash the setup screen while the real ledger loads.
  if (!isLedgerLoaded) {
    return <StartupScreen />;
  }

  if (!ledger.setupComplete) {
    return <HouseholdSetupScreen onComplete={handleHouseholdSetup} />;
  }

  if (justInvited) {
    return (
      <InvitePartnerScreen
        familyName={ledger.familyName}
        inviteUrl={buildInviteUrl(householdId)}
        onContinue={() => setJustInvited(false)}
      />
    );
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

  if (!lockConfig && !hasSkippedLock) {
    return (
      <AppLockSetupScreen
        personLabel={authenticatedUser === 'husband' ? ledger.husbandName : ledger.wifeName}
        onComplete={handleLockSetupComplete}
        onSkip={handleSkipLock}
      />
    );
  }

  if (lockConfig && !isUnlocked) {
    const myResetRequest = ledger.lockResetRequests.find((r) => r.requestedBy === authenticatedUser);
    return (
      <AppLockScreen
        lockConfig={lockConfig}
        partnerName={authenticatedUser === 'husband' ? ledger.wifeName : ledger.husbandName}
        isWaitingForApproval={!!myResetRequest && myResetRequest.status === 'pending'}
        onUnlock={() => setIsUnlocked(true)}
        onRequestReset={handleRequestLockReset}
        onCancelReset={handleCancelLockReset}
        onResetWithInviteCode={handleResetWithInviteCode}
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
          onLockNow={lockConfig ? () => setIsUnlocked(false) : undefined}
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
                  onEditTransaction={(tx) => setEditingTransaction(tx)}
                  onFlagPendingAck={handleFlagPendingAck}
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
                  onEditTransaction={(tx) => setEditingTransaction(tx)}
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
                  authenticatedUser={authenticatedUser}
                  onDismissAlert={handleDismissAlert}
                  onClearAllAlerts={handleClearAllAlerts}
                  onUpdateBudget={handleUpdateBudget}
                  onResolveGreyArea={handleOpenGreyAreaDirect}
                  onReviewAck={handleOpenReviewAck}
                  onReviewLockReset={handleOpenReviewLockReset}
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
                  onLockConfigChanged={() => setLockConfig(loadLockConfig())}
                  onEnableLock={handleEnableLock}
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
            inviteUrl={buildInviteUrl(householdId)}
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
            onFlagPendingAck={handleFlagPendingAck}
          />
        )}

        {/* Review a "paid for you" expense — opened either by tapping its
            Budget Alert or automatically the first time it appears. */}
        {reviewingPendingAck && (
          <PendingAckModal
            key="pending-ack-modal"
            pending={reviewingPendingAck}
            ledger={ledger}
            onClose={() => setReviewingPendingAck(null)}
            onAccept={handleAcceptPendingAck}
            onReject={handleRejectPendingAck}
          />
        )}

        {/* Approve/deny a partner's "forgot PIN" reset request — opened either
            by tapping its Budget Alert or automatically the first time it appears. */}
        {reviewingLockResetRequest && (
          <LockResetApprovalModal
            key="lock-reset-modal"
            request={reviewingLockResetRequest}
            ledger={ledger}
            onClose={() => setReviewingLockResetRequest(null)}
            onApprove={handleApproveLockReset}
            onDeny={handleDenyLockReset}
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
            inviteUrl={buildInviteUrl(householdId)}
          />
        )}

      </AnimatePresence>
    </div>
  );
}
