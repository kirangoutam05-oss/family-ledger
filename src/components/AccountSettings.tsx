import React, { useState } from 'react';
import { UserCog, Save, CheckCircle2, LogOut, Smartphone, UserPlus } from 'lucide-react';
import { LedgerState, SpenderId } from '../types';
import { AppLockSettings } from './AppLockSettings';
import { NotificationSettings } from './NotificationSettings';
import { CategoryPeriodSettings } from './CategoryPeriodSettings';

interface AccountSettingsProps {
  ledger: LedgerState;
  authenticatedUser: SpenderId;
  onUpdateHousehold: (details: {
    familyName: string;
    husbandName: string;
    wifeName: string;
    currency: string;
  }) => Promise<void>;
  onUpdateCategoryPeriod: (period: 'month' | 'year' | 'all') => Promise<void>;
  onSwitchUser: () => void;
  onOpenSyncModal: () => void;
  onOpenLiveMobile: () => void;
  onLockConfigChanged: () => void;
  onEnableLock: () => void;
}

const CURRENCIES = [
  { symbol: '₹', label: 'INR' },
  { symbol: '$', label: 'USD' },
  { symbol: '€', label: 'EUR' },
  { symbol: '£', label: 'GBP' },
];

export const AccountSettings: React.FC<AccountSettingsProps> = ({
  ledger,
  authenticatedUser,
  onUpdateHousehold,
  onUpdateCategoryPeriod,
  onSwitchUser,
  onOpenSyncModal,
  onOpenLiveMobile,
  onLockConfigChanged,
  onEnableLock,
}) => {
  const [familyName, setFamilyName] = useState(ledger.familyName);
  const [husbandName, setHusbandName] = useState(ledger.husbandName);
  const [wifeName, setWifeName] = useState(ledger.wifeName);
  const [currency, setCurrency] = useState(ledger.currency);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const currentName = authenticatedUser === 'husband' ? ledger.husbandName : ledger.wifeName;

  const canSave =
    familyName.trim().length > 0 && husbandName.trim().length > 0 && wifeName.trim().length > 0;

  const isDirty =
    familyName.trim() !== ledger.familyName ||
    husbandName.trim() !== ledger.husbandName ||
    wifeName.trim() !== ledger.wifeName ||
    currency !== ledger.currency;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !isDirty) return;
    setIsSaving(true);
    setError(null);
    try {
      await onUpdateHousehold({
        familyName: familyName.trim(),
        husbandName: husbandName.trim(),
        wifeName: wifeName.trim(),
        currency,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="px-1">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Account</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          Update your household name, partner names, and currency.
        </p>
      </div>

      {/* Signed-in identity */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${
              authenticatedUser === 'husband' ? 'bg-blue-500' : 'bg-purple-500'
            }`}
          >
            <UserCog className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
              Signed in as {currentName}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">On this device</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSwitchUser}
          className="px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.12] text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:border-[#007AFF] hover:text-[#007AFF] transition-colors flex items-center gap-1.5 shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Switch</span>
        </button>
      </div>

      {/* Editable household details */}
      <form
        onSubmit={handleSubmit}
        className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
            Household name
          </label>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Partner 1's name
            </label>
            <input
              type="text"
              value={husbandName}
              onChange={(e) => setHusbandName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Partner 2's name
            </label>
            <input
              type="text"
              value={wifeName}
              onChange={(e) => setWifeName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
            Currency
          </label>
          <div className="grid grid-cols-4 gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c.symbol}
                type="button"
                onClick={() => setCurrency(c.symbol)}
                className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                  currency === c.symbol
                    ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                    : 'border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                {c.symbol} {c.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSave || !isDirty || isSaving}
          className="w-full py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-xs font-bold shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
        >
          {justSaved ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : 'Save Changes'}</span>
            </>
          )}
        </button>
      </form>

      {/* Per-device app lock: change PIN, toggle Face ID / Touch ID */}
      <AppLockSettings personLabel={currentName} onLockConfigChanged={onLockConfigChanged} onEnableLock={onEnableLock} />

      {/* Per-device push notification opt-in */}
      <NotificationSettings authenticatedUser={authenticatedUser} />

      {/* Shared "Amount vs Category" time window */}
      <CategoryPeriodSettings
        period={ledger.categoryBreakdownPeriod ?? 'month'}
        onChange={onUpdateCategoryPeriod}
      />

      {/* Invite partner shortcut */}
      <button
        type="button"
        onClick={onOpenLiveMobile}
        className="w-full p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex items-center justify-between gap-3 hover:border-[#007AFF] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[#007AFF] shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Invite Partner</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Scan to join this household
            </div>
          </div>
        </div>
      </button>

      {/* Devices & sync shortcut */}
      <button
        type="button"
        onClick={onOpenSyncModal}
        className="w-full p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex items-center justify-between gap-3 hover:border-[#007AFF] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Devices & Sync</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Paired devices, reset household data
            </div>
          </div>
        </div>
      </button>
    </div>
  );
};
