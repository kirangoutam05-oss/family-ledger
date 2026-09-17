import React, { useState } from 'react';
import { ShieldCheck, ScanFace, ChevronDown, Check, X } from 'lucide-react';
import {
  hashPin,
  generateSalt,
  isWebAuthnAvailable,
  loadLockConfig,
  registerBiometric,
  saveLockConfig,
} from '../utils/appLock';

interface AppLockSettingsProps {
  personLabel: string;
  onLockConfigChanged: () => void;
}

// Lets whoever's signed in on this device change their app-lock PIN, or turn
// Face ID/Touch ID on or off, without going through "Forgot PIN" — this is a
// per-device setting stored locally, not something synced to the household.
// Every save calls onLockConfigChanged so App.tsx's own copy of the lock config
// (the one AppLockScreen actually checks unlock attempts against) doesn't go
// stale — without it, a changed PIN wouldn't take effect until a page reload.
export const AppLockSettings: React.FC<AppLockSettingsProps> = ({ personLabel, onLockConfigChanged }) => {
  const [lockConfig, setLockConfig] = useState(() => loadLockConfig());
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isRegisteringBiometric, setIsRegisteringBiometric] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  if (!lockConfig) return null;

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 6);

  const resetPinForm = () => {
    setIsEditingPin(false);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError(null);
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const currentHash = await hashPin(currentPin, lockConfig.salt);
    if (currentHash !== lockConfig.pinHash) {
      setError('Current PIN is incorrect.');
      return;
    }
    if (newPin.length < 4) {
      setError('Choose a new PIN of at least 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PINs didn't match.");
      return;
    }

    setIsSaving(true);
    try {
      const salt = generateSalt();
      const pinHash = await hashPin(newPin, salt);
      const updated = { ...lockConfig, pinHash, salt };
      saveLockConfig(updated);
      setLockConfig(updated);
      onLockConfigChanged();
      resetPinForm();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnableBiometric = async () => {
    setIsRegisteringBiometric(true);
    setBiometricError(null);
    const credentialId = await registerBiometric(personLabel);
    setIsRegisteringBiometric(false);
    if (!credentialId) {
      setBiometricError("Couldn't set up Face ID / Touch ID on this device.");
      return;
    }
    const updated = { ...lockConfig, webauthnCredentialId: credentialId };
    saveLockConfig(updated);
    setLockConfig(updated);
    onLockConfigChanged();
  };

  const handleDisableBiometric = () => {
    const { webauthnCredentialId, ...rest } = lockConfig;
    saveLockConfig(rest);
    setLockConfig(rest);
    onLockConfigChanged();
  };

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[#007AFF] shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">App Lock</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {lockConfig.webauthnCredentialId ? 'PIN + Face ID / Touch ID' : 'PIN only'} · this device
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => (isEditingPin ? resetPinForm() : setIsEditingPin(true))}
          className="px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.12] text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:border-[#007AFF] hover:text-[#007AFF] transition-colors flex items-center gap-1 shrink-0"
        >
          <span>{isEditingPin ? 'Cancel' : 'Change PIN'}</span>
          {!isEditingPin && <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isEditingPin && (
        <form onSubmit={handleChangePin} className="space-y-3 pt-1 border-t border-black/[0.05] dark:border-white/[0.08]">
          <div className="pt-3">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Current PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) => setCurrentPin(digitsOnly(e.target.value))}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white tracking-widest focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                New PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(digitsOnly(e.target.value))}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white tracking-widest focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Confirm New PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white tracking-widest focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
              />
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-xs font-bold shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Saving…' : 'Save New PIN'}</span>
          </button>
        </form>
      )}

      {justSaved && (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" />
          <span>PIN updated.</span>
        </div>
      )}

      {isWebAuthnAvailable() && !isEditingPin && (
        <div className="pt-3 border-t border-black/[0.05] dark:border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ScanFace className="w-4 h-4 text-neutral-400 shrink-0" />
            <span className="text-xs text-neutral-600 dark:text-neutral-300">Face ID / Touch ID</span>
          </div>
          {lockConfig.webauthnCredentialId ? (
            <button
              type="button"
              onClick={handleDisableBiometric}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Turn off</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEnableBiometric}
              disabled={isRegisteringBiometric}
              className="px-2.5 py-1.5 rounded-lg bg-[#007AFF]/10 text-xs font-medium text-[#007AFF] hover:bg-[#007AFF]/20 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <span>{isRegisteringBiometric ? 'Waiting…' : 'Enable'}</span>
            </button>
          )}
        </div>
      )}

      {biometricError && (
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          {biometricError}
        </div>
      )}
    </div>
  );
};
