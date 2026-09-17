import React, { useState } from 'react';
import { ScanFace, ArrowRight, Check } from 'lucide-react';
import { generateSalt, hashPin, isWebAuthnAvailable, registerBiometric, saveLockConfig } from '../utils/appLock';

interface AppLockSetupScreenProps {
  personLabel: string;
  onComplete: () => void;
}

type Stage = 'pin' | 'confirm' | 'biometric';

export const AppLockSetupScreen: React.FC<AppLockSetupScreenProps> = ({ personLabel, onComplete }) => {
  const [stage, setStage] = useState<Stage>('pin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [webauthnCredentialId, setWebauthnCredentialId] = useState<string | undefined>(undefined);
  const [isRegisteringBiometric, setIsRegisteringBiometric] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 6);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError('Choose a PIN of at least 4 digits.');
      return;
    }
    setError(null);
    setStage('confirm');
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmPin !== pin) {
      setError('PINs didn\'t match — try again.');
      setConfirmPin('');
      return;
    }
    setError(null);
    if (isWebAuthnAvailable()) {
      setStage('biometric');
    } else {
      await finish(undefined);
    }
  };

  const handleEnableBiometric = async () => {
    setIsRegisteringBiometric(true);
    const credentialId = await registerBiometric(personLabel);
    setIsRegisteringBiometric(false);
    if (credentialId) {
      setWebauthnCredentialId(credentialId);
      await finish(credentialId);
    } else {
      setError('Couldn\'t set up Face ID / Touch ID on this device — continuing with PIN only.');
    }
  };

  const finish = async (credentialId: string | undefined) => {
    setIsSaving(true);
    const salt = generateSalt();
    const pinHash = await hashPin(pin, salt);
    saveLockConfig({ pinHash, salt, webauthnCredentialId: credentialId });
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-16 h-16 rounded-[22px] overflow-hidden shadow-lg border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center">
            <img
              src="/app-logo.jpg?v=4"
              alt="Family Ledger Logo"
              className="w-full h-full object-cover object-center block"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Secure this device</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs">
              {stage === 'pin' && 'Set a PIN to unlock the app on this phone.'}
              {stage === 'confirm' && 'Enter it once more to confirm.'}
              {stage === 'biometric' && 'PIN saved. Want to unlock with Face ID / Touch ID instead?'}
            </p>
          </div>
        </div>

        {stage === 'pin' && (
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              data-lpignore="true"
              data-1p-ignore="true"
              autoFocus
              value={pin}
              onChange={(e) => setPin(digitsOnly(e.target.value))}
              placeholder="4–6 digit PIN"
              className="w-full py-3 px-4 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-center text-lg tracking-normal font-semibold focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
            <button
              type="submit"
              disabled={pin.length < 4}
              className="w-full py-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {stage === 'confirm' && (
          <form onSubmit={handleConfirmSubmit} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              data-lpignore="true"
              data-1p-ignore="true"
              autoFocus
              value={confirmPin}
              onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
              placeholder="Confirm PIN"
              className="w-full py-3 px-4 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-center text-lg tracking-normal font-semibold focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
            <button
              type="submit"
              disabled={confirmPin.length < 4 || isSaving}
              className="w-full py-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Confirm</span>
            </button>
          </form>
        )}

        {stage === 'biometric' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleEnableBiometric}
              disabled={isRegisteringBiometric || isSaving}
              className="w-full py-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <ScanFace className="w-4 h-4" />
              <span>{isRegisteringBiometric ? 'Waiting for Face ID / Touch ID…' : 'Enable Face ID / Touch ID'}</span>
            </button>
            <button
              type="button"
              onClick={() => finish(webauthnCredentialId)}
              disabled={isSaving}
              className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Skip, use PIN only
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
