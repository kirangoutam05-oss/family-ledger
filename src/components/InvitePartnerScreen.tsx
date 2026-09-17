import React, { useState } from 'react';
import { Copy, Check, ArrowRight, Users } from 'lucide-react';

interface InvitePartnerScreenProps {
  familyName: string;
  inviteUrl: string;
  onContinue: () => void;
}

export const InvitePartnerScreen: React.FC<InvitePartnerScreenProps> = ({ familyName, inviteUrl, onContinue }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback — the link is still selectable/visible below
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-16 h-16 rounded-[22px] bg-white dark:bg-neutral-900 shadow-lg border border-black/[0.08] dark:border-white/[0.12] flex items-center justify-center text-[#007AFF]">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Invite your partner</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs">
              Send this link so they can join {familyName} on their own phone. You can find it again later from
              Account → Invite Partner.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 text-xs font-mono text-neutral-700 dark:text-neutral-300 break-all text-left">
          {inviteUrl}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="w-full py-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-2 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy Link</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="w-full py-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
        >
          <span>Continue</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
