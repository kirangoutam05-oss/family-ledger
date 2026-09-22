import React, { useState } from 'react';
import { Heart, ArrowRight, KeyRound, LogIn, Mail, CheckCircle2 } from 'lucide-react';
import { apiFetch, extractHouseholdIdFromText } from '../utils/household';
import { authLogin, authForgotPassword, AuthAccount } from '../utils/auth';

interface GetStartedScreenProps {
  onHouseholdReady: (householdId: string) => void;
  onLoginSuccess: (account: AuthAccount) => void;
}

type Mode = 'choose' | 'join' | 'login' | 'forgot';

export const GetStartedScreen: React.FC<GetStartedScreenProps> = ({ onHouseholdReady, onLoginSuccess }) => {
  const [mode, setMode] = useState<Mode>('choose');
  const [inviteInput, setInviteInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goTo = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/household/create', { method: 'POST' });
      if (!res.ok) throw new Error('Could not create a new household. Please try again.');
      const data = await res.json();
      onHouseholdReady(data.householdId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a new household. Please try again.');
      setIsCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractHouseholdIdFromText(inviteInput);
    if (!id) {
      setError('That doesn\'t look like a valid invite code or link.');
      return;
    }

    setIsJoining(true);
    setError(null);
    try {
      const res = await apiFetch('/api/ledger', {}, id);
      if (!res.ok) throw new Error('Invite code not found — check it and try again.');
      onHouseholdReady(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite code not found — check it and try again.');
      setIsJoining(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError(null);
    try {
      const account = await authLogin(email, password);
      onLoginSuccess(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
      setIsLoggingIn(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    setError(null);
    try {
      await authForgotPassword(email);
      setResetSent(true);
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white"
      style={{
        backgroundImage:
          'radial-gradient(60% 40% at 50% 100%, rgba(147,51,234,0.16) 0%, rgba(147,51,234,0) 70%)',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="min-h-full flex flex-col items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-sm space-y-6 py-8">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-[20px] overflow-hidden shadow-lg border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center">
              <img
                src="/knku-icon.png?v=1"
                alt="KNKU Logo"
                className="w-full h-full object-cover object-center block"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">KNKU</h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs">
                A shared expense ledger for you and your partner — private to your household.
              </p>
            </div>
          </div>

          {mode === 'choose' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => goTo('login')}
                className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Log in</span>
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="w-full py-3 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 disabled:opacity-40 text-sm font-semibold text-neutral-700 dark:text-neutral-300 shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Heart className="w-4 h-4" />
                <span>{isCreating ? 'Creating…' : 'Create a new household'}</span>
                {!isCreating && <ArrowRight className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => goTo('join')}
                className="w-full py-3 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-2 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                <span>Join with an invite link (first time)</span>
              </button>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">Password</label>
                  <button
                    type="button"
                    onClick={() => goTo('forgot')}
                    className="text-[11px] font-medium text-[#9333EA]"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
                />
              </div>
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>{isLoggingIn ? 'Logging in…' : 'Log in'}</span>
                {!isLoggingIn && <ArrowRight className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => goTo('choose')}
                className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                Back
              </button>
            </form>
          )}

          {mode === 'forgot' &&
            (resetSent ? (
              <div className="space-y-4 text-center">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>If that email has a KNKU login, a reset link is on its way.</span>
                </div>
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] text-white text-sm font-semibold shadow-xs transition-colors"
                >
                  Back to login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSendingReset}
                  className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  <span>{isSendingReset ? 'Sending…' : 'Send reset link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  Back
                </button>
              </form>
            ))}

          {mode === 'join' && (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Invite code or link
                </label>
                <input
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="Paste the link your partner sent you"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
                />
              </div>
              <button
                type="submit"
                disabled={isJoining}
                className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>{isJoining ? 'Checking…' : 'Join household'}</span>
                {!isJoining && <ArrowRight className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => goTo('choose')}
                className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                Back
              </button>
            </form>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
