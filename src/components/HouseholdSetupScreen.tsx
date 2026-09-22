import React, { useState } from 'react';
import { Heart, ArrowRight, Users } from 'lucide-react';
import { SpenderId } from '../types';

interface HouseholdSetupScreenProps {
  onComplete: (details: {
    familyName: string;
    husbandName: string;
    wifeName: string;
    currency: string;
    myRole: SpenderId;
  }) => Promise<void>;
}

const CURRENCIES = [
  { symbol: '₹', label: 'INR' },
  { symbol: '$', label: 'USD' },
  { symbol: '€', label: 'EUR' },
  { symbol: '£', label: 'GBP' },
];

export const HouseholdSetupScreen: React.FC<HouseholdSetupScreenProps> = ({ onComplete }) => {
  const [familyName, setFamilyName] = useState('');
  const [partnerAName, setPartnerAName] = useState('');
  const [partnerBName, setPartnerBName] = useState('');
  const [currency, setCurrency] = useState('₹');
  const [myRole, setMyRole] = useState<SpenderId | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    familyName.trim().length > 0 &&
    partnerAName.trim().length > 0 &&
    partnerBName.trim().length > 0 &&
    myRole !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !myRole) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onComplete({
        familyName: familyName.trim(),
        husbandName: partnerAName.trim(),
        wifeName: partnerBName.trim(),
        currency,
        myRole,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your household. Please try again.');
      setIsSubmitting(false);
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
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm space-y-6 py-8"
        >
          {/* Header */}
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
              <h1 className="text-xl font-bold tracking-tight">Set up your household</h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs">
                A one-time setup. Both of you will share this ledger from your own phones.
              </p>
            </div>
          </div>

          {/* Family name */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Household name
            </label>
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g. The Sharmas"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
            />
          </div>

          {/* Partner names */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Partner 1's name
              </label>
              <input
                type="text"
                value={partnerAName}
                onChange={(e) => setPartnerAName(e.target.value)}
                placeholder="e.g. Arjun"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Partner 2's name
              </label>
              <input
                type="text"
                value={partnerBName}
                onChange={(e) => setPartnerBName(e.target.value)}
                placeholder="e.g. Priya"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
            </div>
          </div>

          {/* Currency */}
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
                      ? 'bg-[#9333EA] border-[#9333EA] text-white shadow-xs'
                      : 'border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {c.symbol} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Which one are you */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>On this phone, which one are you?</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMyRole('husband')}
                disabled={!partnerAName.trim()}
                className={`py-3 px-3 rounded-xl border text-sm font-semibold transition-all disabled:opacity-40 ${
                  myRole === 'husband'
                    ? 'border-[#9333EA] bg-blue-50 dark:bg-blue-950/30 text-[#9333EA]'
                    : 'border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                {partnerAName.trim() || 'Partner 1'}
              </button>
              <button
                type="button"
                onClick={() => setMyRole('wife')}
                disabled={!partnerBName.trim()}
                className={`py-3 px-3 rounded-xl border text-sm font-semibold transition-all disabled:opacity-40 ${
                  myRole === 'wife'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 text-purple-600'
                    : 'border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                {partnerBName.trim() || 'Partner 2'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-40 text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            <Heart className="w-4 h-4" />
            <span>{isSubmitting ? 'Setting up…' : 'Create Household'}</span>
            {!isSubmitting && <ArrowRight className="w-4 h-4" />}
          </button>

          <p className="text-[11px] text-center text-neutral-400">
            Next, you'll get a private link to share with your partner so they can join from their own phone.
          </p>
        </form>
      </div>
    </div>
  );
};
