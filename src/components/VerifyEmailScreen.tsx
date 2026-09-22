import React, { useEffect, useState } from 'react';
import { MailCheck, XCircle } from 'lucide-react';
import { authVerifyEmail } from '../utils/auth';

interface VerifyEmailScreenProps {
  token: string;
  onDone: () => void;
}

export const VerifyEmailScreen: React.FC<VerifyEmailScreenProps> = ({ token, onDone }) => {
  const [status, setStatus] = useState<'checking' | 'done' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await authVerifyEmail(token);
        if (!cancelled) setStatus('done');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not verify your email.');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white"
      style={{
        backgroundImage: 'radial-gradient(60% 40% at 50% 100%, rgba(147,51,234,0.16) 0%, rgba(147,51,234,0) 70%)',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="min-h-full flex flex-col items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-sm space-y-6 py-8 text-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="w-14 h-14 rounded-[20px] overflow-hidden shadow-lg border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center">
              <img src="/knku-icon.png?v=1" alt="KNKU Logo" className="w-full h-full object-cover object-center block" referrerPolicy="no-referrer" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              {status === 'checking' && 'Verifying your email…'}
              {status === 'done' && 'Email verified'}
              {status === 'error' && 'Verification failed'}
            </h1>
          </div>

          {status === 'done' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm flex items-center justify-center gap-2">
                <MailCheck className="w-4 h-4 shrink-0" />
                <span>Your email is confirmed — you're all set.</span>
              </div>
              <button
                type="button"
                onClick={onDone}
                className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] text-white text-sm font-semibold shadow-xs transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center justify-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={onDone}
                className="w-full py-3 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] text-white text-sm font-semibold shadow-xs transition-colors"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
