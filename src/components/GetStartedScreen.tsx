import React, { useState } from 'react';
import { Heart, ArrowRight, KeyRound } from 'lucide-react';
import { apiFetch, extractHouseholdIdFromText } from '../utils/household';

interface GetStartedScreenProps {
  onHouseholdReady: (householdId: string) => void;
}

export const GetStartedScreen: React.FC<GetStartedScreenProps> = ({ onHouseholdReady }) => {
  const [mode, setMode] = useState<'choose' | 'join'>('choose');
  const [inviteInput, setInviteInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white">
      <div className="min-h-full flex flex-col items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-sm space-y-6 py-8">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-[22px] overflow-hidden shadow-lg border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center">
              <img
                src="/app-logo.jpg?v=4"
                alt="Family Ledger Logo"
                className="w-full h-full object-cover object-center block"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Family Ledger</h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs">
                A shared expense ledger for you and your partner — private to your household.
              </p>
            </div>
          </div>

          {mode === 'choose' ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="w-full py-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Heart className="w-4 h-4" />
                <span>{isCreating ? 'Creating…' : 'Create a new household'}</span>
                {!isCreating && <ArrowRight className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('join');
                  setError(null);
                }}
                className="w-full py-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-2 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                <span>I have an invite code</span>
              </button>
            </div>
          ) : (
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                />
              </div>
              <button
                type="submit"
                disabled={isJoining}
                className="w-full py-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>{isJoining ? 'Checking…' : 'Join household'}</span>
                {!isJoining && <ArrowRight className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('choose');
                  setError(null);
                }}
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
