import React from 'react';
import { motion } from 'motion/react';
import {
  Bell,
  Users,
  Plus,
  UserPlus,
  Lock,
} from 'lucide-react';
import { SpenderId } from '../types';

interface AppleHeaderProps {
  familyName: string;
  activeSpender: SpenderId | 'shared';
  authenticatedUser: SpenderId;
  onSelectSpender: (spender: SpenderId | 'shared') => void;
  husbandName: string;
  wifeName: string;
  unreadAlertsCount: number;
  onOpenNotifications: () => void;
  onOpenSyncModal: () => void;
  onOpenAddModal: () => void;
  isSyncing: boolean;
  lastSyncTime: string;
  onOpenLiveMobile?: () => void;
  onLockLedger?: () => void;
  onSwitchUser?: () => void;
}

export const AppleHeader: React.FC<AppleHeaderProps> = ({
  familyName,
  activeSpender,
  authenticatedUser,
  onSelectSpender,
  husbandName,
  wifeName,
  unreadAlertsCount,
  onOpenNotifications,
  onOpenSyncModal,
  onOpenAddModal,
  isSyncing,
  onOpenLiveMobile,
  onLockLedger,
  onSwitchUser,
}) => {
  // A shared-layout pill slides between whichever button is active, instead of the
  // background instantly swapping. Rendered twice (desktop row + mobile row), so
  // each instance gets its own layoutId — they're separate DOM trees and shouldn't
  // try to animate a single pill between breakpoints.
  const renderSpenderSwitcher = (layoutScope: string) => (
    <div className="bg-black/[0.06] dark:bg-white/[0.08] p-1 rounded-xl flex items-center text-xs font-medium">
      <button
        onClick={() => onSelectSpender('shared')}
        className="relative flex-1 sm:flex-none justify-center px-3 py-1.5 sm:py-1 rounded-lg flex items-center gap-1.5"
      >
        {activeSpender === 'shared' && (
          <motion.div
            layoutId={`spender-pill-${layoutScope}`}
            className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-lg shadow-xs"
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          />
        )}
        <Users className={`relative w-3.5 h-3.5 ${activeSpender === 'shared' ? 'opacity-100' : 'opacity-70'}`} />
        <span className={`relative ${activeSpender === 'shared' ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-600 dark:text-neutral-400'}`}>
          Shared
        </span>
      </button>
      <button
        onClick={() => onSelectSpender('husband')}
        className="relative flex-1 sm:flex-none min-w-0 justify-center px-3 py-1.5 sm:py-1 rounded-lg flex items-center gap-1.5"
      >
        {activeSpender === 'husband' && (
          <motion.div
            layoutId={`spender-pill-${layoutScope}`}
            className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-lg shadow-xs"
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          />
        )}
        <span className="relative w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
        <span className={`relative truncate min-w-0 ${activeSpender === 'husband' ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-600 dark:text-neutral-400'}`}>
          {husbandName}
        </span>
      </button>
      <button
        onClick={() => onSelectSpender('wife')}
        className="relative flex-1 sm:flex-none min-w-0 justify-center px-3 py-1.5 sm:py-1 rounded-lg flex items-center gap-1.5"
      >
        {activeSpender === 'wife' && (
          <motion.div
            layoutId={`spender-pill-${layoutScope}`}
            className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-lg shadow-xs"
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          />
        )}
        <span className="relative w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
        <span className={`relative truncate min-w-0 ${activeSpender === 'wife' ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-600 dark:text-neutral-400'}`}>
          {wifeName}
        </span>
      </button>
    </div>
  );

  return (
    <header className="glass-nav sticky top-0 z-30 border-b border-black/[0.05] dark:border-white/[0.08] transition-colors">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Clean Brand & Sync State */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden shadow-xs border border-black/[0.08] dark:border-white/[0.12] shrink-0 flex items-center justify-center">
            <img
              src="/app-logo.jpg?v=4"
              alt="Couple Ledger Logo"
              className="w-full h-full object-cover object-center block"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <h1 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white leading-tight truncate max-w-[100px] sm:max-w-none">
                {familyName}
              </h1>
              <button
                onClick={onOpenSyncModal}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium transition-colors shrink-0"
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

        {/* Center: Apple Segmented Spender Switcher (desktop only, mobile gets its own row below) */}
        <div className="hidden sm:flex shrink-0">{renderSpenderSwitcher('desktop')}</div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {onOpenLiveMobile && (
            <button
              onClick={onOpenLiveMobile}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-neutral-800 dark:text-white text-xs font-medium flex items-center gap-1.5 transition-all active:scale-90 shadow-xs"
              title="Invite your partner to install this app"
            >
              <UserPlus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#007AFF]" />
              <span className="hidden lg:inline">Invite Partner</span>
            </button>
          )}

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

      {/* Mobile-only second row: full-width spender switcher */}
      <div className="sm:hidden px-3 pb-2.5">{renderSpenderSwitcher('mobile')}</div>
    </header>
  );
};
