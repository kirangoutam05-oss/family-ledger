import React, { useState } from 'react';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { SpenderId } from '../types';
import { authSignup, AuthAccount } from '../utils/auth';

interface SecureAccountScreenProps {
  familyName: string;
  husbandName: string;
  wifeName: string;
  householdId: string;
  // Skips the role picker when the caller already knows it (e.g. the
  // household creator's `myRole` from HouseholdSetupScreen).
  knownRole?: SpenderId;
  // Which roles already have a login — offered roles exclude these, so an
  // invited partner can only claim the slot that's actually still open.
  husbandHasAccount?: boolean;
  wifeHasAccount?: boolean;
  onComplete: (account: AuthAccount) => void;
  // Present only for the post-hoc migration prompt on an existing device —
  // the creator/invited-partner paths don't skip this, since a login is the
  // whole point of finishing setup.
  onSkip?: () => void;
}

export const SecureAccountScreen: React.FC<SecureAccountScreenProps> = ({
  familyName,
  husbandName,
  wifeName,
  householdId,
  knownRole,
  husbandHasAccount,
  wifeHasAccount,
  onComplete,
  onSkip,
}) => {
  const [role, setRole] = useState<SpenderId | null>(knownRole ?? (husbandHasAccount ? 'wife' : wifeHasAccount ? 'husband' : null));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsRolePicker = !knownRole;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) {
      setError('Please choose which of you this login is for.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords don\'t match.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const account = await authSignup({ email, password, role, householdId });
      onComplete(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your login. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white"
      style={{
        backgroundImage: 'radial-gradient(60% 40% at 50% 100%, rgba(147,51,234,0.16) 0%, rgba(147,51,234,0) 70%)',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="min-h-full flex flex-col items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-sm space-y-6 py-8">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-[20px] overflow-hidden shadow-lg border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center">
              <img src="/knku-icon.png?v=1" alt="KNKU Logo" className="w-full h-full object-cover object-center block" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Secure your account</h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs">
                Set an email and password for {familyName} so you can log back in from any device — no invite link needed.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {needsRolePicker && (
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  This login is for
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {!husbandHasAccount && (
                    <button
                      type="button"
                      onClick={() => setRole('husband')}
                      className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                        role === 'husband'
                          ? 'border-[#9333EA] bg-blue-50 dark:bg-blue-950/30 text-[#9333EA]'
                          : 'border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      {husbandName}
                    </button>
                  )}
                  {!wifeHasAccount && (
                    <button
                      type="button"
                      onClick={() => setRole('wife')}
                      className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                        role === 'wife'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 text-purple-600'
                          : 'border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      {wifeName}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus={!needsRolePicker}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Setting up…' : 'Secure my account'}</span>
              {!isSubmitting && <ArrowRight className="w-4 h-4" />}
            </button>

            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                Not now
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
