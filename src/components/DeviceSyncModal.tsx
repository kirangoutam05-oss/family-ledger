import React, { useState } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  Copy,
  Wifi,
  RotateCcw,
  X,
  ShieldAlert,
} from 'lucide-react';
import { LedgerState } from '../types';

interface DeviceSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledger: LedgerState;
  onTriggerSync: () => Promise<void>;
  isSyncing: boolean;
  onResetHousehold: () => Promise<void>;
}

export const DeviceSyncModal: React.FC<DeviceSyncModalProps> = ({
  isOpen,
  onClose,
  ledger,
  onTriggerSync,
  isSyncing,
  onResetHousehold,
}) => {
  const [copied, setCopied] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { familyId, connectedDevices, husbandName, wifeName } = ledger;

  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      await onResetHousehold();
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(familyId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-md w-full p-6 border border-black/[0.08] dark:border-white/[0.08] shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-xs border border-black/[0.08] dark:border-white/[0.1] shrink-0 flex items-center justify-center">
              <img
                src="/app-logo.jpg?v=4"
                alt="Couple Ledger Logo"
                className="w-full h-full object-cover object-center block"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex flex-col justify-center">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white leading-tight">
                Family Cloud Sync & Devices
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Shared couple ledger synced between {husbandName} & {wifeName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pairing Code Card */}
        <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2">
          <div className="text-[11px] font-medium text-neutral-500 flex items-center justify-between">
            <span>Family Pairing Key</span>
            <span className="text-emerald-600 font-semibold flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              Real-time Polling Active
            </span>
          </div>

          <div className="flex items-center justify-between bg-white dark:bg-neutral-900 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <span className="font-mono font-bold text-sm text-neutral-900 dark:text-white tracking-wider">
              {familyId}
            </span>
            <button
              onClick={handleCopyCode}
              className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-neutral-400">
            Open Family Ledger on your partner's iPhone or Mac to sync real-time UPI alerts.
          </p>
        </div>

        {/* Paired Devices List (informational — who has actually connected) */}
        <div className="space-y-2.5">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Paired Devices ({connectedDevices.length})
          </span>

          {connectedDevices.length === 0 ? (
            <p className="text-xs text-neutral-400 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/80">
              No devices paired yet. Share this app with your partner so they can install it on their own phone.
            </p>
          ) : (
            <div className="space-y-2">
              {connectedDevices.map((device) => (
                <div
                  key={device.id}
                  className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
                        device.owner === 'husband'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                      }`}
                    >
                      {device.owner === 'husband' ? 'H' : 'W'}
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                        {device.name}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {device.lastActive}
                      </div>
                    </div>
                  </div>

                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sync Controls */}
        <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06] space-y-3">
          {showResetConfirm ? (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
              <div className="flex items-start gap-2 text-red-700 dark:text-red-400 text-xs font-semibold">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>This permanently deletes every transaction, goal, and alert for this household. This cannot be undone.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmReset}
                  disabled={isResetting}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {isResetting ? 'Resetting...' : 'Yes, delete everything'}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs text-neutral-600 dark:text-neutral-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Household Data</span>
              </button>

              <button
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="px-4 py-2 rounded-xl bg-[#007AFF] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Cloud Now'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
