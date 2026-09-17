import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  ChevronDown,
  Check,
  Plus,
  Lock,
  Users,
} from 'lucide-react';
import { SpenderId } from '../types';

interface AppleHeaderProps {
  familyName: string;
  activeSpender: SpenderId | 'shared';
  authenticatedUser: SpenderId;
  onSelectSpender: (spender: SpenderId | 'shared') => void;
  onGoToOverview: () => void;
  husbandName: string;
  wifeName: string;
  unreadAlertsCount: number;
  onOpenNotifications: () => void;
  onOpenSyncModal: () => void;
  onOpenAddModal: () => void;
  isSyncing: boolean;
  lastSyncTime: string;
  onLockLedger?: () => void;
  onSwitchUser?: () => void;
  onLockNow?: () => void;
}

export const AppleHeader: React.FC<AppleHeaderProps> = ({
  familyName,
  activeSpender,
  authenticatedUser,
  onSelectSpender,
  onGoToOverview,
  husbandName,
  wifeName,
  unreadAlertsCount,
  onOpenNotifications,
  onOpenSyncModal,
  onOpenAddModal,
  isSyncing,
  onLockLedger,
  onSwitchUser,
  onLockNow,
}) => {
  const [spenderMenuOpen, setSpenderMenuOpen] = useState(false);

  return (
    <header
      className="glass-nav sticky top-0 z-30 border-b border-black/[0.05] dark:border-white/[0.08] transition-colors"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="relative max-w-5xl mx-auto px-3 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand mark + household name/spender picker */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <img
            src="/app-logo-mark.png?v=1"
            alt=""
            className="w-10 h-10 sm:w-12 sm:h-12 object-contain shrink-0 -my-1"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-0.5 min-w-0">
              <button
                onClick={onGoToOverview}
                className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white leading-tight truncate max-w-[140px] sm:max-w-none text-left active:opacity-60 transition-opacity"
                title="Go to Overview"
              >
                {familyName}
              </button>

              <button
                onClick={() => setSpenderMenuOpen((v) => !v)}
                className="p-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.1] hover:bg-black/[0.1] dark:hover:bg-white/[0.16] flex items-center justify-center transition-all active:scale-90 shrink-0 ml-1"
                title="Switch between Overall, Kiran, and Mageswari"
              >
                <ChevronDown
                  strokeWidth={3}
                  className={`w-4 h-4 sm:w-5 sm:h-5 text-neutral-700 dark:text-neutral-200 transition-transform ${spenderMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <button
                onClick={onOpenSyncModal}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium transition-colors shrink-0 ml-0.5"
                title="Family sync status. Tap to see paired devices or switch who's using this phone."
              >
                <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isSyncing ? 'animate-ping' : ''}`} />
                <span className="hidden sm:inline">Synced</span>
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 hidden sm:block leading-normal mt-0.5">
              Signed in as {authenticatedUser === 'husband' ? husbandName : wifeName}
            </p>
          </div>
        </div>

        {/* Spender picker dropdown — left-aligned to the screen's content edge
            (the row's own padding), not to the small chevron trigger, so it
            doesn't float awkwardly mid-header. */}
        <AnimatePresence>
          {spenderMenuOpen && (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setSpenderMenuOpen(false)}
                aria-label="Close menu"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="glass-sheet absolute left-3 sm:left-6 top-full mt-2 w-64 rounded-2xl border border-black/[0.06] dark:border-white/[0.1] p-2 z-50"
              >
                <button
                  onClick={() => {
                    onSelectSpender('shared');
                    setSpenderMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-3.5 rounded-xl text-sm transition-colors ${
                    activeSpender === 'shared'
                      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold'
                      : 'text-neutral-700 dark:text-neutral-300 font-medium hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      activeSpender === 'shared' ? 'bg-teal-500/20' : 'bg-neutral-400/20'
                    }`}
                  >
                    <Users
                      className={`w-3.5 h-3.5 ${
                        activeSpender === 'shared' ? 'text-teal-600 dark:text-teal-400' : 'text-neutral-600 dark:text-neutral-300'
                      }`}
                    />
                  </span>
                  <span className="truncate min-w-0 flex-1 text-left">Overall</span>
                  {activeSpender === 'shared' && <Check className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />}
                </button>
                <button
                  onClick={() => {
                    onSelectSpender('husband');
                    setSpenderMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-3.5 rounded-xl text-sm transition-colors ${
                    activeSpender === 'husband'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold'
                      : 'text-neutral-700 dark:text-neutral-300 font-medium hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="truncate min-w-0 flex-1 text-left">{husbandName}</span>
                  {activeSpender === 'husband' && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
                </button>
                <button
                  onClick={() => {
                    onSelectSpender('wife');
                    setSpenderMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-3.5 rounded-xl text-sm transition-colors ${
                    activeSpender === 'wife'
                      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold'
                      : 'text-neutral-700 dark:text-neutral-300 font-medium hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                  <span className="truncate min-w-0 flex-1 text-left">{wifeName}</span>
                  {activeSpender === 'wife' && <Check className="w-4 h-4 text-purple-500 shrink-0" />}
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-90"
            title="Budget Alerts & Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
            )}
          </button>

          {onLockNow && (
            <button
              onClick={onLockNow}
              className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-90"
              title="Lock the app now"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}

          {/* Authenticated Account: full pill with name, shown on larger screens. On mobile, switching
              identity lives in the sync/devices popup instead (tap the "Synced" pill) — a bare
              unlabeled dot here was confusing on a touch screen with no hover to reveal its title. */}
          <button
            onClick={onSwitchUser || onLockLedger}
            className="hidden sm:flex px-2.5 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-800 text-xs font-semibold items-center gap-1.5 shadow-xs hover:border-[#007AFF] hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all active:scale-95 cursor-pointer"
            title={`Signed in as ${authenticatedUser === 'husband' ? husbandName : wifeName} • Tap to switch identity on this device`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                authenticatedUser === 'husband' ? 'bg-blue-500' : 'bg-purple-500'
              }`}
            />
            <span className="text-neutral-900 dark:text-white font-medium">
              {authenticatedUser === 'husband' ? husbandName : wifeName}
            </span>
            <Lock className="w-3 h-3 text-neutral-400" />
          </button>

          <button
            onClick={onOpenAddModal}
            className="w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all active:scale-90 shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </div>
    </header>
  );
};
