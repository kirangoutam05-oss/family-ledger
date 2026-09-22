import React, { useState } from 'react';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { authResetPassword } from '../utils/auth';

interface ResetPasswordScreenProps {
  token: string;
  onDone: () => void;
}

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ token, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await authResetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
    } finally {
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
              <h1 className="text-xl font-bold tracking-tight">{done ? 'Password reset' : 'Set a new password'}</h1>
              {!done && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs">
                  Choose a new password for your KNKU login.
                </p>
              )}
            </div>
          </div>

          {done ? (
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Your password has been reset. You've been signed out everywhere else for safety.</span>
              </div>
              <button
                type="button"
                onClick={onDone}
                className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] text-white text-sm font-semibold shadow-xs transition-colors"
              >
                Continue to log in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Confirm new password</label>
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
                <KeyRound className="w-4 h-4" />
                <span>{isSubmitting ? 'Resetting…' : 'Reset password'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
