import React, { useEffect, useRef, useState } from 'react';
import { Lock, ScanFace, Delete } from 'lucide-react';
import { LockConfig, clearLockConfig, hashPin, isWebAuthnAvailable, verifyBiometric } from '../utils/appLock';

interface AppLockScreenProps {
  lockConfig: LockConfig;
  onUnlock: () => void;
  onForgotPin: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ lockConfig, onUnlock, onForgotPin }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCheckingBiometric, setIsCheckingBiometric] = useState(false);
  const [confirmingForgot, setConfirmingForgot] = useState(false);
  const canUseBiometric = !!lockConfig.webauthnCredentialId && isWebAuthnAvailable();
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tryBiometric = async () => {
    if (!lockConfig.webauthnCredentialId) return;
    setIsCheckingBiometric(true);
    setError(null);
    const ok = await verifyBiometric(lockConfig.webauthnCredentialId);
    setIsCheckingBiometric(false);
    if (ok) onUnlock();
  };

  // Prompt immediately on mount so unlocking is a single tap in the common case.
  useEffect(() => {
    if (canUseBiometric) tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitPin = async (candidate: string) => {
    const candidateHash = await hashPin(candidate, lockConfig.salt);
    if (candidateHash === lockConfig.pinHash) {
      onUnlock();
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  };

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length >= 4) {
      // Auto-submit once a plausible PIN length is reached, giving a 6-digit
      // PIN room to keep typing without submitting the first 4 digits early —
      // each new digit cancels the previous pending submit.
      autoSubmitTimer.current = setTimeout(() => submitPin(next), next.length === 6 ? 0 : 250);
    }
  };

  const handleBackspace = () => {
    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    setPin((p) => p.slice(0, -1));
  };

  useEffect(() => {
    return () => {
      if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-16 h-16 rounded-[22px] bg-white dark:bg-neutral-900 shadow-lg border border-black/[0.08] dark:border-white/[0.12] flex items-center justify-center text-[#007AFF]">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Family Ledger is locked</h1>
        </div>

        <div className="flex items-center justify-center gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border-2 ${
                i < pin.length ? 'bg-[#007AFF] border-[#007AFF]' : 'border-neutral-300 dark:border-neutral-700'
              }`}
            />
          ))}
        </div>

        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

        <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="aspect-square rounded-full bg-white dark:bg-neutral-900 border border-black/[0.06] dark:border-white/[0.08] text-xl font-semibold shadow-xs active:scale-95 transition-transform"
            >
              {digit}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="aspect-square rounded-full bg-white dark:bg-neutral-900 border border-black/[0.06] dark:border-white/[0.08] text-xl font-semibold shadow-xs active:scale-95 transition-transform"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="aspect-square rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {canUseBiometric && (
          <button
            type="button"
            onClick={tryBiometric}
            disabled={isCheckingBiometric}
            className="w-full py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-2"
          >
            <ScanFace className="w-4 h-4" />
            <span>{isCheckingBiometric ? 'Waiting…' : 'Try Face ID / Touch ID again'}</span>
          </button>
        )}

        {!confirmingForgot ? (
          <button
            type="button"
            onClick={() => setConfirmingForgot(true)}
            className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            Forgot PIN?
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              This resets the lock on this device only — you'll set a new PIN, but it won't touch any household data.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  clearLockConfig();
                  onForgotPin();
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                Reset lock
              </button>
              <button
                type="button"
                onClick={() => setConfirmingForgot(false)}
                className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs text-neutral-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
