import React, { useEffect, useRef, useState } from 'react';
import { ScanFace, Delete, KeyRound, Users } from 'lucide-react';
import { LockConfig, hashPin, isWebAuthnAvailable, verifyBiometric, saveLockConfig } from '../utils/appLock';

interface AppLockScreenProps {
  lockConfig: LockConfig;
  partnerName: string;
  isWaitingForApproval: boolean;
  onUnlock: () => void;
  onRequestReset: () => Promise<void>;
  onCancelReset: () => Promise<void>;
  onResetWithInviteCode: (code: string) => boolean;
}

type ForgotStage = 'idle' | 'choose' | 'invite-code';

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  lockConfig,
  partnerName,
  isWaitingForApproval,
  onUnlock,
  onRequestReset,
  onCancelReset,
  onResetWithInviteCode,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCheckingBiometric, setIsCheckingBiometric] = useState(false);
  const [forgotStage, setForgotStage] = useState<ForgotStage>('idle');
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [isCancellingReset, setIsCancellingReset] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null);
  const canUseBiometric = !!lockConfig.webauthnCredentialId && isWebAuthnAvailable();
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Configs saved before pinLength existed fall back to 6, the old fixed dot count.
  const pinLength = lockConfig.pinLength ?? 6;

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
      // A config saved before pinLength existed has no way to know its real
      // length from the hash alone — but the moment someone unlocks with it,
      // the digit count they just typed *is* the answer. Self-heal here so
      // the dot count is never wrong again after this one unlock, instead of
      // requiring a manual "change your PIN" round-trip to fix a display bug.
      if (lockConfig.pinLength !== candidate.length) {
        saveLockConfig({ ...lockConfig, pinLength: candidate.length });
      }
      onUnlock();
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  };

  const handleDigit = (digit: string) => {
    if (pin.length >= pinLength) return;
    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length >= Math.min(4, pinLength)) {
      // Auto-submit once the configured PIN length is reached; for a longer
      // PIN, submit a beat after the minimum so there's room to keep typing —
      // each new digit cancels the previous pending submit.
      autoSubmitTimer.current = setTimeout(() => submitPin(next), next.length === pinLength ? 0 : 250);
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

  const handleAskPartner = async () => {
    setIsRequestingReset(true);
    try {
      await onRequestReset();
    } finally {
      setIsRequestingReset(false);
    }
  };

  const handleCancelWaiting = async () => {
    setIsCancellingReset(true);
    try {
      await onCancelReset();
    } finally {
      setIsCancellingReset(false);
      setForgotStage('idle');
    }
  };

  const handleSubmitInviteCode = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onResetWithInviteCode(inviteCodeInput);
    if (!ok) {
      setInviteCodeError("That doesn't match this household's invite code.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white"
      style={{
        backgroundImage:
          'radial-gradient(60% 40% at 50% 100%, rgba(147,51,234,0.16) 0%, rgba(147,51,234,0) 70%)',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-14 h-14 rounded-[20px] overflow-hidden shadow-lg border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center">
            <img
              src="/knku-icon.png?v=1"
              alt="KNKU Logo"
              className="w-full h-full object-cover object-center block"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight">KNKU is locked</h1>
        </div>

        <div className="flex items-center justify-center gap-3">
          {Array.from({ length: pinLength }, (_, i) => i).map((i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border-2 ${
                i < pin.length ? 'bg-[#9333EA] border-[#9333EA]' : 'border-neutral-300 dark:border-neutral-700'
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
            className="w-full py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-2"
          >
            <ScanFace className="w-4 h-4" />
            <span>{isCheckingBiometric ? 'Waiting…' : 'Try Face ID / Touch ID again'}</span>
          </button>
        )}

        {isWaitingForApproval ? (
          <div className="space-y-2 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              Waiting for {partnerName} to approve your PIN reset…
            </p>
            <button
              type="button"
              onClick={handleCancelWaiting}
              disabled={isCancellingReset}
              className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline disabled:opacity-50"
            >
              {isCancellingReset ? 'Cancelling…' : 'Cancel request'}
            </button>
          </div>
        ) : forgotStage === 'idle' ? (
          <button
            type="button"
            onClick={() => setForgotStage('choose')}
            className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            Forgot PIN?
          </button>
        ) : forgotStage === 'choose' ? (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No PIN can be recovered on its own here — pick how you'd like to get back in.
            </p>
            <button
              type="button"
              onClick={handleAskPartner}
              disabled={isRequestingReset}
              className="w-full py-2.5 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isRequestingReset ? 'Sending…' : `Ask ${partnerName} to approve`}</span>
            </button>
            <button
              type="button"
              onClick={() => setForgotStage('invite-code')}
              className="w-full py-2.5 rounded-lg border border-black/10 dark:border-white/10 text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Enter household invite code instead</span>
            </button>
            <button
              type="button"
              onClick={() => setForgotStage('idle')}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitInviteCode} className="space-y-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Only works if nobody else can approve it for you — enter the invite link or code for this household.
            </p>
            <input
              type="text"
              value={inviteCodeInput}
              onChange={(e) => {
                setInviteCodeInput(e.target.value);
                setInviteCodeError(null);
              }}
              placeholder="Invite code or link"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
            />
            {inviteCodeError && <p className="text-xs text-red-500 font-medium">{inviteCodeError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] text-white text-xs font-semibold shadow-xs"
            >
              Reset lock
            </button>
            <button
              type="button"
              onClick={() => setForgotStage('choose')}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
